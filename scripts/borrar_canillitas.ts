/**
 * Borra los puntos de retiro (canillitas) dejando SÓLO los que la clienta
 * pidió conservar. Antes de borrar, exporta TODOS los puntos a un JSON en
 * scratch/ (carpeta ya ignorada por git: estos documentos tienen CBU y
 * condición fiscal, no pueden terminar en el repo).
 *
 * Los ids a conservar están hardcodeados a propósito: hacer el match por
 * nombre en el momento del borrado es justo la clase de atajo que borra lo
 * que no era (p. ej. "GRAFA17" contiene "rafa").
 *
 * Uso:
 *   npx tsx scripts/borrar_canillitas.ts            (backup + dry-run)
 *   npx tsx scripts/borrar_canillitas.ts --apply    (backup + borrado real)
 */
import { Client, Databases, Query } from 'node-appwrite';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
config({ path: ['.env.local', '.env'] });

const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) { console.error('Falta APPWRITE_API_KEY.'); process.exit(1); }
const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

const APLICAR = process.argv.includes('--apply');

/** COHAJ y el primero de los dos "Rafa" (/rafa). */
const CONSERVAR = new Map<string, string>([
	['6a7e147900071531a6e3', 'COHAJ (/cohaj)'],
	['6a831b41002da605ec0d', 'Rafa (/rafa)']
]);

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
	const puntos = await fetchAllDocs('pickup_points');
	console.log(`Puntos en la base: ${puntos.length}`);

	// 1) Backup SIEMPRE, incluso en dry-run.
	const dir = path.resolve(process.cwd(), 'scratch');
	fs.mkdirSync(dir, { recursive: true });
	const sello = new Date().toISOString().replace(/[:.]/g, '-');
	const archivo = path.join(dir, `backup-pickup-points-${sello}.json`);
	fs.writeFileSync(archivo, JSON.stringify(puntos, null, 2), 'utf8');
	console.log(`💾 Backup de los ${puntos.length} puntos: ${archivo}`);

	const conservar = puntos.filter((p: any) => CONSERVAR.has(p.$id));
	const aBorrar = puntos.filter((p: any) => !CONSERVAR.has(p.$id));

	console.log(`\n✅ Se conservan (${conservar.length}):`);
	for (const p of conservar) console.log(`   [${p.$id}] "${p.nombre_comercial}" · ${CONSERVAR.get(p.$id)}`);

	if (conservar.length !== CONSERVAR.size) {
		console.error(`\n❌ Se esperaba conservar ${CONSERVAR.size} puntos y se encontraron ${conservar.length}. Se aborta por las dudas.`);
		process.exit(1);
	}

	console.log(`\n🗑️  A borrar: ${aBorrar.length}`);

	if (!APLICAR) {
		console.log('\n(dry-run: no se borró nada — correr con --apply)');
		return;
	}

	let borrados = 0;
	const fallidos: string[] = [];
	for (const p of aBorrar) {
		try {
			await db.deleteDocument('urbanpoint', 'pickup_points', p.$id);
			borrados++;
			if (borrados % 50 === 0) console.log(`   ...${borrados}/${aBorrar.length}`);
		} catch (e: any) {
			fallidos.push(`${p.$id} ("${p.nombre_comercial}"): ${e?.message || e}`);
		}
	}

	console.log(`\n✨ Borrados: ${borrados}/${aBorrar.length}`);
	if (fallidos.length) {
		console.log(`⚠️  Fallaron ${fallidos.length}:`);
		fallidos.slice(0, 10).forEach((f) => console.log(`   ${f}`));
	}

	const quedan = await fetchAllDocs('pickup_points');
	console.log(`\n📍 Puntos restantes: ${quedan.length}`);
	for (const p of quedan) console.log(`   [${p.$id}] "${p.nombre_comercial}" · estado=${p.estado}`);
}

main().catch((e) => { console.error('Error:', e?.message || e); process.exit(1); });
