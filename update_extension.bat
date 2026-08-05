@echo off
title Extension License Auto-Updater
cls
echo =========================================================
echo       IVAC Extension License Auto-Updater
echo =========================================================
echo.

if "%~1"=="" (
    echo Please drag and drop the new Developer Extension folder onto this bat file!
    echo Or run: update_extension.bat "C:\Path\To\NewDeveloperFolder"
    echo.
    pause
    exit /b
)

node "%~dp0update_extension.js" "%~1"

pause
