import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { randomBytes } from 'node:crypto';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { Client, Databases, ID, Users, Query, Account } from 'node-appwrite';
import { getClientProfile, requireRole } from '../lib/server/auth';
import { mensajeParaCliente } from '../lib/server/errors';
import { crearLimitador } from '../lib/server/rateLimit';
import {
	normalizarEstadoPedido,
	esTransicionValida,
	puedeEntregarse,
	type EstadoPedido
} from '../lib/orderStates';
import { parseActiveNodeValue, NODE_COOKIE_NAME, REF_COOKIE_NAME } from '../lib/nodeSession';
import { precioDeVentaCentavos } from '../lib/pricing';
import { esSlugReservado, limpiarSlugNodo } from '../lib/slugs';
import { otorgarAccesoAPedido } from '../lib/server/orderAccess';
import { invalidateSessionCache } from '../middleware';


import { resolverComisiones, cancelarOrdenYRestaurarStock, liquidarComisiones, confirmarComisionesDeOrden } from '../lib/commissions';

import { createAdminClient, escribirDocumentoTolerante } from '../lib/server/appwrite';
import { invalidateCatalogCache } from '../lib/server/catalogCache';
import { 
	sendOrderNotificationEmails, 
	sendOrderStatusNotificationEmail, 
	sendCanillitaApplicationEmail, 
	sendCanillitaApprovedEmail 
} from '../lib/server/mailer';




import { env, getPublicSiteUrl } from '../lib/server/env';

import { saveSiteSetting, getSiteSettings } from '../lib/server/settings';
import { 
	recalculateProductPrices, 
	resolveProductPriceForUser, 
	sanitizeProductForUser 
} from '../lib/pricingEngine';
import { obtenerTokenPlataformaValido } from '../lib/server/mercadopagoOAuth';

const client = new Proxy({} as Client, {
	get(_target, prop: keyof Client) {
		const instance = createAdminClient().client;
		const val = instance[prop];
		return typeof val === 'function' ? val.bind(instance) : val;
	}
});

const db = new Proxy({} as Databases, {
	get(_target, prop: keyof Databases) {
		const instance = createAdminClient().databases;
		const val = instance[prop];
		return typeof val === 'function' ? val.bind(instance) : val;
	}
});

const users = new Proxy({} as Users, {
	get(_target, prop: keyof Users) {
		const instance = createAdminClient().users;
		const val = instance[prop];
		return typeof val === 'function' ? val.bind(instance) : val;
	}
});

/**
 * Recalcula el saldo disponible del canillita desde el ledger.
 *
 * Antes se pisaba con 0 o se restaba a ojo el monto liquidado, con lo que
 * cualquier devengo posterior a la liquidación se perdía de vista.
 */
async function sincronizarSaldoDisponible(profileId: string) {
	try {
		// 'pendiente' + 'disponible': tras una entrega los asientos pasan a
		// 'disponible' (confirmarComisionesDeOrden); contar sólo 'pendiente'
		// ponía el saldo en 0 justo cuando la comisión se confirmaba.
		const pendientes = await db.listDocuments('urbanpoint', 'commission_ledger', [
			Query.equal('profile_id', profileId),
			Query.equal('estado', ['pendiente', 'disponible']),
			Query.limit(5000)
		]);
		const saldo = pendientes.documents.reduce((acc, cur) => acc + (cur.monto_centavos || 0), 0);
		await db.updateDocument('urbanpoint', 'profiles', profileId, {
			saldo_disponible_centavos: Math.max(0, saldo)
		});
	} catch (e) {
		console.error(`No se pudo sincronizar el saldo del perfil ${profileId}:`, e);
	}
}

/**
 * Deja rastro de cada cambio de estado. Antes sólo deliverOrder registraba
 * eventos, así que las transiciones hechas desde el admin no quedaban
 * auditadas y el timeline de la ficha mostraba datos mock.
 */
async function registrarEventoOrden(
	orderId: string,
	deEstado: string,
	aEstado: string,
	actorProfileId: string,
	motivo?: string
) {
	try {
		await db.createDocument('urbanpoint', 'order_events', ID.unique(), {
			order_id: orderId,
			de_estado: deEstado,
			a_estado: aEstado,
			actor_id: actorProfileId,
			motivo: motivo || `Cambio de estado: ${deEstado} -> ${aEstado}`
		});
	} catch (e) {
		// La auditoría no debe tumbar la operación, pero sí tiene que verse.
		console.error(`No se pudo registrar el evento de la orden ${orderId}:`, e);
	}
}

/**
 * Genera un slug único para la página propia del punto de retiro.
 *
 * Evita los slugs reservados del sitio y las colisiones con puntos ya
 * existentes, agregando un sufijo numérico cuando hace falta.
 */
async function generarSlugPunto(nombreComercial: string): Promise<string> {
	const base = limpiarSlugNodo(nombreComercial);

	for (let intento = 0; intento < 25; intento++) {
		const candidato = intento === 0 ? base : `${base}-${intento + 1}`;
		if (esSlugReservado(candidato)) continue;

		const existentes = await db.listDocuments('urbanpoint', 'pickup_points', [
			Query.equal('slug', candidato),
			Query.limit(1)
		]);
		if (existentes.documents.length === 0) return candidato;
	}

	return `${base}-${Date.now().toString().slice(-5)}`;
}


async function generateUniqueReferralCode(nombre: string, apellido: string): Promise<string> {
	const initial = nombre.trim().substring(0, 1).toUpperCase().replace(/[^A-Z]/g, 'X') || 'C';
	const surname = apellido.trim().toUpperCase().replace(/[^A-Z]/g, '').substring(0, 8) || 'CANILLITA';
	
	for (let attempt = 0; attempt < 15; attempt++) {
		const randomNum = Math.floor(1000 + Math.random() * 9000);
		const candidate = `CANI-${initial}${surname}-${randomNum}`;
		
		const existing = await db.listDocuments('urbanpoint', 'referral_codes', [
			Query.equal('code', candidate),
			Query.limit(1)
		]);
		if (existing.documents.length === 0) {
			return candidate;
		}
	}
	return `CANI-${initial}${surname}-${Date.now().toString().slice(-4)}`;
}

/**
 * Tope del alta pública de canillitas: 3 solicitudes por IP por hora.
 * Holgado para un kiosquero que se equivoca y recarga, restrictivo para un
 * script que itera emails.
 */
const limitadorAltaCanillita = crearLimitador(3, 60 * 60 * 1000);

export const server = {
	registerCanillita: defineAction({
		accept: 'json',
		input: z.object({
			nombre: z.string().min(2),
			apellido: z.string().min(2),
			dni: z.string().min(7),
			telefono: z.string().min(8),
			email: z.string().email(),
			nombre_comercial: z.string().min(2),
			direccion: z.string().min(5),
			localidad: z.string().optional(),
			provincia: z.string().optional(),
			cbu: z.string().optional(),
			condicion_fiscal: z.string().optional(),
			horarios: z.string().min(5),
			lat: z.number(),
			lng: z.number()
		}),
		handler: async (input, ctx) => {
			try {
				// Límite por IP. La dedup por email de más abajo frena el reenvío
				// accidental, pero no un abuso: cambiando el email en cada intento
				// se creaban documentos con DNI y CBU sin tope, y salía un mail a
				// los administradores por cada uno.
				const ip = ctx.clientAddress || '0.0.0.0';
				if (!limitadorAltaCanillita.permitir(ip)) {
					return {
						success: false,
						error: 'Recibimos varias solicitudes desde esta conexión. Probá de nuevo en una hora.'
					};
				}

				// Dedup: una solicitud abierta por email alcanza. Sin este control,
				// el endpoint público generaba documentos y mails a admins sin
				// límite (spam trivial contra /_actions/registerCanillita).
				const yaExiste = await db.listDocuments('urbanpoint', 'canillita_applications', [
					Query.equal('email', input.email.trim().toLowerCase()),
					Query.equal('estado', 'solicitado'),
					Query.limit(1)
				]);
				if (yaExiste.documents.length > 0) {
					return {
						success: false,
						error: 'Ya tenemos una solicitud pendiente con ese email. Te vamos a contactar a la brevedad.'
					};
				}

				const doc = await db.createDocument(
					'urbanpoint',
					'canillita_applications',
					ID.unique(),
					{
						nombre: input.nombre,
						apellido: input.apellido,
						dni: input.dni,
						telefono: input.telefono,
						email: input.email.trim().toLowerCase(),
						nombre_comercial: input.nombre_comercial,
						direccion: input.direccion,
						localidad: input.localidad || 'CABA',
						provincia: input.provincia || 'CABA',
						cbu: input.cbu || '',
						condicion_fiscal: input.condicion_fiscal || 'Monotributo',
						lat: input.lat,
						lng: input.lng,
						horarios: input.horarios,
						estado: 'solicitado',
						ip_address: ctx.clientAddress || '0.0.0.0'
					}
				);
				
				// Enviar email de notificación a administradores y confirmación al solicitante
				try {
					await sendCanillitaApplicationEmail({
						$id: doc.$id,
						nombre: doc.nombre,
						apellido: doc.apellido,
						email: doc.email,
						telefono: doc.telefono,
						dni: doc.dni,
						nombre_comercial: doc.nombre_comercial,
						direccion: doc.direccion,
						localidad: doc.localidad,
						provincia: doc.provincia,
						cbu: doc.cbu,
						condicion_fiscal: doc.condicion_fiscal,
						horarios: doc.horarios
					});
				} catch (e: any) {
					console.error('[Mailer Error Canillita Application]:', e.message);
				}

				return { success: true, id: doc.$id };

			} catch (error: any) {
				console.error("Appwrite Error:", error);
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	approveCanillita: defineAction({
		accept: 'json',
		input: z.object({
			applicationId: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin');

				const app = await db.getDocument('urbanpoint', 'canillita_applications', input.applicationId);
				if (app.estado !== 'solicitado') throw new Error('La solicitud ya fue procesada.');

				// 1. Crear o buscar usuario en Auth
				let userId;
				try {
					const existingUsers = await users.list([Query.equal('email', app.email)]);
					if (existingUsers.total > 0) {
						userId = existingUsers.users[0].$id;
					} else {
						const newUser = await users.create(ID.unique(), app.email, undefined, undefined, app.nombre + ' ' + app.apellido);
						userId = newUser.$id;
					}
				} catch(e) {
					throw new Error('Error al gestionar el usuario Auth: ' + e);
				}

				// 2. Crear Perfil (Role: canillita)
				let profile;
				const existingProfiles = await db.listDocuments('urbanpoint', 'profiles', [
					Query.equal('user_id', userId)
				]);
				if (existingProfiles.documents.length > 0) {
					profile = existingProfiles.documents[0];
					await db.updateDocument('urbanpoint', 'profiles', profile.$id, { role: 'canillita' });
				} else {
					profile = await db.createDocument('urbanpoint', 'profiles', ID.unique(), {
						user_id: userId,
						role: 'canillita',
						nombre: app.nombre + ' ' + app.apellido,
						email: app.email,
						telefono: app.telefono,
						saldo_disponible_centavos: 0
					});
				}

				// 3. Crear Punto de Retiro (estado: activo) con toda la información
				// completa. El slug es lo que le da su página propia en el sitio:
				// sin él, /[slug] no matchea y el canillita aprobado se quedaba
				// sin página hasta que un admin se la cargara a mano.
				const slugPunto = await generarSlugPunto(app.nombre_comercial);

				const pickupPoint = await db.createDocument('urbanpoint', 'pickup_points', ID.unique(), {
					profile_id: profile.$id,
					slug: slugPunto,
					nombre_comercial: app.nombre_comercial,
					direccion: app.direccion,
					localidad: app.localidad || 'CABA',
					provincia: app.provincia || 'CABA',
					cbu: app.cbu || '',
					condicion_fiscal: app.condicion_fiscal || 'Monotributo',
					lat: app.lat,
					lng: app.lng,
					horarios: app.horarios,
					estado: 'activo'
				});

				// 4. Crear Referral Code estandarizado
				const codeStr = await generateUniqueReferralCode(app.nombre, app.apellido);
				await db.createDocument('urbanpoint', 'referral_codes', ID.unique(), {
					code: codeStr,
					owner_id: profile.$id,
					activo: true
				});

				// 5. Marcar como aprobado
				await db.updateDocument('urbanpoint', 'canillita_applications', input.applicationId, {
					estado: 'aprobado'
				});

				// Enviar email de felicitaciones y bienvenida al Canillita
				try {
					await sendCanillitaApprovedEmail({
						$id: app.$id,
						nombre: app.nombre,
						apellido: app.apellido,
						email: app.email,
						telefono: app.telefono,
						dni: app.dni,
						nombre_comercial: app.nombre_comercial,
						direccion: app.direccion,
						localidad: app.localidad,
						provincia: app.provincia
					});
				} catch (e: any) {
					console.error('[Mailer Error Canillita Approval]:', e.message);
				}

				return { success: true, profileId: profile.$id, code: codeStr };

			} catch (error: any) {
				console.error("Approve Error:", error);
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	rejectCanillita: defineAction({
		accept: 'json',
		input: z.object({
			applicationId: z.string(),
			motivo: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin');

				await db.updateDocument('urbanpoint', 'canillita_applications', input.applicationId, {
					estado: 'rechazado',
					motivo_rechazo: input.motivo
				});
				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	suspendCanillita: defineAction({
		accept: 'json',
		input: z.object({
			applicationId: z.string().optional(),
			pickupPointId: z.string().optional(),
			profileId: z.string().optional()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('No autorizado');
				}

				if (input.applicationId) {
					await db.updateDocument('urbanpoint', 'canillita_applications', input.applicationId, {
						estado: 'suspendido'
					});
				}

				if (input.pickupPointId) {
					await db.updateDocument('urbanpoint', 'pickup_points', input.pickupPointId, {
						estado: 'suspendido'
					});
				}

				if (input.profileId) {
					const points = await db.listDocuments('urbanpoint', 'pickup_points', [
						Query.equal('profile_id', input.profileId)
					]);
					for (const p of points.documents) {
						await db.updateDocument('urbanpoint', 'pickup_points', p.$id, {
							estado: 'suspendido'
						});
					}
				}

				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	regenerateReferralCode: defineAction({
		accept: 'json',
		input: z.object({
			profileId: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede regenerar códigos de referido');
				}

				const profile = await db.getDocument('urbanpoint', 'profiles', input.profileId);
				const nameParts = profile.nombre ? profile.nombre.split(' ') : ['C', 'CANILLITA'];
				const nombre = nameParts[0] || 'C';
				const apellido = nameParts.slice(1).join(' ') || 'CANILLITA';

				const newCode = await generateUniqueReferralCode(nombre, apellido);

				// Desactivar anteriores (sin Query.limit, Appwrite devuelve sólo 25
				// y quedaban códigos viejos activos en paralelo).
				const prevCodes = await db.listDocuments('urbanpoint', 'referral_codes', [
					Query.equal('owner_id', input.profileId),
					Query.limit(500)
				]);
				await Promise.all(prevCodes.documents.map(c =>
					db.updateDocument('urbanpoint', 'referral_codes', c.$id, { activo: false })
				));

				const newDoc = await db.createDocument('urbanpoint', 'referral_codes', ID.unique(), {
					code: newCode,
					owner_id: input.profileId,
					activo: true
				});

				return { success: true, code: newCode, id: newDoc.$id };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	toggleReferralCode: defineAction({
		accept: 'json',
		input: z.object({
			codeId: z.string(),
			activo: z.boolean()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede modificar códigos de referido');
				}

				await db.updateDocument('urbanpoint', 'referral_codes', input.codeId, {
					activo: input.activo
				});

				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	createPickupPointAdmin: defineAction({
		accept: 'json',
		input: z.object({
			nombre_comercial: z.string().min(2),
			direccion: z.string().min(5),
			localidad: z.string().optional(),
			provincia: z.string().optional(),
			lat: z.number(),
			lng: z.number(),
			horarios: z.string().min(5),
			estado: z.enum(['activo', 'pendiente', 'suspendido', 'baja']).optional(),
			profile_id: z.string().optional()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede crear puntos de retiro');
				}

				const payload: any = {
					nombre_comercial: input.nombre_comercial,
					direccion: input.direccion,
					localidad: input.localidad || 'CABA',
					provincia: input.provincia || 'CABA',
					lat: input.lat,
					lng: input.lng,
					horarios: input.horarios,
					estado: input.estado || 'activo'
				};

				if (input.profile_id) {
					payload.profile_id = input.profile_id;
				}

				const doc = await db.createDocument('urbanpoint', 'pickup_points', ID.unique(), payload);
				return { success: true, id: doc.$id };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	updatePickupPointAdmin: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string(),
			nombre_comercial: z.string().min(2),
			direccion: z.string().min(5),
			localidad: z.string().optional(),
			provincia: z.string().optional(),
			lat: z.number(),
			lng: z.number(),
			horarios: z.string().min(5),
			estado: z.enum(['activo', 'pendiente', 'suspendido', 'baja'])
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede editar puntos de retiro');
				}

				await db.updateDocument('urbanpoint', 'pickup_points', input.id, {
					nombre_comercial: input.nombre_comercial,
					direccion: input.direccion,
					localidad: input.localidad || 'CABA',
					provincia: input.provincia || 'CABA',
					lat: input.lat,
					lng: input.lng,
					horarios: input.horarios,
					estado: input.estado
				});

				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	deletePickupPointAdmin: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede eliminar puntos de retiro');
				}

				// Sólo se opera sobre pickup_points. La cascada anterior, ante un
				// fallo, terminaba borrando un documento con el MISMO id en
				// canillita_applications o incluso en profiles: un fallback
				// destructivo que podía destruir el perfil de un usuario.
				try {
					await db.deleteDocument('urbanpoint', 'pickup_points', input.id);
				} catch (e1) {
					await db.updateDocument('urbanpoint', 'pickup_points', input.id, { estado: 'baja' });
				}

				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	liquidateCommissions: defineAction({
		accept: 'json',
		input: z.object({
			profileId: z.string(),
			montoCentavos: z.number().gt(0, "El monto a liquidar debe ser mayor a 0"),
			periodo: z.string().optional(),
			metodoPago: z.string().optional(),
			comprobante: z.string().optional(),
			idempotencyKey: z.string().min(5)
		}),
		handler: async (input, ctx) => {
			try {
				const actor = requireRole(ctx, 'admin');

				const res = await liquidarComisiones({
					profileId: input.profileId,
					medioPago: input.metodoPago || 'transferencia',
					referenciaPago: input.comprobante || `COMP-${input.idempotencyKey}`,
					idempotencyKey: input.idempotencyKey,
					actorProfileId: actor.profileId,
					montoCentavosEsperado: input.montoCentavos
				});

				await sincronizarSaldoDisponible(input.profileId);

				return { success: true, payoutId: res.payoutId, idempotencySkipped: res.idempotencySkipped };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	deliverOrder: defineAction({
		accept: 'json',
		input: z.object({
			orderId: z.string(),
			pickupCode: z.string().optional()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || (ctx.locals.user.role !== 'canillita' && ctx.locals.user.role !== 'admin')) {
					throw new Error('No autorizado para marcar entregas');
				}

				const order = await db.getDocument('urbanpoint', 'orders', input.orderId);

				// No se entrega mercadería sin pago acreditado. El panel llegó a
				// mostrar pedidos pendiente_pago como "Listo para Retiro".
				if (!puedeEntregarse(order.estado)) {
					throw new Error(
						order.estado === 'pendiente_pago'
							? 'Este pedido todavía no tiene el pago acreditado.'
							: `Un pedido en estado "${order.estado}" no se puede entregar.`
					);
				}

				// Validate pickup point ownership if caller is canillita
				if (ctx.locals.user.role === 'canillita') {
					const userPoints = await db.listDocuments('urbanpoint', 'pickup_points', [
						Query.equal('profile_id', ctx.locals.user.profileId),
						Query.limit(100)
					]);
					const userPointIds = userPoints.documents.map(p => p.$id);
					const orderPointId = typeof order.pickup_point_id === 'string' ? order.pickup_point_id : order.pickup_point_id?.$id;

					// Denegar por defecto: un pedido sin punto de retiro (p. ej.
					// envío a domicilio) no lo puede cerrar un canillita. Antes la
					// guardia sólo corría si orderPointId era truthy.
					if (!orderPointId || !userPointIds.includes(orderPointId)) {
						throw new Error('Este pedido no pertenece a tu punto de retiro.');
					}

					// El código de retiro es obligatorio para el canillita cuando el
					// pedido tiene uno: omitirlo en el POST salteaba la verificación.
					if (order.pickup_code_hash && !input.pickupCode?.trim()) {
						throw new Error('Ingresá el código de retiro que te muestra el cliente.');
					}
				}

				if (input.pickupCode?.trim() && order.pickup_code_hash && input.pickupCode.trim().toUpperCase() !== order.pickup_code_hash.trim().toUpperCase()) {
					throw new Error('El código de retiro ingresado es incorrecto.');
				}

				await db.updateDocument('urbanpoint', 'orders', input.orderId, {
					estado: 'entregado'
				});

				// Confirmar comisiones asociadas (pasar de pendiente a disponible/confirmada)
				try {
					await confirmarComisionesDeOrden(input.orderId);
				} catch (e) {
					console.warn('No se pudieron confirmar comisiones para la orden', input.orderId, e);
				}

				// Create order event
				try {
					await db.createDocument('urbanpoint', 'order_events', ID.unique(), {
						order_id: input.orderId,
						de_estado: order.estado,
						a_estado: 'entregado',
						actor_id: ctx.locals.user.profileId,
						motivo: 'Entrega confirmada por canillita'
					});
				} catch (e) {}

				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	createCheckout: defineAction({
		accept: 'json',
		input: z.object({
			items: z.array(z.object({
				productId: z.string(),
				cantidad: z.number().int().min(1).max(999)
			})).min(1),
			pickupPointId: z.string().optional(),
			fulfillment: z.enum(['retiro', 'envio']).optional(),
			direccionEnvio: z.string().optional(),
			costoEnvio: z.number().optional(),
			// referralCode se quitó a propósito: la atribución se resuelve en el
			// servidor desde la cookie, no con lo que informe el cliente.
			paymentMethod: z.string().optional()
		}),
		handler: async (input, ctx) => {
			try {
				let profileId = null;
				try {
					const profile = await getClientProfile(ctx);
					if (profile) profileId = profile.$id;
				} catch (e) {
					console.error("No profile attached to checkout:", e);
				}

				let referralCodeId = null;
				let resolvedCanillitaId = null;

				// El código sale SIEMPRE de la cookie httpOnly que escribe el
				// servidor (middleware ante ?ref=, o /[slug] al entrar por la
				// página de un punto). Lo que mande el cliente se ignora: antes
				// venía de localStorage y permitía atribuirse la venta de otro.
				const refCode = ctx.cookies.get(REF_COOKIE_NAME)?.value?.trim();

				if (refCode) {
					const codeRes = await db.listDocuments('urbanpoint', 'referral_codes', [
						Query.equal('code', refCode),
						Query.equal('activo', true),
						Query.limit(1)
					]);
					if (codeRes.documents.length > 0) {
						referralCodeId = codeRes.documents[0].$id;
						resolvedCanillitaId = typeof codeRes.documents[0].owner_id === 'string' ? codeRes.documents[0].owner_id : codeRes.documents[0].owner_id?.$id;
					}
				}

				if (!resolvedCanillitaId && input.pickupPointId) {
					try {
						const pt = await db.getDocument('urbanpoint', 'pickup_points', input.pickupPointId);
						if (pt.profile_id) {
							resolvedCanillitaId = typeof pt.profile_id === 'string' ? pt.profile_id : pt.profile_id?.$id;
						}
					} catch (e) {}
				}

				const userRole = ctx.locals.user?.role || 'cliente';

				// Ítems duplicados se consolidan: [{X,5},{X,5}] con stock 5 pasaba
				// las dos validaciones por separado y creaba una orden por 10.
				const itemsPorProducto = new Map<string, number>();
				for (const item of input.items) {
					itemsPorProducto.set(item.productId, (itemsPorProducto.get(item.productId) || 0) + item.cantidad);
				}
				const itemsConsolidados = [...itemsPorProducto.entries()].map(([productId, cantidad]) => ({ productId, cantidad }));

				// Re-fetch all products securely from backend to avoid price manipulation
				const prefItems = [];
				const orderItemsData = [];
				let totalCentavos = 0;

				const productos = await Promise.all(
					itemsConsolidados.map(item => db.getDocument('urbanpoint', 'products', item.productId))
				);

				for (let i = 0; i < itemsConsolidados.length; i++) {
					const item = itemsConsolidados[i];
					const p = productos[i];
					if (p.estado !== 'activo' || p.stock < item.cantidad) {
						throw new Error(`El producto ${p.nombre} no está disponible o no hay stock suficiente.`);
					}

					const priceInfo = resolveProductPriceForUser(p, userRole);
					const unitarioCentavos = priceInfo.unitPriceCentavos;
					const subtotalCentavos = unitarioCentavos * item.cantidad;
					const costoUnitario = Math.round(Number(p.cost ?? p.costo ?? 0));

					prefItems.push({
						id: p.$id,
						title: p.nombre,
						quantity: item.cantidad,
						unit_price: unitarioCentavos / 100, // MP espera moneda, no centavos
						currency_id: 'ARS'
					});

					orderItemsData.push({
						product_id: p.$id,
						sku_snapshot: p.sku || 'SKU-GEN',
						nombre_snapshot: p.nombre,
						precio_unitario: unitarioCentavos,
						applied_level: priceInfo.appliedLevel,
						costo_unitario: costoUnitario,
						cantidad: item.cantidad,
						subtotal: subtotalCentavos
					});

					totalCentavos += subtotalCentavos;
				}

				// El costo de envío se calcula SIEMPRE en el servidor desde settings.
				// input.costoEnvio venía del cliente sin validar: permitía mandar un
				// negativo y bajar el total, y además nunca se cobraba en MP.
				let costoEnvio = 0;
				if ((input.fulfillment || 'retiro') === 'envio') {
					const settings = await getSiteSettings();
					const umbralGratis = settings.free_shipping_threshold_centavos || 0;
					costoEnvio = umbralGratis > 0 && totalCentavos >= umbralGratis
						? 0
						: (settings.shipping_cost_centavos || 0);
				}
				const grandTotal = totalCentavos + costoEnvio;

				if (costoEnvio > 0) {
					prefItems.push({
						id: 'envio',
						title: 'Costo de envío',
						quantity: 1,
						unit_price: costoEnvio / 100,
						currency_id: 'ARS'
					});
				}

				const pickupCode = randomBytes(4).toString('hex').substring(0, 6).toUpperCase();

				// Nodo de origen para la atribución de la venta.
				const activeNodeSession = parseActiveNodeValue(
					ctx.cookies.get(NODE_COOKIE_NAME)?.value
				);

				const effectiveTier = userRole === 'distribuidor' ? 'distribuidor' : (userRole === 'canillita' ? 'canillita' : 'publico');

				// Create the Order in Appwrite
				const orderPayload: any = {
					numero: Math.floor(100000 + Math.random() * 900000).toString(),
					subtotal: totalCentavos,
					total: grandTotal,
					costo_envio: costoEnvio,
					estado: 'pendiente_pago',
					fulfillment: input.fulfillment || 'retiro',
					referral_code_id: referralCodeId,
					pickup_code_hash: pickupCode,
					price_tier: effectiveTier
				};

				// La cookie del nodo activo no es de confianza (viaja sin firma y
				// sin httpOnly): se valida contra la base y los datos de la orden
				// salen del documento real, no de lo que diga la cookie.
				if (activeNodeSession) {
					try {
						const nodeDoc = await db.getDocument('urbanpoint', 'pickup_points', activeNodeSession.id);
						if (nodeDoc.estado === 'activo' || !nodeDoc.estado) {
							orderPayload.origin_node_id = nodeDoc.$id;
							orderPayload.origin_node_name = nodeDoc.nombre_comercial || activeNodeSession.nombre;
							orderPayload.origin_slug = nodeDoc.slug || activeNodeSession.slug;
							const nodeOwner = typeof nodeDoc.profile_id === 'string' ? nodeDoc.profile_id : nodeDoc.profile_id?.$id;
							if (nodeOwner) {
								orderPayload.origin_canillita_id = nodeOwner;
							}
						}
					} catch (e) {
						console.warn('Nodo activo de la cookie inexistente, se ignora:', activeNodeSession.id);
					}
				}

				if (resolvedCanillitaId) {
					orderPayload.canillita_id = resolvedCanillitaId;
				}
				const finalPickupPointId = input.pickupPointId || orderPayload.origin_node_id || null;
				if (finalPickupPointId) {
					orderPayload.pickup_point_id = finalPickupPointId;
					orderPayload.pickup_node_id = finalPickupPointId;
				}
				if (input.direccionEnvio) {
					orderPayload.direccion_envio = input.direccionEnvio;
				}
				if (profileId) {
					orderPayload.customer_id = profileId;
				}

				const orderDoc = await escribirDocumentoTolerante('orders', orderPayload);

				// Habilita a este navegador a ver el pedido y su código de retiro,
				// también si la compra fue como invitado.
				otorgarAccesoAPedido(ctx.cookies, orderDoc.$id);

				// Create the Order Items
				await Promise.all(orderItemsData.map(oi =>
					escribirDocumentoTolerante('order_items', {
						order_id: orderDoc.$id,
						...oi
					})
				));

				// Resolve names & emails for SMTP notifications.
				// Sólo para pedidos "a convenir": los pagados por MP se notifican
				// desde el webhook al acreditarse; mandar acá también generaba un
				// mail duplicado que encima decía "Pagado" sobre un pendiente_pago.
				if (input.paymentMethod === 'a_convenir') (async () => {
					try {
						let customerName = '';
						let customerEmail = '';
						let canillitaEmail = '';
						let canillitaNombre = '';
						let pickupNodeName = activeNodeSession?.nombre || '';
						let pickupNodeAddress = activeNodeSession?.direccion || '';

						if (profileId) {
							try {
								const custProf = await db.getDocument('urbanpoint', 'profiles', profileId);
								customerName = custProf.nombre || '';
								customerEmail = custProf.email || '';
							} catch (e) {}
						}

						if (resolvedCanillitaId) {
							try {
								const canProf = await db.getDocument('urbanpoint', 'profiles', resolvedCanillitaId);
								canillitaNombre = canProf.nombre || '';
								canillitaEmail = canProf.email || '';
							} catch (e) {}
						}

						if (finalPickupPointId && !pickupNodeName) {
							try {
								const ptDoc = await db.getDocument('urbanpoint', 'pickup_points', finalPickupPointId);
								pickupNodeName = ptDoc.nombre_comercial || '';
								pickupNodeAddress = ptDoc.direccion || '';
							} catch (e) {}
						}

						await sendOrderNotificationEmails({
							...orderDoc,
							total: grandTotal,
							customerName,
							customerEmail,
							canillitaEmail,
							canillitaNombre,
							pickupNodeName,
							pickupNodeAddress
						}, orderItemsData);
					} catch (mailErr: any) {
						console.error('[Checkout SMTP Mailer] Error:', mailErr.message);
					}
				})();


				if (input.paymentMethod === 'a_convenir') {
					// La UI oculta esta opción cuando está deshabilitada, pero la
					// action es un POST público: hay que validar acá también.
					const settingsPago = await getSiteSettings();
					if (!settingsPago.transferencia_enabled) {
						await escribirDocumentoTolerante('orders', { estado: 'cancelado' }, orderDoc.$id).catch(() => {});
						return { success: false, error: 'El pago a convenir no está habilitado.' };
					}
					return { success: true, init_point: `/checkout/success?order_id=${orderDoc.$id}` };
				}

				const mpAccessToken = await obtenerTokenPlataformaValido();

				if (!mpAccessToken) {
					// Antes se devolvía un link de sandbox falso con success: true y
					// el cliente creía que iba a pagar. Mejor decir la verdad.
					return {
						success: false,
						error: 'Mercado Pago no está configurado. Elegí otro medio de pago o contactanos.'
					};
				}

				const mp = new MercadoPagoConfig({ accessToken: mpAccessToken, options: { timeout: 5000 } });
				const preference = new Preference(mp);

				const baseUrl = getPublicSiteUrl(ctx);

				const result = await preference.create({
					body: {
						items: prefItems,
						external_reference: orderDoc.$id,
						back_urls: {
							success: `${baseUrl}/checkout/success?order_id=${orderDoc.$id}`,
							failure: `${baseUrl}/checkout/failure?order_id=${orderDoc.$id}`,
							pending: `${baseUrl}/checkout/pending?order_id=${orderDoc.$id}`
						},
						auto_return: 'approved',
						// Sin esto el webhook dependía sólo de la config del panel
						// de MP: si faltaba, ningún pago se acreditaba jamás.
						notification_url: `${baseUrl}/api/webhooks/mercadopago`
					}
				});


				// Update order with preference ID
				await escribirDocumentoTolerante('orders', {
					mp_preference_id: result.id
				}, orderDoc.$id);

				// NUNCA priorizar el sandbox: la API devuelve ambos campos siempre
				// y con el orden invertido todos los compradores de producción
				// terminaban en el checkout de pruebas (no se cobraba nada).
				const useSandbox = import.meta.env.DEV || env('MP_USE_SANDBOX') === 'true';
				return {
					success: true,
					init_point: (useSandbox && result.sandbox_init_point) ? result.sandbox_init_point : result.init_point
				};
			} catch (error: any) {
				console.error("Checkout Error:", error);
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	disconnectMercadoPago: defineAction({
		accept: 'json',
		input: z.object({}),
		handler: async (_input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo el administrador puede desvincular Mercado Pago.');
				}

				await saveSiteSetting('mp_user_id', '');
				await saveSiteSetting('mp_access_token', '');
				await saveSiteSetting('mp_refresh_token', '');
				await saveSiteSetting('mp_public_key', '');
				await saveSiteSetting('mp_token_expires_at', '');
				await saveSiteSetting('mp_connected_at', '');
				await saveSiteSetting('mp_status', 'desconectado');

				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	auth_login: defineAction({
		accept: 'form',
		input: z.object({
			email: z.string().email(),
			password: z.string().min(8)
		}),
		handler: async (input, ctx) => {
			// El atajo de desarrollo que entregaba sesión de admin a un email
			// hardcodeado se quitó: era una llave maestra a un `import.meta.env.DEV`
			// mal resuelto de distancia. Para saltar entre roles en local está
			// /api/dev/switch-user, que responde 404 fuera de desarrollo.
			try {
				// Para loguearnos, creamos un cliente sin el API Key, que actúe como cliente web
				const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
				const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
				const authClient = new Client()
					.setEndpoint(endpoint)
					.setProject(projectId);
				
				const account = new Account(authClient);
				const session = await account.createEmailPasswordSession(input.email, input.password);
				
				ctx.cookies.set('up_session', session.secret, {
					path: '/',
					httpOnly: true,
					secure: import.meta.env.PROD,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 30
				});
				
				// Fetch user profile to determine redirect
				const db = new Databases(client); // Usamos el admin client (global) para buscar el profile
				const profiles = await db.listDocuments('urbanpoint', 'profiles', [
					Query.equal('user_id', session.userId)
				]);
				
				const role = profiles.documents.length > 0 ? profiles.documents[0].role : 'cliente';
				let redirectUrl = '/admin'; // Por defecto, enviamos al admin si no es cliente regular
				if (role === 'canillita') redirectUrl = '/canillita';
				if (role === 'cliente') redirectUrl = '/'; // O su panel de cliente

				return { success: true, redirectUrl };
			} catch (error: any) {
				// Mensaje genérico: el error crudo de Appwrite permite enumerar
				// qué cuentas existen.
				console.error('auth_login:', error?.message);
				return { success: false, error: 'Email o contraseña incorrectos.' };
			}
		}
	}),

	auth_logout: defineAction({
		accept: 'form',
		handler: async (_, ctx) => {
			try {
				const sessionSecret = ctx.cookies.get('up_session')?.value;
				if (sessionSecret) {
					const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
					const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
					const authClient = new Client()
						.setEndpoint(endpoint)
						.setProject(projectId)
						.setSession(sessionSecret);
					const account = new Account(authClient);
					await account.deleteSession('current');
				}
			} catch (e) {
				// Ignore if session is already invalid
			}
			invalidateSessionCache(ctx.cookies.get('up_session')?.value);
			ctx.cookies.delete('up_session', { path: '/' });
			return { success: true };
		}
	}),

	activateCanillita: defineAction({
		accept: 'json',
		input: z.object({
			cbu: z.string().min(10),
			condicion_fiscal: z.string().min(2)
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'canillita') {
					throw new Error('No autorizado');
				}

				// Buscar su punto de retiro pendiente
				const userProfileId = ctx.locals.user.profileId;
				const points = await db.listDocuments('urbanpoint', 'pickup_points', [
					Query.equal('profile_id', userProfileId)
				]);

				if (points.documents.length === 0) {
					throw new Error('No se encontró el punto de retiro asociado.');
				}

				const point = points.documents[0];
				
				if (point.estado === 'activo') {
					throw new Error('El punto ya está activo.');
				}

				await db.updateDocument('urbanpoint', 'pickup_points', point.$id, {
					cbu: input.cbu,
					condicion_fiscal: input.condicion_fiscal,
					estado: 'activo'
				});

				return { success: true };
			} catch (error: any) {
				console.error("Activation Error:", error);
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	createCommissionRule: defineAction({
		accept: 'form',
		input: z.object({
			alcance: z.enum(['default', 'canillita', 'categoria', 'canillita_categoria']),
			tipo: z.enum(['porcentaje', 'monto_fijo']),
			valor: z.number(),
			canillita_id: z.string().optional(),
			categoria_id: z.string().optional()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede crear reglas');
				}

				let queries = [Query.equal('alcance', input.alcance), Query.equal('activo', true)];
				if (input.canillita_id) queries.push(Query.equal('canillita_id', input.canillita_id));
				if (input.categoria_id) queries.push(Query.equal('categoria_id', input.categoria_id));

				const prevRules = await db.listDocuments('urbanpoint', 'commission_rules', queries);
				for (const rule of prevRules.documents) {
					await db.updateDocument('urbanpoint', 'commission_rules', rule.$id, {
						activo: false,
						vigente_hasta: new Date().toISOString()
					});
				}

				await db.createDocument('urbanpoint', 'commission_rules', ID.unique(), {
					alcance: input.alcance,
					tipo: input.tipo,
					valor: input.valor,
					canillita_id: input.canillita_id || null,
					categoria_id: input.categoria_id || null,
					activo: true,
					vigente_desde: new Date().toISOString(),
					creado_por: ctx.locals.user.profileId
				});

				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	simulateCommission: defineAction({
		accept: 'json',
		input: z.object({
			canillitaId: z.string(),
			productId: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin');

				const product = await db.getDocument('urbanpoint', 'products', input.productId);
				const categoryId = product.categoria_id ? (typeof product.categoria_id === 'string' ? product.categoria_id : product.categoria_id.$id) : null;

				const rulesToEvaluate = [
					categoryId ? [Query.equal('alcance', 'canillita_categoria'), Query.equal('canillita_id', input.canillitaId), Query.equal('categoria_id', categoryId)] : null,
					[Query.equal('alcance', 'canillita'), Query.equal('canillita_id', input.canillitaId)],
					categoryId ? [Query.equal('alcance', 'categoria'), Query.equal('categoria_id', categoryId)] : null,
					[Query.equal('alcance', 'default')]
				].filter(Boolean) as string[][];

				let matchedRule = null;
				let ruleLevel = 0;

				for (let i = 0; i < rulesToEvaluate.length; i++) {
					const ruleQuery = rulesToEvaluate[i];
					const rulesRes = await db.listDocuments('urbanpoint', 'commission_rules', [
						...ruleQuery,
						Query.equal('activo', true),
						Query.orderDesc('$createdAt'),
						Query.limit(1)
					]);
					
					if (rulesRes.documents.length > 0) {
						matchedRule = rulesRes.documents[0];
						ruleLevel = i + 1;
						break;
					}
				}

				let amount = 0;
				if (matchedRule) {
					if (matchedRule.tipo === 'porcentaje') {
						amount = Math.round((product.precio * matchedRule.valor) / 10000);
					} else {
						amount = matchedRule.valor;
					}
				}

				return { success: true, rule: matchedRule, productPrice: product.precio, amount, ruleLevel };
			} catch(e: any) {
				return { success: false, error: mensajeParaCliente(e) };
			}
		}
	}),

	getAdminReports: defineAction({
		accept: 'json',
		handler: async (_, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('No autorizado');
				}

				const thirtyDaysAgo = new Date();
				thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
				const dateString = thirtyDaysAgo.toISOString();

				// Todo estado post-pago cuenta como venta: filtrar sólo 'pagado'
				// hacía desaparecer de la facturación los pedidos que avanzaban
				// (preparando, despachado, en_punto, entregado, retirado).
				const ordersRes = await db.listDocuments('urbanpoint', 'orders', [
					Query.greaterThanEqual('$createdAt', dateString),
					Query.equal('estado', ['pagado', 'preparando', 'despachado', 'en_punto', 'entregado', 'retirado']),
					Query.limit(5000)
				]);
				const totalVendido = ordersRes.documents.reduce((acc, curr) => acc + (curr.total || 0), 0);

				const ledgerRes = await db.listDocuments('urbanpoint', 'commission_ledger', [
					Query.greaterThanEqual('$createdAt', dateString),
					Query.limit(1000)
				]);
				
				let totalDevengado = 0;
				let payoutsPendientes = 0;
				
				const rankingMap: Record<string, { id: string, name: string, comisionReferido: number, feeLogistica: number }> = {};

				for (const item of ledgerRes.documents) {
					if (item.monto_centavos > 0) {
						totalDevengado += item.monto_centavos;
					}
					if (item.estado === 'pendiente' || item.estado === 'disponible') {
						payoutsPendientes += item.monto_centavos;
					}

					const profileId = typeof item.profile_id === 'string' ? item.profile_id : item.profile_id?.$id;
					if (!profileId) continue;

					if (!rankingMap[profileId]) {
						rankingMap[profileId] = {
							id: profileId,
							name: item.profile_id?.nombre || 'Desconocido',
							comisionReferido: 0,
							feeLogistica: 0
						};
					}

					if (item.tipo === 'comision_referido') {
						rankingMap[profileId].comisionReferido += item.monto_centavos;
					} else if (item.tipo === 'fee_logistica') {
						rankingMap[profileId].feeLogistica += item.monto_centavos;
					}
				}

				const ranking = Object.values(rankingMap)
					.sort((a, b) => (b.comisionReferido + b.feeLogistica) - (a.comisionReferido + a.feeLogistica))
					.slice(0, 10);

				return { 
					success: true, 
					data: {
						totalVendido,
						totalDevengado,
						payoutsPendientes,
						ranking
					}
				};
			} catch(e: any) {
				return { success: false, error: mensajeParaCliente(e) };
			}
		}
	}),

	createPayout: defineAction({
		accept: 'form',
		input: z.object({
			profileId: z.string(),
			medioPago: z.string(),
			referenciaPago: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				const actor = requireRole(ctx, 'admin');

				const res = await liquidarComisiones({
					profileId: input.profileId,
					medioPago: input.medioPago,
					referenciaPago: input.referenciaPago,
					// Sin clave provista, se deriva del perfil y la referencia para
					// que reenviar el mismo formulario no pague dos veces.
					idempotencyKey: `payout:${input.profileId}:${input.referenciaPago}`,
					actorProfileId: actor.profileId
				});

				await sincronizarSaldoDisponible(input.profileId);

				return { success: true, payoutId: res.payoutId, montoCentavos: res.montoCentavos };
			} catch(e: any) {
				return { success: false, error: mensajeParaCliente(e) };
			}
		}
	}),

	updateOrderStatus: defineAction({
		accept: 'json',
		input: z.object({
			orderId: z.string(),
			nuevoEstado: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				const actor = requireRole(ctx, 'admin', 'gestion');

				const targetState = normalizarEstadoPedido(input.nuevoEstado);
				if (!targetState) {
					throw new Error(`Estado desconocido: "${input.nuevoEstado}".`);
				}

				const order = await db.getDocument('urbanpoint', 'orders', input.orderId);
				// Normalizar también el estado actual: una fila con un alias
				// histórico ('listo_retiro', 'preparado'…) hacía que TRANSICIONES
				// devolviera undefined y la orden quedara congelada para siempre.
				const estadoActual = normalizarEstadoPedido(order.estado) ?? (order.estado as EstadoPedido);

				if (estadoActual === targetState) {
					return { success: true, sinCambios: true };
				}

				if (!esTransicionValida(estadoActual, targetState)) {
					throw new Error(
						`No se puede pasar de "${estadoActual}" a "${targetState}".`
					);
				}

				if (targetState === 'cancelado') {
					await cancelarOrdenYRestaurarStock(input.orderId);
				} else if (targetState === 'pagado') {
					await db.updateDocument('urbanpoint', 'orders', input.orderId, {
						estado: 'pagado',
						paid_at: new Date().toISOString()
					});
					await resolverComisiones(input.orderId);
				} else {
					await db.updateDocument('urbanpoint', 'orders', input.orderId, {
						estado: targetState
					});

					// Al cerrar la entrega desde el admin también hay que confirmar
					// las comisiones (pendiente → disponible); antes sólo lo hacía
					// deliverOrder y los asientos quedaban impagables para siempre.
					if (targetState === 'entregado' || targetState === 'retirado') {
						try {
							await confirmarComisionesDeOrden(input.orderId);
						} catch (e) {
							console.warn('No se pudieron confirmar comisiones para la orden', input.orderId, e);
						}
					}
				}

				await registrarEventoOrden(input.orderId, estadoActual, targetState, actor.profileId);

				// Notificar al cliente si el pedido pasó a listo_para_retirar o estado relevante
				try {
					let pickupNodeName = '';
					let pickupNodeAddress = '';
					const ptId = typeof order.pickup_point_id === 'string' ? order.pickup_point_id : order.pickup_point_id?.$id;
					if (ptId) {
						const pt: any = await db.getDocument('urbanpoint', 'pickup_points', ptId).catch(() => null);
						if (pt) {
							pickupNodeName = pt.nombre_comercial;
							pickupNodeAddress = pt.direccion + (pt.localidad ? `, ${pt.localidad}` : '');
						}
					}

					// El email del cliente sale de su profile (customer_id): los
					// atributos customer_email/guest_email no se escriben nunca,
					// así que con ellos la notificación jamás llegaba.
					let notifCustomerName = order.customer_name || order.guest_name || '';
					let notifCustomerEmail = order.customer_email || order.guest_email || '';
					const custId = typeof order.customer_id === 'string' ? order.customer_id : order.customer_id?.$id;
					if (!notifCustomerEmail && custId) {
						const custProf: any = await db.getDocument('urbanpoint', 'profiles', custId).catch(() => null);
						if (custProf) {
							notifCustomerName = notifCustomerName || custProf.nombre || '';
							notifCustomerEmail = custProf.email || '';
						}
					}

					await sendOrderStatusNotificationEmail({
						$id: order.$id,
						numero: order.numero,
						total: order.total,
						estado: targetState,
						pickup_code_hash: order.pickup_code_hash,
						customerName: notifCustomerName,
						customerEmail: notifCustomerEmail,
						pickupNodeName,
						pickupNodeAddress
					});
				} catch (e: any) {
					console.error('[Mailer Error Order Status]:', e.message);
				}

				return { success: true };

			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	updateOrderItems: defineAction({
		accept: 'json',
		input: z.object({
			orderId: z.string(),
			items: z.array(z.object({
				product_id: z.string().nullable().optional(),
				cantidad: z.number().min(1),
				precio_unitario_centavos: z.number().min(0),
				nombre_snapshot: z.string().optional(),
				sku_snapshot: z.string().optional()
			}))
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin', 'gestion');

				// 1. Fetch current order items (sin Query.limit, Appwrite trae 25:
				// un pedido más grande dejaba ítems huérfanos al recrear)
				const currentItemsRes = await db.listDocuments('urbanpoint', 'order_items', [
					Query.equal('order_id', input.orderId),
					Query.limit(500)
				]);

				// 2. Delete all existing items for this order
				await Promise.all(currentItemsRes.documents.map(item =>
					db.deleteDocument('urbanpoint', 'order_items', item.$id)
				));

				// 3. Create new items and calculate total
				let newSubtotal = 0;
				for (const newItem of input.items) {
					let prodSnapshot = { 
						nombre: newItem.nombre_snapshot || 'Producto', 
						sku: newItem.sku_snapshot || 'SKU-N/A' 
					};

					const cleanProdId = newItem.product_id ? newItem.product_id.trim() : null;

					if (cleanProdId) {
						try {
							const prod = await db.getDocument('urbanpoint', 'products', cleanProdId);
							prodSnapshot = { 
								nombre: prod.nombre || prodSnapshot.nombre, 
								sku: prod.sku || prodSnapshot.sku 
							};
						} catch(e) {}
					}

					const subtotal_centavos = newItem.cantidad * newItem.precio_unitario_centavos;
					newSubtotal += subtotal_centavos;

					const docPayload: any = {
						order_id: input.orderId,
						cantidad: newItem.cantidad,
						precio_unitario: newItem.precio_unitario_centavos,
						subtotal: subtotal_centavos,
						nombre_snapshot: prodSnapshot.nombre,
						sku_snapshot: prodSnapshot.sku
					};

					if (cleanProdId) {
						docPayload.product_id = cleanProdId;
					}

					await db.createDocument('urbanpoint', 'order_items', ID.unique(), docPayload);
				}

				// 4. Update order total
				const order = await db.getDocument('urbanpoint', 'orders', input.orderId);
				const envio = order.costo_envio || 0;
				const descuento = order.descuento || 0;
				const newTotal = newSubtotal + envio - descuento;

				await db.updateDocument('urbanpoint', 'orders', input.orderId, {
					subtotal: newSubtotal,
					total: Math.max(0, newTotal)
				});

				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	createProduct: defineAction({
		accept: 'json',
		input: z.object({
			nombre: z.string().min(2),
			tipo: z.string().optional()
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin', 'gestion');

				const slug = input.nombre
					.toLowerCase()
					.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/(^-|-$)+/g, '') + '-' + Math.floor(Math.random()*1000);

				const sku = 'SKU-' + Math.floor(100000 + Math.random() * 900000);

				const payload: any = {
					nombre: input.nombre,
					slug: slug,
					sku: sku,
					descripcion: '',
					precio: 0,
					stock: 0,
					estado: 'borrador',
					iva_pct: 21.0
				};

				const doc = await escribirDocumentoTolerante('products', payload);
				invalidateCatalogCache();

				return { success: true, id: doc.$id };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	updateProduct: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string(),
			nombre: z.string().min(2).optional(),
			descripcion: z.string().optional(),
			precio: z.number().min(0).optional(),
			precio_promocional: z.number().min(0).optional(),
			precio_distribuidor: z.number().min(0).optional(),
			precio_canillita: z.number().min(0).optional(),
			costo: z.number().min(0).optional().nullable(),
			cost: z.number().min(0).optional().nullable(),
			
			distribuidor_mode: z.enum(['inherit', 'percent', 'fixed']).optional(),
			distribuidor_percent: z.number().optional().nullable(),
			distribuidor_fixed_price: z.number().optional().nullable(),

			canillita_mode: z.enum(['inherit', 'percent', 'fixed']).optional(),
			canillita_percent: z.number().optional().nullable(),
			canillita_fixed_price: z.number().optional().nullable(),

			publico_mode: z.enum(['inherit', 'percent', 'fixed']).optional(),
			publico_percent: z.number().optional().nullable(),
			publico_fixed_price: z.number().optional().nullable(),

			stock: z.number().min(0).optional(),
			stock_maximo: z.number().min(0).optional(),
			nivel_reorden: z.number().min(0).optional(),
			tiempo_reposicion: z.number().min(0).optional(),
			envio_config: z.string().optional(),
			seo_config: z.string().optional(),
			variantes: z.string().optional(),
			tramos_cantidad: z.string().optional(),
			galeria_urls: z.string().optional(),
			portada_url: z.string().optional(),
			estado: z.enum(['activo', 'borrador', 'pausado', 'inactivo']).optional(),
			categoria_id: z.string().optional().nullable(),
			destacado: z.boolean().optional(),
			es_nuevo_manual: z.boolean().optional().nullable(),
			marca: z.string().optional()
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin', 'gestion');

				// El panel manda la categoría junto con el resto, así que se puede
				// pedir en paralelo con el producto en vez de esperar a saber cuál es.
				// Eran tres viajes encadenados —producto, categoría, escritura— contra
				// un backend de ~1,1 s de ida y vuelta: el guardado del modal tardaba
				// una mediana de 4,7 s.
				const catIdDelInput = input.categoria_id
					? (typeof input.categoria_id === 'string' ? input.categoria_id : (input.categoria_id as any).$id)
					: null;

				const [currentDoc, catDocAdelantado] = await Promise.all([
					db.getDocument('urbanpoint', 'products', input.id),
					catIdDelInput
						? db.getDocument('urbanpoint', 'categories', catIdDelInput).catch(() => null)
						: Promise.resolve(null)
				]);
				const updateData: any = {};

				if (input.nombre !== undefined) updateData.nombre = input.nombre;
				if (input.descripcion !== undefined) updateData.descripcion = input.descripcion;
				if (input.stock !== undefined) updateData.stock = input.stock;
				if (input.estado !== undefined) {
					updateData.estado = input.estado === 'inactivo' ? 'pausado' : input.estado;
				}

				if (input.marca !== undefined) updateData.marca = input.marca;
				
				const finalCost = input.cost !== undefined ? input.cost : (input.costo !== undefined ? input.costo : currentDoc.cost ?? currentDoc.costo);
				// Sólo `costo`. `cost` no existe en la colección: era un alias en
				// inglés que se escribía al vacío y consumía uno de los diez
				// reintentos de escribirDocumentoTolerante.
				updateData.costo = finalCost;

				if (input.distribuidor_mode !== undefined) updateData.distribuidor_mode = input.distribuidor_mode;
				if (input.distribuidor_percent !== undefined) updateData.distribuidor_percent = input.distribuidor_percent;
				if (input.distribuidor_fixed_price !== undefined) updateData.distribuidor_fixed_price = input.distribuidor_fixed_price;

				if (input.canillita_mode !== undefined) updateData.canillita_mode = input.canillita_mode;
				if (input.canillita_percent !== undefined) updateData.canillita_percent = input.canillita_percent;
				if (input.canillita_fixed_price !== undefined) updateData.canillita_fixed_price = input.canillita_fixed_price;

				if (input.publico_mode !== undefined) updateData.publico_mode = input.publico_mode;
				if (input.publico_percent !== undefined) updateData.publico_percent = input.publico_percent;
				if (input.publico_fixed_price !== undefined) updateData.publico_fixed_price = input.publico_fixed_price;

				if (input.stock_maximo !== undefined) updateData.stock_maximo = input.stock_maximo;
				if (input.nivel_reorden !== undefined) updateData.nivel_reorden = input.nivel_reorden;
				if (input.tiempo_reposicion !== undefined) updateData.tiempo_reposicion = input.tiempo_reposicion;
				if (input.envio_config !== undefined) updateData.envio_config = input.envio_config;
				if (input.seo_config !== undefined) updateData.seo_config = input.seo_config;
				if (input.variantes !== undefined) updateData.variantes = input.variantes;
				if (input.tramos_cantidad !== undefined) updateData.tramos_cantidad = input.tramos_cantidad;
				if (input.galeria_urls !== undefined) updateData.galeria_urls = input.galeria_urls;
				if (input.portada_url !== undefined) updateData.portada_url = input.portada_url;
				if (input.destacado !== undefined) updateData.destacado = input.destacado;

				if (input.categoria_id !== undefined) {
					updateData.categoria_id = input.categoria_id || null;
				}

				// Merged document for recalculation
				const merged = { ...currentDoc, ...updateData };

				// La categoría ya vino en paralelo si el panel la mandó. Sólo se pide
				// acá cuando cambió respecto de lo que se adelantó, que es el caso raro.
				const targetCatId = merged.categoria_id ? (typeof merged.categoria_id === 'string' ? merged.categoria_id : merged.categoria_id.$id) : null;
				let catDoc = catIdDelInput && catIdDelInput === targetCatId ? catDocAdelantado : null;
				if (targetCatId && !catDoc) {
					try {
						catDoc = await db.getDocument('urbanpoint', 'categories', targetCatId);
					} catch (e) {}
				}
				const settings = await getSiteSettings();

				// Un solo nombre por precio. Antes cada uno se escribía dos veces
				// —precio_x y price_x—, y los price_* ni siquiera existían en la
				// colección: trece campos desconocidos contra diez reintentos, así
				// que guardar un producto fallaba con "demasiados atributos
				// desconocidos". Dos campos para el mismo número son además dos
				// fuentes de verdad que se pueden desincronizar.
				const recalculated = recalculateProductPrices(merged, catDoc, settings);

				if (recalculated.price_distribuidor !== null) {
					updateData.precio_distribuidor = recalculated.price_distribuidor;
				}
				if (recalculated.price_canillita !== null) {
					updateData.precio_canillita = recalculated.price_canillita;
				}
				// Si el admin tipeó un precio nuevo, esa decisión explícita gana
				// sobre el recalculado por costo×markup (antes se pisaba en
				// silencio). Si no lo tocó, rige el recalculado.
				const adminCambioPrecio = input.precio !== undefined && input.precio !== (currentDoc.precio ?? null);
				if (adminCambioPrecio) {
					updateData.precio = input.precio;
				} else if (recalculated.price_publico !== null) {
					updateData.precio = recalculated.price_publico;
				} else if (input.precio !== undefined) {
					updateData.precio = input.precio;
				}

				if (input.precio_promocional !== undefined) {
					const finalPrecio = updateData.precio ?? currentDoc.precio;
					if (input.precio_promocional <= 0 || (finalPrecio !== undefined && input.precio_promocional >= finalPrecio)) {
						updateData.precio_promocional = null;
					} else {
						updateData.precio_promocional = input.precio_promocional;
					}
				}

				await escribirDocumentoTolerante('products', updateData, input.id);
				invalidateCatalogCache();

				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	bulkUpdateProducts: defineAction({
		accept: 'json',
		input: z.object({
			ids: z.array(z.string()),
			estado: z.enum(['activo', 'borrador', 'pausado']).optional(),
			categoria_id: z.string().optional(),
			accion: z.enum(['eliminar', 'activar', 'pausar']).optional()
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin', 'gestion');

				for (const id of input.ids) {
					if (input.accion === 'eliminar') {
						await db.deleteDocument('urbanpoint', 'products', id);
					} else {
						const updatePayload: any = {};
						if (input.accion === 'activar') updatePayload.estado = 'activo';
						if (input.accion === 'pausar') updatePayload.estado = 'pausado';
						if (input.estado) updatePayload.estado = input.estado;
						if (input.categoria_id !== undefined) updatePayload.categoria_id = input.categoria_id || null;

						if (Object.keys(updatePayload).length > 0) {
							await escribirDocumentoTolerante('products', updatePayload, id);
						}
					}
				}
				invalidateCatalogCache();
				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	deleteProduct: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin', 'gestion');

				await db.deleteDocument('urbanpoint', 'products', input.id);
				invalidateCatalogCache();
				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	duplicateProduct: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin', 'gestion');

				const original = await db.getDocument('urbanpoint', 'products', input.id);
				const newSku = 'SKU-' + Math.floor(100000 + Math.random() * 900000);
				const newSlug = original.slug + '-copia-' + Math.floor(Math.random() * 1000);

				const duplicatePayload: any = {
					nombre: original.nombre + ' (Copia)',
					slug: newSlug,
					sku: newSku,
					descripcion: original.descripcion || '',
					precio: original.precio || 0,
					stock: original.stock || 0,
					estado: 'borrador',
					iva_pct: original.iva_pct || 21.0
				};

				if (original.categoria_id) {
					duplicatePayload.categoria_id = typeof original.categoria_id === 'string' ? original.categoria_id : original.categoria_id.$id;
				}
				if (original.precio_distribuidor !== undefined) duplicatePayload.precio_distribuidor = original.precio_distribuidor;
				if (original.precio_canillita !== undefined) duplicatePayload.precio_canillita = original.precio_canillita;

				const doc = await escribirDocumentoTolerante('products', duplicatePayload);
				return { success: true, id: doc.$id };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	importProductsBulk: defineAction({
		accept: 'json',
		input: z.object({
			items: z.array(z.object({
				nombre: z.string(),
				sku: z.string().optional(),
				precio: z.number(),
				precio_promocional: z.number().optional().nullable(),
				precio_canillita: z.number().optional().nullable(),
				precio_distribuidor: z.number().optional().nullable(),
				costo: z.number().optional().nullable(),
				stock: z.number(),
				estado: z.string().optional(),
				categoria_id: z.string().optional().nullable(),
				categoria_nombre: z.string().optional().nullable(),
				marca: z.string().optional(),
				portada_url: z.string().optional(),
				descripcion: z.string().optional(),
				// Agrupado de variantes. Si no viene, se deduce del nombre al mostrar
				// (ver src/lib/variantes.ts): la columna sólo hace falta cuando el
				// nombre no alcanza para separar el grupo de la variante.
				grupo: z.string().optional().nullable(),
				// Prioridad en la vitrina. Mayor primero; empata por fecha de alta.
				orden: z.number().optional().nullable()
			}))
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede importar productos');
				}

				// Cargar mapa completo de categorías (con paginación y normalización de acentos)
				const normCatKey = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
				const catMap: Record<string, string> = {};
				try {
					let catOffset = 0;
					while (true) {
						const catRes = await db.listDocuments('urbanpoint', 'categories', [
							Query.limit(100),
							Query.offset(catOffset)
						]);
						catRes.documents.forEach((c: any) => {
							if (c.$id) catMap[c.$id] = c.$id;
							if (c.nombre) {
								catMap[c.nombre.toLowerCase().trim()] = c.$id;
								catMap[normCatKey(c.nombre)] = c.$id;
							}
						});
						if (catRes.documents.length < 100) break;
						catOffset += 100;
					}
				} catch (e) {}

				// Creaciones de categoría en curso. Sin esto, dos filas del mismo lote
				// que nombran una categoría nueva la crean dos veces: al ir en paralelo
				// ninguna ve todavía lo que la otra escribió en catMap.
				const creandoCategoria = new Map<string, Promise<string | null>>();

				const resolveOrCreateCategory = async (catIdOrName?: string | null): Promise<string | null> => {
					if (!catIdOrName || !catIdOrName.trim()) return null;
					const raw = catIdOrName.trim();
					if (catMap[raw]) return catMap[raw];
					const norm = normCatKey(raw);
					if (catMap[norm]) return catMap[norm];
					const lower = raw.toLowerCase();
					if (catMap[lower]) return catMap[lower];

					// Si otra fila del mismo lote ya la está creando, se espera a esa.
					const enVuelo = creandoCategoria.get(norm);
					if (enVuelo) return enVuelo;

					// Autocreación de categoría inexistente si viene informada en el CSV
					const promesa = (async () => {
					try {
						const catSlug = norm.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || `cat-${Date.now()}`;
						const created = await escribirDocumentoTolerante('categories', {
							nombre: raw,
							slug: catSlug,
							estado: 'activo'
						});
						if (created && created.$id) {
							catMap[raw] = created.$id;
							catMap[norm] = created.$id;
							catMap[lower] = created.$id;
							return created.$id;
						}
					} catch (errCat) {
						console.error('Error autocreando categoría en importación:', errCat);
					}
					return null;
					})();

					creandoCategoria.set(norm, promesa);
					return promesa;
				};

				/**
				 * Se escribe en lotes paralelos, no de a un producto por vez.
				 *
				 * Medido contra este backend: en serie tardaba ~1,1 s por producto, o
				 * sea 19 minutos para mil filas. Cualquier proxy corta la request mucho
				 * antes, y el importador no avisaba: entraba una parte del catálogo y
				 * el resto se perdía en silencio. Era el "se suben algunos productos de
				 * manera aleatoria" que se venía reportando.
				 */
				const LOTE = 12;

				/**
				 * Qué SKUs del archivo ya están en el catálogo.
				 *
				 * Sin esto el importador siempre creaba: volver a subir el mismo CSV
				 * —lo que se hace naturalmente cuando una importación se corta a la
				 * mitad— duplicaba todo lo que ya había entrado. Así se llegó a 1.715
				 * productos repetidos, algunos hasta 16 veces.
				 *
				 * Se consulta sólo por los SKUs del archivo, en tandas, en vez de
				 * traer el catálogo entero: son 6.495 productos y no hacen falta.
				 */
				const skusDelArchivo = [...new Set(
					input.items.map(i => (i.sku || '').trim()).filter(Boolean)
				)];
				const existentePorSku = new Map<string, string>();

				for (let i = 0; i < skusDelArchivo.length; i += 100) {
					const tanda = skusDelArchivo.slice(i, i + 100);
					try {
						const res = await db.listDocuments('urbanpoint', 'products', [
							Query.equal('sku', tanda),
							Query.limit(100)
						]);
						for (const doc of res.documents) {
							const clave = String((doc as any).sku || '').trim();
							// Si hay más de uno con el mismo SKU, se actualiza el primero.
							if (clave && !existentePorSku.has(clave)) existentePorSku.set(clave, doc.$id);
						}
					} catch (e) {
						console.error('No se pudieron consultar SKUs existentes:', e);
					}
				}

				/**
				 * Filas que repiten un SKU ya usado por otra fila del mismo envío.
				 *
				 * El SKU es la identidad del producto: dos variantes del mismo artículo
				 * son productos distintos y necesitan SKU distinto. Si se repite no hay
				 * forma de saber cuál gana, y como el lote se escribe en paralelo
				 * ninguna de las dos filas ve a la otra: las dos se crean y el
				 * duplicado vuelve a entrar por la puerta de atrás, que es justo lo que
				 * el cotejo por SKU vino a evitar.
				 *
				 * Se conserva la primera y se rechaza la repetida, informando la fila.
				 * El modal además valida el archivo entero antes de mandarlo, porque
				 * acá sólo se ve la tanda en curso.
				 */
				const skuYaVisto = new Set<string>();
				const filaRechazada = new Map<number, string>();
				input.items.forEach((item, idx) => {
					const sku = (item.sku || '').trim();
					if (!sku) return;
					if (skuYaVisto.has(sku)) {
						filaRechazada.set(idx, `SKU repetido dentro del mismo archivo: "${sku}". Cada producto, y cada variante, necesita su propio SKU.`);
					} else {
						skuYaVisto.add(sku);
					}
				});

				let creados = 0;
				let actualizados = 0;
				const errores: Array<{ fila: number; nombre: string; motivo: string }> = [];

				const importarUno = async (item: any) => {
					const slug = item.nombre
						.toLowerCase()
						.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
						.replace(/[^a-z0-9]+/g, '-')
						.replace(/(^-|-$)+/g, '') + '-' + Math.floor(Math.random()*1000);

					const sku = item.sku || 'SKU-' + Math.floor(100000 + Math.random() * 900000);
					const catId = await resolveOrCreateCategory(item.categoria_id || item.categoria_nombre);

					const payload: any = {
						nombre: item.nombre,
						slug: slug,
						sku: sku,
						descripcion: item.descripcion || '',
						precio: item.precio,
						stock: item.stock,
						estado: item.estado || 'activo',
						iva_pct: 21.0
					};

					if (item.precio_promocional !== undefined && item.precio_promocional !== null) payload.precio_promocional = item.precio_promocional;
					if (item.precio_canillita !== undefined && item.precio_canillita !== null) payload.precio_canillita = item.precio_canillita;
					if (item.precio_distribuidor !== undefined && item.precio_distribuidor !== null) payload.precio_distribuidor = item.precio_distribuidor;
					if (item.costo !== undefined && item.costo !== null) payload.costo = item.costo;
					if (catId) payload.categoria_id = catId;
					if (item.marca) payload.marca = item.marca;
					if (item.grupo && item.grupo.trim()) payload.grupo = item.grupo.trim();
					if (item.orden !== undefined && item.orden !== null) payload.orden = item.orden;

					// Manejo inteligente de múltiples fotos: la 1ra es portada, las siguientes van a galería
					if (item.portada_url) {
						const urls = item.portada_url.split(/[,|\n;]/).map(u => u.trim()).filter(Boolean);
						if (urls.length > 0) {
							payload.portada_url = urls[0];
							if (urls.length > 1) {
								payload.galeria_urls = JSON.stringify(urls.slice(1));
							}
						}
					}

					const yaExiste = existentePorSku.get(sku);
					if (yaExiste) {
						// El slug se conserva: es la URL pública del producto y cambiarlo
						// rompería los enlaces que ya estén dando vueltas.
						delete payload.slug;
						await escribirDocumentoTolerante('products', payload, yaExiste);
						actualizados++;
					} else {
						await escribirDocumentoTolerante('products', payload);
						creados++;
					}
				};

				for (let i = 0; i < input.items.length; i += LOTE) {
					const lote = input.items.slice(i, i + LOTE);
					await Promise.all(lote.map(async (item, j) => {
						const motivoRechazo = filaRechazada.get(i + j);
						if (motivoRechazo) {
							errores.push({ fila: i + j + 2, nombre: item.nombre, motivo: motivoRechazo });
							return;
						}
						try {
							await importarUno(item);
						} catch (e: any) {
							// Una fila mala no puede cortar la importación entera: antes la
							// primera excepción abortaba todo lo que venía después.
							errores.push({
								fila: i + j + 2, // +2: la fila 1 del CSV son los encabezados
								nombre: item.nombre,
								motivo: String(e?.message || e).slice(0, 200)
							});
						}
					}));
				}

				invalidateCatalogCache();
				// Se informa qué entró y qué no. Antes sólo volvía `count`, así que una
				// importación cortada por la mitad se veía igual que una completa.
				return {
					success: true,
					count: creados + actualizados,
					creados,
					actualizados,
					total: input.items.length,
					errores
				};
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	reimportProductsStock: defineAction({
		accept: 'json',
		input: z.object({
			updates: z.array(z.object({
				id: z.string().optional(),
				sku: z.string().optional(),
				nombre: z.string().optional(),
				precio: z.number().optional(),
				precio_promocional: z.number().optional().nullable(),
				precio_canillita: z.number().optional().nullable(),
				precio_distribuidor: z.number().optional().nullable(),
				costo: z.number().optional().nullable(),
				stock: z.number().optional(),
				estado: z.string().optional(),
				categoria_id: z.string().optional().nullable(),
				categoria_nombre: z.string().optional().nullable(),
				marca: z.string().optional(),
				portada_url: z.string().optional(),
				descripcion: z.string().optional()
			}))
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede re-importar productos');
				}

				// Cargar TODOS los productos mediante paginado offset
				const allProducts: any[] = [];
				let offset = 0;
				while (true) {
					const res = await db.listDocuments('urbanpoint', 'products', [
						Query.limit(100),
						Query.offset(offset)
					]);
					allProducts.push(...res.documents);
					if (res.documents.length < 100) break;
					offset += 100;
				}

				// Cargar mapa completo de categorías (con paginación y normalización de acentos)
				const normCatKey = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
				const catMap: Record<string, string> = {};
				try {
					let catOffset = 0;
					while (true) {
						const catRes = await db.listDocuments('urbanpoint', 'categories', [
							Query.limit(100),
							Query.offset(catOffset)
						]);
						catRes.documents.forEach((c: any) => {
							if (c.$id) catMap[c.$id] = c.$id;
							if (c.nombre) {
								catMap[c.nombre.toLowerCase().trim()] = c.$id;
								catMap[normCatKey(c.nombre)] = c.$id;
							}
						});
						if (catRes.documents.length < 100) break;
						catOffset += 100;
					}
				} catch (e) {}

				const resolveOrCreateCategory = async (catIdOrName?: string | null): Promise<string | null> => {
					if (!catIdOrName || !catIdOrName.trim()) return null;
					const raw = catIdOrName.trim();
					if (catMap[raw]) return catMap[raw];
					const norm = normCatKey(raw);
					if (catMap[norm]) return catMap[norm];
					const lower = raw.toLowerCase();
					if (catMap[lower]) return catMap[lower];

					// Autocreación de categoría inexistente si viene informada en el CSV
					try {
						const catSlug = norm.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || `cat-${Date.now()}`;
						const created = await escribirDocumentoTolerante('categories', {
							nombre: raw,
							slug: catSlug,
							estado: 'activo'
						});
						if (created && created.$id) {
							catMap[raw] = created.$id;
							catMap[norm] = created.$id;
							catMap[lower] = created.$id;
							return created.$id;
						}
					} catch (errCat) {
						console.error('Error autocreando categoría en importación:', errCat);
					}
					return null;
				};

				let updated = 0;
				let created = 0;

				for (const update of input.updates) {
					const cleanId = update.id?.trim();
					const cleanSku = update.sku?.trim();
					const cleanNombre = update.nombre?.trim().toLowerCase();

					// Buscar coincidencia por ID, SKU o Nombre
					let target = allProducts.find(p => cleanId && p.$id === cleanId);
					if (!target && cleanSku) {
						target = allProducts.find(p => p.sku && p.sku.trim() === cleanSku);
					}
					if (!target && cleanNombre) {
						target = allProducts.find(p => p.nombre && p.nombre.trim().toLowerCase() === cleanNombre);
					}

					const catId = await resolveOrCreateCategory(update.categoria_id || update.categoria_nombre);

					if (target) {
						const patch: any = {};
						if (update.nombre !== undefined && update.nombre.trim().length > 0) patch.nombre = update.nombre.trim();
						if (update.precio !== undefined) patch.precio = update.precio;
						if (update.precio_promocional !== undefined) patch.precio_promocional = update.precio_promocional;
						if (update.precio_canillita !== undefined) patch.precio_canillita = update.precio_canillita;
						if (update.precio_distribuidor !== undefined) patch.precio_distribuidor = update.precio_distribuidor;
						if (update.costo !== undefined) patch.costo = update.costo;
						if (update.stock !== undefined) patch.stock = update.stock;
						if (update.estado !== undefined && ['activo', 'borrador', 'pausado', 'inactivo'].includes(update.estado)) patch.estado = update.estado;
						if (catId) patch.categoria_id = catId;
						if (update.marca !== undefined) patch.marca = update.marca;
						if (update.portada_url !== undefined) {
							const urls = (update.portada_url || '').split(/[,|\n;]/).map(u => u.trim()).filter(Boolean);
							if (urls.length > 0) {
								patch.portada_url = urls[0];
								if (urls.length > 1) {
									patch.galeria_urls = JSON.stringify(urls.slice(1));
								}
							}
						}
						if (update.descripcion !== undefined) patch.descripcion = update.descripcion;

						if (Object.keys(patch).length > 0) {
							await escribirDocumentoTolerante('products', patch, target.$id);
							updated++;
						}
					} else if (update.nombre && update.precio !== undefined) {
						// Crear producto si no existía y tiene al menos nombre y precio
						const slug = update.nombre
							.toLowerCase()
							.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
							.replace(/[^a-z0-9]+/g, '-')
							.replace(/(^-|-$)+/g, '') + '-' + Math.floor(Math.random()*1000);

						const newSku = update.sku || 'SKU-' + Math.floor(100000 + Math.random() * 900000);

						const newPayload: any = {
							nombre: update.nombre,
							slug,
							sku: newSku,
							descripcion: update.descripcion || '',
							precio: update.precio,
							stock: update.stock !== undefined ? update.stock : 0,
							estado: update.estado || 'activo',
							iva_pct: 21.0
						};

						if (update.precio_promocional !== undefined && update.precio_promocional !== null) newPayload.precio_promocional = update.precio_promocional;
						if (update.precio_canillita !== undefined && update.precio_canillita !== null) newPayload.precio_canillita = update.precio_canillita;
						if (update.precio_distribuidor !== undefined && update.precio_distribuidor !== null) newPayload.precio_distribuidor = update.precio_distribuidor;
						if (update.costo !== undefined && update.costo !== null) newPayload.costo = update.costo;
						if (catId) newPayload.categoria_id = catId;
						if (update.marca) newPayload.marca = update.marca;
						if (update.portada_url) {
							const urls = update.portada_url.split(/[,|\n;]/).map(u => u.trim()).filter(Boolean);
							if (urls.length > 0) {
								newPayload.portada_url = urls[0];
								if (urls.length > 1) {
									newPayload.galeria_urls = JSON.stringify(urls.slice(1));
								}
							}
						}

						await escribirDocumentoTolerante('products', newPayload);
						created++;
					}
				}

				invalidateCatalogCache();
				return { success: true, updated, created, totalProcessed: input.updates.length };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	createPromocion: defineAction({
		accept: 'json',
		input: z.object({
			nombre: z.string().min(2),
			tipo: z.string(),
			valor: z.number(),
			desde: z.string(),
			hasta: z.string(),
			estado: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede crear promociones');
				}

				// Sin fallback "demo": devolver success con un id inventado hacía
				// que la UI mostrara como creada una promoción que no existe.
				const doc = await db.createDocument('urbanpoint', 'promotions', ID.unique(), {
					nombre: input.nombre,
					tipo: input.tipo,
					valor: input.valor,
					desde: input.desde,
					hasta: input.hasta,
					estado: input.estado
				});
				return { success: true, id: doc.$id };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	savePickupPoint: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string().optional(),
			nombre_comercial: z.string().min(2),
			titular_nombre: z.string().optional(),
			email: z.string().optional(),
			password: z.string().optional(),
			slug: z.string().optional(),
			direccion: z.string().min(3),
			localidad: z.string().min(2),
			provincia: z.string().optional(),
			horarios: z.string().optional(),
			telefono: z.string().optional(),
			lat: z.number().optional().default(-34.6037),
			lng: z.number().optional().default(-58.3816),
			estado: z.string().optional(),
			comision_pct: z.number().optional()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo los administradores pueden gestionar puntos de retiro');
				}

				let profileId: string | undefined = undefined;

				// Create or update linked Canillita user account & profile if email is provided
				if (input.email && input.email.trim()) {
					const cleanEmail = input.email.trim().toLowerCase();

					const profileRes = await db.listDocuments('urbanpoint', 'profiles', [
						Query.equal('email', cleanEmail),
						Query.limit(1)
					]);

					if (profileRes.documents.length > 0) {
						const existingProf = profileRes.documents[0];
						profileId = existingProf.$id;

						const profUpdates: any = { role: 'canillita' };
						if (input.titular_nombre) profUpdates.nombre = input.titular_nombre;
						if (input.telefono) profUpdates.telefono = input.telefono;

						await db.updateDocument('urbanpoint', 'profiles', profileId, profUpdates);

						if (input.password && input.password.length >= 8) {
							try {
								const { users } = createAdminClient();
								await users.updatePassword(existingProf.user_id || profileId, input.password);
							} catch (e: any) {
								console.error("Error updating user password:", e.message);
							}
						}
					} else {
						const { users } = createAdminClient();
						// Sin contraseña provista se genera una aleatoria: la fija
						// 'Canillita2026!' dejaba a todos los canillitas creados sin
						// clave con la misma credencial conocida y publicada en el repo.
						const pwd = input.password && input.password.length >= 8
							? input.password
							: `Up-${randomBytes(9).toString('base64url')}`;
						const name = input.titular_nombre || input.nombre_comercial;

						const authUser = await users.create(ID.unique(), cleanEmail, undefined, pwd, name);

						const newProf = await db.createDocument('urbanpoint', 'profiles', ID.unique(), {
							user_id: authUser.$id,
							nombre: name,
							email: cleanEmail,
							telefono: input.telefono || '',
							role: 'canillita'
						});
						profileId = newProf.$id;

						try {
							const refCode = await generateUniqueReferralCode(name, '');
							await db.createDocument('urbanpoint', 'referral_codes', ID.unique(), {
								code: refCode,
								owner_id: profileId,
								// El atributo es 'activo' (con 'active' el código nacía
								// inactivo y el canillita no podía referir ventas).
								activo: true,
								total_uses: 0
							});
						} catch (e: any) {
							console.error('No se pudo crear el código de referido del canillita nuevo:', e.message);
						}
					}
				}

				const payload: any = {
					nombre_comercial: input.nombre_comercial,
					direccion: input.direccion,
					localidad: input.localidad,
					provincia: input.provincia || 'CABA',
					horarios: input.horarios || 'Lunes a Sábado 09:00 a 20:00 hs.',
					telefono: input.telefono || '',
					lat: input.lat,
					lng: input.lng,
					estado: input.estado || 'activo'
				};

				if (profileId) {
					payload.profile_id = profileId;
				}

				let rawSlug = input.slug || (input.id ? undefined : input.nombre_comercial);
				if (rawSlug) {
					const cleanSlug = limpiarSlugNodo(rawSlug);
					if (esSlugReservado(cleanSlug)) {
						throw new Error(`El slug "${cleanSlug}" es una ruta reservada del sistema.`);
					}

					// Verify uniqueness across pickup points
					const existingRes = await db.listDocuments('urbanpoint', 'pickup_points', [
						Query.equal('slug', cleanSlug),
						Query.limit(2)
					]);
					const duplicate = existingRes.documents.find((doc: any) => doc.$id !== input.id);
					if (duplicate) {
						throw new Error(`El slug "${cleanSlug}" ya pertenece al punto "${duplicate.nombre_comercial}".`);
					}

					payload.slug = cleanSlug;
				}

				if (input.comision_pct !== undefined) {
					payload.comision_pct = input.comision_pct;
				}

				if (input.id) {
					const updated = await db.updateDocument('urbanpoint', 'pickup_points', input.id, payload);
					return { success: true, id: updated.$id };
				} else {
					const created = await db.createDocument('urbanpoint', 'pickup_points', ID.unique(), payload);
					return { success: true, id: created.$id };
				}
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	deletePickupPoint: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo los administradores pueden eliminar puntos de retiro');
				}
				await db.deleteDocument('urbanpoint', 'pickup_points', input.id);
				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	saveCategory: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string().optional(),
			nombre: z.string().min(2),
			parent_id: z.string().optional().nullable(),
			slug: z.string().optional(),
			descripcion: z.string().optional(),
			imagen_url: z.string().optional(),
			estado: z.string().optional(),
			orden: z.number().optional().nullable(),
			markup_distribuidor: z.number().optional().nullable(),
			markup_canillita: z.number().optional().nullable(),
			markup_publico: z.number().optional().nullable()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || (ctx.locals.user.role !== 'admin' && ctx.locals.user.role !== 'gestion')) {
					throw new Error('Solo los administradores pueden gestionar categorías');
				}

				const slugBase = input.slug || input.nombre;
				const cleanSlug = slugBase.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
				const cleanImg = (input.imagen_url || '').trim();

				const payload: any = {
					nombre: input.nombre.trim(),
					slug: cleanSlug || 'cat-' + Date.now(),
					parent_id: input.parent_id || null,
					descripcion: input.descripcion || '',
					imagen_url: (cleanImg && (cleanImg.startsWith('http://') || cleanImg.startsWith('https://') || cleanImg.startsWith('//'))) ? cleanImg : null,
					estado: input.estado || 'activa'
				};

				if (input.orden !== undefined && input.orden !== null) payload.orden = input.orden;
				if (input.markup_distribuidor !== undefined) payload.markup_distribuidor = input.markup_distribuidor;
				if (input.markup_canillita !== undefined) payload.markup_canillita = input.markup_canillita;
				if (input.markup_publico !== undefined) payload.markup_publico = input.markup_publico;

				let categoryId = input.id;
				if (categoryId) {
					await escribirDocumentoTolerante('categories', payload, categoryId);
				} else {
					const created = await escribirDocumentoTolerante('categories', payload);
					categoryId = created.$id;
				}

				invalidateCatalogCache();
				return { success: true, id: categoryId };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	reorderCategories: defineAction({
		accept: 'json',
		input: z.object({
			items: z.array(z.object({
				id: z.string(),
				orden: z.number(),
				parent_id: z.string().optional().nullable()
			}))
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || (ctx.locals.user.role !== 'admin' && ctx.locals.user.role !== 'gestion')) {
					throw new Error('Sin permisos');
				}
				for (const item of input.items) {
					await escribirDocumentoTolerante('categories', {
						orden: item.orden,
						parent_id: item.parent_id || null
					}, item.id);
				}
				invalidateCatalogCache();
				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	recalculateCategoryProducts: defineAction({
		accept: 'json',
		input: z.object({
			categoryId: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo los administradores pueden recalcular precios');
				}

				const category = await db.getDocument('urbanpoint', 'categories', input.categoryId);
				const settings = await getSiteSettings();

				// Fetch products in this category
				const prodsRes = await db.listDocuments('urbanpoint', 'products', [
					Query.equal('categoria_id', input.categoryId),
					Query.limit(500)
				]);

				let updatedCount = 0;

				for (const prod of prodsRes.documents) {
					const recalculated = recalculateProductPrices(prod, category, settings);
					const patch: any = {};

					if (recalculated.price_distribuidor !== null) {
						patch.price_distribuidor = recalculated.price_distribuidor;
						patch.precio_distribuidor = recalculated.price_distribuidor;
					}
					if (recalculated.price_canillita !== null) {
						patch.price_canillita = recalculated.price_canillita;
						patch.precio_canillita = recalculated.price_canillita;
					}
					if (recalculated.price_publico !== null) {
						patch.price_publico = recalculated.price_publico;
						patch.precio = recalculated.price_publico;
					}

					if (Object.keys(patch).length > 0) {
						await escribirDocumentoTolerante('products', patch, prod.$id);
						updatedCount++;
					}
				}

				invalidateCatalogCache();
				return { success: true, updatedCount };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	deleteCategory: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo los administradores pueden eliminar categorías');
				}
				await db.deleteDocument('urbanpoint', 'categories', input.id);
				invalidateCatalogCache();
				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	}),

	updateProfileRole: defineAction({
		accept: 'json',
		input: z.object({
			profileId: z.string(),
			role: z.enum(['cliente', 'canillita', 'distribuidor', 'admin'])
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin');

				const objetivo = await db.getDocument('urbanpoint', 'profiles', input.profileId);

				// No cambiarse el rol a uno mismo: un admin podía degradarse y
				// quedar sin acceso a /admin/equipo para revertirlo.
				if (objetivo.user_id && objetivo.user_id === ctx.locals.user!.id) {
					throw new Error('No podés cambiar tu propio rol.');
				}

				// Protección del último administrador. Vivía sólo en el handler
				// del formulario de /admin/equipo, así que llamar a esta action
				// —como hace la ficha de cliente— la salteaba por completo y
				// permitía degradar al único admin y dejar la tienda sin nadie
				// que pudiera restituir roles.
				if (objetivo.role === 'admin' && input.role !== 'admin') {
					const admins = await db.listDocuments('urbanpoint', 'profiles', [
						Query.equal('role', 'admin'),
						Query.limit(2)
					]);
					if (admins.documents.length <= 1) {
						throw new Error('No se puede degradar al único Administrador de la tienda.');
					}
				}

				await db.updateDocument('urbanpoint', 'profiles', input.profileId, {
					role: input.role
				});
				return { success: true };
			} catch (error: any) {
				return { success: false, error: mensajeParaCliente(error) };
			}
		}
	})
};
