# Informe de Auditoría Pre-Producción — UrbanPoint

**Fecha:** 2026-08-12 · **Alcance:** Fase 1 (auditoría read-only) · **Rama:** `master` @ `bb709e0`
**Método:** lectura de código + ejecución (build, `astro check`, `npm audit`, Vitest) + sondeo read-only del Appwrite real.

---

## Resumen ejecutivo

**¿Se puede poner en producción hoy? NO.** Y no por deuda técnica: hay pérdida de dinero y fuga de datos verificadas contra la base real.

1. **Las órdenes, comisiones, liquidaciones y CBUs de los canillitas son legibles por cualquiera en internet, sin login.** Lo verifiqué con un `curl` anónimo: quedan expuestos domicilios de clientes, montos y el código de retiro en texto plano.
2. **La atribución al punto de retiro nunca funcionó.** De los **19 pedidos reales en producción, 0 tienen `pickup_point_id` y 0 tienen `origin_node_id`.** Una cookie mal serializada rompe la cadena entera. Hoy ningún pedido se puede rutear al canillita correcto.
3. **Cualquiera puede marcar un pedido como pagado sin pagar** (`updateOrderStatus` no valida rol) y **el webhook de Mercado Pago no valida firma**, con un modo mock que regala pedidos si falta la variable de entorno.
4. **Se muestra un precio y se cobra otro:** el checkout ignora `precio_promocional`. El cliente ve $8.000 y Mercado Pago le cobra $10.000.
5. **El alta de canillitas es inalcanzable:** las dos rutas del formulario hacen `redirect('/')` y ningún componente lo monta. Esa es la causa raíz de que no lleguen solicitudes — no eran permisos ni índices.
6. **La API key admin de Appwrite está commiteada** en 21 archivos y 15 commits. Hay que rotarla antes que cualquier otra cosa.

**Mínimo para salir a producción:** rotar la key, cerrar permisos de Appwrite, poner autorización en las actions, validar la firma del webhook, arreglar la atribución de nodo y el cobro del precio promocional. Estimado: **3 a 4 semanas** de trabajo enfocado, más una re-auditoría del flujo de dinero.

---

## Estado de corrección (Fase 2, en curso)

Rama `fix/auditoria-fase-2`. Un hallazgo por commit, en orden de severidad.

| ID | Estado | Commit |
|---|---|---|
| C-07 API key hardcodeada | Código corregido — **falta rotar la clave** | `0b4f86d` |
| C-01 Colecciones públicas | Código corregido — **falta correr el script** | `2878fdf` |
| C-09 Actions sin autorización | Corregido | `dc61fc1` |
| C-04 Estado de pedido sin control | Corregido | `c3262df` |
| C-05 Webhook sin firma | Corregido — **falta `MP_WEBHOOK_SECRET`** | `5b56dad` |
| A-02 Reversa de comisiones rota | Corregido | `0f20294` |
| C-02 Atribución de nodo rota | Corregido | `a67edfa` |
| C-03 Precio promocional no cobrado | Corregido | `9f64b52` |
| M-10 Precios inventados en el front | Corregido | `9f64b52` |
| A-04 Escapes rotos en el alta | Corregido | `196f0d7` |
| A-01 Formulario de alta inalcanzable | Corregido | `6ce5300` |
| C-08 IDOR del código de retiro | Corregido | `01ab717` |
| **C-06 `precio_promocional` en float** | **Pendiente: requiere migrar la base** | — |

Suite: **51 de 52 tests en verde**. El único rojo es C-06, que no se puede
cerrar desde el código.

### Acciones que dependen de vos (no las puedo hacer yo)

1. **Rotar la API key de Appwrite** y definir `APPWRITE_API_KEY` en Dokploy.
   El código ya no tiene fallback: sin esa variable el servidor no arranca.
   Es deliberado — antes degradaba a una clave del repositorio.
2. **Definir `MP_WEBHOOK_SECRET`** con el secreto del webhook de Mercado Pago.
   Sin él, el webhook responde 503 en vez de aceptar eventos sin firmar.
3. **Correr `scripts/secure_perms.ts`** contra producción para cerrar los
   permisos. Primero con `--dry-run`.

---

## Tabla de hallazgos

Ordenados por severidad. `[V]` = verificado ejecutando. `[C]` = verificado leyendo código. `[NV]` = no verificado (se indica por qué).

| ID | Área | Sev | Evidencia (ruta:línea) | Reproducción | Impacto en el negocio | Fix propuesto | Esf. |
|---|---|---|---|---|---|---|---|
| **C-01** | Seguridad | **Crítico** `[V]` | `scripts/fix_perms.ts:17,26` → `Permission.read(Role.any())` | `curl -H "X-Appwrite-Project: 6a6a…" https://aw.orbitalnest.net/v1/databases/urbanpoint/collections/orders/documents` sin API key → 200 con 19 pedidos | Fuga pública de domicilios, totales, `pickup_code_hash`, CBU de canillitas, ledger y payouts. Incumple protección de datos personales | Quitar `read(any)` de `orders`, `payouts`, `commission_ledger`, `pickup_points`. Dejar público solo `products`/`categories` y con allowlist de campos | M |
| **C-02** | Atribución | **Crítico** `[V]` | `src/lib/nodeSession.ts:29` + `src/pages/[slug].astro:61` | `npx vitest run tests/unit/nodeSession.test.ts` → 3 fallos. En prod: **0/19 pedidos con `origin_node_id`** | La cadena punto→pedido→comisión está cortada. Ningún canillita cobra por traer la venta | `serializeActiveNodeCookie` debe devolver solo el valor (JSON urlencoded), no el header completo | S |
| **C-03** | Dinero | **Crítico** `[V]` | `src/actions/index.ts:617,626-630` vs `src/pages/productos/[slug].astro:97` | Producto con `precio_promocional` → la ficha muestra la promo, MP cobra `precio`. Test `pricing.test.ts` falla | Se cobra de más respecto de lo publicado. Riesgo de contracargos y defensa al consumidor | Centralizar `precioDeVenta(producto)` en servidor y usarlo en checkout y en todas las vistas | M |
| **C-04** | Seguridad | **Crítico** `[C]` | `src/actions/index.ts:1093-1137` (`updateOrderStatus`, sin `ctx.locals.user`) | `POST /_actions/updateOrderStatus` con `{orderId, nuevoEstado:"confirmado"}` sin sesión → marca `pagado` y ejecuta `resolverComisiones` | Acreditación de comisiones sin pago real. Un canillita puede autoacreditarse dinero | Guard de rol en la action; validar máquina de estados | S |
| **C-05** | Pagos | **Crítico** `[C]` | `src/pages/api/webhooks/mercadopago.ts:10-50` | Sin `MP_ACCESS_TOKEN`: `POST /api/webhooks/mercadopago?topic=payment&id=<orderId>` → pedido pagado gratis. Con token: no se valida `x-signature` | Pedidos gratis y comisiones falsas | Validar firma HMAC de MP; eliminar el modo mock del código de producción | M |
| **C-06** | Dinero | **Crítico** `[V]` | `add_precio_promocional.js:13` → `createFloatAttribute` | Consulta al esquema real: `precio` = `integer`, `precio_promocional` = **`double`** | Único campo monetario en punto flotante. Errores de redondeo en promociones | Migrar el atributo a `integer` (centavos) y convertir los datos | M |
| **C-07** | Seguridad | **Crítico** `[V]` | `src/lib/server/appwrite.ts:5` + 20 archivos más | `git log -S'standard_3baf…' --all` → 15 commits. Agregada a propósito en `14ff48b` y `ff4cc4a` | Compromiso total de la base. Sigue viva en el historial aunque se borre del HEAD | **Rotar la key ya**, moverla a env sin fallback, purgar historial o asumir la key como quemada | M |
| **C-08** | Seguridad | **Crítico** `[C]` | `src/pages/checkout/success.astro:10-18,48` | `GET /checkout/success?order_id=<id>` sin sesión → muestra `pickup_code_hash` | Con el código se puede retirar el pedido de otra persona. `deliverOrder` compara ese mismo string | Exigir sesión + pertenencia; hashear el código de verdad | M |
| **C-09** | Autorización | **Crítico** `[C]` | `src/actions/index.ts:108,193,1139,1202,1238,1305,1337,1352` | `POST /_actions/approveCanillita` sin ser admin → aprueba canillitas y crea perfiles | El middleware solo filtra por `pathname`; las actions son endpoints POST directos. Alta y catálogo manipulables por cualquiera | Guard de rol en toda action que muta; helper `requireRole()` centralizado | M |
| **A-01** | Canillitas | **Alto** `[V]` | `src/pages/sumate-como-canillita/index.astro:2` y `registro.astro:2` (`redirect('/')`) | `grep -rn RegistrationForm src/` → solo su propia definición | **Causa raíz de "no llegan solicitudes":** el formulario no existe como ruta. No son permisos ni índices | Restaurar la página y montar `RegistrationForm` | S |
| **A-02** | Comisiones | **Alto** `[V]` | `src/lib/commissions.ts:196` escribe `estado:'cancelado'` | Enum real del ledger: `pendiente\|disponible\|liquidado\|revertido`. `'cancelado'` no existe | Cancelar un pedido **restaura el stock y después falla** al revertir la comisión: comisión viva sobre venta anulada | Usar `'revertido'`; hacer el bloque idempotente y ordenado | S |
| **A-03** | Comisiones | **Alto** `[C]` | `src/actions/index.ts:453-464` y `:1055-1062` | `liquidateCommissions` no escribe `profile_id`; `createPayout` omite `periodo_desde/hasta` (requeridos) | Las liquidaciones no se ven en "Mis Cobros" del canillita | Unificar en una sola action con el esquema real | M |
| **A-04** | Canillitas | **Alto** `[V]` | `src/components/canillitas/RegistrationForm.tsx:63` | `od -c` confirma `\\S` (backslash literal). Test falla con `juan@gmail.com` | Aun restaurando la ruta, ningún email válido pasa la validación | Cambiar `\\S` por `\S` | XS |
| **A-05** | Comisiones | **Alto** `[C]` | `src/actions/index.ts:1121-1125` | Apretar "Confirmar" dos veces → `resolverComisiones` corre de nuevo | Descuenta stock dos veces. El guard de idempotencia está en `resolverComisiones` pero el stock se descuenta dentro del mismo loop | Separar devengo de descuento de stock; idempotencia por `order_id` | M |
| **A-06** | Atribución | **Alto** `[C]` | `src/layouts/Layout.astro:63` (`if (!referralCode.get().code)`) vs `src/pages/[slug].astro:61` | Entrar por punto A, después por B, comprar | Referido = first-touch, nodo = last-touch: **A cobra referido y B cobra logística**. No hay regla de negocio decidida | Definir y documentar la política (recomiendo last-touch con ventana) y aplicarla a un solo canal | M |
| **A-07** | Pedidos | **Alto** `[C]` | `src/pages/canillita/index.astro:181,223,227` | Pedido `pendiente_pago` aparece como "Listo para Retiro" con botón activo | El canillita puede entregar mercadería no pagada | Filtrar por `pagado` y deshabilitar la entrega si no está pagado | S |
| **A-08** | Datos | **Alto** `[V]` | `src/pages/checkout/retiro.astro:41-43,213` | Ver el HTML de `/checkout/retiro` sin login | Expone `profile_id`, teléfono y condición fiscal de **todos** los canillitas | Allowlist de campos; no serializar `profile_id` al cliente | S |
| **A-09** | Pedidos | **Alto** `[C]` | `src/pages/mi-cuenta/pedidos/[id].astro:21-24` | Pedido de invitado (`customer_id` null) → el guard `if (orderCustId && …)` no dispara | Cualquier cliente logueado ve pedidos de invitado, con su código de retiro | Denegar por defecto cuando no hay `customer_id` |S|
| **M-01** | Admin | Medio `[C]` | `src/pages/admin/catalogo/index.astro:811-826` | Cambiar estado desde el dropdown de la tabla | **Renombra el producto a "Producto", precio $1,00 y stock 0.** Destructivo | Enviar solo el campo que cambia; `updateProduct` con campos opcionales | S |
| **M-02** | Admin | Medio `[C]` | `src/pages/admin/catalogo/index.astro:788-797` + `src/actions/index.ts:1270` | Guardar desde el drawer rápido | Vacía la descripción del producto en cada edición | Idem M-01 |S|
| **M-03** | Estados | Medio `[V]` | `mi-cuenta/pedidos/[id].astro:105`, `canillita/index.astro:151` | Estados `listo_retiro`, `en_transito`, `listo`, `preparado` no existen en el enum real | El cliente **nunca ve su código QR de retiro**; métricas del panel siempre en 0 | Unificar el vocabulario de estados en una constante compartida | M |
| **M-04** | Carrito | Medio `[C]` | `src/pages/carrito/index.astro:153`, `checkout/pago.astro:134` | Despublicar un producto con el carrito lleno | No se revalida hasta el submit; el usuario descubre el problema al final. (El total sí se recalcula en servidor: **no hay riesgo de comprar barato**) | Revalidar al entrar al carrito y al checkout | M |
| **M-05** | Admin | Medio `[C]` | `src/lib/server/auth.ts:25` + `ClientLayout.astro:18-21` | Entrar a `/mi-cuenta` siendo admin | **Desloguea al admin** (le borra la cookie) | No borrar la sesión; redirigir según rol | S |
| **M-06** | Admin | Medio `[C]` | `admin/pedidos/[id].astro:102,333-341,69-71` | Abrir cualquier ficha de pedido | Fecha fija "20 de julio, 2026", timeline mock y datos de cliente hardcodeados (`'Beyla'`, mails reales de terceros) | Resolver el perfil real; eliminar los mocks | M |
| **M-07** | Admin | Medio `[C]` | `admin/pedidos/[id].astro:111,153,208,297,388` | Botones "Exportar", "Editar estado", "Historial", "Agregar nota", "Registrar pago" | Sin handler: no hacen nada. La nota del pedido no se guarda | Implementar o quitar | M |
| **M-08** | Admin | Medio `[C]` | `admin/catalogo/index.astro:908` → `/api/products-raw.json` | Botón exportar del catálogo | El endpoint no existe; cae en `alert()` | Implementar el endpoint o quitar el botón | S |
| **M-09** | UX/Admin | Medio `[C]` | `admin/catalogo/index.astro:732-746` | Tap en tarjeta vs botón "Editar" | **Ambos abren el mismo drawer rápido.** El criterio pedido (tarjeta→simple, botón→completo) no está implementado | Que el botón navegue a `/admin/catalogo/[id]` | S |
| **M-10** | Legal | Medio `[C]` | `productos/index.astro:141`, `productos/[slug].astro:100` | Ver cualquier ficha | `precioLista = precio × 1.25` y `precioTransferencia = precio × 0.80` son **inventados en el front**; el descuento anunciado no existe en el checkout | Quitar o respaldar con datos reales | S |
| **M-11** | Mapa | Medio `[C]` | `puntos-de-retiro.astro:396` vs `:433-482` | Punto sin lat/lng | No aparece en el mapa pero **sí en la lista**; "Ver en mapa" no hace nada | Filtrar en ambos lados o marcarlo | S |
| **M-12** | Canillitas | Medio `[C]` | `src/actions/index.ts:152-164` | Aprobar un canillita | El punto se crea **sin `slug`** → nunca tiene página propia. Además `activateCanillita` es inalcanzable (`:839`, el punto ya nace `activo`) | Generar slug en la aprobación; revisar el flujo de activación | M |
| **M-13** | Seguridad | Medio `[C]` | `src/pages/api/upload-image.ts:9-34` | `POST /api/upload-image` sin sesión | Sin auth, sin validar tipo/tamaño; carga el archivo entero en memoria. Todo lo subido queda público | Exigir rol admin, validar MIME y tamaño | S |
| **M-14** | Seguridad | Medio `[C]` | `src/pages/login.astro:110` | Inspeccionar la cookie | `up_session` con `secure: false` en producción | `secure: true` fuera de dev | XS |
| **M-15** | Seguridad | Medio `[C]` | `src/pages/login.astro:70` | Registrarse con un email existente | Enumeración de usuarios: el error de Appwrite se muestra tal cual | Mensaje genérico | S |
| **M-16** | Seguridad | Medio `[C]` | grep `captcha\|rate.?limit` → 0 resultados | — | Sin rate limiting en login, registro ni alta. Sin recuperación de contraseña (no existe) | Rate limiting + flujo de recuperación | M |
| **M-17** | XSS | Medio `[C]` | `productos/[slug].astro:271`; `puntos-de-retiro.astro:260`; `index.astro:86`; `[slug].astro:547` | Producto/punto con `</script>` en el nombre | `JSON.stringify` no escapa `</script>` → XSS almacenado en home, mapa y checkout. Hoy requiere admin | Escapar `<` en las inyecciones JSON; sanitizar la descripción | M |
| **B-01** | Deps | Bajo `[V]` | `npm audit` | — | 2 vulnerabilidades **high** (`js-yaml`, `nanoid`) | `npm audit fix` | XS |
| **B-02** | Diseño | Bajo `[C]` | `index.astro:729-753`, `carrito/index.astro:270-275`, +8 más | — | Emojis como iconografía, contra el criterio de diseño | Reemplazar por SVG | S |
| **B-03** | Config | Bajo `[C]` | `admin/configuracion/index.astro:163-167` vs `FloatingWhatsApp.astro` | Configurar horario de WhatsApp | Se guarda pero el componente lo ignora: el botón se muestra 24/7. **El botón sí existe** y está en el layout público | Aplicar el horario | S |
| **B-04** | Código muerto | Bajo `[V]` | `src/middleware.ts:14` (`up_ref_code` nunca se lee); `api/pickup-points.ts` sin consumidores; `public/nodos.csv` | — | Confusión de mantenimiento; tres mecanismos de referido en paralelo | Eliminar | S |
| **B-05** | Config | Bajo `[C]` | `src/actions/index.ts:716-718` | — | `back_urls` de MP hardcodeadas a `http://localhost:4321` | Usar el host real por env | XS |
| **B-06** | Rutas | Bajo `[V]` | `[slug].astro:24,41,93` → `rewrite('/404')` | — | **No existe `src/pages/404.astro`** | Crearla | XS |

---

## Verificaciones que dieron bien (no son hallazgos)

Vale la pena registrarlas porque acotan el riesgo:

- **El total se recalcula siempre en el servidor.** `createCheckout` solo recibe `{productId, cantidad}`; el precio del cliente nunca viaja (`src/actions/index.ts:602-631`). **No se puede comprar manipulando el precio.** El problema del precio es el opuesto: se cobra de más (C-03).
- **La API key no llega al bundle del cliente.** Grep sobre `dist/client/` → sin resultados.
- **La escritura anónima en Appwrite está bloqueada.** Probado con `POST` a `orders` → 401.
- **`astro check`: 0 errores.** El build de producción compila.
- **El aislamiento del panel del canillita es correcto** en el caso normal: filtra por su `pickup_point` y `deliverOrder` revalida la propiedad en servidor.
- **`/api/pickup-points.ts` no filtra datos sensibles**: allowlist de 3 campos.

---

## No verificado (y por qué)

- **Webhook real de Mercado Pago.** No hay `.env` local ni credenciales de sandbox. La falta de validación de firma es evidente por lectura, pero **no ejecuté un pago real**. Los estados aprobado/pendiente/rechazado/cancelado/reembolsado **no fueron probados de punta a punta**; además el código solo maneja `approved` — el resto se ignora en silencio.
- **Reembolsos totales y parciales.** No existe código que los procese: no hay nada que probar. `reembolsado` está en el enum pero ninguna ruta lo escribe.
- **Condiciones de carrera de stock.** No las ejecuté. Por lectura, el descuento es `get` + `update` sin transacción ni control de versión (`src/lib/commissions.ts:103-106`): **dos compras simultáneas del último producto pueden sobrevender**. Requiere prueba de carga para confirmar.
- **Rate limiting de la instancia Appwrite.** Fuera del repo. Las afirmaciones sobre rate limiting son a nivel aplicación.
- **Configuración del bucket de Storage** (extensiones y tamaño permitidos), que acota el riesgo real de M-13.
- **Los 6 asientos de `commission_ledger`** son todos `fee_logistica` pese a que ningún pedido tiene `pickup_point_id`. Sospecho que provienen de `scripts/seed-commissions.ts`, pero **no lo confirmé**. Llamativo: hay 10 pedidos con `referral_code_id` y **0 asientos `comision_referido`**.

---

## Plan de corrección priorizado

Orden de ejecución, con dependencias. Un hallazgo por commit.

### Bloque 0 — Contención inmediata (antes que nada)
1. **C-07** Rotar la API key de Appwrite y quitar todos los fallbacks hardcodeados. *Sin dependencias. Bloquea todo lo demás: mientras la key esté viva, cerrar permisos no sirve.*
2. **C-01** Cerrar permisos de colecciones. *Depende de 1.*

### Bloque 1 — Cortar la pérdida de dinero
3. **C-09** Helper `requireRole()` y guards en todas las actions que mutan. *Habilita 4 y 5.*
4. **C-04** Autorización + validación de transiciones en `updateOrderStatus`. *Depende de 3.*
5. **C-05** Firma del webhook de MP y eliminación del modo mock. *Depende de 3.*
6. **C-08** Auth y pertenencia en `/checkout/success`; hashear el código de retiro. *Depende de 3.*
7. **A-05** Idempotencia del devengo y del descuento de stock. *Depende de 4.*

### Bloque 2 — Reparar la trazabilidad del negocio
8. **C-02** Arreglar la serialización de la cookie de nodo. *Los tests de `nodeSession` pasan a verde.*
9. **A-06** Decidir y documentar la política de atribución; unificar los canales. *Depende de 8.*
10. **A-02** Enum correcto en la reversa de comisiones. *Independiente.*
11. **A-03** Unificar las dos actions de liquidación. *Independiente.*
12. **A-09**, **A-08**, **A-07** Fugas y entrega de pedidos no pagados.

### Bloque 3 — Precios y datos
13. **C-03** `precioDeVenta()` centralizado en servidor. *Depende de 14 para ser correcto.*
14. **C-06** Migrar `precio_promocional` a entero. *Hacer antes que 13.*
15. **M-10** Quitar los precios sintéticos.

### Bloque 4 — Alta de canillitas (el flujo que hoy no existe)
16. **A-01** Restaurar la ruta y montar el formulario.
17. **A-04** Arreglar el regex de email. *Depende de 16 para poder probarse.*
18. **M-12** Generar slug al aprobar; revisar la activación.
19. **M-16** Rate limiting y recuperación de contraseña.

### Bloque 5 — Admin y limpieza
20. **M-01**, **M-02** Bugs destructivos del catálogo. *Prioridad alta dentro del bloque: hoy corrompen datos.*
21. **M-03** Unificar vocabulario de estados.
22. **M-05**, **M-06**, **M-07**, **M-08**, **M-09**, **M-11**, **M-13**, **M-14**, **M-15**, **M-17**
23. **B-01** … **B-06** Deuda y cosmética.

---

## Anexo: esquema real vs. repo

El esquema de Appwrite **derivó** respecto de los scripts del repo. No usar `scripts/setup-db.ts` como fuente de verdad:

| Dato | Repo | Base real |
|---|---|---|
| `orders.canillita_id` | no declarado | **existe** |
| `payouts` | un juego de campos | **ambos** juegos conviven |
| Índices | `createIndex` no aparece nunca | **existen varios** (`idx_estado`, `idx_user_id`, `idx_code_unique`, `idx_idempotency`…) |
| `commission_ledger` | — | **sin índices**, pese a filtrarse por `order_id` y `profile_id` |
| `precio_promocional` | float | **double** (confirmado) |

Esto invalida la hipótesis de que la falta de índices explicara las solicitudes faltantes: `canillita_applications` **sí** tiene `idx_estado`. La causa real es A-01.

**Recomendación estructural:** versionar el esquema (migraciones idempotentes) y dejar de administrar la base a mano desde la consola.
