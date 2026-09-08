# Integración — Fase 5 verificada en instalación limpia

Fecha: 2026-09-07

## Resultado

Fase 5 queda integrada satisfactoriamente entre backend `de7f54b` y frontend `8ece060`.

La validación se hizo en una base PostgreSQL temporal nueva, creada desde el árbol exacto de `de7f54b`. La migración local no confirmada `0024_sync_protocol_core.sql` no formó parte del árbol ni de la prueba.

## Instalación

El migrador aplicó exactamente:

`0001`, `0002`, `0003`, `0007`–`0023` y `0025_workforce_date_response_repair.sql`.

La segunda ejecución devolvió `[]`; por tanto la instalación limpia y su migrador son idempotentes. El defecto histórico que se había atribuido a `0009_identity_access.sql` no se reprodujo: `0009` se aplicó correctamente en esta instalación limpia.

## Validación

- Integraciones de negocio sobre la base limpia: **14/14**.
- HTTP de compras/personal: **3/3**.
- Frontend: **148/148**.
- Typecheck del workspace: correcto.

Se cubrieron compras, gastos, Kardex, empleados, turnos, bonos, pagos, anulaciones compensatorias, aislamiento de sucursal, idempotencia y el mapeo `DATE` de tarifas/turnos/bonos/pagos, incluido replay idempotente.

## Límites

Fase 6 no fue parte de esta integración. Sus cambios locales sin confirmar permanecen fuera de los commits y de la base limpia de Fase 5.
