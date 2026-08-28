@echo off
start "Proxy de imagens VONDER" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0product-image-proxy.ps1"
rem Aguarda o auxiliar realmente responder. Um atraso fixo podia abrir o editor antes dele
rem em computadores mais lentos, deixando a foto apenas na miniatura e fora do post.
for /l %%i in (1,1,12) do (
  powershell.exe -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:8765/health'; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" && goto proxy_ready
  timeout /t 1 /nobreak >nul
)
:proxy_ready
start "" "%~dp0index.html"
