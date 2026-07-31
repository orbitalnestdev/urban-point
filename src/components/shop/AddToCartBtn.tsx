import React, { useState } from 'react';
import { addCartItem, type CartItem } from '../../store/cart';

type Props = {
  item: Omit<CartItem, 'cantidad'>;
  variant?: 'primary' | 'secondary' | 'icon' | 'plus';
  disabled?: boolean;
};

export default function AddToCartBtn({ item, variant = 'primary', disabled = false }: Props) {
  const [added, setAdded] = useState(false);

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    addCartItem(item, 1);
    setAdded(true);
    
    // Disparar evento para abrir el drawer
    document.dispatchEvent(new CustomEvent('cart:open'));

    setTimeout(() => setAdded(false), 2000);
  };

  if (variant === 'plus') {
    return (
      <button 
        onClick={handleAdd}
        disabled={disabled}
        className={`w-10 h-10 rounded-2xl border transition-all flex items-center justify-center font-bold text-xl shadow-sm shrink-0 ${
          disabled 
            ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' 
            : added 
              ? 'bg-[#2D5A27] text-white border-[#2D5A27] scale-105' 
              : 'bg-white hover:bg-[#2D5A27] text-[#2D5A27] hover:text-white border-slate-200/90 hover:border-[#2D5A27] hover:scale-105 active:scale-95'
        }`}
        aria-label="Agregar al carrito"
        title="Agregar al carrito"
      >
        {added ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        )}
      </button>
    );
  }

  if (variant === 'icon') {
    return (
      <button 
        onClick={handleAdd}
        disabled={disabled}
        className={`p-3 rounded-full transition-all border ${
          disabled 
            ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed' 
            : 'bg-white hover:bg-slate-50 text-[#2D5A27] shadow-sm hover:shadow-md border-slate-200'
        }`}
        aria-label="Agregar al carrito"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {added ? (
            <polyline points="20 6 9 17 4 12"></polyline>
          ) : (
            <>
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              <line x1="12" y1="9" x2="16" y2="9"></line>
              <line x1="14" y1="7" x2="14" y2="11"></line>
            </>
          )}
        </svg>
      </button>
    );
  }

  const baseStyles = "px-6 py-3 font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 w-full text-sm";
  const variants = {
    primary: disabled ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-[#2D5A27] hover:bg-[#23471F] text-white shadow-[#2D5A27]/20",
    secondary: disabled ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed" : "bg-white hover:bg-slate-50 text-[#2D5A27] border border-slate-200"
  };

  return (
    <button 
      onClick={handleAdd}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${added ? '!bg-emerald-600 !text-white !border-emerald-600' : ''}`}
    >
      {disabled ? (
        'Sin Stock'
      ) : added ? (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Agregado
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
          Agregar al Carrito
        </>
      )}
    </button>
  );
}
