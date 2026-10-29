@echo off
title VATcube Leads Generator setup
set "SRC=%~dp0"
set "APP=%LOCALAPPDATA%\VATcube Leads Generator"
where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto nonode
if not exist "%APP%" mkdir "%APP%"
copy /y "%SRC%agent.cjs" "%APP%\" >nul
if errorlevel 1 goto copyfail
copy /y "%SRC%README-FIRST.txt" "%APP%\" >nul
copy /y "%SRC%.env.example" "%APP%\" >nul
copy /y "%SRC%Start-Windows.bat" "%APP%\Start VATcube Leads Generator.bat" >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; foreach($d in 'Desktop','Programs'){ $s=$w.CreateShortcut([Environment]::GetFolderPath($d)+'\VATcube Leads Generator.lnk'); $s.TargetPath='%APP%\Start VATcube Leads Generator.bat'; $s.WorkingDirectory='%APP%'; $s.WindowStyle=7; $s.Save() }"
echo.
echo Installed to %APP%
echo A VATcube Leads Generator shortcut is on your Desktop and in the Start Menu.
echo Your settings and data stay in that folder, so installing again is safe.
echo Starting now...
call "%APP%\Start VATcube Leads Generator.bat"
exit /b
:copyfail
echo Could not copy the files. Unzip the whole folder first, then run this file from the unzipped folder.
pause
exit /b
:nonode
echo Node.js 22.13 or newer is needed. It is a free one-time install.
echo Opening the download page. Install the LTS version, then run this file again.
start https://nodejs.org/en/download
pause
