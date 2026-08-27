import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { cartItems, removeCartItem, updateItemQuantity } from '../../store/cart';

export default function CartDrawer(_props?: { pickupPoints?: any[] }) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Suscribirse al store de Nanostores
  const cart = useStore(cartItems);
  const items = Object.values(cart);
  const totalItems = items.reduce((sum, item) => sum + (item.cantidad || 0), 0);
  const totalAmount = items.reduce((sum, item) => sum + ((item.precio || 0) * (item.cantidad || 0)), 0);

  useEffect(() => {
    // Escuchar eventos para abrir el drawer
    const openDrawer = () => {
      (window as any).__upCartOpenPendiente = false;
      setIsOpen(true);
    };
    window.addEventListener('cart:open', openDrawer);
    document.addEventListener('cart:open', openDrawer);

    // Este componente es client:only: si el usuario agregó algo al carrito
    // antes de que montara, el cart:open de ese momento no tuvo oyente. El
    // script del Header lo dejó anotado; se consume acá.
    if ((window as any).__upCartOpenPendiente) {
      openDrawer();
    }

    return () => {
      window.removeEventListener('cart:open', openDrawer);
      document.removeEventListener('cart:open', openDrawer);
    };
  }, []);

  const formatPrice = (amountInPesos: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(amountInPesos || 0);
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 transition-opacity cursor-pointer"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <div 
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#F2F7F3] border border-[#D4E5D6] text-[#2D5A27] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            </div>
            Tu Carrito de Compras ({totalItems})
          </h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            aria-label="Cerrar carrito"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
          {items.length === 0 ? (
            <div className="text-center text-slate-500 my-16 space-y-3">
              <div className="w-16 h-16 rounded-full bg-[#F2F7F3] text-[#2D5A27] flex items-center justify-center mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
              </div>
              <p className="text-base font-bold text-slate-800">Tu carrito está vacío</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">Explorá nuestro catálogo e impulsá a los comercios de tu barrio.</p>
              <button 
                onClick={() => setIsOpen(false)}
                className="mt-4 px-5 py-2.5 bg-[#2D5A27] text-white rounded-xl font-bold text-xs shadow-sm hover:bg-[#23471F] transition-all cursor-pointer"
              >
                Ver productos
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map(item => (
                <li key={item.id} className="bg-white p-3.5 rounded-2xl shadow-xs border border-slate-200/80 flex gap-3.5 items-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-xl overflow-hidden shrink-0 border border-slate-100 p-1 flex items-center justify-center">
                    <img src={item.imagen} alt={item.nombre} className="w-full h-full object-contain mix-blend-multiply" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-xs leading-tight line-clamp-2 mb-1">{item.nombre}</h3>
                    <p className="text-[#2D5A27] font-black text-sm mb-2">{formatPrice(item.precio)}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                        <button 
                          onClick={() => updateItemQuantity(item.id, item.cantidad - 1)}
                          className="px-2.5 py-0.5 text-slate-600 hover:text-[#2D5A27] hover:bg-slate-200 rounded-l-lg transition-colors font-bold text-sm cursor-pointer"
                        >-</button>
                        <span className="px-3 text-xs font-black text-slate-900">{item.cantidad}</span>
                        <button 
                          onClick={() => updateItemQuantity(item.id, item.cantidad + 1)}
                          className="px-2.5 py-0.5 text-slate-600 hover:text-[#2D5A27] hover:bg-slate-200 rounded-r-lg transition-colors font-bold text-sm cursor-pointer"
                        >+</button>
                      </div>
                      <button 
                        onClick={() => removeCartItem(item.id)}
                        className="text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer Checkout Section */}
        {items.length > 0 && (
          <div className="p-5 bg-white border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] space-y-4">
            
            {/* Installments & Free Pickup Perks */}
            <div className="py-2.5 px-3.5 bg-[#F2F7F3] rounded-xl border border-[#D4E5D6] space-y-1">
              <div className="text-xs font-extrabold text-[#2D5A27] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                  3 cuotas sin interés de:
                </span>
                <span>{formatPrice(Math.round(totalAmount / 3))}</span>
              </div>
              <p className="text-[11px] font-bold text-[#2D5A27] flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Retiro 100% GRATIS</span>
              </p>
            </div>

            {/* Total Price */}
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total a pagar</span>
              <span className="text-2xl font-black text-slate-900">{formatPrice(totalAmount)}</span>
            </div>

            {/* Action Buttons: Finalizar Compra + Ver Carrito Completo */}
            <div className="space-y-2">
              <a 
                href="/checkout/retiro"
                className="w-full bg-[#2D5A27] hover:bg-[#23471F] text-white font-extrabold py-3.5 px-6 rounded-xl shadow-lg shadow-[#2D5A27]/20 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
              >
                Continuar Compra
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </a>

              <a 
                href="/carrito"
                onClick={() => setIsOpen(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer border border-slate-200"
              >
                Ver carrito
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </a>
            </div>

            <p className="text-[11px] text-center text-slate-500 flex items-center justify-center gap-1.5 font-medium pt-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#2D5A27] shrink-0"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>Pago 100% seguro procesado con Mercado Pago</span>
            </p>
          </div>
        )}
      </div>
    </>
  );
}
