@echo off
rem ==================================================================
rem  Sky Ace - copy game assets to SkyAce-Web\assets
rem  Source : ..\SkyAce\app\src\main\assets   (relative to this folder)
rem  Target : .\assets                         (created if missing)
rem  Mirrors the assets (removes files deleted from the source)
rem ==================================================================
setlocal
rem run from this bat file's folder so relative paths always work
pushd "%~dp0"

set "SRC=..\SkyAce\app\src\main\assets"
set "DST=.\assets"

if not exist "%SRC%\index.html" (
  echo [ERROR] source folder not found: %SRC%
  popd
  pause
  exit /b 1
)

if not exist "%DST%" (
  mkdir "%DST%"
  echo Created folder: %DST%
)

echo Copying assets...
echo   from: %SRC%
echo   to  : %DST%
echo.
robocopy "%SRC%" "%DST%" /MIR /NJH /NP /NDL
if %ERRORLEVEL% GEQ 8 (
  echo.
  echo [ERROR] copy failed (robocopy code %ERRORLEVEL%^)
  popd
  pause
  exit /b 1
)

echo.
echo [OK] Done. Files in %DST%:
dir /b "%DST%"
echo.
popd
endlocal
