/**
 * Suma `a_convenir` al enum `orders.fulfillment` (que tenía sólo `envio` y
 * `retiro`).
 *
 * Por qué hace falta: la clienta decidió que el cliente no elija punto de
 * retiro y que la entrega se coordine con él después de la compra. Eso ya
 * funciona en el checkout, pero los pedidos quedaban guardados como
 * `fulfillment: 'retiro'` —el default— y todo lo que viene después los trataba
 * como un retiro en punto: el cliente veía un código QR para mostrarle a un
 * canillita que no existe, el panel decía "Listo en punto" / "Retirado", y el
 * mail de confirmación mandaba instrucciones de retiro.
 *
 * Con un valor propio, cada pantalla puede decir lo que corresponde.
 *
 * Agregar un valor a un enum no rompe los documentos existentes: siguen
 * teniendo `envio` o `retiro`. Los pedidos "a convenir" creados antes de esta
 * migración (guardados como `retiro` sin punto) se corrigen con --apply si
 * los hay.
 *
 * Uso:
 *   APPWRITE_API_KEY=... npx tsx scripts/add_fulfillment_a_convenir.ts --dry-run
 *   APPWRITE_API_KEY=... npx tsx scripts/add_fulfillment_a_convenir.ts --apply
 *
 * Es idempotente: si el valor ya está, no toca el enum.
 */
import { Client, Databases, Query } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey) {
	console.error('Falta APPWRITE_API_KEY en el entorno.');
	process.exit(1);
}

const aplicar = process.argv.includes('--apply');
if (!aplicar && !process.argv.includes('--dry-run')) {
	console.error('Pasá --dry-run para ver qué haría, o --apply para aplicarlo.');
	process.exit(1);
}

const DB_ID = 'urbanpoint';
const COL = 'orders';
const NUEVO = 'a_convenir';

const db = new Databases(
	new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
);

async function fetchAllDocs(coll: string, queries: any[] = []) {
	let docs: any[] = [];
	let offset = 0;
	while (true) {
		const res = await db.listDocuments(DB_ID, coll, [...queries, Query.limit(100), Query.offset(offset)]);
		docs.push(...res.documents);
		if (res.documents.length < 100) break;
		offset += 100;
	}
	return docs;
}

async function main() {
	console.log(`Base ${DB_ID} · ${COL}.fulfillment · ${aplicar ? 'APLICAR' : 'simulación'}\n`);

	const attr: any = await db.getAttribute(DB_ID, COL, 'fulfillment');
	const actuales: string[] = attr.elements || [];
	console.log(`Valores actuales del enum: ${actuales.join(', ')}`);

	if (actuales.includes(NUEVO)) {
		console.log(`"${NUEVO}" ya está en el enum: no se toca.`);
	} else {
		console.log(`  · agregar "${NUEVO}" al enum (queda: ${[...actuales, NUEVO].join(', ')})`);
		if (aplicar) {
			// El SDK exige mandar el default explícito: para un atributo requerido
			// es null (undefined lo hace fallar antes de llamar a la API).
			await db.updateEnumAttribute(DB_ID, COL, 'fulfillment', [...actuales, NUEVO], attr.required, (attr.default ?? null) as any);
			console.log('  ✓ enum actualizado');
		}
	}

	// Pedidos "a convenir" anteriores a esta migración: quedaron como retiro
	// sin punto asignado. Se detectan por esa combinación.
	const retiros = await fetchAllDocs(COL, [Query.equal('fulfillment', 'retiro')]);
	const huerfanos = retiros.filter((o: any) => {
		const punto = typeof o.pickup_point_id === 'string' ? o.pickup_point_id : o.pickup_point_id?.$id;
		return !punto;
	});

	console.log(`\nPedidos guardados como "retiro" pero sin punto asignado: ${huerfanos.length}`);
	for (const o of huerfanos) console.log(`  · #${o.numero} (${o.$id}) · estado=${o.estado}`);

	if (!aplicar) {
		console.log('\nSimulación: no se cambió nada. Volvé a correrlo con --apply.');
		return;
	}

	// Ojo: los pedidos huérfanos que apuntaban a un punto que se BORRÓ
	// (pickup_point_id inexistente) también caen acá con esta consulta, pero
	// esos no son "a convenir" sino retiros viejos. Como el punto ya no existe
	// y el pedido ya está cerrado, dejarlos como retiro es lo más fiel a lo que
	// pasó. Sólo se corrigen los que se crearon DESPUÉS de que existiera el
	// modo a convenir.
	const desde = new Date('2026-09-09T22:00:00Z'); // deploy de 754d8a2
	let corregidos = 0;
	for (const o of huerfanos) {
		if (new Date(o.$createdAt) < desde) {
			console.log(`  = #${o.numero} es anterior al modo a convenir: se deja como retiro.`);
			continue;
		}
		await db.updateDocument(DB_ID, COL, o.$id, { fulfillment: NUEVO });
		corregidos++;
		console.log(`  ✓ #${o.numero} → ${NUEVO}`);
	}
	console.log(`\nListo. ${corregidos} pedido(s) corregido(s).`);
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
