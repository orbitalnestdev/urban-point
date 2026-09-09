/**
 * Convierte los grupos temáticos de src/lib/categoryGroups.ts (hasta ahora
 * sólo visuales, para el menú lateral) en categorías padre REALES en
 * Appwrite: crea una categoría por grupo (parent_id null) y reasigna el
 * parent_id de cada categoría existente al grupo que le corresponde según
 * la misma asignación (idDeGrupo) — así quedan editables desde
 * /admin/categorias como cualquier otra categoría (renombrar, mover una
 * categoría a otro grupo, etc.), sin depender más del mapeo en el código.
 *
 * Idempotente: si un grupo con ese nombre ya existe (parent_id null), lo
 * reusa en vez de duplicarlo; si una categoría ya tiene el parent_id
 * correcto, no la vuelve a escribir.
 *
 * Uso:
 *   npx tsx scripts/migrate_category_groups.ts --dry-run
 *   npx tsx scripts/migrate_category_groups.ts --apply
 */
import { Client, Databases, Query } from 'node-appwrite';
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });
import { GRUPOS, idDeGrupo } from '../src/lib/categoryGroups';
import { escribirDocumentoTolerante } from '../src/lib/server/appwrite';

const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) {
	console.error('Falta APPWRITE_API_KEY en el entorno.');
	process.exit(1);
}

const endpoint = process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1';
const projectId = process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817';
const db = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

const APLICAR = process.argv.includes('--apply');

function slugify(nombre: string): string {
	return (
		nombre
			.toLowerCase()
			.trim()
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'grupo-' + Date.now()
	);
}

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
	console.log(APLICAR ? '🚀 Aplicando cambios...' : '👀 Dry-run (nada se escribe; usá --apply para aplicar)');

	const categorias = await fetchAllDocs('categories');
	// Sólo las de primer nivel: son las que se reparentan bajo su grupo.
	const raices = categorias.filter((c: any) => !c.parent_id);

	console.log(`\nCategorías totales: ${categorias.length} · de primer nivel a reasignar: ${raices.length}\n`);

	// 1) Crear (o reusar) una categoría real por grupo.
	const idGrupoReal = new Map<string, string>(); // id de grupo (categoryGroups.ts) -> $id real en Appwrite
	for (let i = 0; i < GRUPOS.length; i++) {
		const grupo = GRUPOS[i];
		const existente = raices.find((c: any) => c.nombre === grupo.nombre);
		if (existente) {
			console.log(`  ↺ Grupo "${grupo.nombre}" ya existe como categoría [${existente.$id}], se reusa.`);
			idGrupoReal.set(grupo.id, existente.$id);
			continue;
		}
		console.log(`  + Crear categoría de grupo: "${grupo.nombre}"`);
		if (APLICAR) {
			// Tolerante: si la colección no tiene alguno de estos atributos
			// (p. ej. "descripcion"), lo omite y reintenta en vez de fallar.
			const doc = await escribirDocumentoTolerante('categories', {
				nombre: grupo.nombre,
				slug: slugify(grupo.nombre),
				parent_id: null,
				descripcion: '',
				imagen_url: null,
				estado: 'activa',
				orden: i
			});
			idGrupoReal.set(grupo.id, doc.$id);
		} else {
			idGrupoReal.set(grupo.id, `(nuevo:${grupo.id})`);
		}
	}

	// 2) Reasignar parent_id de cada categoría de primer nivel (salvo las que
	//    son, ellas mismas, una de las categorías de grupo).
	const idsDeGrupoReal = new Set([...idGrupoReal.values()].filter((v) => !v.startsWith('(nuevo:')));
	let actualizadas = 0;
	let saltadas = 0;
	const porGrupoPreview = new Map<string, string[]>();

	for (const cat of raices) {
		if (idsDeGrupoReal.has(cat.$id)) continue; // es un grupo real ya existente, no se reasigna a sí mismo
		if (GRUPOS.some((g) => g.nombre === cat.nombre)) continue; // es uno de los grupos (dry-run, sin $id real todavía)

		const grupoId = idDeGrupo(cat.nombre);
		const nuevoParentId = idGrupoReal.get(grupoId);
		if (!nuevoParentId) {
			console.warn(`  ⚠️  "${cat.nombre}" no resolvió a ningún grupo, se deja sin tocar.`);
			saltadas++;
			continue;
		}

		const lista = porGrupoPreview.get(grupoId) || [];
		lista.push(cat.nombre);
		porGrupoPreview.set(grupoId, lista);

		if (!APLICAR) continue;

		const parentActual = typeof cat.parent_id === 'string' ? cat.parent_id : cat.parent_id?.$id;
		if (parentActual === nuevoParentId) {
			saltadas++;
			continue;
		}

		await db.updateDocument('urbanpoint', 'categories', cat.$id, { parent_id: nuevoParentId });
		actualizadas++;
	}

	if (!APLICAR) {
		console.log('\n📋 Vista previa de la reasignación:\n');
		for (const grupo of GRUPOS) {
			const hijas = porGrupoPreview.get(grupo.id) || [];
			if (hijas.length === 0) continue;
			console.log(`  ${grupo.nombre} (${hijas.length}):`);
			hijas.forEach((n) => console.log(`    - ${n}`));
		}
		console.log('\n(dry-run: no se escribió nada — correr con --apply para aplicar)');
		return;
	}

	console.log(`\n✨ Listo. ${actualizadas} categorías reasignadas a su grupo, ${saltadas} sin cambios.`);
}

main().catch((e) => {
	console.error('Error:', e?.message || e);
	process.exit(1);
});
