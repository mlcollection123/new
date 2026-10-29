@echo off
title VATcube Leads Generator
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto nonode
start "VATcube Leads Generator" /min node --disable-warning=ExperimentalWarning agent.cjs dashboard --open
timeout /t 6 >nul
powershell -NoProfile -Command "try{Invoke-WebRequest http://127.0.0.1:4000 -UseBasicParsing -TimeoutSec 3 | Out-Null}catch{exit 1}"
if errorlevel 1 goto failed
exit /b
:failed
echo The agent did not start. This is the error:
echo.
node --disable-warning=ExperimentalWarning agent.cjs dashboard
echo.
pause
exit /b
:nonode
echo Node.js 22.13 or newer is needed. It is a free one-time install.
echo Opening the download page. Install the LTS version, then run this file again.
start https://nodejs.org/en/download
pause
