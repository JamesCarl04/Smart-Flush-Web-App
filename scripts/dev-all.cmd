@echo off
setlocal

for %%I in ("%~dp0..") do set "ROOT=%%~fI"

start "mqtt-listener" /b cmd /d /s /c "cd /d ""%ROOT%"" && npm --prefix mqtt-listener run dev > mqtt-listener.dev.log 2> mqtt-listener.dev.err"
npm run dev:web
