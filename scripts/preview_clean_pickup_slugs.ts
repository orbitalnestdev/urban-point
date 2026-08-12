import 'dotenv/config';
import { createAdminClient } from '../src/lib/server/appwrite';
import { Query } from 'node-appwrite';
import { limpiarSlugNodo, esSlugReservado } from '../src/lib/slugs';

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

	console.log(`Analyzing ${allPoints.length} pickup point slugs...\n`);
	
	const usedSlugs = new Set<string>();
	let changeCount = 0;

	for (const p of allPoints) {
		const originalSlug = p.slug || '';
		const baseSlug = limpiarSlugNodo(p.nombre_comercial || originalSlug);
		
		let candidate = baseSlug;
		let counter = 2;

		while (usedSlugs.has(candidate) || esSlugReservado(candidate)) {
			candidate = `${baseSlug}-${counter}`;
			counter++;
		}
		usedSlugs.add(candidate);

		if (candidate !== originalSlug) {
			console.log(`[${p.$id}] Name: "${p.nombre_comercial}" | "${originalSlug}" ==> "${candidate}"`);
			changeCount++;
		} else {
			console.log(`[${p.$id}] OK: "${originalSlug}"`);
		}
	}

	console.log(`\nTotal points to update: ${changeCount} / ${allPoints.length}`);
}

main().catch(console.error);
