/**
 * Corrección puntual pedida por la clienta: "Vehículos y Motores" no tenía
 * sentido como grupo — son autos de juguete, no vehículos "reales". Sus
 * hijas se reparten en dos grupos ya existentes y el grupo queda vacío
 * (se borra al final, si efectivamente quedó sin hijas).
 *
 * Uso:
 *   npx tsx scripts/reassign_vehiculos_group.ts --dry-run
 *   npx tsx scripts/reassign_vehiculos_group.ts --apply
 */
import { Client, Databases, Query } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) { console.error('Falta APPWRITE_API_KEY.'); process.exit(1); }
const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

const APLICAR = process.argv.includes('--apply');

// Autos "de juguete" -> Infantil. Los dos "Objetos de Coleccion - Vehiculos
// de Coleccion" -> Objetos de Colección (su propio nombre ya lo dice).
const A_INFANTIL = [
	'Autos Alemanes',
	'Autos americanos',
	'Autos Clásicos Descapotables',
	'Autos Clasicos y Descapotables',
	'Autos deportivos de lujo',
	'Batimóviles',
	'Construye tu F1',
	'Monster Truck',
	'Motos Clásicas',
	'Pick Ups Americanas'
];
const A_COLECCION = [
	'Objetos de Coleccion - Vehiculos de Coleccion - Autos',
	'Objetos de Coleccion - Vehiculos de Coleccion - Barcos'
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
	console.log(APLICAR ? '🚀 Aplicando cambios...' : '👀 Dry-run (usá --apply para aplicar)');

	const categorias = await fetchAllDocs('categories');
	const porNombre = new Map(categorias.map((c: any) => [c.nombre, c]));

	const vehiculos = porNombre.get('Vehículos y Motores');
	const infantil = porNombre.get('Infantil');
	const coleccion = porNombre.get('Objetos de Colección');

	if (!vehiculos || !infantil || !coleccion) {
		console.error('No se encontró alguno de los 3 grupos por nombre. Categorías de grupo detectadas:',
			[vehiculos?.nombre, infantil?.nombre, coleccion?.nombre]);
		process.exit(1);
	}

	console.log(`\nVehículos y Motores: [${vehiculos.$id}]`);
	console.log(`Infantil: [${infantil.$id}]`);
	console.log(`Objetos de Colección: [${coleccion.$id}]\n`);

	async function mover(nombres: string[], destino: any) {
		for (const nombre of nombres) {
			const cat = porNombre.get(nombre);
			if (!cat) {
				console.warn(`  ⚠️  No se encontró la categoría "${nombre}".`);
				continue;
			}
			const parentActual = typeof cat.parent_id === 'string' ? cat.parent_id : cat.parent_id?.$id;
			if (parentActual === destino.$id) {
				console.log(`  = "${nombre}" ya está en "${destino.nombre}".`);
				continue;
			}
			console.log(`  → "${nombre}": "${vehiculos.nombre}" → "${destino.nombre}"`);
			if (APLICAR) {
				await db.updateDocument('urbanpoint', 'categories', cat.$id, { parent_id: destino.$id });
			}
		}
	}

	await mover(A_INFANTIL, infantil);
	await mover(A_COLECCION, coleccion);

	// ¿Vehículos y Motores quedó sin hijas? Si es así, se borra.
	const hijasRestantes = categorias.filter((c: any) => {
		const pid = typeof c.parent_id === 'string' ? c.parent_id : c.parent_id?.$id;
		return pid === vehiculos.$id && !A_INFANTIL.includes(c.nombre) && !A_COLECCION.includes(c.nombre);
	});

	if (hijasRestantes.length > 0) {
		console.log(`\n⚠️  "Vehículos y Motores" quedaría con ${hijasRestantes.length} hija(s) sin mover: ${hijasRestantes.map((c: any) => c.nombre).join(', ')}. No se borra.`);
		return;
	}

	console.log(`\n${APLICAR ? 'Borrando' : 'Se borraría'} la categoría "Vehículos y Motores" (queda sin hijas).`);
	if (APLICAR) {
		await db.deleteDocument('urbanpoint', 'categories', vehiculos.$id);
		console.log('✨ Listo.');
	}
}

main().catch((e) => { console.error('Error:', e?.message || e); process.exit(1); });
