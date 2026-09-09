/**
 * Datos legales/societarios de la empresa titular de UrbanPoint.
 *
 * Única fuente de estos datos: las 5 páginas legales (Términos, Privacidad,
 * Cookies, Cambios y Devoluciones, Datos de la Empresa) los importan de acá,
 * así que completar estos campos una sola vez actualiza todas las páginas.
 *
 * Los valores "[COMPLETAR: ...]" son placeholders visibles a propósito —
 * cuando la clienta entregue los datos reales, reemplazar acá.
 */
export const DATOS_EMPRESA = {
	razonSocial: '[COMPLETAR: Razón social / nombre completo del titular]',
	nombreFantasia: 'UrbanPoint',
	cuit: '[COMPLETAR: CUIT]',
	condicionIVA: '[COMPLETAR: Responsable Inscripto / Monotributista / etc.]',
	domicilioLegal: '[COMPLETAR: domicilio legal/fiscal completo]',
	domicilioComercial: '', // dejar vacío si es el mismo que el legal
	jurisdiccion: '[COMPLETAR: CABA / provincia donde está inscripta la empresa — define la autoridad de defensa del consumidor competente]',
	inscripcionAAIP: '[COMPLETAR: si la base de datos de clientes está inscripta ante la AAIP (Ley 25.326), número de inscripción; si no está inscripta, dejar indicado]'
};
