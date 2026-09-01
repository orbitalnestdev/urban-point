import React, { useEffect, useState } from 'react';
import { actions } from 'astro:actions';

/**
 * Alta de producto en dos pasos: primero el tipo, después los datos que ese
 * tipo necesita. Al confirmar se crea y se abre el editor.
 *
 * Antes los tres botones creaban exactamente lo mismo —un producto vacío— y te
 * dejaban en el editor para empezar de cero: el tipo ni siquiera se guardaba
 * (`createProduct` lo descartaba) y el editor lo leía de `?tipo=` en la URL,
 * así que al volver desde el listado se perdía.
 *
 * Las variantes se crean como PRODUCTOS HERMANOS con el mismo `grupo`, que es
 * el modelo que entiende la tienda (ver src/lib/variantes.ts): cada una
 * conserva su stock, su SKU y su renglón en order_items.
 */

type Tipo = 'simple' | 'variantes' | 'combo';

interface FilaVariante {
	etiqueta: string;
	sku: string;
	precio: string;
	stock: string;
}

interface ProductoListado {
	$id: string;
	nombre: string;
	precio?: number;
}

const filaVacia = (): FilaVariante => ({ etiqueta: '', sku: '', precio: '', stock: '' });

/** "1.234,50" o "1234.5" -> centavos enteros. */
const aCentavos = (txt: string): number => {
	const limpio = (txt || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
	const n = parseFloat(limpio);
	return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

const aEntero = (txt: string): number => {
	const n = parseInt((txt || '').replace(/[^\d-]/g, ''), 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
};

export default function NewProductModal() {
	const [isOpen, setIsOpen] = useState(false);
	const [tipo, setTipo] = useState<Tipo | null>(null);
	const [guardando, setGuardando] = useState(false);
	const [errorMsg, setErrorMsg] = useState('');

	// Comunes
	const [nombre, setNombre] = useState('');

	// Variantes
	const [filas, setFilas] = useState<FilaVariante[]>([filaVacia(), filaVacia()]);

	// Combo
	const [catalogo, setCatalogo] = useState<ProductoListado[]>([]);
	const [integrantes, setIntegrantes] = useState<Record<string, number>>({});
	const [precioCombo, setPrecioCombo] = useState('');
	const [buscar, setBuscar] = useState('');

	const reiniciar = () => {
		setTipo(null);
		setNombre('');
		setFilas([filaVacia(), filaVacia()]);
		setIntegrantes({});
		setPrecioCombo('');
		setBuscar('');
		setErrorMsg('');
		setGuardando(false);
	};

	useEffect(() => {
		const handleOpen = () => {
			reiniciar();
			setIsOpen(true);
		};
		document.addEventListener('modal:new-product', handleOpen);
		window.addEventListener('modal:new-product', handleOpen);
		(window as any).openNewProductModal = handleOpen;
		return () => {
			document.removeEventListener('modal:new-product', handleOpen);
			window.removeEventListener('modal:new-product', handleOpen);
			delete (window as any).openNewProductModal;
		};
	}, []);

	// El catálogo para armar combos sale del JSON que la página ya embebe para
	// el buscador del listado: no hace falta otra consulta.
	useEffect(() => {
		if (tipo !== 'combo' || catalogo.length > 0) return;
		try {
			const raw = document.getElementById('productos-json-data')?.textContent;
			if (raw) setCatalogo(JSON.parse(raw));
		} catch {
			// Sin catálogo embebido se puede crear el combo igual y elegir los
			// integrantes después, desde el editor.
		}
	}, [tipo, catalogo.length]);

	const irAlEditor = (id: string) => {
		window.location.href = `/admin/catalogo/${id}`;
	};

	const crearSimple = async () => {
		const limpio = nombre.trim();
		if (limpio.length < 2) return setErrorMsg('Poné un nombre de al menos 2 caracteres.');

		setGuardando(true);
		setErrorMsg('');
		const { data, error } = await actions.createProduct({ nombre: limpio, tipo: 'simple' });
		if (error || !data?.success) {
			setErrorMsg(error?.message || data?.error || 'No se pudo crear el producto.');
			return setGuardando(false);
		}
		irAlEditor(data.id!);
	};

	const crearConVariantes = async () => {
		const grupo = nombre.trim();
		if (grupo.length < 2) return setErrorMsg('Poné el nombre del producto.');

		const utiles = filas
			.filter((f) => f.etiqueta.trim())
			.map((f) => ({
				etiqueta: f.etiqueta.trim(),
				sku: f.sku.trim() || undefined,
				precio: aCentavos(f.precio),
				stock: aEntero(f.stock)
			}));

		if (utiles.length === 0) return setErrorMsg('Cargá al menos una variante.');

		setGuardando(true);
		setErrorMsg('');
		const { data, error } = await actions.createProductoConVariantes({ grupo, variantes: utiles });
		if (error || !data?.success) {
			setErrorMsg(error?.message || data?.error || 'No se pudieron crear las variantes.');
			return setGuardando(false);
		}
		irAlEditor(data.id!);
	};

	const crearCombo = async () => {
		const limpio = nombre.trim();
		if (limpio.length < 2) return setErrorMsg('Poné un nombre para el combo.');

		const items = Object.entries(integrantes)
			.filter(([, cant]) => cant > 0)
			.map(([product_id, cantidad]) => ({ product_id, cantidad }));

		if (items.length < 2) return setErrorMsg('Un combo necesita al menos dos productos.');

		setGuardando(true);
		setErrorMsg('');
		const { data, error } = await actions.createProduct({
			nombre: limpio,
			tipo: 'combo',
			precio: aCentavos(precioCombo),
			combo_items: JSON.stringify(items)
		});
		if (error || !data?.success) {
			setErrorMsg(error?.message || data?.error || 'No se pudo crear el combo.');
			return setGuardando(false);
		}
		irAlEditor(data.id!);
	};

	if (!isOpen) return null;

	// Las clases van completas y literales: Tailwind escanea el código fuente y
	// no puede ver una clase armada como `bg-${color}-50`.
	const opciones: Array<{ id: Tipo; titulo: string; desc: string; marco: string; icono: React.ReactNode }> = [
		{
			id: 'simple',
			titulo: 'Producto simple',
			desc: 'Un SKU, un precio, un stock.',
			marco: 'hover:border-emerald-500 hover:bg-emerald-50/30',
			icono: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
		},
		{
			id: 'variantes',
			titulo: 'Producto con variantes',
			desc: 'Talles, colores o fascículos. Cada uno con su stock.',
			marco: 'hover:border-indigo-500 hover:bg-indigo-50/30',
			icono: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>
		},
		{
			id: 'combo',
			titulo: 'Combo',
			desc: 'Varios productos vendidos juntos a un precio propio.',
			marco: 'hover:border-amber-500 hover:bg-amber-50/30',
			icono: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>
		}
	];

	const catalogoFiltrado = buscar.trim()
		? catalogo.filter((p) => p.nombre?.toLowerCase().includes(buscar.trim().toLowerCase())).slice(0, 30)
		: catalogo.slice(0, 30);

	const inputCls =
		'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600';

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
			<div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100">

				<div className="p-6 pb-4 flex items-start justify-between shrink-0 border-b border-slate-100">
					<div>
						<h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
							{tipo === null && 'Nuevo producto'}
							{tipo === 'simple' && 'Producto simple'}
							{tipo === 'variantes' && 'Producto con variantes'}
							{tipo === 'combo' && 'Nuevo combo'}
						</h2>
						<p className="text-sm text-slate-500 mt-1 max-w-md">
							{tipo === null && 'Elegí qué querés cargar.'}
							{tipo === 'simple' && 'Se crea como borrador y se abre el editor para completarlo.'}
							{tipo === 'variantes' && 'Cada variante se crea como su propia ficha y se muestran juntas en la tienda.'}
							{tipo === 'combo' && 'Elegí los productos que lo integran y su precio.'}
						</p>
					</div>
					<button
						onClick={() => setIsOpen(false)}
						className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer shrink-0"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
					</button>
				</div>

				<div className="p-6 space-y-4 overflow-y-auto">
					{errorMsg && (
						<div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl">
							{errorMsg}
						</div>
					)}

					{/* Paso 1: elegir el tipo */}
					{tipo === null && opciones.map((op) => (
						<button
							key={op.id}
							onClick={() => { setTipo(op.id); setErrorMsg(''); }}
							className={`w-full text-left p-5 rounded-2xl border border-slate-200 ${op.marco} transition-all flex items-start gap-4 group cursor-pointer`}
						>
							<div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 transition-colors">
								<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{op.icono}</svg>
							</div>
							<div>
								<h3 className="font-extrabold text-slate-900 text-base">{op.titulo}</h3>
								<p className="text-xs text-slate-500 mt-0.5">{op.desc}</p>
							</div>
						</button>
					))}

					{/* Paso 2 — Simple */}
					{tipo === 'simple' && (
						<div>
							<label className="block text-xs font-bold text-slate-900 mb-1">Nombre del producto</label>
							<input
								autoFocus
								value={nombre}
								onChange={(e) => setNombre(e.target.value)}
								onKeyDown={(e) => { if (e.key === 'Enter') crearSimple(); }}
								placeholder="Ej: Auriculares Kanji Bluetooth"
								className={inputCls}
							/>
						</div>
					)}

					{/* Paso 2 — Variantes */}
					{tipo === 'variantes' && (
						<div className="space-y-4">
							<div>
								<label className="block text-xs font-bold text-slate-900 mb-1">Nombre del producto (el grupo)</label>
								<input
									autoFocus
									value={nombre}
									onChange={(e) => setNombre(e.target.value)}
									placeholder="Ej: Remera Algodón"
									className={inputCls}
								/>
								<p className="text-[11px] text-slate-500 mt-1">
									Es el nombre de la tarjeta en la tienda. Cada variante se va a llamar
									{nombre.trim() ? ` “${nombre.trim()} - Talle S”` : ' “Nombre - Talle S”'}.
								</p>
							</div>

							<div className="space-y-2">
								<div className="grid grid-cols-[1fr_1fr_90px_70px_28px] gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
									<span>Variante</span><span>SKU</span><span>Precio</span><span>Stock</span><span />
								</div>
								{filas.map((f, i) => (
									<div key={i} className="grid grid-cols-[1fr_1fr_90px_70px_28px] gap-2 items-center">
										<input
											value={f.etiqueta}
											onChange={(e) => setFilas(filas.map((x, j) => j === i ? { ...x, etiqueta: e.target.value } : x))}
											placeholder="Talle S Negro"
											className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
										/>
										<input
											value={f.sku}
											onChange={(e) => setFilas(filas.map((x, j) => j === i ? { ...x, sku: e.target.value } : x))}
											placeholder="automático"
											className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
										/>
										<input
											value={f.precio}
											onChange={(e) => setFilas(filas.map((x, j) => j === i ? { ...x, precio: e.target.value } : x))}
											placeholder="0"
											inputMode="decimal"
											className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
										/>
										<input
											value={f.stock}
											onChange={(e) => setFilas(filas.map((x, j) => j === i ? { ...x, stock: e.target.value } : x))}
											placeholder="0"
											inputMode="numeric"
											className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
										/>
										<button
											onClick={() => setFilas(filas.length > 1 ? filas.filter((_, j) => j !== i) : filas)}
											title="Quitar"
											className="text-slate-300 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-30"
											disabled={filas.length <= 1}
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
										</button>
									</div>
								))}
								<button
									onClick={() => setFilas([...filas, filaVacia()])}
									className="text-xs font-bold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
								>
									+ Agregar variante
								</button>
							</div>

							<p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed">
								Si son muchas, conviene el importador de CSV: una fila por variante y una
								columna <strong>Grupo</strong> con el nombre compartido.
							</p>
						</div>
					)}

					{/* Paso 2 — Combo */}
					{tipo === 'combo' && (
						<div className="space-y-4">
							<div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-3">
								<div>
									<label className="block text-xs font-bold text-slate-900 mb-1">Nombre del combo</label>
									<input
										autoFocus
										value={nombre}
										onChange={(e) => setNombre(e.target.value)}
										placeholder="Ej: Combo Desayuno"
										className={inputCls}
									/>
								</div>
								<div>
									<label className="block text-xs font-bold text-slate-900 mb-1">Precio</label>
									<input
										value={precioCombo}
										onChange={(e) => setPrecioCombo(e.target.value)}
										placeholder="0,00"
										inputMode="decimal"
										className={inputCls}
									/>
								</div>
							</div>

							<div>
								<label className="block text-xs font-bold text-slate-900 mb-1">
									Productos que lo integran
									<span className="ml-2 font-medium text-slate-400">
										{Object.values(integrantes).filter((c) => c > 0).length} elegidos
									</span>
								</label>
								<input
									value={buscar}
									onChange={(e) => setBuscar(e.target.value)}
									placeholder="Buscar producto..."
									className={`${inputCls} mb-2`}
								/>
								<div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
									{catalogoFiltrado.length === 0 && (
										<p className="text-xs text-slate-400 p-4 text-center">
											No hay productos para elegir acá. Podés crear el combo y sumarlos después.
										</p>
									)}
									{catalogoFiltrado.map((p) => {
										const cant = integrantes[p.$id] || 0;
										return (
											<div key={p.$id} className="flex items-center justify-between gap-3 p-2.5 hover:bg-slate-50">
												<span className="text-xs font-bold text-slate-700 truncate">{p.nombre}</span>
												<div className="flex items-center gap-1.5 shrink-0">
													<button
														onClick={() => setIntegrantes({ ...integrantes, [p.$id]: Math.max(0, cant - 1) })}
														className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
													>−</button>
													<span className="w-6 text-center text-xs font-extrabold text-slate-900 tabular-nums">{cant}</span>
													<button
														onClick={() => setIntegrantes({ ...integrantes, [p.$id]: cant + 1 })}
														className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
													>+</button>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
					<button
						onClick={() => (tipo === null ? setIsOpen(false) : reiniciar())}
						className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors px-3 py-2 cursor-pointer"
					>
						{tipo === null ? 'Cancelar' : 'Volver'}
					</button>

					{tipo !== null && (
						<button
							onClick={tipo === 'simple' ? crearSimple : tipo === 'variantes' ? crearConVariantes : crearCombo}
							disabled={guardando}
							className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
						>
							{guardando ? 'Creando...' : 'Crear y abrir el editor'}
						</button>
					)}
				</div>

			</div>
		</div>
	);
}
