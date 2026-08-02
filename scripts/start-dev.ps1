# FinTracker 开发环境一键启动脚本
# 用法: powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1
# 作用: 依次确保 PostgreSQL / 后端 / 前端 都在运行

$ErrorActionPreference = 'Continue'

$Repo   = Split-Path -Parent $PSScriptRoot
$PgBin  = "$env:LOCALAPPDATA\Programs\PostgreSQL\18\pgsql\bin"
$PgData = "$env:LOCALAPPDATA\PostgreSQL\data"
$PgLog  = "$env:LOCALAPPDATA\PostgreSQL\pg.log"
$NodeDir = "$env:LOCALAPPDATA\Programs\nodejs"
$CargoBin = "$env:USERPROFILE\.cargo\bin"
$BackendExe = "$Repo\backend\target\debug\fintracker-backend.exe"
$FrontendDir = "$Repo\frontend"

$env:PATH = "$CargoBin;$PgBin;$NodeDir;$env:PATH"

# 1. PostgreSQL
if (-not (Get-Process postgres -ErrorAction SilentlyContinue)) {
    Write-Host "[1/3] 启动 PostgreSQL ..."
    & "$PgBin\pg_ctl.exe" -D $PgData -l $PgLog -o "-p 5432" start
} else {
    Write-Host "[1/3] PostgreSQL 已在运行"
}

# 2. 后端 (Rust Axum, 端口 8080)
if (-not (Get-Process fintracker-backend -ErrorAction SilentlyContinue)) {
    if (-not (Test-Path $BackendExe)) {
        Write-Host "[2/3] 首次编译后端（较慢，请稍候）..."
        Push-Location "$Repo\backend"
        & cargo build
        Pop-Location
    }
    Write-Host "[2/3] 启动后端 (http://localhost:8080) ..."
    Start-Process -FilePath $BackendExe -WorkingDirectory "$Repo\backend" -WindowStyle Hidden
} else {
    Write-Host "[2/3] 后端已在运行 (http://localhost:8080)"
}

# 3. 前端 (Vite, 端口 3000)
$portBusy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $portBusy) {
    Write-Host "[3/3] 启动前端 (http://localhost:3000) ..."
    Start-Process -FilePath "$NodeDir\node.exe" `
        -ArgumentList ".\node_modules\vite\bin\vite.js","--port","3000" `
        -WorkingDirectory $FrontendDir -WindowStyle Hidden
} else {
    Write-Host "[3/3] 前端已在运行 (http://localhost:3000)"
}

Start-Sleep -Seconds 3
Write-Host ""
Write-Host "FinTracker 已就绪:"
Write-Host "  前端页面  http://localhost:3000"
Write-Host "  后端健康  http://localhost:8080/api/health"
