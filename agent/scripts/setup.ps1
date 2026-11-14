param([string]$Python = 'py')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$projectTemp = Join-Path $projectRoot '.cache\tmp'
New-Item -ItemType Directory -Force -Path $projectTemp | Out-Null
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
try {
    $env:TEMP = $projectTemp
    $env:TMP = $projectTemp
    $venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $venvPython)) {
        if ($Python -eq 'py') { & $Python -3.12 -m venv .venv }
        else { & $Python -m venv .venv }
        if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o ambiente. Conferir o Python 3.12.' }
    }
    & $venvPython -m pip --version
    if ($LASTEXITCODE -ne 0) {
        & $venvPython -m ensurepip --upgrade
        if ($LASTEXITCODE -ne 0) { throw 'Não foi possível preparar o pip.' }
    }
    if (Test-Path -LiteralPath 'requirements.lock') {
        & $venvPython -m pip install --cache-dir .cache/pip -r requirements.lock -e '.[dev]'
    } else {
        & $venvPython -m pip install --cache-dir .cache/pip -e '.[dev]'
    }
    if ($LASTEXITCODE -ne 0) { throw 'Instalação falhou. Conferir acesso de rede e guia.' }
    if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
    & $venvPython -m translog.cli doctor
    if ($LASTEXITCODE -ne 0) { throw 'Conferir a configuração indicada pelo diagnóstico.' }
    Write-Output 'Ambiente preparado. A chave e o conteúdo revisado continuam sob responsabilidade do grupo.'
} finally {
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
}
