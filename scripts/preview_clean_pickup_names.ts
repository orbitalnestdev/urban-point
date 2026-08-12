import 'dotenv/config';
import { createAdminClient } from '../src/lib/server/appwrite';
import { Query } from 'node-appwrite';

function cleanName(rawName: string): string {
	if (!rawName) return '';
	// 1. Remove address part after " - " or " – " or " — "
	let cleaned = rawName.split(/\s*[\-\–\—]\s*/)[0].trim();

	// 2. Remove "puesto de diarios", "puesto nro", "puesto n°", "puesto", "kiosco" at start
	cleaned = cleaned.replace(/^(puesto\s+de\s+diarios|puesto\s+n[rº°#\.]*|puesto|kiosco\s+de\s+diarios|kiosco)\s+/i, '').trim();

	if (!cleaned) {
		cleaned = rawName.trim();
	}
	return cleaned;
}

async function main() {
	const { databases } = createAdminClient();
	let offset = 0;
	const allPoints: any[] = [];
	while (true) {
		const res = await databases.listDocuments('urbanpoint', 'pickup_points', [
			Query.limit(100),
			Query.offset(offset)
		]);
		allPoints.push(...res.documents);
		if (res.documents.length < 100) break;
		offset += 100;
	}

	console.log(`Analyzing ${allPoints.length} pickup points...\n`);
	for (const p of allPoints) {
		const original = p.nombre_comercial;
		const cleaned = cleanName(original);
		console.log(`[${p.$id}] "${original}" ==> "${cleaned}"`);
	}
}

main().catch(console.error);
