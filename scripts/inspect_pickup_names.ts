import 'dotenv/config';
import { createAdminClient } from '../src/lib/server/appwrite';
import { Query } from 'node-appwrite';

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

	console.log(`FOUND_TOTAL: ${allPoints.length}`);
	for (const p of allPoints) {
		console.log(JSON.stringify({ id: p.$id, current: p.nombre_comercial, address: p.direccion, slug: p.slug }));
	}
}

main().catch(console.error);
