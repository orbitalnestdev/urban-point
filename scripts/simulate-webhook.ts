import { Client, Databases, Query } from 'node-appwrite';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Buscar .env.local o .env
const envLocalPath = join(__dirname, '../.env.local');
const envPath = join(__dirname, '../.env');

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config({ path: envPath });
}

const client = new Client()
    .setEndpoint(process.env.PUBLIC_APPWRITE_ENDPOINT || process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://aw.orbitalnest.net/v1')
    .setProject(process.env.PUBLIC_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const db = new Databases(client);

async function simulateWebhook() {
    try {
        console.log("Buscando una orden en estado 'pendiente_pago'...");
        
        const ordersRes = await db.listDocuments('urbanpoint', 'orders', [
            Query.equal('estado', 'pendiente_pago'),
            Query.limit(1)
        ]);

        if (ordersRes.documents.length === 0) {
            console.log("❌ No se encontraron órdenes pendientes de pago. Creá una desde la tienda (Checkout) primero.");
            return;
        }

        const orderId = ordersRes.documents[0].$id;
        console.log(`✅ Orden encontrada: ${orderId}`);
        console.log("Simulando llamada POST del Webhook de Mercado Pago a http://localhost:4321/api/webhooks/mercadopago ...");

        // Como usamos el mock (sin MP_ACCESS_TOKEN o con lógica de bypass), le enviamos el ID de la orden en data.id
        const res = await fetch('http://localhost:4321/api/webhooks/mercadopago', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: 'payment',
                data: {
                    id: orderId
                }
            })
        });

        const text = await res.text();
        if (res.ok) {
            console.log(`🎉 Webhook procesado exitosamente: ${text}`);
            
            // Verificar el ledger
            console.log("Verificando commission_ledger...");
            const ledgerRes = await db.listDocuments('urbanpoint', 'commission_ledger', [
                Query.equal('order_id', orderId)
            ]);

            if (ledgerRes.documents.length > 0) {
                console.log(`✅ ¡Se encontraron ${ledgerRes.documents.length} registros de comisión!`);
                ledgerRes.documents.forEach(doc => {
                    console.log(`   -> Canillita: ${doc.canillita_id}, Monto: $${(doc.monto_centavos/100).toFixed(2)}, Tipo: ${doc.tipo}, Tasa BP: ${doc.tasa_bp_snapshot}`);
                });
            } else {
                console.log("⚠️ No se generaron registros en commission_ledger (¿Quizás la orden estaba vacía o hubo un error?).");
            }

        } else {
            console.error(`❌ El webhook respondió con error ${res.status}: ${text}`);
        }

    } catch (error) {
        console.error("❌ Error al simular webhook:", error);
    }
}

simulateWebhook();
