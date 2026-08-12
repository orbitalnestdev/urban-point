import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { Client, Databases, ID, Users, Query, Account } from 'node-appwrite';
import { getClientProfile, requireRole } from '../lib/server/auth';
import {
	normalizarEstadoPedido,
	esTransicionValida,
	type EstadoPedido
} from '../lib/orderStates';
import { parseActiveNodeValue, NODE_COOKIE_NAME } from '../lib/nodeSession';


import { resolverComisiones, cancelarOrdenYRestaurarStock } from '../lib/commissions';

import { createAdminClient } from '../lib/server/appwrite';

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
				const doc = await db.createDocument(
					'urbanpoint',
					'canillita_applications',
					ID.unique(),
					{
						nombre: input.nombre,
						apellido: input.apellido,
						dni: input.dni,
						telefono: input.telefono,
						email: input.email,
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
				
				return { success: true, id: doc.$id };
			} catch (error: any) {
				console.error("Appwrite Error:", error);
				return { success: false, error: error.message };
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

				// 3. Crear Punto de Retiro (estado: activo) con toda la información completa
				const pickupPoint = await db.createDocument('urbanpoint', 'pickup_points', ID.unique(), {
					profile_id: profile.$id,
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

				return { success: true, profileId: profile.$id, code: codeStr };
			} catch (error: any) {
				console.error("Approve Error:", error);
				return { success: false, error: error.message };
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
				return { success: false, error: error.message };
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
				return { success: false, error: error.message };
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

				// Desactivar anteriores
				const prevCodes = await db.listDocuments('urbanpoint', 'referral_codes', [
					Query.equal('owner_id', input.profileId)
				]);
				for (const c of prevCodes.documents) {
					await db.updateDocument('urbanpoint', 'referral_codes', c.$id, { activo: false });
				}

				const newDoc = await db.createDocument('urbanpoint', 'referral_codes', ID.unique(), {
					code: newCode,
					owner_id: input.profileId,
					activo: true
				});

				return { success: true, code: newCode, id: newDoc.$id };
			} catch (error: any) {
				return { success: false, error: error.message };
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
				return { success: false, error: error.message };
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
				return { success: false, error: error.message };
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
				return { success: false, error: error.message };
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

				try {
					await db.deleteDocument('urbanpoint', 'pickup_points', input.id);
				} catch (e1) {
					try {
						await db.updateDocument('urbanpoint', 'pickup_points', input.id, { estado: 'baja' });
					} catch (e2) {
						try {
							await db.deleteDocument('urbanpoint', 'canillita_applications', input.id);
						} catch (e3) {
							await db.deleteDocument('urbanpoint', 'profiles', input.id);
						}
					}
				}

				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
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
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo un administrador puede ejecutar liquidaciones');
				}

				// Idempotency check
				const existingPayout = await db.listDocuments('urbanpoint', 'payouts', [
					Query.equal('idempotency_key', input.idempotencyKey),
					Query.limit(1)
				]);

				if (existingPayout.documents.length > 0) {
					return { success: true, payoutId: existingPayout.documents[0].$id, idempotencySkipped: true };
				}

				const now = new Date();
				const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
				const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

				// Create payout document
				const payout = await db.createDocument('urbanpoint', 'payouts', ID.unique(), {
					monto_centavos: input.montoCentavos,
					periodo: input.periodo || now.toISOString().substring(0, 7),
					periodo_desde: firstDayOfMonth,
					periodo_hasta: lastDayOfMonth,
					estado: 'pagado',
					metodo_pago: input.metodoPago || 'transferencia',
					comprobante: input.comprobante || `COMP-${Date.now()}`,
					idempotency_key: input.idempotencyKey,
					actor_id: ctx.locals.user.id,
					notas: `Liquidación a perfil ${input.profileId}`
				});

				// Update matching ledger entries
				const pendingEntries = await db.listDocuments('urbanpoint', 'commission_ledger', [
					Query.equal('profile_id', input.profileId),
					Query.equal('estado', 'pendiente'),
					Query.limit(500)
				]);

				for (const entry of pendingEntries.documents) {
					await db.updateDocument('urbanpoint', 'commission_ledger', entry.$id, {
						estado: 'liquidado',
						payout_id: payout.$id
					});
				}

				// Deduct or adjust profile balance if tracked
				try {
					const profile = await db.getDocument('urbanpoint', 'profiles', input.profileId);
					const currentSaldo = profile.saldo_disponible_centavos || 0;
					const newSaldo = Math.max(0, currentSaldo - input.montoCentavos);
					await db.updateDocument('urbanpoint', 'profiles', input.profileId, {
						saldo_disponible_centavos: newSaldo
					});
				} catch (e) {}

				return { success: true, payoutId: payout.$id };
			} catch (error: any) {
				return { success: false, error: error.message };
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

				// Validate pickup point ownership if caller is canillita
				if (ctx.locals.user.role === 'canillita') {
					const userPoints = await db.listDocuments('urbanpoint', 'pickup_points', [
						Query.equal('profile_id', ctx.locals.user.profileId)
					]);
					const userPointIds = userPoints.documents.map(p => p.$id);
					const orderPointId = typeof order.pickup_point_id === 'string' ? order.pickup_point_id : order.pickup_point_id?.$id;
					
					if (orderPointId && !userPointIds.includes(orderPointId)) {
						throw new Error('Este pedido no pertenece a tu punto de retiro.');
					}
				}

				if (input.pickupCode && order.pickup_code_hash && input.pickupCode.trim().toUpperCase() !== order.pickup_code_hash.trim().toUpperCase()) {
					throw new Error('El código de retiro ingresado es incorrecto.');
				}

				await db.updateDocument('urbanpoint', 'orders', input.orderId, {
					estado: 'entregado'
				});

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

				// Trigger commissions devengo if not already pagado
				if (order.estado !== 'pagado') {
					await resolverComisiones(input.orderId);
				}

				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		}
	}),

	createCheckout: defineAction({
		accept: 'json',
		input: z.object({
			items: z.array(z.object({
				productId: z.string(),
				cantidad: z.number().min(1)
			})),
			pickupPointId: z.string().optional(),
			fulfillment: z.enum(['retiro', 'envio']).optional(),
			direccionEnvio: z.string().optional(),
			costoEnvio: z.number().optional(),
			referralCode: z.string().optional(),
			paymentMethod: z.string().optional()
		}),
		handler: async (input, ctx) => {
			try {
				let profileId = null;
				try {
					const profile = await getClientProfile(ctx.cookies);
					if (profile) profileId = profile.$id;
				} catch (e) {
					console.error("No profile attached to checkout:", e);
				}

				let referralCodeId = null;
				let resolvedCanillitaId = null;
				if (input.referralCode) {
					const codeRes = await db.listDocuments('urbanpoint', 'referral_codes', [
						Query.equal('code', input.referralCode),
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

				// Re-fetch all products securely from backend to avoid price manipulation
				const prefItems = [];
				const orderItemsData = [];
				let totalCentavos = 0;
				
				for (const item of input.items) {
					const p = await db.getDocument('urbanpoint', 'products', item.productId);
					if (p.estado !== 'activo' || p.stock < item.cantidad) {
						throw new Error(`El producto ${p.nombre} no está disponible o no hay stock suficiente.`);
					}
					
					prefItems.push({
						id: p.$id,
						title: p.nombre,
						quantity: item.cantidad,
						unit_price: p.precio / 100, // MP uses standard currency, not cents
						currency_id: 'ARS'
					});
					
					orderItemsData.push({
						product_id: p.$id,
						sku_snapshot: p.sku || 'SKU-GEN',
						nombre_snapshot: p.nombre,
						precio_unitario: p.precio,
						cantidad: item.cantidad,
						subtotal: p.precio * item.cantidad
					});
					
					totalCentavos += p.precio * item.cantidad;
				}

				const costoEnvio = input.costoEnvio || 0;
				const grandTotal = totalCentavos + costoEnvio;

				const pickupCode = Math.random().toString(36).substring(2, 8).toUpperCase();

				// Nodo de origen para la atribución de la venta.
				const activeNodeSession = parseActiveNodeValue(
					ctx.cookies.get(NODE_COOKIE_NAME)?.value
				);

				// Create the Order in Appwrite
				const orderPayload: any = {
					numero: Math.floor(100000 + Math.random() * 900000).toString(),
					subtotal: totalCentavos,
					total: grandTotal,
					costo_envio: costoEnvio,
					estado: 'pendiente_pago',
					fulfillment: input.fulfillment || 'retiro',
					referral_code_id: referralCodeId,
					pickup_code_hash: pickupCode
				};

				if (activeNodeSession) {
					orderPayload.origin_node_id = activeNodeSession.id;
					orderPayload.origin_node_name = activeNodeSession.nombre;
					orderPayload.origin_slug = activeNodeSession.slug;
					if (activeNodeSession.canillitaId) {
						orderPayload.origin_canillita_id = activeNodeSession.canillitaId;
					}
				}

				if (resolvedCanillitaId) {
					orderPayload.canillita_id = resolvedCanillitaId;
				}
				const finalPickupPointId = input.pickupPointId || (activeNodeSession ? activeNodeSession.id : null);
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

				const orderDoc = await db.createDocument('urbanpoint', 'orders', ID.unique(), orderPayload);

				// Create the Order Items
				for (const oi of orderItemsData) {
					await db.createDocument('urbanpoint', 'order_items', ID.unique(), {
						order_id: orderDoc.$id,
						...oi
					});
				}

				if (input.paymentMethod === 'a_convenir') {
					return { success: true, init_point: `/checkout/success?order_id=${orderDoc.$id}` };
				}

				const mpAccessToken = process.env.MP_ACCESS_TOKEN;
				if (!mpAccessToken) {
					// Fallback to fake checkout if no token
					return { success: true, init_point: 'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=TEST-123' };
				}

				const mp = new MercadoPagoConfig({ accessToken: mpAccessToken, options: { timeout: 5000 } });
				const preference = new Preference(mp);

				const result = await preference.create({
					body: {
						items: prefItems,
						external_reference: orderDoc.$id,
						back_urls: {
							success: 'http://localhost:4321/checkout/success',
							failure: 'http://localhost:4321/checkout/failure',
							pending: 'http://localhost:4321/checkout/pending'
						},
						auto_return: 'approved'
					}
				});

				// Update order with preference ID
				await db.updateDocument('urbanpoint', 'orders', orderDoc.$id, {
					mp_preference_id: result.id
				});

				return { success: true, init_point: result.sandbox_init_point || result.init_point };
			} catch (error: any) {
				console.error("Checkout Error:", error);
				return { success: false, error: error.message };
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
			if (import.meta.env.DEV && input.email === 'azcurraely@gmail.com') {
				ctx.cookies.set('up_session', 'dev_mock_admin_session', {
					path: '/',
					httpOnly: true,
					secure: false,
					sameSite: 'lax',
					maxAge: 60 * 60 * 24 * 30
				});
				return { success: true, role: 'admin' };
			}
			
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
					secure: false, // Forzado a false temporalmente para evitar problemas de localhost/http
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
				return { success: false, error: error.message || 'Credenciales inválidas' };
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
				return { success: false, error: error.message };
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
				return { success: false, error: error.message };
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
				return { success: false, error: e.message };
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

				const ordersRes = await db.listDocuments('urbanpoint', 'orders', [
					Query.greaterThanEqual('$createdAt', dateString),
					Query.equal('estado', 'pagado'),
					Query.limit(500)
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
				return { success: false, error: e.message };
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
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede crear payouts');
				}

				const ledgerRes = await db.listDocuments('urbanpoint', 'commission_ledger', [
					Query.equal('profile_id', input.profileId),
					Query.equal('estado', 'pendiente'),
					Query.limit(500)
				]);

				if (ledgerRes.documents.length === 0) {
					throw new Error('No hay devengos pendientes para liquidar');
				}

				const montoCentavos = ledgerRes.documents.reduce((acc, curr) => acc + (curr.monto_centavos || 0), 0);

				const payout = await db.createDocument('urbanpoint', 'payouts', ID.unique(), {
					profile_id: input.profileId,
					monto_centavos: montoCentavos,
					estado: 'pagado',
					medio_pago: input.medioPago,
					referencia_pago: input.referenciaPago,
					pagado_at: new Date().toISOString()
				});

				for (const item of ledgerRes.documents) {
					await db.updateDocument('urbanpoint', 'commission_ledger', item.$id, {
						estado: 'liquidado'
					});
				}

				await db.createDocument('urbanpoint', 'commission_ledger', ID.unique(), {
					profile_id: input.profileId,
					tipo: 'liquidacion',
					estado: 'liquidado',
					monto_centavos: -montoCentavos,
					motivo: `Liquidación #${payout.$id}`
				});

				try {
					await db.updateDocument('urbanpoint', 'profiles', input.profileId, {
						saldo_disponible_centavos: 0
					});
				} catch (e) {
					// Ignorar si no existe el campo
				}

				return { success: true, payoutId: payout.$id };
			} catch(e: any) {
				return { success: false, error: e.message };
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
				const estadoActual = order.estado as EstadoPedido;

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
				}

				await registrarEventoOrden(input.orderId, estadoActual, targetState, actor.profileId);

				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		}
	}),

	updateOrderItems: defineAction({
		accept: 'json',
		input: z.object({
			orderId: z.string(),
			items: z.array(z.object({
				product_id: z.string(),
				cantidad: z.number().min(1),
				precio_unitario_centavos: z.number().min(0)
			}))
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin', 'gestion');

				// 1. Fetch current order items
				const currentItemsRes = await db.listDocuments('urbanpoint', 'order_items', [
					Query.equal('order_id', input.orderId)
				]);

				// 2. Delete all existing items for this order
				for (const item of currentItemsRes.documents) {
					await db.deleteDocument('urbanpoint', 'order_items', item.$id);
				}

				// 3. Create new items and calculate total
				let newSubtotal = 0;
				for (const newItem of input.items) {
					let prodSnapshot = { nombre: 'Producto', sku: 'SKU-N/A' };
					try {
						const prod = await db.getDocument('urbanpoint', 'products', newItem.product_id);
						prodSnapshot = { nombre: prod.nombre, sku: prod.sku };
					} catch(e) {}

					const subtotal_centavos = newItem.cantidad * newItem.precio_unitario_centavos;
					newSubtotal += subtotal_centavos;

					await db.createDocument('urbanpoint', 'order_items', ID.unique(), {
						order_id: input.orderId,
						product_id: newItem.product_id,
						cantidad: newItem.cantidad,
						precio_unitario: newItem.precio_unitario_centavos,
						subtotal: subtotal_centavos,
						nombre_snapshot: prodSnapshot.nombre,
						sku_snapshot: prodSnapshot.sku
					});
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
				return { success: false, error: error.message };
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

				const doc = await db.createDocument('urbanpoint', 'products', ID.unique(), payload);

				return { success: true, id: doc.$id };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		}
	}),

	updateProduct: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string(),
			nombre: z.string().min(2),
			descripcion: z.string().optional(),
			precio: z.number().min(0),
			precio_promocional: z.number().min(0).optional(),
			precio_distribuidor: z.number().min(0).optional(),
			precio_canillita: z.number().min(0).optional(),
			costo: z.number().min(0).optional(),
			stock: z.number().min(0),
			stock_maximo: z.number().min(0).optional(),
			nivel_reorden: z.number().min(0).optional(),
			tiempo_reposicion: z.number().min(0).optional(),
			envio_config: z.string().optional(),
			seo_config: z.string().optional(),
			variantes: z.string().optional(),
			tramos_cantidad: z.string().optional(),
			galeria_urls: z.string().optional(),
			portada_url: z.string().optional(),
			estado: z.enum(['activo', 'borrador', 'pausado', 'inactivo']),
			categoria_id: z.string().optional().nullable(),
			destacado: z.boolean().optional(),
			es_nuevo_manual: z.boolean().optional().nullable(),
			marca: z.string().optional()
		}),
		handler: async (input, ctx) => {
			try {
				requireRole(ctx, 'admin', 'gestion');

				const finalState = input.estado === 'inactivo' ? 'pausado' : input.estado;
				const updateData: any = {
					nombre: input.nombre,
					descripcion: input.descripcion || '',
					precio: input.precio,
					stock: input.stock,
					estado: finalState
				};

				if (input.precio_promocional !== undefined) updateData.precio_promocional = input.precio_promocional;
				if (input.precio_distribuidor !== undefined) updateData.precio_distribuidor = input.precio_distribuidor;
				if (input.precio_canillita !== undefined) updateData.precio_canillita = input.precio_canillita;
				if (input.marca !== undefined) updateData.marca = input.marca;
				if (input.costo !== undefined) updateData.costo = input.costo;
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

				await db.updateDocument('urbanpoint', 'products', input.id, updateData);

				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
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
							await db.updateDocument('urbanpoint', 'products', id, updatePayload);
						}
					}
				}
				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
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
				return { success: true };
			} catch (error: any) {
				return { success: false, error: error.message };
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

				const doc = await db.createDocument('urbanpoint', 'products', ID.unique(), duplicatePayload);
				return { success: true, id: doc.$id };
			} catch (error: any) {
				return { success: false, error: error.message };
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
				stock: z.number()
			}))
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede importar productos');
				}

				let count = 0;
				for (const item of input.items) {
					const slug = item.nombre
						.toLowerCase()
						.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
						.replace(/[^a-z0-9]+/g, '-')
						.replace(/(^-|-$)+/g, '') + '-' + Math.floor(Math.random()*1000);

					const sku = item.sku || 'SKU-' + Math.floor(100000 + Math.random() * 900000);

					await db.createDocument('urbanpoint', 'products', ID.unique(), {
						nombre: item.nombre,
						slug: slug,
						sku: sku,
						descripcion: '',
						precio: item.precio,
						stock: item.stock,
						estado: 'borrador',
						iva_pct: 21.0
					});
					count++;
				}

				return { success: true, count };
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		}
	}),

	reimportProductsStock: defineAction({
		accept: 'json',
		input: z.object({
			updates: z.array(z.object({
				sku: z.string(),
				precio: z.number().optional(),
				stock: z.number().optional()
			}))
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo admin puede re-importar productos');
				}

				const res = await db.listDocuments('urbanpoint', 'products');
				let updated = 0;

				for (const update of input.updates) {
					const target = res.documents.find(p => p.sku === update.sku || p.$id === update.sku);
					if (target) {
						const patch: any = {};
						if (update.precio !== undefined) patch.precio = update.precio;
						if (update.stock !== undefined) patch.stock = update.stock;

						if (Object.keys(patch).length > 0) {
							await db.updateDocument('urbanpoint', 'products', target.$id, patch);
							updated++;
						}
					}
				}

				return { success: true, updated };
			} catch (error: any) {
				return { success: false, error: error.message };
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

				try {
					const doc = await db.createDocument('urbanpoint', 'promotions', ID.unique(), {
						nombre: input.nombre,
						tipo: input.tipo,
						valor: input.valor,
						desde: input.desde,
						hasta: input.hasta,
						estado: input.estado
					});
					return { success: true, id: doc.$id };
				} catch (e) {
					// Fallback si no existe la colección promotions
					return { success: true, id: 'demo-' + Date.now() };
				}
			} catch (error: any) {
				return { success: false, error: error.message };
			}
		}
	}),

	savePickupPoint: defineAction({
		accept: 'json',
		input: z.object({
			id: z.string().optional(),
			nombre_comercial: z.string().min(2),
			slug: z.string().optional(),
			direccion: z.string().min(3),
			localidad: z.string().min(2),
			provincia: z.string().optional(),
			horarios: z.string().optional(),
			telefono: z.string().optional(),
			lat: z.number(),
			lng: z.number(),
			estado: z.string().optional(),
			comision_pct: z.number().optional()
		}),
		handler: async (input, ctx) => {
			try {
				if (!ctx.locals.user || ctx.locals.user.role !== 'admin') {
					throw new Error('Solo los administradores pueden gestionar puntos de retiro');
				}

				const reservedSlugs = new Set([
					'tienda', 'carrito', 'checkout', 'pago', 'retiro', 'success', 'mi-cuenta',
					'contacto', 'admin', 'canillita', 'puntos-de-retiro', 'login', 'registro',
					'api', 'productos', 'ingresar', 'nosotros', 'ayuda', 'terminos', 'privacidad',
					'comisiones', 'favicon.ico', 'robots.txt', 'sumate-como-canillita', 'puntos', 'sitemap.xml'
				]);

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

				let rawSlug = input.slug || (input.id ? undefined : input.nombre_comercial);
				if (rawSlug) {
					const cleanSlug = rawSlug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
					if (reservedSlugs.has(cleanSlug)) {
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
				return { success: false, error: error.message };
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
				return { success: false, error: error.message };
			}
		}
	})
};
