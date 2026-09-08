[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$InstallPath,
  [Parameter(Mandatory)][string]$ReleaseRef,
  [ValidateRange(1,65535)][int]$LanPort = 3000,
  [string]$BindAddress = "0.0.0.0",
  [string]$CorsOrigins = ""
)
$ErrorActionPreference="Stop"
if ([string]::IsNullOrWhiteSpace($ReleaseRef)) { throw "-ReleaseRef es obligatorio: indique un tag o commit inmutable; main no se instala automáticamente." }
if ($ReleaseRef -eq "main") { throw "main no es un release permitido. Use un tag o SHA de commit explícito." }
if (!(Get-Command git -ErrorAction SilentlyContinue)) { throw "Git no está instalado o no está en PATH." }
if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker Desktop no está instalado o no está en PATH." }
& docker info *> $null; if ($LASTEXITCODE) { throw "Docker Desktop no está en ejecución." }
if (Test-Path -LiteralPath $InstallPath) { if ((Get-ChildItem -LiteralPath $InstallPath -Force | Measure-Object).Count -gt 0) { throw "La ruta de instalación ya contiene archivos: $InstallPath. El bootstrap no mezcla releases." } } else { New-Item -ItemType Directory -Path $InstallPath | Out-Null }
& git clone https://github.com/JLLoaiza/don-juan-pos.git $InstallPath
if ($LASTEXITCODE) { throw "No se pudo clonar el repositorio." }
Push-Location $InstallPath
try { & git checkout --detach $ReleaseRef; if ($LASTEXITCODE) { throw "ReleaseRef no existe o no se pudo resolver: $ReleaseRef" }; $resolved=& git rev-parse HEAD; Write-Host "Instalando release inmutable: $resolved"; & .\infra\edge-windows\Install-DonJuanEdge.ps1 -RepositoryPath $InstallPath -LanPort $LanPort -BindAddress $BindAddress -CorsOrigins $CorsOrigins } finally { Pop-Location }
