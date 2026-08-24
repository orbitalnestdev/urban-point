import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies, redirect }) => {
    const backupAdminSession = cookies.get('up_admin_session_backup')?.value;

    if (backupAdminSession) {
        cookies.set('up_session', backupAdminSession, {
            path: '/',
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7
        });
    }

    cookies.delete('up_admin_session_backup', { path: '/' });
    cookies.delete('up_impersonated_profile', { path: '/' });

    return redirect('/admin');
};

export const GET = POST;
