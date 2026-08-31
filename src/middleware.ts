import { defineMiddleware } from 'astro:middleware';
import { Client, Account, Query } from 'node-appwrite';
import { createAdminClient } from './lib/server/appwrite';
import { puedeImpersonar, ROLES_IMPERSONABLES } from './lib/server/auth';
import { REF_COOKIE_NAME, REF_COOKIE_MAX_AGE } from './lib/nodeSession';

const DEFAULT_ENDPOINT = 'https://aw.orbitalnest.net/v1';
const DEFAULT_PROJECT_ID = '6a6a5321001439f06817';

interface CachedSession {
	user: any;
	profile: any;
	expiresAt: number;
}
const sessionAuthCache = new Map<string, CachedSession>();
const SESSION_CACHE_TTL_MS = 60 * 1000; // 60 segundos
const SESSION_CACHE_MAX = 500; // tope para que el Map no crezca sin límite

/**
 * Invalida la entrada cacheada de una sesión. Los endpoints de logout la
 * llaman para que un secreto revocado no siga siendo aceptado hasta 60 s.
 */
export function invalidateSessionCache(secret?: string | null) {
	if (secret) sessionAuthCache.delete(secret);
}

function cacheSession(secret: string, user: any, profile: any) {
	if (sessionAuthCache.size >= SESSION_CACHE_MAX) {
		// Se descarta la entrada más vieja (orden de inserción del Map).
		const oldest = sessionAuthCache.keys().next().value;
		if (oldest) sessionAuthCache.delete(oldest);
	}
	sessionAuthCache.set(secret, { user, profile, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
}

/**
 * Sesiones simuladas de desarrollo (ver /api/dev/switch-user).
 * Formatos aceptados, SOLO en dev:
 *   dev_mock_admin_session            → legado, equivale a rol admin
 *   dev_mock_session:<rol>            → usuario sintético con ese rol
 *   dev_mock_session:profile:<id>     → impersonar un profile real por $id
 */
async function resolveDevMockSession(sessionSecret: string): Promise<{ user: any; profile: any } | null> {
	if (!import.meta.env.DEV) return null;

	let role: string | null = null;
	let profileId: string | null = null;

	if (sessionSecret === 'dev_mock_admin_session') {
		role = 'admin';
	} else if (sessionSecret.startsWith('dev_mock_session:')) {
		const parts = sessionSecret.split(':');
		if (parts[1] === 'profile' && parts[2]) profileId = parts[2];
		else if (['admin', 'gestion', 'canillita', 'cliente', 'distribuidor'].includes(parts[1])) role = parts[1];
	}

	if (profileId) {
		const { databases } = createAdminClient();
		const profile = await databases.getDocument('urbanpoint', 'profiles', profileId);
		return {
			user: { $id: profile.user_id || `dev-user-${profile.$id}`, email: profile.email || '' },
			profile
		};
	}

	if (role) {
		// Perfil sintético: no toca la base, sirve para probar rutas y permisos
		// aunque no haya APPWRITE_API_KEY configurada localmente.
		return {
			user: { $id: `dev-user-${role}`, email: `dev-${role}@urbanpoint.test` },
			profile: {
				$id: `dev-profile-${role}`,
				user_id: `dev-user-${role}`,
				role,
				nombre: `Dev ${role.charAt(0).toUpperCase()}${role.slice(1)}`,
				email: `dev-${role}@urbanpoint.test`
			}
		};
	}

	return null;
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;

	const refParam = context.url.searchParams.get('ref');
	if (refParam && refParam.trim()) {
		context.cookies.set(REF_COOKIE_NAME, refParam.trim(), {
			path: '/',
			maxAge: REF_COOKIE_MAX_AGE,
			httpOnly: true,
			secure: import.meta.env.PROD,
			sameSite: 'lax'
		});
	}

	const sessionSecret = context.cookies.get('up_session')?.value;
	const isProtectedPage = (pathname.startsWith('/admin') || pathname.startsWith('/canillita')) && !pathname.includes('/login');
	
	if (!sessionSecret) {
		if (isProtectedPage) {
			return context.redirect(pathname.startsWith('/canillita') ? '/canillita/login' : '/login');
		}
		return next();
	}

	try {
		let user: any;
		let profile: any;

		const cached = sessionAuthCache.get(sessionSecret);
		const cachedValid = !!cached && cached.expiresAt > Date.now();
		const devMock = cachedValid ? null : await resolveDevMockSession(sessionSecret).catch(() => null);
		if (cachedValid) {
			user = cached!.user;
			profile = cached!.profile;
		} else if (devMock) {
			user = devMock.user;
			profile = devMock.profile;
			cacheSession(sessionSecret, user, profile);
		} else {
			{
				const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || DEFAULT_ENDPOINT;
				const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || DEFAULT_PROJECT_ID;

				const authClient = new Client()
					.setEndpoint(endpoint)
					.setProject(projectId)
					.setSession(sessionSecret)
					.addHeader('X-Fallback-Cookies', `a_session_${projectId}=${sessionSecret}`);

				const account = new Account(authClient);
				user = await account.get();
			}

			const { databases } = createAdminClient();
			let profiles = await databases.listDocuments('urbanpoint', 'profiles', [
				Query.equal('user_id', user.$id)
			]);

			if (profiles.documents.length === 0 && user.email) {
				profiles = await databases.listDocuments('urbanpoint', 'profiles', [
					Query.equal('email', user.email)
				]);
				if (profiles.documents.length > 0 && !profiles.documents[0].user_id) {
					try {
						await databases.updateDocument('urbanpoint', 'profiles', profiles.documents[0].$id, {
							user_id: user.$id
						});
					} catch (e) {}
				}
			}

			if (profiles.documents.length === 0) {
				return context.redirect(pathname.startsWith('/canillita') ? '/canillita/login' : '/login');
			}
			
			profile = profiles.documents[0];
			cacheSession(sessionSecret, user, profile);
		}

		
		// Bloque Impersonación / Switch de Usuario
		//
		// Sólo el administrador impersona, y sólo perfiles de rol estrictamente
		// inferior (ver puedeImpersonar). La condición anterior aceptaba el rol
		// `gestion` —o la mera presencia de la cookie de respaldo— y adoptaba el
		// perfil destino sin mirar su rol: un `gestion` copiaba el $id de un
		// admin desde /admin/clientes?role=admin y se convertía en admin.
		const impersonatedTarget = context.cookies.get('up_impersonated_profile')?.value;

		if (impersonatedTarget && profile.role === 'admin') {
			try {
				const adminName = profile.nombre || 'Admin';
				const adminRole = profile.role;
				let targetProfile: any = null;

				if (impersonatedTarget.startsWith('synthetic:')) {
					const sRole = impersonatedTarget.slice('synthetic:'.length);
					// La cookie es httpOnly y sólo la escribe el endpoint, que ya
					// valida el rol. Se revalida igual: es el único lugar donde
					// un valor de cookie se convierte en un rol efectivo.
					if (ROLES_IMPERSONABLES.includes(sRole)) {
						targetProfile = {
							$id: `synthetic-profile-${sRole}`,
							user_id: `synthetic-user-${sRole}`,
							role: sRole,
							nombre: `Prueba ${sRole.charAt(0).toUpperCase()}${sRole.slice(1)}`,
							email: `prueba-${sRole}@urbanpoint.test`
						};
					}
				} else {
					const { databases } = createAdminClient();
					targetProfile = await databases.getDocument('urbanpoint', 'profiles', impersonatedTarget);
				}

				if (targetProfile && puedeImpersonar(adminRole, targetProfile.role)) {
					profile = targetProfile;
					user = {
						$id: targetProfile.user_id || `imp-user-${targetProfile.$id}`,
						email: targetProfile.email || ''
					};
					context.locals.isImpersonating = true;
					context.locals.impersonatorAdminName = adminName;
					// Rol real de quien impersona: /api/admin/impersonate lo usa
					// para autorizar el cambio a otro usuario sin tener que
					// salir primero, ya que locals.user ya es el destino.
					context.locals.impersonatorRole = adminRole;
				}
			} catch (impErr) {
				console.error("Error al aplicar impersonación:", impErr);
			}
		}

		// Bloque 7 — Protección de Rutas por Rol (admin vs gestion)
		if (pathname.startsWith('/admin')) {
			if (profile.role !== 'admin' && profile.role !== 'gestion') {
				if (profile.role === 'canillita') return context.redirect('/canillita');
				return context.redirect('/');
			}

			// Rol "gestion" NO tiene acceso a /admin/configuracion ni /admin/equipo
			if (profile.role === 'gestion') {
				if (pathname.startsWith('/admin/configuracion') || pathname.startsWith('/admin/equipo')) {
					return new Response(
						`<!DOCTYPE html>
						<html lang="es">
						<head><title>Acceso Denegado - UrbanPoint</title><meta charset="utf-8"/><script src="https://cdn.tailwindcss.com"></script></head>
						<body class="bg-slate-900 text-white min-h-screen flex items-center justify-center p-6">
							<div class="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
								<div class="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
									<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
								</div>
								<h1 class="text-2xl font-black">Acceso Denegado (403)</h1>
								<p class="text-slate-400 text-xs leading-relaxed">Tu rol de <strong>Gestión de Tienda</strong> no tiene permiso para acceder a esta sección. Contactá a un Administrador.</p>
								<a href="/admin/pedidos" class="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors">Volver al Panel</a>
							</div>
						</body>
						</html>`,
						{ status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
					);
				}
			}
		}
		
		if (pathname.startsWith('/canillita') && profile.role !== 'canillita' && profile.role !== 'admin') {
			return context.redirect('/');
		}

		context.locals.user = {
			id: user.$id,
			name: profile.nombre,
			email: user.email,
			role: profile.role,
			profileId: profile.$id
		};

		return next();
	} catch (error: any) {
		console.error("Middleware Auth Error:", error);
		if (sessionSecret) sessionAuthCache.delete(sessionSecret);
		context.cookies.delete('up_session', { path: '/' });
		// Sólo se fuerza el login en rutas protegidas; en páginas públicas una
		// sesión vencida no debe expulsar al visitante de la tienda.
		if (isProtectedPage) {
			return context.redirect(pathname.startsWith('/canillita') ? '/canillita/login' : '/login');
		}
		return next();
	}
});

