import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/server/appwrite';

export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
    const sessionUser = locals?.user;
    const backupAdminSession = cookies.get('up_admin_session_backup')?.value;
    
    if (!sessionUser || (sessionUser.role !== 'admin' && sessionUser.role !== 'gestion' && !backupAdminSession)) {
        return new Response('Acceso Denegado', { status: 403 });
    }

    const form = await request.formData().catch(() => null);
    const url = new URL(request.url);

    const profileId = form?.get('profile_id')?.toString().trim() || url.searchParams.get('profile_id')?.trim() || '';
    const syntheticRole = form?.get('role')?.toString().trim() || url.searchParams.get('role')?.trim() || '';
    const redirectTo = form?.get('redirect')?.toString().trim() || url.searchParams.get('redirect')?.trim() || '';

    const currentSession = cookies.get('up_session')?.value || '';

    if (!backupAdminSession && currentSession) {
        cookies.set('up_admin_session_backup', currentSession, {
            path: '/',
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: 'lax',
            maxAge: 60 * 60 * 12
        });
    }

    const cookieOpts = {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax' as const,
        maxAge: 60 * 60 * 12
    };

    if (profileId) {
        cookies.set('up_impersonated_profile', profileId, cookieOpts);

        try {
            const { databases } = createAdminClient();
            const profile = await databases.getDocument('urbanpoint', 'profiles', profileId);
            if (profile.role === 'canillita') {
                return redirect(redirectTo || '/canillita');
            }
        } catch (e) {}

        return redirect(redirectTo || '/mi-cuenta');
    }

    if (['canillita', 'cliente', 'gestion'].includes(syntheticRole)) {
        cookies.set('up_impersonated_profile', `synthetic:${syntheticRole}`, cookieOpts);
        return redirect(redirectTo || (syntheticRole === 'canillita' ? '/canillita' : '/mi-cuenta'));
    }

    return new Response('Parámetros inválidos para impersonación.', { status: 400 });
};

export const GET = POST;
