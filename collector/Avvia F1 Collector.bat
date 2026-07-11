@echo off
setlocal enableextensions enabledelayedexpansion
title F1 Telemetry Collector
cd /d "%~dp0"

REM ============================================================
REM  Avvio "a un click" del collector telemetria F1 25.
REM  Al primo avvio scarica da se' il motore Node (portable),
REM  poi avvia il collector e apre la vista live nel browser.
REM  Non serve installare nulla a mano.
REM ============================================================

REM Versione di Node da scaricare (aggiornabile qui in un punto solo).
set "NODE_VERSION=v22.11.0"
set "NODE_DIR=node-%NODE_VERSION%-win-x64"
set "NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_DIR%.zip"
set "NODE_EXE=%~dp0runtime\node.exe"

cls
echo ============================================================
echo     F1 Telemetry Collector
echo ============================================================
echo.

REM --- 1) Motore Node gia' scaricato in precedenza? ---
if exist "%NODE_EXE%" (
  echo [OK] Motore gia' presente.
  echo.
  goto run
)

REM --- 2) C'e' un Node di sistema >= 18? Se si', usiamo quello. ---
set "SYS_NODE="
for /f "delims=" %%v in ('node -v 2^>nul') do set "SYS_NODE=%%v"
if defined SYS_NODE (
  set "SV=!SYS_NODE:v=!"
  for /f "tokens=1 delims=." %%m in ("!SV!") do set "MAJOR=%%m"
  if !MAJOR! GEQ 18 (
    set "NODE_EXE=node"
    echo [OK] Uso Node gia' installato sul PC ^(!SYS_NODE!^).
    echo.
    goto run
  )
)

REM --- 3) Scarica il motore Node portable (una volta sola) ---
echo Prima configurazione: scarico il motore Node ^(~30 MB, una volta sola^).
echo Attendere: puo' richiedere 1-2 minuti in base alla connessione.
echo.
if not exist "runtime" mkdir "runtime"

set "DL_OK="
where curl >nul 2>nul
if !errorlevel! EQU 0 (
  curl -L --fail --progress-bar -o "runtime\node.zip" "%NODE_URL%"
  if !errorlevel! EQU 0 set "DL_OK=1"
)
if not defined DL_OK (
  echo Uso PowerShell per il download...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri '%NODE_URL%' -OutFile 'runtime\node.zip' } catch { exit 1 }"
  if !errorlevel! EQU 0 set "DL_OK=1"
)
if not defined DL_OK goto dl_error
if not exist "runtime\node.zip" goto dl_error

echo.
echo Estrazione in corso...
set "EX_OK="
where tar >nul 2>nul
if !errorlevel! EQU 0 (
  pushd "runtime" & tar -xf "node.zip" & popd
  if exist "runtime\%NODE_DIR%\node.exe" set "EX_OK=1"
)
if not defined EX_OK (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -Force 'runtime\node.zip' 'runtime' } catch { exit 1 }"
  if exist "runtime\%NODE_DIR%\node.exe" set "EX_OK=1"
)
if not defined EX_OK goto extract_error

REM Teniamo solo node.exe (basta per eseguire lo script), il resto si elimina.
copy /y "runtime\%NODE_DIR%\node.exe" "runtime\node.exe" >nul
del /q "runtime\node.zip" >nul 2>nul
rmdir /s /q "runtime\%NODE_DIR%" >nul 2>nul
set "NODE_EXE=%~dp0runtime\node.exe"
echo [OK] Motore Node pronto.
echo.
goto run

:run
REM --- config.json: se manca, la creiamo dal modello (caso admin) ---
if not exist "config.json" if exist "config.example.json" (
  copy /y "config.example.json" "config.json" >nul
  echo [ATTENZIONE] config.json non trovato: creato dal modello.
  echo             L'amministratore deve inserire URL del sito e token.
  echo.
)

echo ------------------------------------------------------------
echo  Avvio del collector.
echo  - LASCIA APERTA questa finestra mentre giochi.
echo  - Per fermarlo: chiudi la finestra.
echo  - Vista live nel browser: http://localhost:4600
echo ------------------------------------------------------------
echo.

REM Apri il browser sulla vista live dopo qualche secondo (non blocca l'avvio).
start "" /b cmd /c "ping -n 5 127.0.0.1 >nul & start http://localhost:4600"

REM Avvia il collector (resta in primo piano: la finestra mostra i log).
"%NODE_EXE%" "src\index.js"

echo.
echo Il collector si e' fermato. Premi un tasto per chiudere.
pause >nul
goto :eof

:dl_error
echo.
echo [ERRORE] Download del motore Node non riuscito.
echo Controlla la connessione a Internet e riprova ad avviare.
echo In alternativa installa Node LTS da https://nodejs.org e riavvia questo file.
echo.
pause
goto :eof

:extract_error
echo.
echo [ERRORE] Estrazione del motore Node non riuscita.
echo Riprova ad avviare, oppure installa Node LTS da https://nodejs.org
echo.
pause
goto :eof
