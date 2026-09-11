# Expedientes de funcionalidades

Cada subdirectorio de esta carpeta representa una funcionalidad real que está
siendo definida por el cluster descrito en `.agents/feature-cluster/README.md`.

No se guardan ejemplos ni documentos globales aquí. Para iniciar una feature, el
Feature Manager debe:

1. comprobar que no existe un expediente equivalente;
2. elegir un `<feature-slug>` estable;
3. copiar la estructura de `.agents/feature-cluster/templates/`;
4. sustituir todos los marcadores de la plantilla;
5. preservar la solicitud original del usuario;
6. iniciar el expediente con estado `DRAFT`.

La carpeta de una feature y su slug no se renombran después de que existan
referencias o handoffs, salvo decisión explícita registrada en `decisions.md`.
