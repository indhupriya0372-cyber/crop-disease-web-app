@echo off
REM ==========================================================
REM  AgriCare AI - one-click launcher
REM  Finds a free port automatically and opens the browser.
REM ==========================================================
setlocal
cd /d "%~dp0"

set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (
  where py >nul 2>nul && set "PY=py -3"
)
if not defined PY (
  echo [ERROR] Python not found. Install Python 3.10+ and tick "Add to PATH".
  pause
  exit /b 1
)

REM Find a free port starting at 5000
set "PORT="
for %%P in (5000 5050 5055 5056 5100 8000 8080) do (
  if not defined PORT (
    netstat -ano | find "LISTENING" | find ":%%P " >nul 2>nul || set "PORT=%%P"
  )
)

if not defined PORT (
  echo [ERROR] Could not find a free port. Set one manually:
  echo         set PORT=5055
  echo         .venv\Scripts\python.exe app.py
  pause
  exit /b 1
)

echo.
echo  ==========================================
echo   AgriCare AI
echo   Starting on port %PORT%
echo  ==========================================
echo.
echo   Admin  -> admin@agricare.ai  / admin123
echo   Farmer -> farmer@agricare.ai / farmer123
echo.
echo   Opening http://127.0.0.1:%PORT% ...
echo   Keep this window open while you use the app.
echo   Press Ctrl+C to stop.
echo.

start "" "http://127.0.0.1:%PORT%"

REM Give the server a moment so the browser does not show an error first
timeout /t 2 /nobreak >nul

set "PORT=%PORT%"
%PY% app.py

endlocal
