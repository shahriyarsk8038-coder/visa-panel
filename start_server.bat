@echo off
title IVAC Extension License Backend Server
cls
echo =========================================================
echo 🚀 Starting IVAC Extension License Backend Server...
echo =========================================================
echo.
echo Admin Panel URL: http://localhost:5000/admin
echo.
cd /d "%~dp0backend"
node server.js
pause
