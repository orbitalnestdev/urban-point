import { defineMiddleware } from 'astro:middleware';
import { Client, Account, Databases, Query } from 'node-appwrite';
import { PUBLIC_APPWRITE_ENDPOINT, PUBLIC_APPWRITE_PROJECT_ID } from 'astro:env/client';
import { APPWRITE_API_KEY } from 'astro:env/server';

export const onRequest = defineMiddleware(async (context, next) => {
	// 1. Identificar si es una ruta protegida
	const { pathname } = context.url;
	const isProtectedRoute = pathname.startsWith('/admin') || pathname.startsWith('/canillita');
	
	// Si no es protegida, continuamos normalmente sin hacer fetch a Appwrite
	if (!isProtectedRoute) {
		return next();
	}

	// 2. Obtener la sesión desde la cookie
	const sessionSecret = context.cookies.get('up_session')?.value;
	
	if (!sessionSecret) {
		// No hay sesión, redirigir al login
		return context.redirect('/login');
	}

	try {
		let user: any;
		
		if (import.meta.env.DEV && sessionSecret === 'dev_mock_admin_session') {
			user = { $id: '6a6b75790014f4940f25', email: 'azcurraely@gmail.com' };
		} else {
			// 3. Inicializar Appwrite Client usando el Session Secret (para autenticar como el usuario)
			const authClient = new Client()
				.setEndpoint(PUBLIC_APPWRITE_ENDPOINT)
				.setProject(PUBLIC_APPWRITE_PROJECT_ID)
				.setSession(sessionSecret)
				.addHeader('X-Fallback-Cookies', `a_session_${PUBLIC_APPWRITE_PROJECT_ID}=${sessionSecret}`);
			
			const account = new Account(authClient);
			user = await account.get(); // Falla si el token es inválido o expiró
		}
		
		// 4. Buscar el perfil en la base de datos (Usamos Admin Client)
		const adminClient = new Client()
			.setEndpoint(PUBLIC_APPWRITE_ENDPOINT)
			.setProject(PUBLIC_APPWRITE_PROJECT_ID)
			.setKey(APPWRITE_API_KEY);
			
		const db = new Databases(adminClient);
		const profiles = await db.listDocuments('urbanpoint', 'profiles', [
			Query.equal('user_id', user.$id)
		]);
		
		if (profiles.documents.length === 0) {
			// El usuario no tiene perfil
			return context.redirect('/login');
		}
		
		const profile = profiles.documents[0];
		
		// 5. Autorización (Role Check)
		if (pathname.startsWith('/admin') && profile.role !== 'admin') {
			if (profile.role === 'canillita') return context.redirect('/canillita');
			return context.redirect('/');
		}
		
		if (pathname.startsWith('/canillita') && profile.role !== 'canillita' && profile.role !== 'admin') {
			return context.redirect('/');
		}

		// 6. Inyectar datos del usuario en los Locals para que estén disponibles en el Layout
		context.locals.user = {
			id: user.$id,
			name: profile.nombre,
			email: user.email,
			role: profile.role,
			profileId: profile.$id
		};

		return next();
	} catch (error: any) {
		context.cookies.delete('up_session', { path: '/' });
		return context.redirect('/login');
	}
});
