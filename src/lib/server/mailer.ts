import nodemailer from 'nodemailer';
import { env } from './env';
import { getSiteSettings } from './settings';
import { formatearCentavos } from '../pricing';

interface OrderEmailItem {
  nombre_snapshot: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface OrderEmailData {
  $id: string;
  numero?: string;
  total: number;
  subtotal?: number;
  costo_envio?: number;
  fulfillment?: string;
  direccion_envio?: string;
  pickup_code_hash?: string;
  customerName?: string;
  customerEmail?: string;
  canillitaEmail?: string;
  canillitaNombre?: string;
  pickupNodeName?: string;
  pickupNodeAddress?: string;
}

async function getTransporter() {
  const settings = await getSiteSettings();
  const host = settings.smtp_host || env('SMTP_HOST') || process.env.SMTP_HOST;
  const user = settings.smtp_user || env('SMTP_USER') || process.env.SMTP_USER;
  const pass = settings.smtp_pass || env('SMTP_PASS') || process.env.SMTP_PASS;
  const port = settings.smtp_port || parseInt(env('SMTP_PORT') || process.env.SMTP_PORT || '587', 10);

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

function renderItemsTable(items: OrderEmailItem[]): string {
  const rows = items.map(item => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 13px; font-weight: 600;">
        ${item.nombre_snapshot}
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; font-size: 13px; text-align: center;">
        x${item.cantidad}
      </td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 700; text-align: right;">
        ${formatearCentavos(item.subtotal)}
      </td>
    </tr>
  `).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
      <thead>
        <tr style="background-color: #f8fafc; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
          <th style="padding: 10px 12px; text-align: left;">Producto</th>
          <th style="padding: 10px 12px; text-align: center;">Cant.</th>
          <th style="padding: 10px 12px; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

export async function sendOrderNotificationEmails(
  order: OrderEmailData,
  items: OrderEmailItem[]
): Promise<{ success: boolean; sentTo: string[]; error?: string }> {
  try {
    const transporter = await getTransporter();
    if (!transporter) {
      console.log('[Mailer] SMTP credentials missing in settings/env. Emails skipped.');
      return { success: false, sentTo: [], error: 'SMTP no configurado' };
    }

    const settings = await getSiteSettings();
    const fromEmail = settings.smtp_from || env('SMTP_FROM') || process.env.SMTP_FROM || settings.smtp_user || env('SMTP_USER') || 'notificaciones@urbanpoint.com.ar';

    // Soporte para múltiples correos de administrador separados por coma o punto y coma
    const adminEmailsRaw = settings.admin_emails || env('ADMIN_EMAIL') || process.env.ADMIN_EMAIL || 'admin@urbanpoint.com.ar';
    const adminEmailsList = adminEmailsRaw
      .split(/[,;]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0 && e.includes('@'));

    const orderNum = order.numero || order.$id.substring(0, 6);
    const sentTo: string[] = [];

    const itemsHtml = renderItemsTable(items);

    // 1. Email al Cliente
    if (order.customerEmail) {
      const customerSubject = `¡Confirmación de Pedido #${orderNum} en UrbanPoint!`;
      const customerHtml = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 24px; border-radius: 16px;">
          <div style="background: #2D5A27; padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">UrbanPoint</h1>
            <p style="color: #a7f3d0; margin: 4px 0 0 0; font-size: 13px;">Tu tienda de cercanía</p>
          </div>
          
          <div style="background: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h2 style="color: #0f172a; margin-top: 0; font-size: 18px;">¡Gracias por tu compra, ${order.customerName || 'Cliente'}!</h2>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">
              Hemos recibido tu pedido <strong>#${orderNum}</strong> correctamente.
            </p>

            ${order.fulfillment === 'retiro' ? `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 10px; margin: 16px 0;">
                <p style="margin: 0; color: #166534; font-size: 13px; font-weight: 700;">📍 Punto de Retiro seleccionado:</p>
                <p style="margin: 4px 0 0 0; color: #15803d; font-size: 14px; font-weight: 800;">${order.pickupNodeName || 'Punto UrbanPoint'}</p>
                ${order.pickupNodeAddress ? `<p style="margin: 2px 0 0 0; color: #166534; font-size: 12px;">${order.pickupNodeAddress}</p>` : ''}
                ${order.pickup_code_hash ? `<p style="margin: 8px 0 0 0; color: #166534; font-size: 13px;">Código de retiro: <strong>${order.pickup_code_hash}</strong></p>` : ''}
              </div>
            ` : `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 10px; margin: 16px 0;">
                <p style="margin: 0; color: #334155; font-size: 13px; font-weight: 700;">🚚 Envío a Domicilio:</p>
                <p style="margin: 4px 0 0 0; color: #0f172a; font-size: 13px;">${order.direccion_envio || 'Dirección provista en checkout'}</p>
              </div>
            `}

            <h3 style="color: #0f172a; font-size: 14px; margin-bottom: 8px;">Resumen de Productos:</h3>
            ${itemsHtml}

            <div style="text-align: right; margin-top: 16px; border-top: 2px solid #f1f5f9; padding-top: 12px;">
              <p style="color: #0f172a; font-size: 16px; font-weight: 800; margin: 0;">Total: ${formatearCentavos(order.total)}</p>
            </div>
          </div>
          
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 20px;">
            UrbanPoint &bull; La red minorista de cercanía
          </p>
        </div>
      `;

      await transporter.sendMail({
        from: fromEmail,
        to: order.customerEmail,
        subject: customerSubject,
        html: customerHtml
      });
      sentTo.push(order.customerEmail);
    }

    // 2. Email al Canillita (Si el pedido asigna a un Canillita / Punto de Retiro)
    if (order.canillitaEmail) {
      const canillitaSubject = `📦 ¡Nuevo pedido #${orderNum} para tu Punto UrbanPoint!`;
      const canillitaHtml = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 24px; border-radius: 16px;">
          <div style="background: #1e293b; padding: 20px; border-radius: 12px; text-align: center; margin-bottom: 20px;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 800;">Panel Canillita UrbanPoint</h1>
          </div>
          
          <div style="background: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h2 style="color: #0f172a; margin-top: 0; font-size: 18px;">¡Nuevo Pedido Registrado!</h2>
            <p style="color: #475569; font-size: 14px;">
              Se ha ingresado el pedido <strong>#${orderNum}</strong> para retiro o atribución en tu nodo.
            </p>

            <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 14px; border-radius: 10px; margin: 16px 0;">
              <p style="margin: 0; color: #1e40af; font-size: 13px; font-weight: 700;">👤 Cliente:</p>
              <p style="margin: 2px 0 0 0; color: #1e3a8a; font-size: 14px; font-weight: 700;">${order.customerName || 'Cliente'} (${order.customerEmail || 'Sin email'})</p>
              ${order.pickup_code_hash ? `<p style="margin: 6px 0 0 0; color: #1d4ed8; font-size: 13px;">Código para verificar al entregar: <strong>${order.pickup_code_hash}</strong></p>` : ''}
            </div>

            <h3 style="color: #0f172a; font-size: 14px; margin-bottom: 8px;">Detalle de ítems:</h3>
            ${itemsHtml}

            <div style="text-align: right; margin-top: 16px; border-top: 2px solid #f1f5f9; padding-top: 12px;">
              <p style="color: #0f172a; font-size: 16px; font-weight: 800; margin: 0;">Monto Total: ${formatearCentavos(order.total)}</p>
            </div>
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: fromEmail,
        to: order.canillitaEmail,
        subject: canillitaSubject,
        html: canillitaHtml
      });
      sentTo.push(order.canillitaEmail);
    }

    // 3. Email a los Administradores de la Tienda (Soporte para múltiples correos)
    for (const targetAdminEmail of adminEmailsList) {
      if (targetAdminEmail !== order.customerEmail && targetAdminEmail !== order.canillitaEmail) {
        const adminSubject = `🔔 [Notificación Admin] Nuevo Pedido #${orderNum} - UrbanPoint`;
        const adminHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h3 style="color: #2D5A27; margin-top: 0;">Nuevo Pedido Recibido en la Tienda</h3>
            <p><strong>Pedido:</strong> #${orderNum}</p>
            <p><strong>Cliente:</strong> ${order.customerName || 'Invitado/Cliente'} (${order.customerEmail || 'Sin email'})</p>
            <p><strong>Punto / Nodo:</strong> ${order.pickupNodeName || 'N/A'}</p>
            <p><strong>Modalidad:</strong> ${order.fulfillment || 'retiro'}</p>
            ${itemsHtml}
            <p style="font-size: 16px; font-weight: bold; text-align: right;">Total: ${formatearCentavos(order.total)}</p>
          </div>
        `;

        await transporter.sendMail({
          from: fromEmail,
          to: targetAdminEmail,
          subject: adminSubject,
          html: adminHtml
        });
        sentTo.push(targetAdminEmail);
      }
    }

    return { success: true, sentTo };
  } catch (error: any) {
    console.error('[Mailer] Failed to send order notification email:', error.message);
    return { success: false, sentTo: [], error: error.message };
  }
}
