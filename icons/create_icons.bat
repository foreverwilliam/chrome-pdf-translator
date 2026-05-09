@echo off
REM Run this batch file to generate the PNG icons for PDF Translator.
REM It tries Python first (Pillow), then Node.js as a fallback.

cd /d "%~dp0"

echo Checking for Python...
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Trying stdlib-only Python script (no extra deps)...
    python generate_icons_stdlib.py
    if %errorlevel% == 0 (
        echo Done! Icons created with Python (stdlib).
        goto :end
    )
    echo Installing Pillow...
    python -m pip install Pillow --quiet 2>nul
    if %errorlevel% neq 0 python -m pip install Pillow --break-system-packages --quiet
    echo Generating icons with Python/Pillow...
    python generate_icons.py
    if %errorlevel% == 0 (
        echo Done! Icons created with Python/Pillow.
        goto :end
    )
)

echo Python not available or failed. Trying Node.js...
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo Generating icons with Node.js...
    node generate_icons.js
    if %errorlevel% == 0 (
        echo Done! Icons created with Node.js.
        goto :end
    )
)

echo ERROR: Neither Python nor Node.js could generate the icons.
echo Please install Python (https://python.org) or Node.js (https://nodejs.org)
echo and re-run this script.
exit /b 1

:end
echo.
echo Files created:
if exist icon16.png  echo   icon16.png
if exist icon48.png  echo   icon48.png
if exist icon128.png echo   icon128.png
