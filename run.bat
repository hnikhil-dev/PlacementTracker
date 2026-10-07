@echo off
setlocal enabledelayedexpansion
title Smart Placement Tracker - Startup Runner

echo ======================================================================
echo           SMART PLACEMENT TRACKER - ENTERPRISE LAUNCHER
echo           Tech Stack: Python FastAPI + Supabase PostgreSQL
echo ======================================================================
echo.

cd /d "%~dp0"

:: ----------------------------------------------------------------------
:: 1. CHECK ENVIRONMENT CONFIGURATION (.env)
:: ----------------------------------------------------------------------
if not exist .env (
    echo [NOTICE] .env file not found in root directory!
    if exist .env.example (
        echo [INFO] Creating .env from .env.example template...
        copy .env.example .env >nul
    ) else (
        echo [WARNING] Please ensure a .env file with your database credentials is created.
    )
    echo.
)

REM Check if .env contains unconfigured placeholders
set "NEEDS_SETUP=0"
if exist .env (
    findstr /i /c:"<your-password>" /c:"<project-ref>" .env >nul 2>&1
    if !ERRORLEVEL! equ 0 set "NEEDS_SETUP=1"
)

if "!NEEDS_SETUP!"=="1" (
    echo ======================================================================
    echo          FIRST-TIME SETUP: DATABASE CONFIGURATION REQUIRED
    echo ======================================================================
    echo  It looks like this project was freshly cloned or .env is not configured!
    echo  Smart Placement Tracker needs your free Supabase database credentials.
    echo.
    echo  [1] Open .env in Notepad to enter your credentials (Recommended)
    echo  [2] View the step-by-step Setup Guide (opens Documentation in browser)
    echo  [3] Continue anyway (Skip configuration for now)
    echo ======================================================================
    set "SETUP_CHOICE=1"
    set /p "SETUP_CHOICE=Select an option [1/2/3] (Default: 1): "
    if "!SETUP_CHOICE!"=="1" (
        echo.
        echo [INFO] Opening .env in Notepad...
        echo Please paste your Supabase DATABASE_URL, SUPABASE_URL, and SUPABASE_KEY.
        echo When done, press Ctrl+S to save and close Notepad to continue.
        notepad .env
        echo.
        echo [INFO] Continuing setup...
        echo.
    )
    if "!SETUP_CHOICE!"=="2" (
        echo.
        echo [INFO] Opening documentation guide in your web browser...
        if exist "Documentation.html" start "" "Documentation.html"
        if exist "SETUP_GUIDE.md" start "" "SETUP_GUIDE.md"
        echo Opening .env for editing...
        notepad .env
    )
)

:: Extract configured PORT from .env (Default: 3000)
set "APP_PORT=3000"
if exist .env (
    for /f "tokens=1* delims==" %%A in ('findstr /r /c:"^PORT=" .env 2^>nul') do (
        set "APP_PORT=%%B"
        set "APP_PORT=!APP_PORT:"=!"
        set "APP_PORT=!APP_PORT:'=!"
        set "APP_PORT=!APP_PORT: =!"
    )
)
if "%APP_PORT%"=="" set "APP_PORT=3000"

:: ----------------------------------------------------------------------
:: 2. DETECT OR REPAIR EXISTING VIRTUAL ENVIRONMENT (.venv)
:: ----------------------------------------------------------------------
if exist ".venv\Scripts\python.exe" (
    REM Verify existing virtualenv is valid and not moved/corrupt
    .venv\Scripts\python.exe -c "import sys" >nul 2>&1
    if errorlevel 1 (
        echo [WARNING] Detected corrupted or moved .venv environment. Rebuilding...
        rmdir /s /q .venv >nul 2>&1
    ) else (
        echo [INFO] Verified existing Python virtual environment ^(.venv^).
        set "PYTHON_CMD=.venv\Scripts\python.exe"
        goto :INSTALL_DEPENDENCIES
    )
)

:: ----------------------------------------------------------------------
:: 3. DETECT SYSTEM PYTHON (3.9+) OR AUTO-INSTALL
:: ----------------------------------------------------------------------
echo [INFO] Detecting Python on host system...
set "SYS_PYTHON="

:: A) Check standard python on PATH
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    python -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        set "SYS_PYTHON=python"
        goto :CREATE_VENV
    )
)

:: B) Check Windows Python launcher (py)
where py >nul 2>&1
if %ERRORLEVEL% equ 0 (
    py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        set "SYS_PYTHON=py -3"
        goto :CREATE_VENV
    )
)

:: C) Check common installation directories
for %%V in (Python313 Python312 Python311 Python310) do (
    if exist "%LOCALAPPDATA%\Programs\Python\%%V\python.exe" (
        set "SYS_PYTHON=%LOCALAPPDATA%\Programs\Python\%%V\python.exe"
        goto :CREATE_VENV
    )
    if exist "%ProgramFiles%\Python\%%V\python.exe" (
        set "SYS_PYTHON=%ProgramFiles%\Python\%%V\python.exe"
        goto :CREATE_VENV
    )
    if exist "%ProgramFiles(x86)%\Python\%%V\python.exe" (
        set "SYS_PYTHON=%ProgramFiles(x86)%\Python\%%V\python.exe"
        goto :CREATE_VENV
    )
)

:: D) If Python is completely missing, download and install silently
echo.
echo ======================================================================
echo [ACTION REQUIRED] Python was not found on your system PATH!
echo To ensure zero-friction setup, this launcher will automatically
echo download and silently install official Python 3.11 now.
echo ======================================================================
echo.

where winget >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [INFO] Installing Python 3.11 via Windows Package Manager (winget)...
    winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
)

:: Re-check if winget succeeded
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "SYS_PYTHON=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto :CREATE_VENV
)

:: Direct fallback download via PowerShell
echo [INFO] Downloading official Python 3.11.9 64-bit installer from python.org...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$url = 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe';" ^
    "$installer = Join-Path $env:TEMP 'python-3.11.9-installer.exe';" ^
    "Write-Host 'Downloading installer... Please wait...';" ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
    "Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing;" ^
    "Write-Host 'Running silent installation...';" ^
    "Start-Process -FilePath $installer -ArgumentList '/quiet InstallAllUsers=0 PrependPath=1 Include_test=0' -Wait;" ^
    "Remove-Item $installer -Force;" ^
    "Write-Host 'Python installation completed!';"

:: Refresh and locate new binary
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts;%PATH%"
    set "SYS_PYTHON=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto :CREATE_VENV
)

where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "SYS_PYTHON=python"
    goto :CREATE_VENV
)

echo.
echo [ERROR] Automatic installation could not be completed.
echo Please download Python 3.11+ manually from https://www.python.org/downloads/
echo IMPORTANT: Check the box 'Add python.exe to PATH' during installation!
echo.
pause
exit /b 1

:: ----------------------------------------------------------------------
:: 4. CREATE VIRTUAL ENVIRONMENT (.venv)
:: ----------------------------------------------------------------------
:CREATE_VENV
echo [INFO] Creating Python virtual environment (.venv)...
%SYS_PYTHON% -m venv .venv
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Could not create isolated .venv. Falling back to system Python...
    set "PYTHON_CMD=%SYS_PYTHON%"
    set "PIP_CMD=%SYS_PYTHON% -m pip"
    goto :INSTALL_GLOBAL
)

set "PYTHON_CMD=.venv\Scripts\python.exe"
set "PIP_CMD=.venv\Scripts\pip"

:: ----------------------------------------------------------------------
:: 5. VERIFY AND INSTALL ALL REQUIREMENTS
:: ----------------------------------------------------------------------
:INSTALL_DEPENDENCIES
echo [INFO] Checking and installing all required Python dependencies...
echo [INFO] Target requirements: backend\requirements.txt
echo.

%PYTHON_CMD% -m pip install -r backend\requirements.txt --disable-pip-version-check
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Encountered retryable network notice. Re-running pip install...
    %PYTHON_CMD% -m pip install -r backend\requirements.txt
)
goto :LAUNCH_APPLICATION

:INSTALL_GLOBAL
echo [INFO] Installing dependencies globally...
%PIP_CMD% install -r backend\requirements.txt --disable-pip-version-check

:: ----------------------------------------------------------------------
:: 6. LAUNCH APPLICATION & OPEN BROWSER
:: ----------------------------------------------------------------------
:LAUNCH_APPLICATION
echo.
echo ======================================================================
echo    APPLICATION IS READY! STARTING SERVERS...
echo ======================================================================
echo    * Student Portal:   http://localhost:%APP_PORT%/index.html
echo    * Officer Portal:   http://localhost:%APP_PORT%/admin.html
echo    * Interactive API:  http://localhost:%APP_PORT%/docs
echo    * Documentation:    http://localhost:%APP_PORT%/Documentation.html
echo ======================================================================
echo.

:: Launch default web browser automatically in background after 2 seconds
start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:%APP_PORT%/index.html'"

:: Run Python FastAPI Backend Server
%PYTHON_CMD% backend\run.py

if %ERRORLEVEL% neq 0 (
    echo.
    echo ======================================================================
    echo [ERROR] Application server stopped or encountered an error.
    echo Please verify your Supabase database connection details in .env.
    echo ======================================================================
    echo.
    pause
)
