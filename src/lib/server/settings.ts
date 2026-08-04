import { createAdminClient } from './appwrite';
import { AppwriteException } from 'node-appwrite';

export interface SiteSettings {
    whatsapp_number: string;
    contact_email: string;
}

const DEFAULT_SETTINGS: SiteSettings = {
    whatsapp_number: '+5491100000000', // Default placeholder
    contact_email: 'hola@urbanpoints.com.ar' // As requested by user
};

/**
 * Fetches the global site settings from the 'settings' collection in Appwrite.
 * If the collection/document does not exist, returns safe defaults.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
    try {
        const { databases } = createAdminClient();
        const settingsDoc = await databases.getDocument('urbanpoint', 'settings', 'general');
        
        return {
            whatsapp_number: settingsDoc.whatsapp_number || DEFAULT_SETTINGS.whatsapp_number,
            contact_email: settingsDoc.contact_email || DEFAULT_SETTINGS.contact_email
        };
    } catch (error) {
        if (error instanceof AppwriteException && error.code === 404) {
            // Document or collection doesn't exist yet, return defaults safely
            return DEFAULT_SETTINGS;
        }
        // console.error("Error fetching site settings:", error);
        return DEFAULT_SETTINGS;
    }
}
