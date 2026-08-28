@echo off
start "Proxy de imagens VONDER" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0product-image-proxy.ps1"
timeout /t 2 /nobreak >nul
start "" "%~dp0index.html"
