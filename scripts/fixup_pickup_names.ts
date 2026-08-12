import 'dotenv/config';
import { createAdminClient } from '../src/lib/server/appwrite';
import { Query } from 'node-appwrite';

const FIX_MAP: Record<string, string> = {
	'AZCA17': 'NAZCA17',
	'AON': 'NAON',
	'ICOLAS15': 'NICOLAS15',
	'U#EZ 15': 'NU#EZ 15'
};

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

	for (const p of allPoints) {
		const current = p.nombre_comercial;
		if (FIX_MAP[current]) {
			const fixed = FIX_MAP[current];
			await databases.updateDocument('urbanpoint', 'pickup_points', p.$id, {
				nombre_comercial: fixed
			});
			console.log(`🔧 [${p.$id}] FIXED: "${current}" ==> "${fixed}"`);
		}
	}
	console.log("Cleanup pass complete.");
}

main().catch(console.error);
