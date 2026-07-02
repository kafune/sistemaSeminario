# Sobe o ambiente de desenvolvimento completo (banco + backend + frontend).
# Uso:  powershell -File start-dev.ps1

$raiz = $PSScriptRoot
$mariadb = Join-Path $raiz "tools\mariadb-11.4.5-winx64\bin\mysqld.exe"
$node = Join-Path $raiz "tools\node-v22.14.0-win-x64"
$venv = Join-Path $raiz ".venv\Scripts"

# 1. Banco (se ainda nao estiver rodando)
$tn = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -WarningAction SilentlyContinue
if (-not $tn.TcpTestSucceeded) {
    Write-Host "Iniciando MariaDB..."
    Start-Process -FilePath $mariadb -ArgumentList "--datadir=$raiz\tools\data", "--port=3306", "--console" -WindowStyle Minimized
    Start-Sleep -Seconds 4
} else {
    Write-Host "MariaDB ja esta rodando."
}

# 2. Backend FastAPI em http://localhost:8000
Write-Host "Iniciando backend (http://localhost:8000)..."
Start-Process -FilePath (Join-Path $venv "uvicorn.exe") -ArgumentList "app.main:app", "--port", "8000", "--reload" -WorkingDirectory (Join-Path $raiz "backend") -WindowStyle Minimized

# 3. Frontend Vite em http://localhost:5173
Write-Host "Iniciando frontend (http://localhost:5173)..."
$env:PATH = "$node;$env:PATH"
Start-Process -FilePath (Join-Path $node "npm.cmd") -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $raiz "frontend") -WindowStyle Minimized

Start-Sleep -Seconds 3
Write-Host ""
Write-Host "Pronto! Abra http://localhost:5173 no navegador."
Start-Process "http://localhost:5173"
