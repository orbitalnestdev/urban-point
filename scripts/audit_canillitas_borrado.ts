/**
 * Auditoría de SOLO LECTURA: qué se llevaría puesto borrar "todos los
 * canillitas". No modifica nada — sólo cuenta y muestra ejemplos, para
 * decidir con información antes de un borrado irreversible.
 *
 * Uso:
 *   npx tsx scripts/audit_canillitas_borrado.ts
 */
import { Client, Databases, Query } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) {
	console.error('Falta APPWRITE_API_KEY en el entorno.');
	process.exit(1);
}

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

async function fetchAllDocs(coll: string) {
	let docs: any[] = [];
	let offset = 0;
	while (true) {
		const res = await db.listDocuments('urbanpoint', coll, [Query.limit(100), Query.offset(offset)]);
		docs.push(...res.documents);
		if (res.documents.length < 100) break;
		offset += 100;
	}
	return docs;
}

const idDe = (v: any): string => (typeof v === 'string' ? v : v?.$id) || '';

async function main() {
	const puntos = await fetchAllDocs('pickup_points');
	console.log(`\n📍 pickup_points: ${puntos.length}`);
	const porEstado = new Map<string, number>();
	for (const p of puntos) porEstado.set(p.estado || '(sin estado)', (porEstado.get(p.estado || '(sin estado)') || 0) + 1);
	for (const [estado, n] of porEstado) console.log(`     ${estado}: ${n}`);

	const conUsuario = puntos.filter((p) => idDe(p.profile_id));
	console.log(`     con usuario/perfil vinculado: ${conUsuario.length}`);

	// Pedidos que referencian un punto
	const pedidos = await fetchAllDocs('orders').catch((e) => {
		console.log(`  (orders: ${e.message})`);
		return [] as any[];
	});
	const idsPuntos = new Set(puntos.map((p) => p.$id));
	const pedidosConPunto = pedidos.filter(
		(o) => idsPuntos.has(idDe(o.pickup_point_id)) || idsPuntos.has(idDe(o.origin_node_id)) || idsPuntos.has(idDe(o.pickup_node_id))
	);
	console.log(`\n🧾 orders totales: ${pedidos.length}`);
	console.log(`     que referencian un punto: ${pedidosConPunto.length}  ← se quedarían huérfanos`);

	const idsPerfilesCanillita = new Set(conUsuario.map((p) => idDe(p.profile_id)));
	const pedidosConCanillita = pedidos.filter((o) => idsPerfilesCanillita.has(idDe(o.canillita_id)) || idsPerfilesCanillita.has(idDe(o.origin_canillita_id)));
	console.log(`     con canillita atribuido (comisión): ${pedidosConCanillita.length}`);

	// Otras colecciones relacionadas
	for (const coll of ['referral_codes', 'canillita_applications', 'payout_requests', 'commissions', 'commission_rules']) {
		const docs = await fetchAllDocs(coll).catch(() => null);
		if (docs === null) {
			console.log(`\n📦 ${coll}: (no existe o sin acceso)`);
			continue;
		}
		console.log(`\n📦 ${coll}: ${docs.length}`);
	}

	console.log('\n📄 Ejemplos de puntos (5):');
	for (const p of puntos.slice(0, 5)) {
		console.log(`   [${p.$id}] "${p.nombre_comercial}" · estado=${p.estado} · perfil=${idDe(p.profile_id) || '(ninguno)'}`);
	}

	console.log('\n⚠️  Nada de esto fue modificado: es sólo un informe.');
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
