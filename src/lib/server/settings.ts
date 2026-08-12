import { createAdminClient } from './appwrite';
import { AppwriteException } from 'node-appwrite';

export interface SiteSettings {
    site_name: string;
    site_description: string;
    currency: string;
    timezone: string;
    
    contact_address: string;
    contact_phone: string;
    contact_email: string;
    social_instagram: string;
    social_facebook: string;

    whatsapp_number: string;
    whatsapp_message: string;
    whatsapp_enabled: boolean;
    whatsapp_position: 'right' | 'left';
    whatsapp_schedule_start: string;
    whatsapp_schedule_end: string;

    default_commission_pct: number;
    attribution_days: number;
    delivery_canillita_commission: boolean;

    shipping_cost_centavos: number;
    free_shipping_threshold_centavos: number;
    pickup_has_cost: boolean;

    mp_public_key: string;
    mp_access_token: string;
    mp_enabled: boolean;
    transferencia_enabled: boolean;

    notify_email_order_created: boolean;
    notify_email_order_ready: boolean;
    notify_email_canillita_approved: boolean;

    terms_and_conditions: string;
    privacy_policy: string;
    seo_title: string;
    seo_meta_description: string;
    analytics_pixel_code: string;
}

export const DEFAULT_SETTINGS: SiteSettings = {
    site_name: 'UrbanPoint',
    site_description: 'E-Commerce minorista con red de retiro en canillitas afiliados.',
    currency: 'ARS',
    timezone: 'America/Argentina/Buenos_Aires',

    contact_address: 'Av. Corrientes 1234, CABA, Argentina',
    contact_phone: '+54 9 11 5060-6395',
    contact_email: 'hola@urbanpoints.com.ar',
    social_instagram: 'https://instagram.com/urbanpoint',
    social_facebook: 'https://facebook.com/urbanpoint',

    whatsapp_number: '+5491150606395',
    whatsapp_message: '¡Hola! Quisiera realizar una consulta sobre un producto.',
    whatsapp_enabled: true,
    whatsapp_position: 'right',
    whatsapp_schedule_start: '08:00',
    whatsapp_schedule_end: '20:00',

    default_commission_pct: 10.0,
    attribution_days: 30,
    delivery_canillita_commission: false,

    shipping_cost_centavos: 350000,
    free_shipping_threshold_centavos: 2500000,
    pickup_has_cost: false,

    mp_public_key: 'APP_USR-7890123456789-TEST',
    mp_access_token: 'APP_USR-1234567890123-TEST',
    mp_enabled: true,
    transferencia_enabled: true,

    notify_email_order_created: true,
    notify_email_order_ready: true,
    notify_email_canillita_approved: true,

    terms_and_conditions: 'Términos y condiciones generales del servicio UrbanPoint.',
    privacy_policy: 'Políticas de privacidad y protección de datos personales.',
    seo_title: 'UrbanPoint | E-Commerce & Red Canillita',
    seo_meta_description: 'Comprá online al mejor precio y retirá gratis en el kiosco de diarios más cercano.',
    analytics_pixel_code: ''
};

export async function getSiteSettings(): Promise<SiteSettings> {
    try {
        const { databases } = createAdminClient();
        const docs = await databases.listDocuments('urbanpoint', 'settings');
        
        const settingsMap: Record<string, any> = {};
        for (const doc of docs.documents) {
            settingsMap[doc.key] = doc.value;
        }

        return {
            site_name: settingsMap.site_name || DEFAULT_SETTINGS.site_name,
            site_description: settingsMap.site_description || DEFAULT_SETTINGS.site_description,
            currency: settingsMap.currency || DEFAULT_SETTINGS.currency,
            timezone: settingsMap.timezone || DEFAULT_SETTINGS.timezone,

            contact_address: settingsMap.contact_address || DEFAULT_SETTINGS.contact_address,
            contact_phone: settingsMap.contact_phone || DEFAULT_SETTINGS.contact_phone,
            contact_email: settingsMap.contact_email || DEFAULT_SETTINGS.contact_email,
            social_instagram: settingsMap.social_instagram || DEFAULT_SETTINGS.social_instagram,
            social_facebook: settingsMap.social_facebook || DEFAULT_SETTINGS.social_facebook,

            whatsapp_number: settingsMap.whatsapp_number || DEFAULT_SETTINGS.whatsapp_number,
            whatsapp_message: settingsMap.whatsapp_message || DEFAULT_SETTINGS.whatsapp_message,
            whatsapp_enabled: settingsMap.whatsapp_enabled !== undefined ? settingsMap.whatsapp_enabled === 'true' : DEFAULT_SETTINGS.whatsapp_enabled,
            whatsapp_position: (settingsMap.whatsapp_position as any) || DEFAULT_SETTINGS.whatsapp_position,
            whatsapp_schedule_start: settingsMap.whatsapp_schedule_start || DEFAULT_SETTINGS.whatsapp_schedule_start,
            whatsapp_schedule_end: settingsMap.whatsapp_schedule_end || DEFAULT_SETTINGS.whatsapp_schedule_end,

            default_commission_pct: settingsMap.default_commission_pct ? parseFloat(settingsMap.default_commission_pct) : DEFAULT_SETTINGS.default_commission_pct,
            attribution_days: settingsMap.attribution_days ? parseInt(settingsMap.attribution_days, 10) : DEFAULT_SETTINGS.attribution_days,
            delivery_canillita_commission: settingsMap.delivery_canillita_commission !== undefined ? settingsMap.delivery_canillita_commission === 'true' : DEFAULT_SETTINGS.delivery_canillita_commission,

            shipping_cost_centavos: settingsMap.shipping_cost_centavos ? parseInt(settingsMap.shipping_cost_centavos, 10) : DEFAULT_SETTINGS.shipping_cost_centavos,
            free_shipping_threshold_centavos: settingsMap.free_shipping_threshold_centavos ? parseInt(settingsMap.free_shipping_threshold_centavos, 10) : DEFAULT_SETTINGS.free_shipping_threshold_centavos,
            pickup_has_cost: settingsMap.pickup_has_cost !== undefined ? settingsMap.pickup_has_cost === 'true' : DEFAULT_SETTINGS.pickup_has_cost,

            mp_public_key: settingsMap.mp_public_key || DEFAULT_SETTINGS.mp_public_key,
            mp_access_token: settingsMap.mp_access_token || DEFAULT_SETTINGS.mp_access_token,
            mp_enabled: settingsMap.mp_enabled !== undefined ? settingsMap.mp_enabled === 'true' : DEFAULT_SETTINGS.mp_enabled,
            transferencia_enabled: settingsMap.transferencia_enabled !== undefined ? settingsMap.transferencia_enabled === 'true' : DEFAULT_SETTINGS.transferencia_enabled,

            notify_email_order_created: settingsMap.notify_email_order_created !== undefined ? settingsMap.notify_email_order_created === 'true' : DEFAULT_SETTINGS.notify_email_order_created,
            notify_email_order_ready: settingsMap.notify_email_order_ready !== undefined ? settingsMap.notify_email_order_ready === 'true' : DEFAULT_SETTINGS.notify_email_order_ready,
            notify_email_canillita_approved: settingsMap.notify_email_canillita_approved !== undefined ? settingsMap.notify_email_canillita_approved === 'true' : DEFAULT_SETTINGS.notify_email_canillita_approved,

            terms_and_conditions: settingsMap.terms_and_conditions || DEFAULT_SETTINGS.terms_and_conditions,
            privacy_policy: settingsMap.privacy_policy || DEFAULT_SETTINGS.privacy_policy,
            seo_title: settingsMap.seo_title || DEFAULT_SETTINGS.seo_title,
            seo_meta_description: settingsMap.seo_meta_description || DEFAULT_SETTINGS.seo_meta_description,
            analytics_pixel_code: settingsMap.analytics_pixel_code || DEFAULT_SETTINGS.analytics_pixel_code
        };
    } catch (error) {
        return DEFAULT_SETTINGS;
    }
}

export async function saveSiteSetting(key: string, value: any): Promise<void> {
    const { databases } = createAdminClient();
    const strVal = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

    try {
        await databases.getDocument('urbanpoint', 'settings', key);
        await databases.updateDocument('urbanpoint', 'settings', key, {
            key,
            value: strVal
        });
    } catch (e: any) {
        try {
            await databases.createDocument('urbanpoint', 'settings', key, {
                key,
                value: strVal
            });
        } catch (err: any) {
            console.error(`Error saving setting ${key}:`, err);
        }
    }
}
