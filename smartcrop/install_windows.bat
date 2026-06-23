@echo off
setlocal enabledelayedexpansion
:: ─────────────────────────────────────────────────────────────────────────────
:: SmartCrop — Installation Windows
:: ─────────────────────────────────────────────────────────────────────────────

set DIR=%~dp0
set VENV=%DIR%.venv

echo.
echo ==========================================
echo   SmartCrop ^— Installation Windows
echo ==========================================
echo.

:: ── Verifier Python ───────────────────────────────────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Python introuvable.
    echo.
    echo Installez Python 3.11+ depuis : https://www.python.org/downloads/
    echo Cochez "Add Python to PATH" pendant l'installation.
    echo.
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PY_VER=%%v
echo [OK] Python %PY_VER% trouve

:: ── Creer l'environnement virtuel ─────────────────────────────────────────
if exist "%VENV%\Scripts\python.exe" (
    echo [OK] Environnement virtuel existant
) else (
    echo [ ] Creation de l'environnement virtuel...
    python -m venv "%VENV%"
    echo [OK] Environnement cree
)

:: ── Installer les dependances ─────────────────────────────────────────────
echo [ ] Installation des dependances (peut prendre quelques minutes)...
"%VENV%\Scripts\pip" install --upgrade pip --quiet
"%VENV%\Scripts\pip" install --upgrade ^
    "anthropic>=0.40.0" ^
    "Pillow>=10.0.0" ^
    "customtkinter>=5.2.0" ^
    "numpy>=1.26.0" ^
    --quiet

echo [OK] Dependances installees

echo.
echo ==========================================
echo   Installation terminee !
echo.
echo   Pour lancer SmartCrop :
echo   Double-cliquez sur SmartCrop.bat
echo ==========================================
echo.
pause
