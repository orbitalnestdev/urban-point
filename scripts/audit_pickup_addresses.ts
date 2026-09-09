/**
 * Auditoría de solo lectura: detecta direcciones rotas/incompletas en
 * pickup_points (p. ej. "Falta Calle 00000085", direcciones vacías, o sólo
 * números). No modifica nada — imprime un resumen y ejemplos para decidir
 * cómo limpiarlas.
 *
 * Uso:
 *   npx tsx scripts/audit_pickup_addresses.ts
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

const PATRONES_ROTOS: { nombre: string; test: (d: string) => boolean }[] = [
	{ nombre: 'Contiene "falta calle"', test: (d) => /falta\s*calle/i.test(d) },
	{ nombre: 'Vacía o sólo espacios', test: (d) => d.trim().length === 0 },
	{ nombre: 'Sólo dígitos (sin nombre de calle)', test: (d) => /^\d+$/.test(d.trim()) },
	{ nombre: 'Altura con muchos ceros a la izquierda (000000xx)', test: (d) => /\b0{4,}\d*\b/.test(d) },
	{ nombre: 'Muy corta (<6 caracteres)', test: (d) => d.trim().length > 0 && d.trim().length < 6 }
];

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

async function main() {
	console.log('🔎 Trayendo todos los pickup_points...');
	const puntos = await fetchAllDocs('pickup_points');
	console.log(`Total de puntos: ${puntos.length}\n`);

	const porPatron = new Map<string, any[]>();
	const rotosIds = new Set<string>();

	for (const p of puntos) {
		const direccion: string = p.direccion || '';
		for (const patron of PATRONES_ROTOS) {
			if (patron.test(direccion)) {
				const lista = porPatron.get(patron.nombre) || [];
				lista.push(p);
				porPatron.set(patron.nombre, lista);
				rotosIds.add(p.$id);
			}
		}
	}

	console.log('📊 Resumen por patrón (un punto puede caer en más de uno):\n');
	for (const [nombre, lista] of porPatron.entries()) {
		console.log(`  ${nombre}: ${lista.length}`);
	}

	console.log(`\n🚩 Total de puntos con al menos un problema: ${rotosIds.size} de ${puntos.length}\n`);

	console.log('📄 Ejemplos (hasta 20):\n');
	let mostrados = 0;
	for (const p of puntos) {
		if (!rotosIds.has(p.$id)) continue;
		if (mostrados >= 20) break;
		console.log(
			`  [${p.$id}] estado=${p.estado} · "${p.nombre_comercial}" · dirección="${p.direccion}" · localidad="${p.localidad}" · lat=${p.lat} lng=${p.lng}`
		);
		mostrados++;
	}

	// Distribución por estado, para saber si el problema pega sobre todo en
	// puntos activos (visibles a clientes) o en pendientes/suspendidos.
	const porEstado = new Map<string, number>();
	for (const p of puntos) {
		if (!rotosIds.has(p.$id)) continue;
		porEstado.set(p.estado, (porEstado.get(p.estado) || 0) + 1);
	}
	console.log('\n📍 Puntos rotos por estado:');
	for (const [estado, n] of porEstado.entries()) {
		console.log(`  ${estado}: ${n}`);
	}
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
