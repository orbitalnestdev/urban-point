# Estado de los tests

> **Actualizado tras la Fase 2.** La suite pasó de 24 a **72 tests, con 71 en
> verde**. El único rojo es C-06 (`precio_promocional` declarado como `double`
> en Appwrite), que no se puede cerrar desde el código: requiere migrar el
> atributo. Los archivos por área son `commissions`, `orderStates`, `pricing`,
> `pricingModule`, `nodeSession`, `payouts` y `atribucion`.
>
> Lo que sigue documenta el estado en que se encontró el proyecto.


## Runner

El proyecto **no tenía** runner real. `package.json` declaraba `node --test tests/*.test.ts`.

Se configuró **Vitest** (`vitest.config.ts`, tests en `tests/unit/`). Se ejecuta con:

```bash
npx vitest run
```

**Playwright (E2E) no se instaló.** Justificación explícita más abajo — instalarlo sin poder ejecutar nada habría dejado andamiaje decorativo, que es justo lo que esta auditoría vino a señalar.

---

## Hallazgo previo: la suite existente no probaba nada

De los 4 archivos en `tests/`, **3 no importan una sola línea de `src/`**. Reimplementan la lógica dentro del propio test y se afirman contra su propia copia.

Ejemplo textual de `tests/referrals_and_stock.test.ts:30-36`:

```ts
const buyerProfileId = 'user_abc_123';
const referrerProfileId = 'user_abc_123';
const isSelfReferral = buyerProfileId && buyerProfileId === referrerProfileId;
assert.strictEqual(isSelfReferral, true);
```

El test calcula `isSelfReferral` y después verifica que valga lo que acaba de calcular. **Pasa siempre, incluso si se borra el código de producción.** Lo mismo en `create_product.test.ts` e `import_export.test.ts`.

`npm test` reporta **12 pass / 8 fail**. Los 12 que pasan son tautológicos; los 8 que fallan (`e2e_products_orders_audit.test.ts`) son los únicos que tocan Appwrite de verdad, y fallan por falta de credenciales locales.

**Conclusión: la cobertura previa real era cero.**

---

## Suite nueva — `npx vitest run`

**24 tests: 17 pasan, 7 fallan.** Los 7 fallos son intencionales: cada uno encoda un hallazgo confirmado. En Fase 2 deben pasar a verde.

### `tests/unit/commissions.test.ts` — 14 tests, **14 pasan**

Importa `src/lib/commissions/resolve.ts` y `src/lib/commissions.ts` reales.

| Test | Estado |
|---|---|
| Sin overrides gana la default | ✅ |
| Override por categoría > default | ✅ |
| Override por canillita > categoría | ✅ |
| canillita+categoría > todos | ✅ |
| Regla de otro canillita no se aplica | ✅ |
| Ignora reglas inactivas y vencidas | ✅ |
| Sin default activa lanza error | ✅ |
| Carrito mixto: cada categoría su regla | ✅ |
| Porcentaje en centavos, entero | ✅ |
| Redondeo con resto | ✅ |
| `monto_fijo` sin escalar | ✅ |
| `calculateAmount` (producción) == `resolve.ts` | ✅ |
| Comisión nunca mayor a la base | ✅ |
| Reversa anula exactamente el devengo | ✅ |

**Matiz importante:** `resolve.ts` está bien construido (respeta vigencias) **pero no es el código que corre en producción**. El checkout usa `evaluateCommissionRule` de `src/lib/commissions.ts:13`, que consulta Appwrite y **no filtra por `vigente_desde`/`vigente_hasta`** — solo por `activo`. Son dos implementaciones divergentes de la misma regla de negocio. Los tests de precedencia pasan sobre la implementación **que no se usa**.

### `tests/unit/nodeSession.test.ts` — 3 tests, **3 fallan** (hallazgo C-02)

| Test | Estado | Qué prueba |
|---|---|---|
| El valor no debe contener atributos de cookie | ❌ | `serializeActiveNodeCookie` devuelve un header completo |
| El valor guardado debe poder re-parsearse | ❌ | Round-trip roto |
| `createCheckout` debe reconstruir el nodo | ❌ | `JSON.parse` falla siempre |

### `tests/unit/pricing.test.ts` — 7 tests, **4 fallan**

| Test | Estado | Hallazgo |
|---|---|---|
| `precioDeVenta` prefiere la promo | ✅ | (regla esperada) |
| `precioDeVenta` ignora promos inválidas | ✅ | (regla esperada) |
| `createCheckout` debe considerar `precio_promocional` | ❌ | **C-03** |
| `precio_promocional` debe ser entero | ❌ | **C-06** |
| El form acepta emails válidos | ❌ | **A-04** |
| El form rechaza emails inválidos | ✅ | (rechaza todo, incluidos los válidos) |
| Alguna página debe montar `RegistrationForm` | ❌ | **A-01** |

---

## Otras verificaciones ejecutadas

| Comando | Resultado |
|---|---|
| `npx astro build` | ✅ Compila (exit 0) |
| `npx astro check` | ✅ **0 errores**, 439 hints |
| `npm audit` | ⚠️ **2 vulnerabilidades high**: `js-yaml`, `nanoid`. `npm audit fix` las resuelve |
| Linter | ❌ **No hay linter configurado.** No hay ESLint ni Biome en `package.json` |
| Grep de secretos en `dist/client/` | ✅ La API key **no** llega al bundle |
| `git log -S` sobre la API key | ❌ Presente en **21 archivos y 15 commits** |
| Lectura anónima de Appwrite (`curl` sin key) | ❌ `orders`, `pickup_points`, `commission_ledger`, `payouts`, `products`, `categories` **legibles públicamente** |
| Escritura anónima en Appwrite | ✅ Bloqueada (401) |
| Esquema real vs. repo | ❌ Derivado: la base tiene atributos e índices que los scripts no declaran |

---

## Lo que quedó sin verificar, y por qué

### Requiere credenciales que no debo tocar
- **Webhook real de Mercado Pago** (aprobado / pendiente / rechazado / cancelado / reembolsado). No hay `.env` local ni credenciales de sandbox. **La idempotencia del webhook y la validación de firma no fueron probadas en ejecución**; la ausencia de validación es evidente por lectura (`api/webhooks/mercadopago.ts:10-50`), pero no disparé un evento real ni un duplicado.
- **Cierre de ventana después de pagar.** Depende del webhook real.

### No hay código que probar
- **Reembolsos totales y parciales.** No existe ninguna ruta que los procese. `reembolsado` está en el enum de `orders` pero **ningún código lo escribe**. No es que falle: no está implementado.
- **Estados de MP distintos de `approved`.** El handler solo contempla `approved` (`mercadopago.ts:57`); el resto se ignora en silencio.

### Requiere entorno de carga
- **Condiciones de carrera de stock** (dos compras simultáneas del último producto). Por lectura, el descuento es `getDocument` + `updateDocument` sin transacción ni control optimista (`lib/commissions.ts:103-106`), lo que **sugiere sobreventa**, pero no lo confirmé ejecutando.

### E2E (Playwright) — no ejecutados
Los cuatro escenarios E2E pedidos —camino feliz con punto A, envío a domicilio sin comisión, atribución A→navegación→compra, y A→B→compra— **no se escribieron como tests ejecutables**, por dos razones:

1. **Requieren escribir en la base de producción.** Es el único Appwrite disponible (no hay entorno de staging ni `.env` local). Sembrar pedidos y asientos de comisión `TEST_` en la base real durante una auditoría de dinero es un riesgo que no asumí sin tu confirmación.
2. **Tres de los cuatro escenarios ya están respondidos por evidencia más fuerte.** No necesito simular la atribución: miré los **19 pedidos reales** y ninguno tiene `pickup_point_id` ni `origin_node_id`. Un E2E habría reproducido, con datos inventados, algo que los datos reales ya demuestran.

**Recomendación:** levantar un proyecto Appwrite de staging y recién ahí montar Playwright. Sin entorno aislado, un E2E de checkout es una operación de escritura sobre producción disfrazada de test.

---

## Deuda de testing pendiente para Fase 2

Además de poner en verde los 7 tests rojos:

1. **Tests de autorización por action** (cliente → ruta admin, canillita → datos de otro canillita, rol `gestion` → configuración). Requieren levantar el servidor Astro y golpear `/_actions/*` — se pueden hacer con Vitest + `fetch`, sin Playwright.
2. **Integración del webhook**: evento duplicado, fuera de orden, firma inválida. Se puede hacer con un mock del SDK de MP, sin credenciales.
3. **Recálculo de totales con carrito manipulado.** Nota: por lectura, esta es una de las cosas **bien hechas** — `createCheckout` solo recibe `{productId, cantidad}` y el precio nunca viaja desde el cliente. El test debe blindar esa propiedad para que no se rompa.
4. **Unificar las dos implementaciones de comisiones** y testear la que realmente corre.
5. **Configurar un linter** (no hay ninguno).
