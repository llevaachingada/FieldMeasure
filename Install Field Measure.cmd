@echo off
setlocal EnableExtensions
title Field Measure - installer

rem ---------------------------------------------------------------------------
rem  Install Field Measure.cmd - double-click to install (or update) Field Measure
rem  on this Windows PC and put a "Field Measure" shortcut on the desktop.
rem
rem  1. Installs Node.js 24 LTS with winget if it is missing (one Windows prompt).
rem  2. Copies this folder to %LOCALAPPDATA%\FieldMeasure\app, so the download
rem     folder can be deleted afterwards.
rem  3. Installs the app's parts (npm ci) and builds it (npm run build).
rem  4. Runs tools\launch-fieldmeasure.ps1, which makes the desktop shortcut and
rem     opens the app.
rem
rem  Run it again from a newer download to update. Projects are never touched:
rem  they live in Documents\FieldMeasure (or the folder you picked).
rem ---------------------------------------------------------------------------

set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"
set "APP=%LOCALAPPDATA%\FieldMeasure\app"
set "PATH=%ProgramFiles%\nodejs;%PATH%"

echo.
echo   Field Measure installer
echo   -----------------------
echo.

rem --- 1. Node.js 24 or newer -------------------------------------------------
call :checknode
if not errorlevel 1 goto nodeok
echo   Node.js 24 is needed. Installing it now (Windows may ask for permission)...
where winget >nul 2>&1
if errorlevel 1 goto nonode
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
call :checknode
if errorlevel 1 goto nonode
:nodeok
for /f "delims=" %%v in ('node -v') do echo   OK  Node.js %%v

rem --- 2. Stop a running copy, then copy the app into place --------------------
if exist "%APP%\tools\launch-fieldmeasure.ps1" (
  echo   Stopping any running Field Measure...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%\tools\launch-fieldmeasure.ps1" -Stop >nul 2>&1
)
if /i "%SRC%"=="%APP%" goto copied
echo   Copying the app to %APP% ...
robocopy "%SRC%" "%APP%" /MIR /XD node_modules dist .git /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo   !!  Copy failed. Close any open Field Measure windows and run this again.
  goto fail
)
:copied
echo   OK  app files in place

rem --- 3. Install the parts and build --------------------------------------------
cd /d "%APP%"
echo   Installing the app's parts (first time takes a few minutes)...
call npm.cmd ci --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo   !!  Installing parts failed. Check the internet connection and run this again.
  goto fail
)
echo   Building the app...
call npm.cmd run build >"%LOCALAPPDATA%\FieldMeasure\build.log" 2>&1
if errorlevel 1 (
  echo   !!  Build failed. Details: %LOCALAPPDATA%\FieldMeasure\build.log
  goto fail
)
echo   OK  built

rem --- 4. Desktop shortcut + first launch -----------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%APP%\tools\launch-fieldmeasure.ps1" -SkipBuild -InstallShortcut
if errorlevel 1 goto fail

echo.
echo   Done. From now on, double-click "Field Measure" on the desktop.
echo   You can delete the downloaded folder and ZIP.
echo.
pause
exit /b 0

:checknode
where node >nul 2>&1 || exit /b 1
node -e "process.exit(+process.versions.node.split('.')[0] >= 24 ? 0 : 1)"
exit /b %errorlevel%

:nonode
echo.
echo   !!  Could not install Node.js automatically.
echo       Opening the download page: install the "LTS" version with the default
echo       options, then double-click this installer again.
start "" "https://nodejs.org/en/download"
goto fail

:fail
echo.
pause
exit /b 1
