# Desarrollo local-first

`docker-compose.local-first.yml` levanta dos instalaciones deliberadamente separadas: `cloud-*` y `edge-*`. La base Edge continúa siendo la autoridad compartida de la sede y se puede desconectar de `cloud-api` sin afectar API, PostgreSQL ni worker de impresión locales.

Para enrolar: inicie Cloud, cree un token de un solo uso con `POST /replication/cloud/enrollment-tokens` autenticado como administrador de la sede, reclame el token en `POST /replication/cloud/enroll`, y guarde los tres valores devueltos (`edgeServerId`, `branchId`, `edgeServerToken`) como `EDGE_SERVER_ID`, `EDGE_BRANCH_ID`, `EDGE_SERVER_TOKEN` en el entorno del Edge. Configure además un secreto no vacío `EDGE_INTERNAL_REPLICATION_SECRET` para el canal local worker→API de snapshot de identidades.

No exponga PostgreSQL ni el endpoint interno Edge en una red pública. El Edge abre las conexiones salientes a Cloud; Cloud no inicia conexiones hacia la sede.