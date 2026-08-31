import type { APIRoute } from 'astro';
import { createAdminClient } from '../../../lib/server/appwrite';
import { puedeImpersonar, ROLES_IMPERSONABLES } from '../../../lib/server/auth';

/**
 * Impersonación de usuarios desde el panel de administración.
 *
 * Dos reglas que antes no estaban:
 *
 * 1. Sólo impersona el administrador, y sólo perfiles de rol estrictamente
 *    inferior (ver `puedeImpersonar`). La versión anterior aceptaba también al
 *    rol `gestion` —o la sola presencia de la cookie de respaldo— y nunca
 *    miraba el rol del destino: era una escalada directa a admin.
 *
 * 2. Sólo POST. Antes exportaba `GET = POST`, y como las cookies de sesión son
 *    SameSite=Lax (viajan en navegaciones top-level), bastaba con que un
 *    administrador abriera un enlace preparado por un tercero para quedar
 *    impersonando a quien el atacante eligiera.
 *
 * Mientras la impersonación está activa `locals.user` es el usuario destino,
 * así que para decidir si se puede volver a impersonar se mira el rol real del
 * actor, que el middleware deja en `locals.impersonatorRole`.
 */
export const POST: APIRoute = async ({ request, cookies, redirect, locals }) => {
    const sessionUser = locals?.user;
    const rolActor = locals?.isImpersonating ? locals?.impersonatorRole : sessionUser?.role;

    if (!sessionUser || rolActor !== 'admin') {
        return new Response('Acceso Denegado', { status: 403 });
    }

    const form = await request.formData().catch(() => null);

    const profileId = form?.get('profile_id')?.toString().trim() || '';
    const syntheticRole = form?.get('role')?.toString().trim() || '';
    const redirectTo = form?.get('redirect')?.toString().trim() || '';

    const backupAdminSession = cookies.get('up_admin_session_backup')?.value;
    const currentSession = cookies.get('up_session')?.value || '';

    const cookieOpts = {
        path: '/',
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax' as const,
        maxAge: 60 * 60 * 12
    };

    if (profileId) {
        let profile: any;
        try {
            const { databases } = createAdminClient();
            profile = await databases.getDocument('urbanpoint', 'profiles', profileId);
        } catch (e) {
            return new Response('El perfil indicado no existe.', { status: 404 });
        }

        if (!puedeImpersonar(rolActor, profile.role)) {
            return new Response(
                'No se puede impersonar a un usuario de igual o mayor privilegio.',
                { status: 403 }
            );
        }

        if (!backupAdminSession && currentSession) {
            cookies.set('up_admin_session_backup', currentSession, cookieOpts);
        }
        cookies.set('up_impersonated_profile', profileId, cookieOpts);

        if (profile.role === 'canillita') {
            return redirect(redirectTo || '/canillita');
        }
        if (profile.role === 'gestion') {
            return redirect(redirectTo || '/admin/pedidos');
        }
        return redirect(redirectTo || '/mi-cuenta');
    }

    if (ROLES_IMPERSONABLES.includes(syntheticRole)) {
        if (!backupAdminSession && currentSession) {
            cookies.set('up_admin_session_backup', currentSession, cookieOpts);
        }
        cookies.set('up_impersonated_profile', `synthetic:${syntheticRole}`, cookieOpts);

        if (syntheticRole === 'canillita') return redirect(redirectTo || '/canillita');
        if (syntheticRole === 'gestion') return redirect(redirectTo || '/admin/pedidos');
        return redirect(redirectTo || '/mi-cuenta');
    }

    return new Response('Parámetros inválidos para impersonación.', { status: 400 });
};
