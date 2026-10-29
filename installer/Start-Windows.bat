@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto nonode
node --disable-warning=ExperimentalWarning agent.cjs dashboard --open
pause
exit /b
:nonode
echo Node.js 22.13 or newer is needed. It is a free one-time install.
echo Opening the download page. Install the LTS version, then run this file again.
start https://nodejs.org/en/download
pause
