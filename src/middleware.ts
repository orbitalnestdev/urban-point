import { defineMiddleware } from 'astro:middleware';
import { Client, Account, Query } from 'node-appwrite';
import { createAdminClient } from './lib/server/appwrite';
import { REF_COOKIE_NAME, REF_COOKIE_MAX_AGE } from './lib/nodeSession';

const DEFAULT_ENDPOINT = 'https://aw.orbitalnest.net/v1';
const DEFAULT_PROJECT_ID = '6a6a5321001439f06817';

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;

	// Atribución por código de referido (?ref=CODIGO).
	//
	// POLÍTICA: last-touch con ventana de 30 días. El último canillita que
	// trajo al comprador se queda la venta, tanto si llegó por ?ref= como si
	// entró por la página de un punto (que escribe la misma cookie).
	//
	// Fuente única y del lado del servidor. Antes el código viajaba además por
	// localStorage y por una cookie legible desde JS, y el checkout lo tomaba
	// de ahí: cualquiera podía atribuirse la venta escribiendo el código de
	// otro canillita. Y convivían dos criterios opuestos —el referido era
	// first-touch y el nodo last-touch—, así que entrar por A y después por B
	// hacía que A cobrara el referido y B el fee de logística.
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
		
		if (import.meta.env.DEV && sessionSecret === 'dev_mock_admin_session') {
			user = { $id: '6a6b75790014f4940f25', email: 'azcurraely@gmail.com' };
		} else {
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
		const profiles = await databases.listDocuments('urbanpoint', 'profiles', [
			Query.equal('user_id', user.$id)
		]);
		
		if (profiles.documents.length === 0) {
			return context.redirect('/login');
		}
		
		const profile = profiles.documents[0];
		
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
		context.cookies.delete('up_session', { path: '/' });
		return context.redirect('/login');
	}
});
