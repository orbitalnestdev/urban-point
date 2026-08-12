/**
 * Migra products.precio_promocional de double a integer. [C-06]
 *
 * Es el único campo monetario declarado como punto flotante en toda la base,
 * conviviendo con `precio` (integer) en la misma colección. Appwrite no
 * permite cambiar el tipo de un atributo: hay que borrarlo y recrearlo, así
 * que los valores se respaldan y se reescriben.
 *
 * Durante la ventana de migración el campo no existe y la vitrina muestra el
 * precio de lista. precioDeVentaCentavos() tolera el campo ausente, así que
 * no rompe nada: sólo deja de aplicar promociones hasta que termina.
 *
 * Uso:
 *   npx tsx scripts/migrate_precio_promocional.ts --backup
 *   npx tsx scripts/migrate_precio_promocional.ts --apply
 *   npx tsx scripts/migrate_precio_promocional.ts --restore   (si algo falla)
 */
import { Client, Databases } from 'node-appwrite';
import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

config({ path: ['.env.local', '.env'] });

const DB = 'urbanpoint';
const COL = 'products';
const ATTR = 'precio_promocional';
const BACKUP = path.join('docs', 'auditoria', 'backups', 'precio_promocional_backup.json');

const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) {
	console.error('Falta APPWRITE_API_KEY.');
	process.exit(1);
}

const db = new Databases(
	new Client()
		.setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
		.setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || '6a6a5321001439f06817')
		.setKey(apiKey)
);

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Fila = { id: string; sku?: string; precio?: number; precio_promocional?: number };

async function leerTodos(): Promise<Fila[]> {
	const { Query } = await import('node-appwrite');
	const todos: Fila[] = [];
	let offset = 0;
	while (true) {
		const res = await db.listDocuments(DB, COL, [Query.limit(100), Query.offset(offset)]);
		todos.push(
			...res.documents.map((d: any) => ({
				id: d.$id,
				sku: d.sku,
				precio: d.precio,
				precio_promocional: d[ATTR]
			}))
		);
		if (res.documents.length < 100) break;
		offset += 100;
	}
	return todos;
}

async function respaldar() {
	const filas = await leerTodos();
	fs.mkdirSync(path.dirname(BACKUP), { recursive: true });
	fs.writeFileSync(BACKUP, JSON.stringify(filas, null, 1));
	const conPromo = filas.filter((f) => Number(f.precio_promocional) > 0);
	const noEnteros = conPromo.filter((f) => !Number.isInteger(Number(f.precio_promocional)));
	console.log(`Respaldados ${filas.length} productos (${conPromo.length} con promoción).`);
	if (noEnteros.length) {
		console.log(`ATENCIÓN: ${noEnteros.length} valores no enteros se van a redondear.`);
	}
	return filas;
}

/** Espera a que el atributo quede disponible (Appwrite lo crea en background). */
async function esperarDisponible(intentos = 30) {
	for (let i = 0; i < intentos; i++) {
		try {
			const attr: any = await db.getAttribute(DB, COL, ATTR);
			if (attr.status === 'available') return true;
			console.log(`  estado del atributo: ${attr.status}...`);
		} catch {
			// Todavía no existe.
		}
		await dormir(2000);
	}
	return false;
}

async function esperarBorrado(intentos = 30) {
	for (let i = 0; i < intentos; i++) {
		try {
			await db.getAttribute(DB, COL, ATTR);
			await dormir(2000);
		} catch {
			return true; // ya no existe
		}
	}
	return false;
}

async function restaurarValores(filas: Fila[]) {
	const conPromo = filas.filter((f) => Number(f.precio_promocional) > 0);
	let ok = 0;
	const fallidos: string[] = [];

	for (const fila of conPromo) {
		const valor = Math.round(Number(fila.precio_promocional));
		try {
			await db.updateDocument(DB, COL, fila.id, { [ATTR]: valor });
			ok++;
			if (ok % 100 === 0) console.log(`  ${ok}/${conPromo.length} restaurados...`);
		} catch (e: any) {
			fallidos.push(`${fila.id}: ${e.message}`);
		}
	}

	console.log(`Restaurados ${ok}/${conPromo.length}.`);
	if (fallidos.length) {
		console.error(`${fallidos.length} fallidos:`);
		fallidos.slice(0, 10).forEach((f) => console.error('  ' + f));
	}
	return fallidos.length === 0;
}

async function main() {
	const modo = process.argv[2];

	if (modo === '--backup') {
		await respaldar();
		return;
	}

	if (modo === '--restore') {
		const filas: Fila[] = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
		await restaurarValores(filas);
		return;
	}

	if (modo !== '--apply') {
		console.log('Usá --backup, --apply o --restore.');
		return;
	}

	console.log('1/5 Respaldando...');
	const filas = await respaldar();

	console.log('2/5 Borrando el atributo double...');
	await db.deleteAttribute(DB, COL, ATTR);
	if (!(await esperarBorrado())) {
		console.error('El atributo no terminó de borrarse. Abortando; los datos están en el respaldo.');
		process.exit(1);
	}
	console.log('  borrado.');

	console.log('3/5 Creando el atributo integer...');
	await db.createIntegerAttribute(DB, COL, ATTR, false, 0, 999999999, 0);
	if (!(await esperarDisponible())) {
		console.error('El atributo no quedó disponible. Corré --restore cuando lo esté.');
		process.exit(1);
	}
	console.log('  creado como integer.');

	console.log('4/5 Restaurando valores...');
	const todoOk = await restaurarValores(filas);

	console.log('5/5 Verificando...');
	const attr: any = await db.getAttribute(DB, COL, ATTR);
	console.log(`  tipo final: ${attr.type} (status: ${attr.status})`);
	console.log(todoOk ? 'Migración completa.' : 'Migración terminada CON ERRORES: revisá arriba.');
}

main().catch((e) => {
	console.error('Error en la migración:', e);
	console.error(`Los datos están respaldados en ${BACKUP}. Podés reintentar con --restore.`);
	process.exit(1);
});
