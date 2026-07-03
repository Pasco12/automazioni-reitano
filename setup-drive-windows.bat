@echo off
setlocal

title Setup Reitano - Google Drive Safe Mode

set "PROJECT_DIR=%~dp0"
for %%I in ("%PROJECT_DIR%.") do set "PROJECT_NAME=%%~nxI"
set "DEPS_ROOT=C:\reitano-node-deps"
set "DEPS_DIR=%DEPS_ROOT%\%PROJECT_NAME%\node_modules"

echo.
echo ==========================================
echo  Reitano Automazioni - Setup sicuro Drive
echo ==========================================
echo.
echo Cartella progetto:
echo %PROJECT_DIR%
echo.
echo Le dipendenze node_modules saranno salvate fuori da Google Drive:
echo %DEPS_DIR%
echo.

cd /d "%PROJECT_DIR%"

echo [1/5] Rimuovo node_modules dalla cartella Drive, se presente...
if exist "node_modules" (
  rmdir /s /q "node_modules"
)

echo [2/5] Creo cartella locale dipendenze...
if not exist "%DEPS_DIR%" mkdir "%DEPS_DIR%"

echo [3/5] Creo collegamento node_modules verso cartella locale...
mklink /J "node_modules" "%DEPS_DIR%"
if errorlevel 1 (
  echo.
  echo ERRORE: non riesco a creare il collegamento.
  echo Prova ad aprire il Prompt dei comandi come Amministratore.
  pause
  exit /b 1
)

echo [4/5] Pulisco cache npm...
npm cache clean --force

echo [5/5] Installo dipendenze...
npm install
if errorlevel 1 (
  echo.
  echo ERRORE durante npm install.
  echo Controlla connessione internet, permessi e antivirus.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo  Setup completato.
echo  Ora puoi avviare con start-drive-windows.bat
echo ==========================================
echo.
pause
