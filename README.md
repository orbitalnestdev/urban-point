# 🛒 UrbanPoint — Tienda Minorista de Cercanía

<p align="center">
  <img src="public/images/logo.png" alt="UrbanPoint Logo" width="280" />
</p>

<p align="center">
  <strong>Plataforma e-Commerce de Compras Online con Retiro Sin Cargo en Canillitas y Comercios de Barrio.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Astro-5.0-orange.svg" alt="Astro 5" />
  <img src="https://img.shields.io/badge/React-18-blue.svg" alt="React 18" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/Appwrite-Backend%20%26%20Storage-red.svg" alt="Appwrite" />
  <img src="https://img.shields.io/badge/Mercado%20Pago-Checkout%20Pro-009EE3.svg" alt="Mercado Pago" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue.svg" alt="TypeScript" />
</p>

---

## 📖 Descripción General

**UrbanPoint** es una solución e-commerce moderna que conecta tiendas minoristas y distribuidores con una red de puntos de retiro físicos en kioscos de diarios ("Canillitas") y comercios de cercanía en CABA y Gran Buenos Aires.

Los compradores pueden navegar un catálogo completo de productos con **precios especiales**, pagar de forma segura vía **Mercado Pago** en cuotas sin interés y seleccionar el **Canillita más cercano** para retirar su pedido sin costo de envío.

---

## ✨ Características Principales

### 🛒 Tienda & Compradores
- **Catálogo Dinámico & Búsqueda**: Filtrado interactivo por categorías, ordenamiento por precio y buscador de productos.
- **Carrito Global & Drawer Lateral**: Carrito sincronizado en tiempo real con Nanostores, accesible desde cualquier página.
- **Selector de Puntos de Retiro**: Menú interactivo con buscador de barrios/localidades e identificador con ícono `📍` de cada punto de retiro.
- **Checkout Integrado con Mercado Pago**: Cobro en pesos argentinos con generación de código de retiro único (`pickup_code_hash`).
- **Registro Simplificado**: Creación de cuenta con sólo ingresar correo electrónico.
- **Cucardas de Confianza**: Badges de pago seguro con Mercado Pago y garantía oficial.
- **Barra Superior Animada**: Banner rotativo automático de beneficios (3 cuotas sin interés, retiro gratis, etc.).
- **Redes Sociales & Contacto Directo**: Enlaces oficiales a [Instagram @urbanpoints.ar](https://www.instagram.com/urbanpoints.ar/) e ícono directo de atención por **WhatsApp**.

### 🛠️ Panel de Administración (`/admin`)
- **Gestor de Catálogo por Pestañas Separadas**:
  - **Identidad**: Nombre, descripción, categoría, SKU y marca/fabricante.
  - **Galería e Imágenes**: Carga directa de fotos de portada y secundarias alojadas en **Appwrite Storage**.
  - **Precio & Margen**: Cálculo en tiempo real de ganancia bruta en pesos ($ ARS) y porcentaje de margen neto (`((Precio - Costo) / Costo) * 100`).
  - **Stock & Reposición**: Control de inventario, stock máximo, nivel de reorden y tiempo de reposición.
  - **Envío & Logística**: Definición de bultos, packs, peso en kg, código EAN y dimensiones del empaque.
  - **SEO**: Título meta, descripción para buscadores, indexación y ordenamiento manual.
- **Edición Rápida en Panel Lateral**: Modificación instantánea de precio y stock sin salir del catálogo.
- **Importación Masiva desde CSV & Re-importación de Stock**.
- **Gestión de Pedidos, Liquidaciones y Reportes Financieros**.

### 📰 Portal de Canillitas (`/canillita`)
- **Panel de Control para Locales**: Registro de solicitudes para comercios de barrio.
- **Libro Mayor de Comisiones (`commission_ledger`)**: Cálculo automático de fees de logística y comisiones por cada pedido entregado.
- **Generación de Payouts**: Sistema de liquidaciones de saldos para los comercios afiliados.

### 🌐 Scraper en Tiempo Real de Attain (`scripts/migrate_attain.ts`)
- Script automatizado que escanea `attain.com.ar`, extrae especificaciones de productos, precios de costo, stock (`InStock` / `OutOfStock`), marcas y descarga e inserta las imágenes HD directamente en el bucket `products` de Appwrite.

---

## 🛠️ Tecnologías Utilizadas

- **Framework Web**: [Astro 5](https://astro.build/) (Modo Híbrido Server/Static con adaptador `@astrojs/node`).
- **Componentes UI**: [React 18](https://react.dev/) + [Lucide Icons](https://lucide.dev/).
- **Estilos**: Vanilla CSS & [TailwindCSS 3.4](https://tailwindcss.com/).
- **Gestión de Estado**: [Nanostores](https://github.com/nanostores/nanostores) (Persistencia en LocalStorage).
- **Base de Datos & Storage**: [Appwrite Cloud / Self-hosted](https://appwrite.io/) (Node Appwrite SDK).
- **Pasarela de Pagos**: [Mercado Pago SDK](https://www.mercadopago.com.ar/developers).
- **Ejecución TypeScript**: `tsx` (Node.js script runner).

---

## 📂 Estructura del Proyecto

```text
urban-point/
├── public/
│   ├── images/
│   │   ├── logo.png             # Logo oficial de UrbanPoint
│   │   ├── favicon.jpg          # Favicon oficial
│   │   └── map_banner.jpg       # Banner ilustrativo de la red de puntos
│   └── favicon.svg
├── scripts/
│   └── migrate_attain.ts        # Scraper y migrador en vivo de Attain
├── src/
│   ├── actions/
│   │   └── index.ts             # Astro Actions (Checkout, Admin, Auth, Productos)
│   ├── components/
│   │   ├── Header.astro         # Cabecera global con ticker animado & Logo
│   │   ├── Footer.astro         # Pie de página con Instagram y WhatsApp
│   │   ├── Logo.astro           # Componente dinámico de logo
│   │   ├── admin/               # Modales y simuladores de administración
│   │   └── shop/
│   │       ├── CartDrawer.tsx   # Carrito lateral responsivo
│   │       └── AddToCartBtn.tsx # Botón interactivo agregar al carrito
│   ├── layouts/
│   │   ├── Layout.astro         # Layout principal del sitio
│   │   └── AdminLayout.astro    # Layout del panel de control admin
│   ├── lib/
│   │   └── server/
│   │       └── appwrite.ts      # Cliente de Appwrite Server Admin SDK
│   ├── pages/
│   │   ├── api/
│   │   │   ├── pickup-points.ts # API REST de Puntos de Retiro
│   │   │   └── upload-image.ts  # API REST de subida de fotos a Storage
│   │   ├── admin/
│   │   │   ├── index.astro      # Dashboard principal de administración
│   │   │   └── catalogo/
│   │   │       ├── index.astro  # Tabla de productos y edición rápida
│   │   │       └── [id].astro   # Editor de producto por pestañas
│   │   ├── carrito/
│   │   │   └── index.astro      # Página dedicada de carrito y checkout
│   │   ├── productos/
│   │   │   ├── index.astro      # Catálogo público con filtros
│   │   │   └── [slug].astro     # Ficha detallada de producto
│   │   ├── login.astro          # Página de inicio de sesión / registro
│   │   └── index.astro          # Página de inicio (Landing Page)
│   └── store/
│       └── cart.ts              # Store Nanostores del carrito
└── astro.config.mjs             # Configuración de Astro
```

---

## ⚙️ Instalación y Configuración Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/azcurraely/UrbanPoint.git
cd UrbanPoint/urban-point
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Variables de Entorno (`.env`)
Crear un archivo `.env` en la raíz de `urban-point` con las credenciales correspondientes:

```env
PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
PUBLIC_APPWRITE_PROJECT_ID=tu_project_id
APPWRITE_API_KEY=tu_secret_api_key
MP_ACCESS_TOKEN=tu_mercadopago_access_token
```

### 4. Iniciar Servidor de Desarrollo
```bash
npm run dev
```
La aplicación se ejecutará en **`http://localhost:4321`**.

---

## 📜 Scripts Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo local en `localhost:4321` |
| `npm run build` | Compila la aplicación de producción en `./dist` |
| `npm run preview` | Previsualiza la build de producción |
| `npx tsx scripts/migrate_attain.ts` | Ejecuta el scraper en vivo de Attain e importa productos a Appwrite |

---

## 📄 Licencia

Derechos Reservados © 2026 **UrbanPoint** — Tienda Minorista de Cercanía.
