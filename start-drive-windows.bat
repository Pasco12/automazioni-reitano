@echo off
setlocal

title Avvio Reitano Automazioni

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo.
echo ==========================================
echo  Avvio Reitano Automazioni
echo ==========================================
echo.

if not exist "package.json" (
  echo ERRORE: package.json non trovato.
  echo Avvia questo file dalla cartella principale del progetto.
  pause
  exit /b 1
)

if not exist "node_modules\dotenv\package.json" (
  echo node_modules non trovato o incompleto.
  echo Eseguo setup-drive-windows.bat...
  call "%PROJECT_DIR%setup-drive-windows.bat"
)

echo.
echo Apro il server...
echo Se tutto va bene apri: http://localhost:3000
echo.
npm start

pause
