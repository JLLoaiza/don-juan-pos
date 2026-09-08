# Edge Windows operativo

Este paquete instala una sede como un servidor **Edge local**: API, PostgreSQL, migraciones y worker de impresión quedan en el mismo Docker Desktop. La sede continúa operando si Cloud o Internet no están disponibles. PostgreSQL no publica ningún puerto al host; sólo se expone la API LAN configurada.

## Instalación limpia

En PowerShell, con Git y Docker Desktop ejecutándose, elija una ruta vacía y un release inmutable (tag o SHA):

```powershell
.\infra\edge-windows\Bootstrap-DonJuanEdge.ps1 -InstallPath 'D:\DonJuan\edge' -ReleaseRef 'v1.0.0' -LanPort 3000
```

El bootstrap rechaza `main`, clona el repositorio oficial, hace checkout detached del release solicitado y delega al instalador. Este último genera `infra\edge-windows\.edge.env` una sola vez, con secretos criptográficos y ACL para el usuario actual, Administrators y SYSTEM. No copie ni comparta ese archivo.

Para instalar un checkout ya verificado:

```powershell
.\infra\edge-windows\Install-DonJuanEdge.ps1 -RepositoryPath 'D:\DonJuan\edge' -LanPort 3000
```

La comprobación se hace en `http://127.0.0.1:3000/health`. Las estaciones de la LAN usan `http://IP-DEL-EDGE:3000`; configure `-CorsOrigins` si la interfaz se sirve desde otro origen. Autorice sólo ese puerto en el firewall de Windows para la red privada.

## Operación y actualización

El compose operativo es `docker-compose.edge-windows.yml`; no incluye Vite ni el compose de desarrollo y usa el proyecto Docker `don-juan-edge`. Sus volúmenes `edge_postgres` y `edge_prints` persisten entre reinicios. Para actualizar, haga backup, instale un nuevo checkout con `Bootstrap-DonJuanEdge.ps1` apuntando a un **nuevo directorio** y un `-ReleaseRef` explícito, restaure el backup en la nueva instalación y valide `/health`. Nunca ejecute `down -v` en producción.

Cloud es opcional. Con `CLOUD_SYNC_URL`, credenciales y valores `EDGE_SERVER_*` vacíos, API, impresión y transacciones locales siguen disponibles. Tras enrolar la sede en Cloud, complete `EDGE_SERVER_ID`, `EDGE_BRANCH_ID`, `EDGE_SERVER_TOKEN`, `CLOUD_SYNC_URL` y `CLOUD_IDENTITY_SYNC_URL` en `.edge.env`, reinicie sólo `api` y `worker`; no se reinicializan datos ni volúmenes. Los valores se obtienen mediante el enrolamiento Cloud documentado en `LOCAL_FIRST.md` y nunca van al navegador.

## Backup y recuperación

```powershell
.\infra\edge-windows\Backup-DonJuanEdge.ps1 -RepositoryPath 'D:\DonJuan\edge'
.\infra\edge-windows\Restore-DonJuanEdge.ps1 -RepositoryPath 'D:\DonJuan\edge' -BackupPath 'D:\DonJuan\edge\infra\edge-windows\backups\don-juan-edge-YYYYMMDD-HHMMSS.dump' -Force
```

El backup es un `pg_dump` en formato PostgreSQL personalizado con SHA-256. Copie ambos archivos a un medio cifrado fuera del servidor. Restore verifica el archivo antes de detener API/worker, exige `-Force`, restaura en la base existente y vuelve a ejecutar migraciones idempotentes. Después compruebe `/health` y realice una prueba de login/operación antes de abrir la sede.

## Límites de responsabilidad

El operador debe aportar DNS/TLS si expone la API más allá de la LAN, reglas de firewall, UPS, copias externas cifradas y monitoreo del host/Docker Desktop. No se publica PostgreSQL, no se configura acceso entrante Cloud→Edge y no se debe instalar sobre volúmenes de desarrollo existentes.
