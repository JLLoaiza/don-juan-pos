[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$RepositoryPath,
  [ValidateRange(1,65535)][int]$LanPort = 3000,
  [string]$BindAddress = "0.0.0.0",
  [string]$CorsOrigins = ""
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path -LiteralPath $RepositoryPath).Path
$scriptRoot = Join-Path $repo "infra\edge-windows"
$compose = Join-Path $repo "infra\compose\docker-compose.edge-windows.yml"
$envFile = Join-Path $scriptRoot ".edge.env"
if (!(Test-Path -LiteralPath $compose)) { throw "No se encontró el compose operativo Edge en $compose." }
if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker Desktop no está instalado o no está en PATH." }
& docker info *> $null; if ($LASTEXITCODE) { throw "Docker Desktop no está en ejecución." }
function New-Secret([int]$Bytes = 48) { $buffer = [byte[]]::new($Bytes); [Security.Cryptography.RandomNumberGenerator]::Fill($buffer); return ([Convert]::ToHexString($buffer)).ToLowerInvariant() }
if (!(Test-Path -LiteralPath $envFile)) {
  $origins = if ($CorsOrigins) { $CorsOrigins } else { "http://localhost:$LanPort" }
  @(
    "EDGE_POSTGRES_DB=edge",
    "EDGE_POSTGRES_USER=donjuan",
    "EDGE_POSTGRES_PASSWORD=$(New-Secret 32)",
    "AUTH_JWT_SECRET=$(New-Secret 48)",
    "EDGE_INTERNAL_REPLICATION_SECRET=$(New-Secret 48)",
    "EDGE_API_BIND=$BindAddress",
    "EDGE_API_PORT=$LanPort",
    "CORS_ORIGINS=$origins",
    "# Cloud es opcional. Deje estos valores vacíos hasta enrolar esta sede.",
    "EDGE_SERVER_ID=",
    "EDGE_BRANCH_ID=",
    "EDGE_SERVER_TOKEN=",
    "CLOUD_SYNC_URL=",
    "CLOUD_IDENTITY_SYNC_URL="
  ) | Set-Content -LiteralPath $envFile -Encoding ascii
  # Only current user, local Administrators and SYSTEM may read secrets.
  & icacls $envFile /inheritance:r /grant:r "$env:USERNAME:(R,W)" "Administrators:(R)" "SYSTEM:(R)" *> $null
  if ($LASTEXITCODE) { throw "No se pudo restringir ACL de $envFile. El archivo fue creado; revise sus permisos antes de continuar." }
} else { Write-Host "Se conserva el archivo de secretos existente: $envFile" }
$composeArgs = @("compose", "--project-name", "don-juan-edge", "--env-file", $envFile, "-f", $compose)
& docker @composeArgs build api worker
if ($LASTEXITCODE) { throw "La construcción de imágenes Edge falló." }
& docker @composeArgs up -d postgres migrate
if ($LASTEXITCODE) { throw "No se pudo iniciar PostgreSQL/migraciones." }
& docker @composeArgs up -d api worker
if ($LASTEXITCODE) { throw "No se pudo iniciar API/worker Edge." }
$healthUrl = "http://127.0.0.1:$LanPort/health"
$deadline = (Get-Date).AddMinutes(3)
do { try { $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5; if ($health.status -eq "ok") { break } } catch {}; Start-Sleep -Seconds 3 } while ((Get-Date) -lt $deadline)
if (!$health -or $health.status -ne "ok") { & docker @composeArgs ps; throw "Edge no respondió saludable en $healthUrl. Revise: docker compose --project-name don-juan-edge --env-file `"$envFile`" -f `"$compose`" logs api" }
Write-Host "Edge operativo: $healthUrl"
Write-Host "PostgreSQL permanece interno a Docker; no existe puerto PostgreSQL en el host."
Write-Host "Cloud es opcional: este Edge opera localmente hasta que se complete el enrolamiento."
