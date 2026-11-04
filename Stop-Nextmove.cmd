@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0.runtime\node.exe" (
  "%~dp0.runtime\node.exe" scripts\launch-local.mjs --stop
) else (
where node >nul 2>nul
if not errorlevel 1 (
  node scripts\launch-local.mjs --stop
) else (
  echo Install Node.js 22.13 or newer from https://nodejs.org.
  pause
  exit /b 1
)
)
if errorlevel 1 pause
