[CmdletBinding(SupportsShouldProcess)]
param([Parameter(Mandatory)][string]$RepositoryPath,[Parameter(Mandatory)][string]$BackupPath,[switch]$Force)
$ErrorActionPreference="Stop"
if (!$Force) { throw "Restore reemplaza los datos locales. Revise el backup y vuelva a ejecutar con -Force." }
$repo=(Resolve-Path -LiteralPath $RepositoryPath).Path; $backup=(Resolve-Path -LiteralPath $BackupPath).Path; $root=Join-Path $repo "infra\edge-windows"; $envFile=Join-Path $root ".edge.env"; $compose=Join-Path $repo "infra\compose\docker-compose.edge-windows.yml"
if (!(Test-Path $envFile)) { throw "No existe .edge.env." }; if ((Get-Item $backup).Length -eq 0) { throw "El backup está vacío." }
$args=@("compose","--project-name","don-juan-edge","--env-file",$envFile,"-f",$compose); $container=(& docker @args ps -q postgres).Trim(); if (!$container) { throw "PostgreSQL Edge no está en ejecución." }
& docker cp $backup "${container}:/tmp/restore.dump"; if ($LASTEXITCODE) { throw "No se pudo copiar el backup al contenedor." }
& docker exec $container pg_restore --list /tmp/restore.dump *> $null; if ($LASTEXITCODE) { throw "El archivo no es un backup PostgreSQL válido." }
& docker @args stop api worker; if ($LASTEXITCODE) { throw "No se pudieron detener API/worker para restaurar." }
try { & docker exec $container pg_restore -U donjuan -d edge --clean --if-exists --no-owner /tmp/restore.dump; if ($LASTEXITCODE) { throw "La restauración falló; API/worker continúan detenidos para evitar escrituras." }; & docker @args up -d migrate api worker; if ($LASTEXITCODE) { throw "Datos restaurados, pero no se pudo iniciar completamente el Edge." } } finally { & docker exec $container rm -f /tmp/restore.dump *> $null }
Write-Host "Restauración terminada. Confirme GET /health antes de reabrir el POS."
