# Handoff — Claude (frontend), cierre de Fase 4

## Estado

Fase 4 — Cobro y Caja (frontend): **COMPLETE** contra los ocho contratos/rutas reales que este ciclo pidió consumir. No se avanzó a Fase 5.

## Rutas consumidas (todas reales, ninguna mockeada)

| Ruta | Uso |
| --- | --- |
| `GET /accounts/:id/billing` | Snapshot de cobro (pagado, saldo, descuentos, servicio, pagos) |
| `POST /accounts/:id/discounts` | Aplicar descuento a la cuenta |
| `PUT /accounts/:id/service` | Configurar porcentaje de servicio |
| `GET /payment-methods` | Selector de método de pago (nombres, nunca UUIDs) |
| `POST /accounts/:id/payments` | Registrar pago (efectivo con caja+recibido+cambio, tarjeta/QR sin esos campos) |
| `GET /cash-registers` | Listado de cajas de la sucursal + su sesión abierta |
| `GET /cash-registers/:id/open-session` | Publicado por Codex; no se llama directo porque `GET /cash-registers` ya incluye `openSession` embebido — evita una segunda petición redundante en el flujo normal |
| `POST /cash-sessions` | Abrir caja |
| `POST /cash-sessions/:id/adjustments` | Ajustar efectivo (ingreso/retiro) de una sesión abierta |
| `POST /cash-sessions/:id/close` | Cerrar caja con efectivo contado; el servidor calcula esperado y diferencia |

## Pantallas y componentes

- **`/floor/accounts/:id` → sección "Cobro"** (`apps/web/src/features/floor/BillingSection.tsx` + `PaymentForm.tsx`): además de lo ya existente (descuento, servicio), ahora incluye el formulario de registrar pago. Al elegir un método `CASH` se despliegan el selector de caja (solo cajas con sesión abierta, por nombre) y el campo de efectivo recibido, con un cambio *estimado* mostrado como ayuda visual (`cashReceived - amountApplied`, calculado en el navegador únicamente para mostrarlo antes de enviar); el cambio real que se persiste y se muestra después viene siempre de la respuesta del servidor. Métodos `CARD`/`QR` nunca envían `cashReceived` ni `cashSessionId` (se omiten del payload, no se mandan como `null`, porque el backend rechaza `cashReceived` en pagos no-CASH).
- **`/cash` → pantalla completa nueva** (`apps/web/src/features/cash/`): reemplaza el placeholder. Lista todas las cajas de la sucursal (`CashRegisterCard.tsx`) con badge Abierta/Cerrada; por caja, según permiso: abrir sesión (`OpenSessionForm.tsx`), ajustar efectivo (`AdjustmentForm.tsx`, dirección Ingreso/Retiro), o cerrar caja (`CloseSessionForm.tsx`, efectivo contado + nota de que el servidor calcula lo esperado y la diferencia). Al cerrar, se muestra un banner con Esperado/Contado/Diferencia tomado tal cual de la respuesta.

## Reglas de la tarea, verificadas una por una

- **Compañía/sucursal nunca se envían ni se muestran**: ningún payload nuevo incluye esos campos; se derivan siempre de la sesión, igual que el resto de la app.
- **Selectores por nombre, nunca UUID manual**: método de pago (`Efectivo`/`Tarjeta`/`QR` + nombre), caja (`register.name`), todo poblado desde los `GET` correspondientes.
- **`Idempotency-Key` UUID en todo comando**: los seis comandos mutantes (`applyDiscount`, `configureService`, `registerPayment`, `openCashSession`, `adjustCashSession`, `closeCashSession`) generan un `crypto.randomUUID()` por intento vía el mismo helper ya usado en Fase 2/3.
- **401/403/409/validación manejados con claridad**: se agregó `apps/web/src/features/shared/commandErrorMessage.ts`, un helper único que todos los formularios de cobro/caja usan (incluidos los de Fase 4 previa, `DiscountForm`/`ServiceForm`, que antes solo mostraban `error.message` crudo). Un `409` muestra un mensaje explícito y dispara automáticamente `reload()` del snapshot correspondiente (vía `onConflict`) sin cerrar el formulario, así el siguiente intento ya lleva la `version` fresca porque el formulario la lee de un prop, no de estado propio.
- **Recarga tras cada mutación**: cada `onSubmit` exitoso llama `onChanged()`, que recarga cobro + cuenta (para que `accounts.version` se mantenga sincronizado entre Fase 3 y Fase 4) o la lista de cajas, según corresponda.
- **Invalidación al cambiar de sucursal**: `useCashRegisters` sigue el mismo patrón que `useCatalog`/`useFloor` — depende de `activeBranch.id` y se recarga solo con eso cambia.
- **El backend es la autoridad**: ningún monto, permiso, estado de sesión o cálculo de efectivo se decide en el navegador. La única excepción es el "cambio estimado" del formulario de pago, explícitamente marcado como estimado y sustituido por el valor real del servidor en cuanto responde.

## Dos bugs de contrato/backend encontrados y corregidos durante la verificación en vivo

No estaban en el alcance original de "solo consumir contratos", pero bloqueaban por completo el punto 6 del pedido ("cierre de caja... con diferencia"), así que los corregí con el mínimo cambio posible y los documento aquí para que Codex/ChatGPT los revisen:

1. **`packages/contracts/src/billing.ts` — `CashSessionSchema.difference` usaba `MoneySchema` (no-negativo)**, pero `apps/api/src/billing.ts` calcula `difference = countedCash - expected`, que es legítimamente negativo cuando falta efectivo (caja corta). El backend ya devolvía el valor correcto (`-500.00` en mi prueba); el frontend simplemente no podía *parsear* esa respuesta válida y mostraba "No se pudo cerrar la caja" pese a que el cierre sí se había guardado en la base de datos — un false negative confuso para el cajero. Cambié ese campo a un nuevo `SignedMoneySchema` (alias de `DecimalStringSchema`, ya publicado) en la misma línea; no toqué ningún otro campo ni la forma del resto del contrato. Confirmado en vivo: abrir con 50000, cerrar con 48750 contados → banner "Esperado 50000 · Contado 48750 · Diferencia -1250".
2. **Bug propio (no de contrato): estado de UI perdido al recargar.** `CashRegisterCard` guardaba el resultado del cierre (`lastClosed`) en su propio estado local; como `reload()` hace que `CashPage` retorne `<LoadingState/>` mientras recarga la lista, la tarjeta se desmontaba y el banner de confirmación desaparecía antes de que el usuario lo viera, aunque el cierre sí se había registrado. Lo subí a `CashPage` (mismo patrón que `lastResult` en `AccountPage`, que sí sobrevive porque vive en el componente que persiste). Verificado en vivo tras el fix: el banner "Caja cerrada — Esperado/Contado/Diferencia" ahora se ve correctamente.

Ambos arreglos están cubiertos por `pnpm -w typecheck` y `pnpm -w test` (sin regresiones en las pruebas de Codex) y verificados contra la API real, no solo con mocks.

## Tests ejecutados

- `pnpm --filter @don-juan/web test`: **139/139**. Nuevos: `billingApi.test.ts` (+2: `getPaymentMethods` desenvuelve el `{ paymentMethods }`, `registerPayment` con Idempotency-Key), `cashApi.test.ts` (nuevo, 5 pruebas: las cinco funciones de `cashApi.ts`), `CashPage.test.tsx` (nuevo, 7 pruebas: loading, forbidden/network, vacío, listado con permisos, abrir/ajustar/cerrar caja end-to-end con el resumen de cierre), `AccountPage.test.tsx` (+5: botón de pago visible solo con `payments.create` y saldo pendiente, pago con tarjeta sin campos de efectivo, bloqueo de envío sin caja abierta para efectivo, pago en efectivo con caja+cambio).
- `pnpm -w typecheck` y `pnpm -w test`: correctos en todo el workspace, incluidas las pruebas de `apps/api` (32 pasaron, ninguna rota por el fix de `difference`).

## Verificación manual (API + PostgreSQL reales, no solo mocks)

Contra el seed de desarrollo (`Caja Principal`, métodos Efectivo/Tarjeta/QR de la migración `0020`, aplicada manualmente vía `psql` porque el migrador también recogería la migración `0019` de Fase 5 —pausada y sin confirmar— si corriera; ver nota abajo):

1. Abrí caja con monto inicial 100000 → aparece "Abierta" con el monto.
2. Ajusté +5000 (Ingreso) → sin error, formulario se cierra.
3. Cerré con 104500 contados → esperado 105000, diferencia -500 (antes del fix, esto fallaba con "No se pudo cerrar la caja" pese a guardarse bien).
4. Repetí abrir (50000) → cerrar (48750) tras el fix → banner correcto "Esperado 50000 · Contado 48750 · Diferencia -1250", visible y persistente.
5. Abrí una nueva sesión (100000) y fui a la cuenta de Mesa 1 (que ya tenía descuento 10% y servicio 10% de un ciclo anterior, total 512.82): "Registrar pago" → selector mostró Efectivo/Tarjeta/QR por nombre → elegí Efectivo, caja "Caja Principal" por nombre, efectivo recibido 520 → pago registrado con cambio 7.18 (520-512.82, calculado por el servidor), cuenta pasó a "Pagada", saldo a 0, descuentos/servicio/agregar consumo desaparecieron, y la Mesa 1 volvió a "Disponible" en `/floor`.

Sin errores nuevos en consola ni en la red durante todo el flujo.

## Nota operativa importante

`infra/db/migrations/0019_procurement_integrity.sql` sigue sin confirmar (Fase 5, pausada por instrucción del usuario). No lo apliqué al ejecutar el migrador porque habría quedado registrado en `schema_migrations` con checksum antes de que Codex lo termine, bloqueando futuras ediciones de ese archivo. Para probar Fase 4 apliqué el contenido de `0020_development_cash_seed.sql` directamente vía `psql` (es puramente aditivo e idempotente, `ON CONFLICT DO NOTHING`), sin tocar `schema_migrations`. Cuando Codex confirme `0019` y se corra el migrador normalmente, `0020` se re-aplicará sin problema (mismo `ON CONFLICT DO NOTHING`).

## Lo que NO se tocó (fuera del alcance de este pedido)

- Divisiones de cuenta (`sales.split`, `POST /accounts/:id/splits`) — sigue sin ruta en `apps/api`.
- `/billing` como pantalla de nivel superior sigue siendo el placeholder: no hay endpoint de "cuentas pendientes de cobro" para darle contenido propio; el cobro real vive dentro de cada cuenta.

## Siguiente fase frontend esperada

Ninguna por ahora — Fase 4 frontend queda `COMPLETE`. No avanzo a Fase 5 (pausada explícitamente hasta integración de Fase 4).
