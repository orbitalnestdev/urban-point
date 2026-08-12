/**
 * Regresión — AUDITORÍA C-02: atribución de nodo rota.
 *
 * serializeActiveNodeCookie() devuelve un header Set-Cookie COMPLETO
 * ("clave=valor; Path=/; Max-Age=..."), pero src/pages/[slug].astro:61 lo pasa
 * como el VALOR a Astro.cookies.set(). El valor almacenado queda doblemente
 * serializado y createCheckout (src/actions/index.ts:641-650) nunca lo parsea.
 *
 * Estos tests fallan HOY a propósito: documentan el bug. En Fase 2 deben pasar.
 */
import { describe, it, expect } from 'vitest';
import {
	serializeActiveNodeCookie,
	parseActiveNodeCookie,
	NODE_COOKIE_NAME,
	type ActiveNodeData
} from '../../src/lib/nodeSession';

const nodo: ActiveNodeData = {
	id: 'node_abc123',
	nombre: 'Kiosco Belgrano',
	slug: 'kiosco-belgrano',
	direccion: 'Cabildo 2200',
	canillitaId: 'profile_canillita_1'
};

describe('nodeSession — round-trip de la cookie de nodo activo', () => {
	it('el valor serializado NO debe contener atributos de cookie (Path/Max-Age/SameSite)', () => {
		// Un "valor" de cookie no puede traer atributos adentro: Astro los agrega aparte.
		const valor = serializeActiveNodeCookie(nodo);
		expect(valor).not.toMatch(/Path=/);
		expect(valor).not.toMatch(/Max-Age=/);
		expect(valor).not.toMatch(/SameSite=/);
		expect(valor.startsWith(`${NODE_COOKIE_NAME}=`)).toBe(false);
	});

	it('lo que se guarda como valor de cookie debe poder volver a parsearse', () => {
		// Reproduce exactamente el camino de [slug].astro -> createCheckout.
		const valorGuardado = serializeActiveNodeCookie(nodo);
		const recuperado = parseActiveNodeCookie(`${NODE_COOKIE_NAME}=${valorGuardado}`);
		expect(recuperado).not.toBeNull();
		expect(recuperado?.id).toBe(nodo.id);
		expect(recuperado?.canillitaId).toBe(nodo.canillitaId);
	});

	it('createCheckout debe poder reconstruir el nodo desde el valor de la cookie', () => {
		// Réplica literal de src/actions/index.ts:641-644
		const valorCookie = serializeActiveNodeCookie(nodo);
		let activeNodeSession: any = null;
		try {
			activeNodeSession = JSON.parse(decodeURIComponent(valorCookie));
		} catch (e) {
			activeNodeSession = null;
		}
		expect(activeNodeSession).not.toBeNull();
		expect(activeNodeSession?.id).toBe(nodo.id);
	});
});
