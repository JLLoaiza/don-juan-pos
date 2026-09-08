[CmdletBinding()]
param([Parameter(Mandatory)][string]$RepositoryPath,[string]$DestinationPath="")
$ErrorActionPreference="Stop"
$repo=(Resolve-Path -LiteralPath $RepositoryPath).Path; $root=Join-Path $repo "infra\edge-windows"; $envFile=Join-Path $root ".edge.env"; $compose=Join-Path $repo "infra\compose\docker-compose.edge-windows.yml"
if (!(Test-Path $envFile)) { throw "No existe .edge.env; esta ruta no parece una instalación Edge." }; if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker no está disponible." }
if (!$DestinationPath) { $DestinationPath=Join-Path $root "backups" }; New-Item -ItemType Directory -Force -Path $DestinationPath | Out-Null
$stamp=Get-Date -Format "yyyyMMdd-HHmmss"; $target=Join-Path (Resolve-Path $DestinationPath) "don-juan-edge-$stamp.dump"; $args=@("compose","--project-name","don-juan-edge","--env-file",$envFile,"-f",$compose)
$container=(& docker @args ps -q postgres).Trim(); if (!$container) { throw "PostgreSQL Edge no está en ejecución." }
& docker exec $container pg_dump -U donjuan -d edge -Fc -f /tmp/don-juan-edge.dump; if ($LASTEXITCODE) { throw "pg_dump falló; el backup no fue creado." }
& docker cp "${container}:/tmp/don-juan-edge.dump" $target; if ($LASTEXITCODE -or !(Test-Path $target) -or (Get-Item $target).Length -eq 0) { Remove-Item -LiteralPath $target -ErrorAction SilentlyContinue; throw "No se pudo verificar la copia del backup." }
& docker exec $container rm -f /tmp/don-juan-edge.dump
$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash; "$hash  $([IO.Path]::GetFileName($target))" | Set-Content -LiteralPath "$target.sha256" -Encoding ascii
Write-Host "Backup verificado: $target"; Write-Host "SHA-256 guardado junto al backup. Guárdelo fuera del servidor Edge."
