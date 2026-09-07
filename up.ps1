[CmdletBinding()]
param(
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$rootDirectory = Split-Path -Parent $PSCommandPath
$composeFile = Join-Path $rootDirectory 'infra\compose\docker-compose.yml'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is required but was not found in PATH.'
}

function Invoke-Docker {
    param([string[]]$Arguments)

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed with exit code $LASTEXITCODE."
    }
}

Invoke-Docker -Arguments @('compose', 'version')

Push-Location $rootDirectory
try {
    $upArguments = @('compose', '-f', $composeFile, 'up', '--detach')
    if (-not $NoBuild) {
        $upArguments += '--build'
    }

    Invoke-Docker -Arguments $upArguments
    Invoke-Docker -Arguments @('compose', '-f', $composeFile, 'ps')
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Ready to test:'
Write-Host '  PWA:        http://localhost:5173'
Write-Host '  API health: http://localhost:3000/health'
Write-Host '  PostgreSQL: localhost:5433'
Write-Host ''
Write-Host 'To stop the stack: docker compose -f infra/compose/docker-compose.yml down'
