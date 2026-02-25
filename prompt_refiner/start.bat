@echo off
setlocal enabledelayedexpansion
title PromptRefiner Server
color 0A

:: CD to the directory where this .bat file lives
cd /d "%~dp0"

echo.
echo  ========================================================
echo   PromptRefiner v0.2 - One-Click Launcher
echo   Directory: %CD%
echo  ========================================================
echo.

:: ---- Step 1: Check Python ----
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo  [FAIL] Python not found in PATH.
    pause
    exit /b 1
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo  [OK] Python %PYVER%

:: ---- Step 2: Check Ollama ----
echo  [..] Checking Ollama...
curl -s -o nul -w "%%{http_code}" http://localhost:11434/api/tags > "%TEMP%\pr_ollama.txt" 2>nul
set /p OLLAMA_STATUS=<"%TEMP%\pr_ollama.txt"
del "%TEMP%\pr_ollama.txt" 2>nul

if not "%OLLAMA_STATUS%"=="200" (
    echo  [..] Ollama not responding. Starting...
    start "" /min "ollama" serve
    set RETRIES=0
    :ollama_wait
    timeout /t 2 /nobreak >nul
    curl -s -o nul http://localhost:11434/api/tags 2>nul
    if %errorlevel% neq 0 (
        set /a RETRIES+=1
        if !RETRIES! geq 10 (
            echo  [FAIL] Ollama won't start. Install from https://ollama.ai
            pause
            exit /b 1
        )
        echo  [..] Retry !RETRIES!/10
        goto ollama_wait
    )
)
echo  [OK] Ollama running.

:: ---- Step 3: Check models ----
curl -s http://localhost:11434/api/tags 2>nul | findstr /i "name" >nul
if %errorlevel% neq 0 (
    echo  [WARN] No models. Pulling llama3.1:8b...
    ollama pull llama3.1:8b
) else (
    echo  [OK] Models available.
)

:: ---- Step 4: Venv ----
set VENV_DIR=.venv

if not exist "%VENV_DIR%\Scripts\python.exe" (
    echo  [..] Creating venv...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo  [FAIL] Venv creation failed.
        pause
        exit /b 1
    )
    echo  [OK] Venv created.
) else (
    echo  [OK] Venv exists.
)

call "%VENV_DIR%\Scripts\activate.bat"
echo  [OK] Venv activated.

:: ---- Step 5: Deps ----
set DEPS_MARKER=%VENV_DIR%\.deps_hash
set REQ_HASH=none
for /f "tokens=*" %%h in ('certutil -hashfile requirements.txt MD5 2^>nul ^| findstr /v "hash MD5"') do set REQ_HASH=%%h

set OLD_HASH=none
if exist "%DEPS_MARKER%" set /p OLD_HASH=<"%DEPS_MARKER%"

if not "!REQ_HASH!"=="!OLD_HASH!" (
    echo  [..] Installing dependencies...
    python -m pip install --upgrade pip -q 2>nul
    pip install -r requirements.txt -q
    if errorlevel 1 (
        echo  [FAIL] Dependency install failed. Check requirements.txt
        echo  File location: %CD%\requirements.txt
        pause
        exit /b 1
    )
    echo !REQ_HASH!> "%DEPS_MARKER%"
    echo  [OK] Dependencies installed.
) else (
    echo  [OK] Dependencies current.
)

:: ---- Step 6: Port ----
set PORT=8000
netstat -aon 2>nul | findstr ":8000 " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo  [WARN] Port 8000 busy, using 8001
    set PORT=8001
)

:: ---- Step 7: Launch ----
echo.
echo  ========================================================
echo   http://localhost:!PORT!
echo   Close this window to stop.
echo  ========================================================
echo.

start "" http://localhost:!PORT!
python -c "from backend.server import app; app.run(host='127.0.0.1', port=!PORT!, debug=False)"

deactivate 2>nul
endlocal
pause
