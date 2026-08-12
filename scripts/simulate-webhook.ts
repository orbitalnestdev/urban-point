/**
 * Envía un webhook FIRMADO al endpoint local de Mercado Pago.
 *
 * La versión anterior dependía del modo mock que se eliminó en C-05, donde
 * bastaba con mandar el orderId como data.id para dar un pedido por pagado.
 * Ese atajo era justamente la vulnerabilidad: cualquiera podía regalarse
 * pedidos con un POST.
 *
 * Ahora firma el request igual que Mercado Pago, así que sirve para verificar
 * que la validación de firma funciona. El endpoint consulta el pago real
 * contra la API de MP, por lo que hace falta un payment id del sandbox:
 * un id inventado va a fallar en ese paso, que es lo correcto.
 *
 * Uso:
 *   MP_WEBHOOK_SECRET=... npx tsx scripts/simulate-webhook.ts <paymentId>
 *   MP_WEBHOOK_SECRET=... npx tsx scripts/simulate-webhook.ts <paymentId> --firma-invalida
 */
import crypto from 'node:crypto';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envLocalPath = join(__dirname, '../.env.local');
dotenv.config({ path: fs.existsSync(envLocalPath) ? envLocalPath : join(__dirname, '../.env') });

const paymentId = process.argv[2];
const firmaInvalida = process.argv.includes('--firma-invalida');
const baseUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:4321';
const secret = process.env.MP_WEBHOOK_SECRET;

if (!paymentId) {
	console.error('Falta el paymentId.\n  npx tsx scripts/simulate-webhook.ts <paymentId>');
	process.exit(1);
}

if (!secret) {
	console.error('Falta MP_WEBHOOK_SECRET en el entorno.');
	process.exit(1);
}

async function main() {
	const ts = Math.floor(Date.now() / 1000).toString();
	const requestId = crypto.randomUUID();

	// Mismo manifiesto que arma Mercado Pago.
	const manifiesto = `id:${paymentId};request-id:${requestId};ts:${ts};`;
	const v1 = crypto
		.createHmac('sha256', firmaInvalida ? 'secreto-incorrecto' : secret!)
		.update(manifiesto)
		.digest('hex');

	const url = `${baseUrl}/api/webhooks/mercadopago?topic=payment&id=${encodeURIComponent(paymentId)}`;
	console.log(`POST ${url}`);
	console.log(`Firma: ${firmaInvalida ? 'INVÁLIDA (se espera 401)' : 'válida'}`);

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-signature': `ts=${ts},v1=${v1}`,
			'x-request-id': requestId
		},
		body: JSON.stringify({ type: 'payment', data: { id: paymentId } })
	});

	const texto = await res.text();
	console.log(`\n-> ${res.status} ${texto}`);

	if (firmaInvalida && res.status === 401) {
		console.log('OK: el endpoint rechazó la firma inválida.');
	} else if (!firmaInvalida && res.status === 401) {
		console.log('El endpoint rechazó una firma que debería ser válida: revisá MP_WEBHOOK_SECRET.');
	}
}

main().catch((e) => {
	console.error('Error al simular el webhook:', e);
	process.exit(1);
});
