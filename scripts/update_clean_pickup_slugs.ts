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

	console.log(`Processing ${allPoints.length} pickup point slugs with parallel batching...\n`);
	
	const usedSlugs = new Set<string>();
	const updates: { id: string; oldSlug: string; newSlug: string; name: string }[] = [];

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
			updates.push({
				id: p.$id,
				oldSlug: originalSlug,
				newSlug: candidate,
				name: p.nombre_comercial
			});
		}
	}

	console.log(`Found ${updates.length} slugs to update.\n`);

	const BATCH_SIZE = 20;
	let updatedCount = 0;

	for (let i = 0; i < updates.length; i += BATCH_SIZE) {
		const batch = updates.slice(i, i + BATCH_SIZE);
		await Promise.all(
			batch.map(async (u) => {
				try {
					await databases.updateDocument('urbanpoint', 'pickup_points', u.id, {
						slug: u.newSlug
					});
					console.log(`✅ [${u.id}] UPDATED: "${u.oldSlug}" ==> "${u.newSlug}" (${u.name})`);
					updatedCount++;
				} catch (e: any) {
					console.error(`❌ [${u.id}] ERROR updating slug:`, e.message);
				}
			})
		);
	}

	console.log(`\n🎉 FINISHED: ${updatedCount} node slugs updated.`);
}

main().catch(console.error);
