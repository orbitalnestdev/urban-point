import 'dotenv/config';
import { createAdminClient } from '../src/lib/server/appwrite';
import { Query } from 'node-appwrite';

function cleanName(rawName: string): string {
	if (!rawName) return '';
	// 1. Remove address part after " - " or " – " or " — "
	let cleaned = rawName.split(/\s*[\-\–\—]\s*/)[0].trim();

	// 2. Remove "puesto de diarios", "puesto nro", "puesto n°", "puesto", "kiosco" at start
	cleaned = cleaned.replace(/^(puesto\s+de\s+diarios|kiosco\s+de\s+diarios|kiosco)\s+/i, '').trim();
	cleaned = cleaned.replace(/^puesto\s+n[rº°#\.]*\s*/i, '').trim();
	cleaned = cleaned.replace(/^puesto\s+/i, '').trim();

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

	console.log(`Processing ${allPoints.length} pickup points with parallel batching...\n`);
	
	const BATCH_SIZE = 20;
	let updatedCount = 0;
	let skippedCount = 0;

	for (let i = 0; i < allPoints.length; i += BATCH_SIZE) {
		const batch = allPoints.slice(i, i + BATCH_SIZE);
		await Promise.all(
			batch.map(async (p) => {
				const original = p.nombre_comercial;
				const cleaned = cleanName(original);

				if (cleaned && cleaned !== original) {
					try {
						await databases.updateDocument('urbanpoint', 'pickup_points', p.$id, {
							nombre_comercial: cleaned
						});
						console.log(`✅ [${p.$id}] UPDATED: "${original}" ==> "${cleaned}"`);
						updatedCount++;
					} catch (e: any) {
						console.error(`❌ [${p.$id}] ERROR:`, e.message);
					}
				} else {
					skippedCount++;
				}
			})
		);
	}

	console.log(`\n🎉 FINISHED: ${updatedCount} updated, ${skippedCount} skipped.`);
}

main().catch(console.error);
