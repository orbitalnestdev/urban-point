import { persistentMap } from '@nanostores/persistent';

export type CartItem = {
	id: string;
	sku: string;
	nombre: string;
	precio: number; // Precio en Pesos (ARS)
	cantidad: number;
	imagen: string;
};

// Guardaremos los items del carrito como un mapa { [productId]: CartItem }
export const cartItems = persistentMap<Record<string, CartItem>>(
	'urbanpoint_cart:',
	{},
	{
		encode: JSON.stringify,
		decode: JSON.parse
	}
);

// Store the referral code separately
export const referralCode = persistentMap<Record<string, string>>(
	'urbanpoint_ref:',
	{},
	{
		encode: JSON.stringify,
		decode: JSON.parse
	}
);

// Helper helper para notificar a componentes no-React (ej: Header.astro)
function notifyCartUpdate() {
	if (typeof window !== 'undefined') {
		const cart = cartItems.get();
		const count = Object.values(cart).reduce((acc, item) => acc + (item.cantidad || 0), 0);
		window.dispatchEvent(new CustomEvent('cart:updated', { detail: { count } }));
	}
}

// Suscribirse a cambios para autodisparar cart:updated
if (typeof window !== 'undefined') {
	cartItems.listen(() => {
		notifyCartUpdate();
	});
}

export function addCartItem(item: Omit<CartItem, 'cantidad'>, qty: number = 1) {
	const currentCart = cartItems.get();
	const existingItem = currentCart[item.id];
	
	if (existingItem) {
		cartItems.setKey(item.id, {
			...existingItem,
			cantidad: existingItem.cantidad + qty
		});
	} else {
		cartItems.setKey(item.id, {
			...item,
			cantidad: qty
		});
	}
	notifyCartUpdate();
}

export function removeCartItem(id: string) {
	const currentCart = cartItems.get();
	if (currentCart[id]) {
		const newCart = { ...currentCart };
		delete newCart[id];
		cartItems.set(newCart);
		notifyCartUpdate();
	}
}

export function updateItemQuantity(id: string, qty: number) {
	if (qty <= 0) {
		removeCartItem(id);
		return;
	}
	
	const currentCart = cartItems.get();
	if (currentCart[id]) {
		cartItems.setKey(id, {
			...currentCart[id],
			cantidad: qty
		});
		notifyCartUpdate();
	}
}

export function clearCart() {
	cartItems.set({});
	notifyCartUpdate();
}
