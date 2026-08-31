import type { APIRoute } from 'astro';

/**
 * Switch de usuarios SOLO PARA DESARROLLO.
 *
 * Permite saltar entre roles (admin / gestion / canillita / cliente) sin
 * loguearse cada vez, o impersonar un profile real por su $id. El middleware
 * reconoce estas cookies únicamente cuando import.meta.env.DEV es true, y este
 * endpoint responde 404 en producción, así que no abre ninguna puerta en prod.
 *
 * POST con form-data / urlencoded:
 *   role=admin|gestion|canillita|cliente  → usuario sintético con ese rol
 *   profile=<$id de profiles>             → impersonar ese profile real
 *   role=salir                            → cerrar la sesión simulada
 *   redirect=/ruta                        → adónde volver (opcional)
 */

const HOME_BY_ROLE: Record<string, string> = {
    admin: '/admin',
    gestion: '/admin/pedidos',
    canillita: '/canillita',
    cliente: '/mi-cuenta'
};

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
    if (!import.meta.env.DEV) {
        return new Response('Not found', { status: 404 });
    }

    const form = await request.formData().catch(() => null);
    const role = form?.get('role')?.toString().trim() || '';
    const profileId = form?.get('profile')?.toString().trim() || '';
    const redirectTo = form?.get('redirect')?.toString().trim() || '';

    const cookieOpts = {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax' as const,
        maxAge: 60 * 60 * 8
    };

    if (role === 'salir') {
        cookies.delete('up_session', { path: '/' });
        return redirect(redirectTo || '/');
    }

    if (profileId) {
        cookies.set('up_session', `dev_mock_session:profile:${profileId}`, cookieOpts);
        return redirect(redirectTo || '/');
    }

    if (['admin', 'gestion', 'canillita', 'cliente', 'distribuidor'].includes(role)) {
        cookies.set('up_session', `dev_mock_session:${role}`, cookieOpts);
        return redirect(redirectTo || HOME_BY_ROLE[role]);
    }

    return new Response('Parámetros inválidos: mandá role o profile.', { status: 400 });
};
