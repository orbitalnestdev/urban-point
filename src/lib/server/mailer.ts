import nodemailer from 'nodemailer';
import { env } from './env';
import { getSiteSettings } from './settings';
import { formatearCentavos } from '../pricing';

export interface OrderEmailItem {
  nombre_snapshot: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface OrderEmailData {
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
  estado?: string;
}

export interface CanillitaApplicationData {
  $id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  dni: string;
  nombre_comercial: string;
  direccion: string;
  localidad: string;
  provincia: string;
  cbu?: string;
  condicion_fiscal?: string;
  horarios?: string;
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

/**
 * Plantilla HTML Maestra para todos los correos de la plataforma.
 * Diseñada para máxima compatibilidad con Gmail (Desktop/App/Dark Mode), Apple Mail y Outlook.
 */
function renderEmailLayout({
  preheaderText,
  badgeText,
  badgeBgColor = 'rgba(16, 185, 129, 0.15)',
  badgeTextColor = '#34D399',
  title,
  subtitle,
  bodyHtml,
  ctaText,
  ctaUrl
}: {
  preheaderText?: string;
  badgeText: string;
  badgeBgColor?: string;
  badgeTextColor?: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  ctaText?: string;
  ctaUrl?: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  
  ${preheaderText ? `
    <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">
      ${preheaderText}
    </div>
  ` : ''}

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Wrapper -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #0F172A; padding: 32px 28px; text-align: center; border-bottom: 3px solid #10B981;">
              <div style="display: inline-block; padding: 6px 14px; background-color: ${badgeBgColor}; border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 9999px; margin-bottom: 12px;">
                <span style="color: ${badgeTextColor}; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">${badgeText}</span>
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; line-height: 1.2;">${title}</h1>
              ${subtitle ? `<p style="color: #94A3B8; margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">${subtitle}</p>` : ''}
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 28px; background-color: #ffffff;">
              ${bodyHtml}

              ${ctaText && ctaUrl ? `
                <div style="margin-top: 32px; text-align: center;">
                  <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; background-color: #059669; color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);">
                    ${ctaText} &rarr;
                  </a>
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 24px 28px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="color: #0F172A; font-size: 13px; font-weight: 800; margin: 0 0 4px 0;">UrbanPoint &bull; La Red Minorista de Cercanía</p>
              <p style="color: #64748B; font-size: 11px; margin: 0 0 12px 0;">Comprá online al mejor precio y retirá cerca de tu casa sin esperas.</p>
              <p style="color: #94A3B8; font-size: 10px; margin: 0;">&copy; ${new Date().getFullYear()} UrbanPoint Argentina. Todos los derechos reservados.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `;
}

function renderItemsTable(items: OrderEmailItem[]): string {
  const rows = items.map(item => `
    <tr>
      <td style="padding: 12px 14px; border-bottom: 1px solid #F1F5F9; color: #0F172A; font-size: 13px; font-weight: 700; line-height: 1.4;">
        ${item.nombre_snapshot}
      </td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #F1F5F9; color: #475569; font-size: 13px; font-weight: 600; text-align: center;">
        x${item.cantidad}
      </td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #F1F5F9; color: #0F172A; font-size: 13px; font-weight: 800; text-align: right;">
        ${formatearCentavos(item.subtotal)}
      </td>
    </tr>
  `).join('');

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; margin: 16px 0; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #E2E8F0;">
      <thead>
        <tr style="background-color: #F8FAFC; color: #475569; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
          <th style="padding: 12px 14px; text-align: left; border-bottom: 1px solid #E2E8F0;">Producto</th>
          <th style="padding: 12px 14px; text-align: center; border-bottom: 1px solid #E2E8F0;">Cant.</th>
          <th style="padding: 12px 14px; text-align: right; border-bottom: 1px solid #E2E8F0;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Envía las notificaciones de nuevo pedido al Cliente, al Canillita/Punto y a los Administradores.
 */
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
    const fromEmail = settings.smtp_from || env('SMTP_FROM') || process.env.SMTP_FROM || `UrbanPoint <${settings.smtp_user}>`;

    const adminEmailsRaw = settings.admin_emails || env('ADMIN_EMAIL') || process.env.ADMIN_EMAIL || 'admin@urbanpoint.com.ar';
    const adminEmailsList = adminEmailsRaw
      .split(/[,;]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0 && e.includes('@'));

    const orderNum = order.numero || order.$id.substring(0, 6);
    const sentTo: string[] = [];
    const itemsHtml = renderItemsTable(items);

    // 1. EMAIL AL CLIENTE (Confirmación de compra)
    if (order.customerEmail) {
      const customerSubject = `🎉 ¡Tu pedido #${orderNum} fue recibido en UrbanPoint!`;
      const isRetiro = order.fulfillment === 'retiro';

      const customerContent = `
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
          ¡Hola <strong>${order.customerName || 'Cliente'}</strong>! Muchas gracias por comprar en UrbanPoint. Registramos tu pedido <strong>#${orderNum}</strong> con éxito.
        </p>

        ${isRetiro ? `
          <div style="background-color: #ECFDF5; border: 1.5px solid #A7F3D0; padding: 20px; border-radius: 14px; margin: 20px 0;">
            <p style="margin: 0 0 6px 0; color: #065F46; font-size: 12px; font-weight: 800; uppercase; letter-spacing: 0.5px;">📍 PUNTO DE RETIRO SELECCIONADO</p>
            <p style="margin: 0; color: #047857; font-size: 16px; font-weight: 800;">${order.pickupNodeName || 'Punto UrbanPoint'}</p>
            ${order.pickupNodeAddress ? `<p style="margin: 4px 0 0 0; color: #065F46; font-size: 13px;">${order.pickupNodeAddress}</p>` : ''}
            
            ${order.pickup_code_hash ? `
              <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #A7F3D0; text-align: center;">
                <span style="display: block; color: #065F46; font-size: 11px; font-weight: 700; uppercase; margin-bottom: 4px;">TU CÓDIGO DE RETIRO</span>
                <span style="font-family: monospace; font-size: 26px; font-weight: 900; color: #047857; letter-spacing: 4px;">${order.pickup_code_hash}</span>
              </div>
            ` : ''}
          </div>
        ` : `
          <div style="background-color: #F8FAFC; border: 1.5px solid #E2E8F0; padding: 20px; border-radius: 14px; margin: 20px 0;">
            <p style="margin: 0 0 6px 0; color: #475569; font-size: 12px; font-weight: 800; uppercase;">🚚 ENVÍO A DOMICILIO</p>
            <p style="margin: 0; color: #0F172A; font-size: 14px; font-weight: 700;">${order.direccion_envio || 'Dirección acordada en checkout'}</p>
          </div>
        `}

        <h3 style="color: #0F172A; font-size: 15px; font-weight: 800; margin: 24px 0 10px 0;">Resumen del Pedido</h3>
        ${itemsHtml}

        <div style="background-color: #F8FAFC; padding: 16px 20px; border-radius: 12px; margin-top: 16px; border: 1px solid #E2E8F0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="color: #475569; font-size: 14px; font-weight: 600;">Monto Total Pagado:</td>
              <td align="right" style="color: #059669; font-size: 20px; font-weight: 900;">${formatearCentavos(order.total)}</td>
            </tr>
          </table>
        </div>
      `;

      const customerHtml = renderEmailLayout({
        preheaderText: `Confirmación de pedido #${orderNum} en UrbanPoint. Total: ${formatearCentavos(order.total)}`,
        badgeText: 'NUEVO PEDIDO RECIBIDO',
        badgeBgColor: 'rgba(16, 185, 129, 0.15)',
        badgeTextColor: '#34D399',
        title: `¡Gracias por tu compra, ${order.customerName || 'Cliente'}!`,
        subtitle: `Pedido #${orderNum} registrado correctamente`,
        bodyHtml: customerContent
      });

      await transporter.sendMail({
        from: fromEmail,
        to: order.customerEmail,
        subject: customerSubject,
        html: customerHtml
      });
      sentTo.push(order.customerEmail);
    }

    // 2. EMAIL AL CANILLITA / PUNTO DE RETIRO
    if (order.canillitaEmail) {
      const canillitaSubject = `📦 ¡Nuevo pedido #${orderNum} asignado a tu Punto UrbanPoint!`;

      const canillitaContent = `
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
          Hola <strong>${order.canillitaNombre || 'Punto UrbanPoint'}</strong>, tenés un nuevo pedido asignado a tu nodo para entrega/atribución.
        </p>

        <div style="background-color: #EFF6FF; border: 1.5px solid #BFDBFE; padding: 18px; border-radius: 14px; margin: 18px 0;">
          <p style="margin: 0; color: #1E40AF; font-size: 12px; font-weight: 800; uppercase;">👤 DATOS DEL CLIENTE</p>
          <p style="margin: 4px 0 0 0; color: #1E3A8A; font-size: 15px; font-weight: 800;">${order.customerName || 'Cliente'} (${order.customerEmail || 'Sin email'})</p>
          
          ${order.pickup_code_hash ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #93C5FD;">
              <span style="color: #1E40AF; font-size: 12px; font-weight: 700;">🔑 Código para pedir al momento de la entrega: </span>
              <strong style="font-family: monospace; font-size: 18px; color: #1D4ED8; font-weight: 900;">${order.pickup_code_hash}</strong>
            </div>
          ` : ''}
        </div>

        <h3 style="color: #0F172A; font-size: 15px; font-weight: 800; margin: 24px 0 10px 0;">Ítems del Pedido</h3>
        ${itemsHtml}

        <div style="background-color: #F8FAFC; padding: 14px 18px; border-radius: 12px; margin-top: 16px; border: 1px solid #E2E8F0; text-align: right;">
          <span style="color: #475569; font-size: 13px; font-weight: 600;">Total del pedido: </span>
          <strong style="color: #0F172A; font-size: 17px; font-weight: 900; margin-left: 8px;">${formatearCentavos(order.total)}</strong>
        </div>
      `;

      const canillitaHtml = renderEmailLayout({
        preheaderText: `Nuevo pedido #${orderNum} asignado a tu Punto UrbanPoint.`,
        badgeText: 'NODO CANILLITA',
        badgeBgColor: 'rgba(59, 130, 246, 0.15)',
        badgeTextColor: '#60A5FA',
        title: `Nuevo Pedido #${orderNum}`,
        subtitle: `Ingresó un pedido asignado a tu punto de retiro`,
        bodyHtml: canillitaContent
      });

      await transporter.sendMail({
        from: fromEmail,
        to: order.canillitaEmail,
        subject: canillitaSubject,
        html: canillitaHtml
      });
      sentTo.push(order.canillitaEmail);
    }

    // 3. EMAIL A ADMINISTRADORES
    for (const targetAdminEmail of adminEmailsList) {
      if (targetAdminEmail !== order.customerEmail && targetAdminEmail !== order.canillitaEmail) {
        const adminSubject = `🔔 [Venta Registrada] Nuevo Pedido #${orderNum} - UrbanPoint`;

        const adminContent = `
          <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 18px; border-radius: 14px; margin-bottom: 20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="4">
              <tr>
                <td style="color: #64748B; font-size: 13px; font-weight: 700; width: 140px;">Pedido Nº:</td>
                <td style="color: #0F172A; font-size: 14px; font-weight: 800;">#${orderNum}</td>
              </tr>
              <tr>
                <td style="color: #64748B; font-size: 13px; font-weight: 700;">Cliente:</td>
                <td style="color: #0F172A; font-size: 14px; font-weight: 700;">${order.customerName || 'Invitado/Cliente'} (${order.customerEmail || 'Sin email'})</td>
              </tr>
              <tr>
                <td style="color: #64748B; font-size: 13px; font-weight: 700;">Modalidad:</td>
                <td style="color: #059669; font-size: 13px; font-weight: 800; text-transform: uppercase;">${order.fulfillment || 'Retiro'}</td>
              </tr>
              <tr>
                <td style="color: #64748B; font-size: 13px; font-weight: 700;">Punto de Retiro:</td>
                <td style="color: #0F172A; font-size: 13px; font-weight: 600;">${order.pickupNodeName || 'N/A'}</td>
              </tr>
            </table>
          </div>

          <h3 style="color: #0F172A; font-size: 15px; font-weight: 800; margin: 20px 0 10px 0;">Detalle de Productos</h3>
          ${itemsHtml}

          <div style="background-color: #F0FDF4; border: 1.5px solid #BBF7D0; padding: 16px 20px; border-radius: 12px; margin-top: 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="color: #166534; font-size: 14px; font-weight: 800;">Total Venta:</td>
                <td align="right" style="color: #15803D; font-size: 22px; font-weight: 900;">${formatearCentavos(order.total)}</td>
              </tr>
            </table>
          </div>
        `;

        const adminHtml = renderEmailLayout({
          preheaderText: `Nueva venta ingresada #${orderNum} en UrbanPoint. Total: ${formatearCentavos(order.total)}`,
          badgeText: 'NOTIFICACIÓN ADMINISTRATIVA',
          badgeBgColor: 'rgba(234, 179, 8, 0.15)',
          badgeTextColor: '#FACC15',
          title: `¡Nueva Venta Recibida! #${orderNum}`,
          subtitle: `Se ha registrado un pedido en la tienda online`,
          bodyHtml: adminContent
        });

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

/**
 * Notificación cuando un pedido cambia a estado "listo_para_retirar" o "enviado".
 */
export async function sendOrderStatusNotificationEmail(
  order: OrderEmailData
): Promise<{ success: boolean; sentTo: string[]; error?: string }> {
  try {
    if (!order.customerEmail) return { success: false, sentTo: [], error: 'Cliente sin email' };

    const transporter = await getTransporter();
    if (!transporter) return { success: false, sentTo: [], error: 'SMTP no configurado' };

    const settings = await getSiteSettings();
    const fromEmail = settings.smtp_from || env('SMTP_FROM') || `UrbanPoint <${settings.smtp_user}>`;
    const orderNum = order.numero || order.$id.substring(0, 6);

    const isReadyForPickup = order.estado === 'listo_para_retirar';
    const subject = isReadyForPickup
      ? `🛍️ ¡Tu pedido #${orderNum} está listo para retirar!`
      : `🚚 Tu pedido #${orderNum} cambió a estado: ${order.estado}`;

    const bodyContent = `
      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
        ¡Hola <strong>${order.customerName || 'Cliente'}</strong>! Te avisamos que tu pedido <strong>#${orderNum}</strong> ya está <strong>${isReadyForPickup ? 'LISTO PARA RETIRAR' : order.estado}</strong>.
      </p>

      ${isReadyForPickup ? `
        <div style="background-color: #ECFDF5; border: 1.5px solid #A7F3D0; padding: 20px; border-radius: 14px; margin: 20px 0;">
          <p style="margin: 0 0 6px 0; color: #065F46; font-size: 12px; font-weight: 800; uppercase;">📍 PODÉS RETIRAR EN</p>
          <p style="margin: 0; color: #047857; font-size: 16px; font-weight: 800;">${order.pickupNodeName || 'Punto UrbanPoint'}</p>
          ${order.pickupNodeAddress ? `<p style="margin: 4px 0 0 0; color: #065F46; font-size: 13px;">${order.pickupNodeAddress}</p>` : ''}
          
          ${order.pickup_code_hash ? `
            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #A7F3D0; text-align: center;">
              <span style="display: block; color: #065F46; font-size: 11px; font-weight: 700; uppercase; margin-bottom: 4px;">PRESENTÁ ESTE CÓDIGO AL RETIRAR</span>
              <span style="font-family: monospace; font-size: 28px; font-weight: 900; color: #047857; letter-spacing: 4px;">${order.pickup_code_hash}</span>
            </div>
          ` : ''}
        </div>
      ` : ''}
    `;

    const html = renderEmailLayout({
      preheaderText: `Tu pedido #${orderNum} está listo para retirar en UrbanPoint.`,
      badgeText: 'ESTADO DEL PEDIDO',
      badgeBgColor: 'rgba(16, 185, 129, 0.15)',
      badgeTextColor: '#34D399',
      title: isReadyForPickup ? '¡Tu pedido ya está listo!' : `Actualización del Pedido #${orderNum}`,
      subtitle: `Pedido #${orderNum}`,
      bodyHtml: bodyContent
    });

    await transporter.sendMail({
      from: fromEmail,
      to: order.customerEmail,
      subject,
      html
    });

    return { success: true, sentTo: [order.customerEmail] };
  } catch (error: any) {
    console.error('[Mailer] Error sending status email:', error.message);
    return { success: false, sentTo: [], error: error.message };
  }
}

/**
 * Notificación cuando un nuevo Canillita / Punto de Retiro solicita sumarse a la red.
 */
export async function sendCanillitaApplicationEmail(
  app: CanillitaApplicationData
): Promise<{ success: boolean; sentTo: string[]; error?: string }> {
  try {
    const transporter = await getTransporter();
    if (!transporter) return { success: false, sentTo: [], error: 'SMTP no configurado' };

    const settings = await getSiteSettings();
    const fromEmail = settings.smtp_from || env('SMTP_FROM') || `UrbanPoint <${settings.smtp_user}>`;

    const adminEmailsRaw = settings.admin_emails || env('ADMIN_EMAIL') || 'admin@urbanpoint.com.ar';
    const adminEmailsList = adminEmailsRaw.split(/[,;]+/).map(e => e.trim()).filter(e => e.length > 0 && e.includes('@'));
    const sentTo: string[] = [];

    // 1. Email de confirmación al Canillita Solicitante
    if (app.email) {
      const applicantSubject = `🤝 Recibimos tu solicitud para ser Punto UrbanPoint`;
      const applicantContent = `
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
          Hola <strong>${app.nombre} ${app.apellido}</strong>, ¡gracias por tu interés en sumarte a la red UrbanPoint!
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Registramos correctamente los datos de tu comercio <strong>${app.nombre_comercial}</strong> ubicado en <strong>${app.direccion}, ${app.localidad}</strong>. Nuestro equipo auditará tu solicitud y te avisaremos en cuanto tu nodo sea activado.
        </p>
      `;

      const applicantHtml = renderEmailLayout({
        preheaderText: `Solicitud de adhesión recibida para ${app.nombre_comercial}.`,
        badgeText: 'SOLICITUD EN REVISIÓN',
        badgeBgColor: 'rgba(59, 130, 246, 0.15)',
        badgeTextColor: '#60A5FA',
        title: '¡Solicitud Recibida!',
        subtitle: 'Red de Puntos de Retiro UrbanPoint',
        bodyHtml: applicantContent
      });

      await transporter.sendMail({ from: fromEmail, to: app.email, subject: applicantSubject, html: applicantHtml });
      sentTo.push(app.email);
    }

    // 2. Email de alerta a Administradores
    const adminSubject = `📄 [Nueva Solicitud] Kiosco/Canillita: ${app.nombre_comercial}`;
    const adminContent = `
      <p style="color: #334155; font-size: 15px; margin-top: 0;">Se ingresó una nueva solicitud de afiliación de punto de retiro:</p>
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 18px; border-radius: 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="4">
          <tr><td style="color: #64748B; font-weight: 700;">Comercio:</td><td style="color: #0F172A; font-weight: 800;">${app.nombre_comercial}</td></tr>
          <tr><td style="color: #64748B; font-weight: 700;">Titular:</td><td style="color: #0F172A;">${app.nombre} ${app.apellido} (DNI: ${app.dni})</td></tr>
          <tr><td style="color: #64748B; font-weight: 700;">Contacto:</td><td style="color: #0F172A;">${app.email} / ${app.telefono}</td></tr>
          <tr><td style="color: #64748B; font-weight: 700;">Dirección:</td><td style="color: #0F172A;">${app.direccion}, ${app.localidad}, ${app.provincia}</td></tr>
          <tr><td style="color: #64748B; font-weight: 700;">Condición Fiscal:</td><td style="color: #0F172A;">${app.condicion_fiscal || 'Monotributo'}</td></tr>
        </table>
      </div>
    `;

    const adminHtml = renderEmailLayout({
      preheaderText: `Nueva solicitud de afiliación: ${app.nombre_comercial}.`,
      badgeText: 'SOLICITUD AFILIACIÓN',
      badgeBgColor: 'rgba(234, 179, 8, 0.15)',
      badgeTextColor: '#FACC15',
      title: `Nueva Solicitud: ${app.nombre_comercial}`,
      subtitle: `Revisá y aprobá este punto en el Panel de Administración`,
      bodyHtml: adminContent
    });

    for (const adminEmail of adminEmailsList) {
      if (adminEmail !== app.email) {
        await transporter.sendMail({ from: fromEmail, to: adminEmail, subject: adminSubject, html: adminHtml });
        sentTo.push(adminEmail);
      }
    }

    return { success: true, sentTo };
  } catch (error: any) {
    console.error('[Mailer] Error sending application email:', error.message);
    return { success: false, sentTo: [], error: error.message };
  }
}

/**
 * Notificación cuando una solicitud de Canillita es aprobada.
 */
export async function sendCanillitaApprovedEmail(
  app: CanillitaApplicationData
): Promise<{ success: boolean; sentTo: string[]; error?: string }> {
  try {
    if (!app.email) return { success: false, sentTo: [], error: 'Sin email de contacto' };

    const transporter = await getTransporter();
    if (!transporter) return { success: false, sentTo: [], error: 'SMTP no configurado' };

    const settings = await getSiteSettings();
    const fromEmail = settings.smtp_from || env('SMTP_FROM') || `UrbanPoint <${settings.smtp_user}>`;

    const subject = `🎉 ¡Tu Punto UrbanPoint (${app.nombre_comercial}) ha sido aprobado!`;
    const content = `
      <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-top: 0;">
        ¡Felicitaciones <strong>${app.nombre}</strong>! Tu solicitud para sumar <strong>${app.nombre_comercial}</strong> como Punto de Retiro oficial de UrbanPoint fue <strong>APROBADA Y ACTIVADA</strong>.
      </p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6;">
        A partir de este momento, tus clientes podrán seleccionar tu punto de retiro para recibir sus compras online y generar comisiones automáticas por cada entrega y venta atribuida a tu nodo.
      </p>
    `;

    const html = renderEmailLayout({
      preheaderText: `¡Tu punto de retiro ${app.nombre_comercial} ya está activo en UrbanPoint!`,
      badgeText: 'PUNTO ACTIVADO',
      badgeBgColor: 'rgba(16, 185, 129, 0.15)',
      badgeTextColor: '#34D399',
      title: '¡Bienvenido a la Red UrbanPoint!',
      subtitle: `Nodo ${app.nombre_comercial} activado con éxito`,
      bodyHtml: content
    });

    await transporter.sendMail({ from: fromEmail, to: app.email, subject, html });
    return { success: true, sentTo: [app.email] };
  } catch (error: any) {
    console.error('[Mailer] Error sending approval email:', error.message);
    return { success: false, sentTo: [], error: error.message };
  }
}
