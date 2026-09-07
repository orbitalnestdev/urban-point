import type { APIRoute } from 'astro';

/**
 * Cierra la impersonación y restaura la sesión original.
 *
 * Sólo POST: exportar también el handler como GET convertía un enlace en una
 * acción con efecto, disparable desde otro sitio (las cookies SameSite=Lax
 * viajan en navegaciones top-level). El banner ya lo invoca por formulario.
 *
 * No exige rol porque durante la impersonación `locals.user` es el usuario
 * destino, y salir del modo monitoreo no otorga ningún privilegio: sólo
 * devuelve la sesión que el navegador ya tenía.
 */
export const POST: APIRoute = async ({ cookies, redirect }) => {
    const backupAdminSession = cookies.get('up_admin_session_backup')?.value;

    if (backupAdminSession) {
        cookies.set('up_session', backupAdminSession, {
            path: '/',
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: 'lax',
            // Mismo maxAge que el login (login.astro): antes eran 7 días acá
            // contra 30 en el login, así que volver de impersonar recortaba
            // la sesión "recordada" del admin sin ninguna razón.
            maxAge: 60 * 60 * 24 * 30
        });
    }

    cookies.delete('up_admin_session_backup', { path: '/' });
    cookies.delete('up_impersonated_profile', { path: '/' });

    return redirect('/admin');
};
