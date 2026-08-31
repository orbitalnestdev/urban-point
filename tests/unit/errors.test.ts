import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mensajeParaCliente, MENSAJE_GENERICO } from '../../src/lib/server/errors';

/**
 * Los handlers devolvían `error.message` crudo al navegador. Los mensajes de
 * Appwrite nombran la base, la colección y los atributos, y en los rechazos
 * por esquema desalineado incluyen el payload.
 */
describe('mensajeParaCliente', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('deja pasar los mensajes que escribimos para el usuario', () => {
		const error = new Error('Solo admin puede regenerar códigos de referido');
		expect(mensajeParaCliente(error)).toBe('Solo admin puede regenerar códigos de referido');
	});

	it('oculta el error de Appwrite reconocido por su nombre', () => {
		const error = new Error('Invalid document structure: Unknown attribute: "precio_promo"');
		error.name = 'AppwriteException';
		expect(mensajeParaCliente(error)).toBe(MENSAJE_GENERICO);
	});

	it('oculta el error de Appwrite reconocido por code/type/response', () => {
		const error: any = new Error('Collection with the requested ID could not be found.');
		error.code = 404;
		error.type = 'collection_not_found';
		error.response = '{"message":"...","code":404}';
		expect(mensajeParaCliente(error)).toBe(MENSAJE_GENERICO);
	});

	it('alcanza con code numérico para tratarlo como interno', () => {
		const error: any = new Error('fallo interno con detalle de esquema');
		error.code = 401;
		expect(mensajeParaCliente(error)).toBe(MENSAJE_GENERICO);
	});

	it('oculta los errores de runtime', () => {
		expect(mensajeParaCliente(new TypeError("Cannot read properties of undefined (reading '$id')")))
			.toBe(MENSAJE_GENERICO);
		expect(mensajeParaCliente(new RangeError('Invalid array length'))).toBe(MENSAJE_GENERICO);
		expect(mensajeParaCliente(new ReferenceError('db is not defined'))).toBe(MENSAJE_GENERICO);
	});

	it('oculta lo que no es un Error', () => {
		expect(mensajeParaCliente('string suelto')).toBe(MENSAJE_GENERICO);
		expect(mensajeParaCliente(null)).toBe(MENSAJE_GENERICO);
		expect(mensajeParaCliente(undefined)).toBe(MENSAJE_GENERICO);
		expect(mensajeParaCliente({ message: 'objeto plano' })).toBe(MENSAJE_GENERICO);
	});

	it('oculta un Error sin mensaje', () => {
		expect(mensajeParaCliente(new Error(''))).toBe(MENSAJE_GENERICO);
	});

	it('registra en el servidor lo que oculta, con la etiqueta de contexto', () => {
		const error: any = new Error('detalle interno');
		error.code = 500;
		mensajeParaCliente(error, 'createProduct');
		expect(console.error).toHaveBeenCalledWith('[createProduct]', error);
	});

	it('no registra nada cuando el mensaje es para el usuario', () => {
		mensajeParaCliente(new Error('No tenés permisos para realizar esta acción.'));
		expect(console.error).not.toHaveBeenCalled();
	});
});
