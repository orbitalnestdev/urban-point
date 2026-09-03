/**
 * Verifica qué variables de entorno están configuradas, SIN imprimir su valor.
 *
 * Existe para poder confirmar que un entorno quedó bien armado sin que el
 * secreto pase por la pantalla, por un log o por el historial de la terminal.
 * De cada variable sólo informa si está, cuántos caracteres tiene y —cuando el
 * prefijo es parte del formato, como en los tokens de Mercado Pago— si el
 * prefijo es el esperado.
 *
 * Uso:
 *   npx tsx scripts/check_env.ts
 */
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

interface Variable {
	nombre: string;
	obligatoria: boolean;
	para: string;
	/** Prefijo esperado, cuando informarlo no revela el secreto. */
	prefijo?: string;
	/** Verificación de forma que no expone el contenido. */
	valida?: (v: string) => string | null;
}

const VARIABLES: Variable[] = [
	{
		nombre: 'APPWRITE_API_KEY',
		obligatoria: true,
		para: 'Scripts de esquema y servidor'
	},
	{
		nombre: 'PUBLIC_APPWRITE_ENDPOINT',
		obligatoria: false,
		para: 'Appwrite (tiene default)'
	},
	{
		nombre: 'PUBLIC_APPWRITE_PROJECT_ID',
		obligatoria: false,
		para: 'Appwrite (tiene default)'
	},
	{
		nombre: 'MP_ACCESS_TOKEN',
		obligatoria: false,
		para: 'Checkout de Mercado Pago',
		prefijo: 'TEST-',
		valida: (v) =>
			v.startsWith('TEST-')
				? null
				: 'no empieza con TEST-: parece de PRODUCCIÓN, no de prueba'
	},
	{
		nombre: 'MP_WEBHOOK_SECRET',
		obligatoria: false,
		para: 'Firma del webhook de pagos'
	},
	{
		nombre: 'MP_USE_SANDBOX',
		obligatoria: false,
		para: 'Fuerza el checkout de prueba',
		valida: (v) => (v === 'true' ? null : `está en "${v}", tiene que ser "true" para probar`)
	},
	{
		nombre: 'BIND_CLIENT_ID',
		obligatoria: false,
		para: 'BIND PSP (en evaluación, no usado aún)'
	},
	{
		nombre: 'BIND_CLIENT_SECRET',
		obligatoria: false,
		para: 'BIND PSP (en evaluación, no usado aún)'
	},
	{
		nombre: 'BIND_SCOPE',
		obligatoria: false,
		para: 'BIND PSP (en evaluación, no usado aún)'
	},
	{
		nombre: 'PUBLIC_SITE_URL',
		obligatoria: false,
		para: 'notification_url que recibe Mercado Pago',
		valida: (v) =>
			v.includes('localhost') || v.includes('127.0.0.1')
				? 'apunta a localhost: se va a ignorar y el webhook le llegará a PRODUCCIÓN'
				: null
	}
];

const oculto = (v: string) => `${v.length} caracteres`;

console.log('\nVariables de entorno · sólo se informa presencia y forma\n');

let faltanObligatorias = 0;
const avisos: string[] = [];

for (const v of VARIABLES) {
	const valor = process.env[v.nombre];

	if (!valor || !valor.trim()) {
		const marca = v.obligatoria ? 'FALTA   ' : 'vacía   ';
		if (v.obligatoria) faltanObligatorias++;
		console.log(`  [${marca}] ${v.nombre.padEnd(28)} ${v.para}`);
		continue;
	}

	const problema = v.valida?.(valor.trim()) ?? null;
	const marca = problema ? 'REVISAR ' : 'ok      ';
	const detalle = v.prefijo && valor.startsWith(v.prefijo)
		? `${v.prefijo}… (${oculto(valor)})`
		: oculto(valor);

	console.log(`  [${marca}] ${v.nombre.padEnd(28)} ${detalle}`);
	if (problema) avisos.push(`${v.nombre}: ${problema}`);
}

if (avisos.length) {
	console.log('\nAvisos:');
	for (const a of avisos) console.log('  · ' + a);
}

console.log('');
if (faltanObligatorias > 0) {
	console.log(`Faltan ${faltanObligatorias} variable(s) obligatoria(s). Copiá .env.local.ejemplo a .env.local y completalas.`);
	process.exit(1);
}
console.log('Nada obligatorio pendiente.');
