@echo off
REM ---------------------------------------------------------------------------
REM Starts the Vite dev server (http://localhost:5173).
REM
REM This is a .cmd batch file on purpose: PowerShell's script-execution policy
REM does NOT apply to .cmd/.bat files (only to .ps1 scripts). So this runs even
REM when `npm run dev` is blocked by "running scripts is disabled on this system".
REM
REM Run it with:  .\dev.cmd     (or just double-click it in Explorer)
REM ---------------------------------------------------------------------------
cd /d "%~dp0"

REM Make sure Node is reachable even if this window predates the Node install.
set "PATH=C:\Program Files\nodejs;%PATH%"

echo Starting Vite dev server on http://localhost:5173 ...
echo (Make sure the backend is running too: in the bodiala folder run  dev.ps1 )
echo.
call npm.cmd run dev
