# 🛒 UrbanPoint — Tienda Minorista de Cercanía & Red de Canillitas

<p align="center">
  <img src="public/images/logo.png" alt="UrbanPoint Logo" width="280" />
</p>

<p align="center">
  <strong>Plataforma e-Commerce B2C Minorista con Puntos de Retiro Físicos en Kioscos de Diarios (Canillitas Afiliados) y Atribución por Referidos.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Astro-5.0%20(SSR)-orange.svg" alt="Astro 5" />
  <img src="https://img.shields.io/badge/React-18-blue.svg" alt="React 18" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-cyan.svg" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/Appwrite-1.8.0%20Self--Hosted-red.svg" alt="Appwrite" />
  <img src="https://img.shields.io/badge/Mercado%20Pago-Checkout%20Pro-009EE3.svg" alt="Mercado Pago" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Lucide-SVG%20Icons-purple.svg" alt="Lucide Icons" />
</p>

---

## 📖 Descripción General

**UrbanPoint** es una plataforma e-commerce minorista (B2C) de última generación que integra dos particularidades logísticas y comerciales fundamentales:

1. **Puntos de Retiro en Kioscos de Diarios ("Canillitas")**: Los clientes compran online y eligen entre recibir el paquete en su domicilio o retirarlo sin costo en el comercio de cercanía de su barrio.
2. **Red de Referidos & Comisiones**: Los Canillitas afiliados generan ventas a través de sus enlaces únicos (`?ref=CODIGO`) o códigos QR pegados en su local, cobrando una comisión en porcentaje sobre cada venta atribuida.

---

## ✨ Características Principales

### 🛒 Tienda Pública & Experiencia del Cliente
- **Rastreo de Referidos Universal (`?ref=CODIGO`)**: Captura automática del código de referido en cualquier URL de entrada, persistencia en cookies/localStorage (ventana por defecto de 30 días, regla de *último contacto*) y atribución en checkout.
- **Catálogo Dinámico & Buscador**: Filtrado por categorías, ordenamiento por precio y buscador interactivo.
- **Carrito Global & Drawer Lateral**: Carrito en tiempo real con Nanostores, accesible desde cualquier pantalla.
- **Selector de Puntos de Retiro**: Buscador interactivo por localidad y mapa con ubicaciones físicas.
- **Checkout Integrado con Mercado Pago**: Pagos en pesos argentinos ($ ARS) y generación de código único de retiro (`pickup_code_hash`).
- **Botón Flotante de WhatsApp Administrable**: Color oficial `#25D366`, ícono vectorial SVG, mensaje pre-cargado, posición responsiva y estado activo/inactivo configurable desde el Admin.
- **Iconografía 100% Vectorial (Lucide Icons)**: Ausencia total de emojis utilizados como íconos gráficos en todo el frontend.

### 🛠️ Panel de Administración (`/admin`)
- **Gestión de Catálogo & Modelo de 3 Estados**:
  - Productos con estados explícitos (`borrador`, `activo`, `pausado`).
  - Selector de 3 estados por fila en la tabla y **Drawer de Edición Rápida** de 2 columnas con formateo de moneda en vivo, badge derivado de *"Nuevo"* (<30 días) y barra flotante de acciones masivas.
  - Editor completo por pestañas ([`/admin/catalogo/[id]`](file:///c:/Users/azcur/Workspace/UrbanPoint/urban-point/src/pages/admin/catalogo/[id].astro)): Identidad, Galería (Appwrite Storage), Precio/Margen, Stock, Logística y SEO.
- **Dashboard Operativo Vivo ([`/admin/index.astro`](file:///c:/Users/azcur/Workspace/UrbanPoint/urban-point/src/pages/admin/index.astro))**: Métricas del día/mes, pedidos que requieren atención (nuevos sin confirmar, listos para retiro), solicitudes de canillitas y stock crítico.
- **Análisis de Tendencias ([`/admin/analisis.astro`](file:///c:/Users/azcur/Workspace/UrbanPoint/urban-point/src/pages/admin/analisis.astro))**: Comparativa Retiro en Punto vs Envío a Domicilio, ranking de ventas por canillita y análisis de compradores nuevos vs recurrentes.
- **Centro de Reportes CSV ([`/admin/reportes.astro`](file:///c:/Users/azcur/Workspace/UrbanPoint/urban-point/src/pages/admin/reportes.astro))**: Exportación descargable para Ventas, Comisiones, Liquidaciones e Inventario.
- **Equipo de Trabajo ([`/admin/equipo/index.astro`](file:///c:/Users/azcur/Workspace/UrbanPoint/urban-point/src/pages/admin/equipo/index.astro))**:
  - Roles definidos: `admin` (Administrador) y `gestion` (Gestión de Tienda).
  - Middleware HTTP 403 para limitar accesos del rol `gestion`.
  - Protección estricta contra eliminación o degradación del último Administrador.
- **Configuración en Vivo ([`/admin/configuracion/index.astro`](file:///c:/Users/azcur/Workspace/UrbanPoint/urban-point/src/pages/admin/configuracion/index.astro))**: Ajustes de Tienda, Contacto, WhatsApp, Comisiones de Canillita, Envíos, Mercado Pago, Notificaciones, SEO y Legales con impacto inmediato sin necesidad de redeploy.

### 📰 Portal de Canillitas (`/canillita`)
- **Panel de Control para Comercios Afiliados**: Seguimiento de paquetes recibidos, códigos de retiro presentados por clientes y entregas confirmadas.
- **Link de Referido, Compartir en WhatsApp & Código QR**:
  - Tarjeta destacada con link único (`https://domain.com/?ref=CODIGO`).
  - Botón de copia instantánea y botón *"Compartir por WhatsApp"* con texto pre-cargado.
  - **Código QR vectorial generado dinámicamente** listo para imprimir y colocar en el kiosco físico.
- **Libro Mayor de Comisiones (`commission_ledger`)**: Registro automático de ingresos acumulados, pendientes y liquidados.

---

## 🛠️ Tecnologías Utilizadas

- **Framework Web**: [Astro 5](https://astro.build/) en modo SSR (`prerender = false`) con `@astrojs/node`.
- **Componentes UI**: [React 18](https://react.dev/) + [Lucide Icons SVG](https://lucide.dev/).
- **Estilos**: Vanilla CSS & [TailwindCSS 3.4](https://tailwindcss.com/).
- **Gestión de Estado**: [Nanostores](https://github.com/nanostores/nanostores).
- **Backend & DB**: [Appwrite 1.8.0 Self-hosted](https://appwrite.io/) (Colecciones: `products`, `orders`, `profiles`, `pickup_points`, `referral_codes`, `referral_attributions`, `commission_ledger`, `settings`, `payouts`).
- **Pasarela de Pagos**: [Mercado Pago Checkout Pro SDK](https://www.mercadopago.com.ar/developers).

---

## 📂 Estructura del Proyecto

```text
urban-point/
├── public/
│   ├── images/              # Logos y banners estáticos
│   └── favicon.svg
├── scratch/                 # Suites de pruebas y verificación E2E
│   ├── test_master_v2_e2e.mjs
│   ├── test_products_master_v3.mjs
│   └── test_addendum_master_suite.mjs
├── src/
│   ├── actions/
│   │   └── index.ts         # Server Actions (Checkout, Productos, Pedidos, Canillitas)
│   ├── components/
│   │   ├── FloatingWhatsApp.astro # Botón flotante público de WhatsApp
│   │   ├── Navbar.astro
│   │   ├── Footer.astro
│   │   └── shop/
│   │       ├── CartDrawer.tsx     # Carrito lateral responsivo
│   │       └── AddToCartBtn.tsx
│   ├── layouts/
│   │   ├── Layout.astro     # Layout público con tracking de referidos
│   │   └── AdminLayout.astro# Layout del panel de control con verificación de roles
│   ├── lib/
│   │   └── server/
│   │       ├── appwrite.ts  # Cliente Admin SDK de Appwrite
│   │       └── settings.ts  # Helper de configuración global en vivo
│   ├── middleware.ts        # Captura ?ref=CODIGO y protección HTTP 403 por rol
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── index.astro        # Dashboard general de métricas
│   │   │   ├── analisis.astro     # Análisis de tendencias y canales
│   │   │   ├── reportes.astro     # Exportadores CSV
│   │   │   ├── catalogo/          # ABM de productos y editor rápido
│   │   │   ├── pedidos/           # Gestión de órdenes y entregas
│   │   │   ├── clientes/          # Fichas dinámicas de compradores
│   │   │   ├── canillitas/        # Red de retiro y solicitudes
│   │   │   ├── equipo/            # Gestión de miembros y permisos
│   │   │   └── configuracion/     # Panel de ajustes globales
│   │   ├── canillita/
│   │   │   └── index.astro        # Panel del canillita, entregas, QR y link
│   │   ├── productos/             # Catálogo público y ficha de producto
│   │   └── index.astro            # Landing page principal
│   └── store/
│       └── cart.ts                # Store Nanostores del carrito y referidos
└── astro.config.mjs               # Configuración de Astro
```

---

## ⚙️ Instalación y Configuración Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/orbitalnestdev/urban-point.git
cd urban-point
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Variables de Entorno (`.env`)
Crear un archivo `.env` en la raíz de `urban-point`:

```env
PUBLIC_APPWRITE_ENDPOINT=https://aw.orbitalnest.net/v1
PUBLIC_APPWRITE_PROJECT_ID=6a6a5321001439f06817
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
| `node scratch/test_addendum_master_suite.mjs` | Ejecuta la suite de verificación completa del Addendum |

---

## 📄 Licencia

Derechos Reservados © 2026 **UrbanPoint** — Tienda Minorista de Cercanía & Red de Canillitas.
