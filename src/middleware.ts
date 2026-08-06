import { defineMiddleware } from 'astro:middleware';
import { Client, Account, Query } from 'node-appwrite';
import { PUBLIC_APPWRITE_ENDPOINT, PUBLIC_APPWRITE_PROJECT_ID, NEXT_PUBLIC_APPWRITE_ENDPOINT, NEXT_PUBLIC_APPWRITE_PROJECT_ID } from 'astro:env/client';
import { createAdminClient } from './lib/server/appwrite';

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;
	const sessionSecret = context.cookies.get('up_session')?.value;
	const isProtectedPage = (pathname.startsWith('/admin') || pathname.startsWith('/canillita')) && !pathname.includes('/login');
	
	if (!sessionSecret) {
		if (isProtectedPage) {
			return context.redirect('/login');
		}
		return next();
	}

	try {
		let user: any;
		
		if (import.meta.env.DEV && sessionSecret === 'dev_mock_admin_session') {
			user = { $id: '6a6b75790014f4940f25', email: 'azcurraely@gmail.com' };
		} else {
			const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || PUBLIC_APPWRITE_ENDPOINT || NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
			const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || PUBLIC_APPWRITE_PROJECT_ID || NEXT_PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';

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
		
		if (pathname.startsWith('/admin') && profile.role !== 'admin') {
			if (profile.role === 'canillita') return context.redirect('/canillita');
			return context.redirect('/');
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
