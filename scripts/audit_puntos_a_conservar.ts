/**
 * SOLO LECTURA: identifica los puntos a conservar (Rafa / Conaj) y a qué
 * puntos apuntan los pedidos existentes, para saber si borrar el resto
 * dejaría pedidos huérfanos.
 *
 * Uso: npx tsx scripts/audit_puntos_a_conservar.ts
 */
import { Client, Databases, Query } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) { console.error('Falta APPWRITE_API_KEY.'); process.exit(1); }
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
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

async function main() {
	const puntos = await fetchAllDocs('pickup_points');
	const perfiles = await fetchAllDocs('profiles').catch(() => [] as any[]);
	const perfilPorId = new Map(perfiles.map((p: any) => [p.$id, p]));

	console.log('🔎 Puntos que matchean "rafa" / "conaj" / "cohaj":\n');
	const candidatos = puntos.filter((p: any) => {
		const t = norm(p.nombre_comercial) + ' ' + norm(p.titular_nombre) + ' ' + norm(p.slug);
		return t.includes('rafa') || t.includes('conaj') || t.includes('cohaj');
	});
	for (const p of candidatos) {
		const perfil = perfilPorId.get(idDe(p.profile_id));
		console.log(`   [${p.$id}] "${p.nombre_comercial}" · titular=${p.titular_nombre || '-'} · slug=${p.slug || '-'} · estado=${p.estado} · usuario=${perfil?.email || '(ninguno)'}`);
	}
	if (candidatos.length === 0) console.log('   (ninguno encontrado)');

	// A qué puntos apuntan los pedidos
	const pedidos = await fetchAllDocs('orders');
	const puntoPorId = new Map(puntos.map((p: any) => [p.$id, p]));
	const conteo = new Map<string, number>();
	for (const o of pedidos) {
		const pid = idDe(o.pickup_point_id) || idDe(o.origin_node_id) || idDe(o.pickup_node_id);
		if (!pid) continue;
		conteo.set(pid, (conteo.get(pid) || 0) + 1);
	}

	console.log(`\n🧾 Puntos referenciados por los ${pedidos.length} pedidos:\n`);
	for (const [pid, n] of [...conteo.entries()].sort((a, b) => b[1] - a[1])) {
		const p = puntoPorId.get(pid);
		const seConserva = candidatos.some((c: any) => c.$id === pid);
		console.log(`   ${n} pedido(s) → [${pid}] "${p?.nombre_comercial || '(punto inexistente)'}" ${seConserva ? '✅ se conserva' : '⚠️  se borraría'}`);
	}

	console.log('\n⚠️  Informe únicamente: no se modificó nada.');
}

main().catch((e) => { console.error('Error:', e?.message || e); process.exit(1); });
