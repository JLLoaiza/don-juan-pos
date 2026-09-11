# Prompt para Claude — Corrección frontend de <TÍTULO>

- **Estado:** `PENDING | READY | NOT_APPLICABLE`
- **Fecha:** `<YYYY-MM-DD>`

## Prompt listo para copiar

```text
Trabaja como especialista frontend de Don Juan POS/ERP y corrige el bug descrito
a continuación. Antes de editar, lee las instrucciones permanentes y los
documentos autoritativos indicados en este prompt. Inspecciona el código real y
preserva cualquier cambio preexistente del usuario.

BUG
<Descripción precisa>

RESULTADO ACTUAL
<Comportamiento observable>

RESULTADO ESPERADO
<Comportamiento verificable>

CAUSA RAÍZ Y EVIDENCIA
<Causa demostrada, archivos, símbolos y evidencia>

ALCANCE FRONTEND AUTORIZADO
<Pantallas, componentes y comportamiento permitidos>

CONTRATOS BACKEND REALES
<Rutas, métodos, payloads, respuestas, errores y ejemplos verificados>

CAMBIOS BACKEND YA REALIZADOS
<Cambios, migraciones, compatibilidad o No aplica>

ARCHIVOS PROBABLEMENTE AFECTADOS
<Rutas reales o claramente marcadas como candidatas>

CASOS LÍMITE Y MANEJO DE ERRORES
<401, 403, 404, 409, validación, loading, vacío, retry, offline, etc.>

PLAN REQUERIDO
1. Reproduce o demuestra el fallo antes de modificar.
2. Implementa el cambio mínimo que corrija la causa frontend.
3. Añade una prueba de regresión.
4. Ejecuta las verificaciones focalizadas y proporcionales al riesgo.
5. Revisa el diff y elimina cambios accidentales.
6. Actualiza los handoffs o documentación frontend vigentes.

RESTRICCIONES
- No modifiques backend.
- No inventes endpoints ni contratos.
- No uses mocks de producción para ocultar el problema.
- No cambies reglas de producto.
- No sobrescribas cambios ajenos.
- No hagas commit ni push salvo instrucción explícita.

CRITERIOS DE FINALIZACIÓN
<Lista verificable>

Al terminar, reporta causa, archivos cambiados, pruebas ejecutadas, resultados,
riesgos residuales y estado COMPLETE, PARTIAL o BLOCKED.
```
