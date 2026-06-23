@echo off
setlocal enabledelayedexpansion
:: ─────────────────────────────────────────────────────────────────────────────
:: SmartCrop — Lanceur Windows
:: ─────────────────────────────────────────────────────────────────────────────

set DIR=%~dp0
set VENV=%DIR%.venv

:: ── Verifier le venv ──────────────────────────────────────────────────────
if not exist "%VENV%\Scripts\python.exe" (
    echo Environnement virtuel introuvable.
    echo Lancez d'abord install_windows.bat
    pause
    exit /b 1
)

:: ── Charger la cle API depuis les variables d'environnement utilisateur ───
if "%ANTHROPIC_API_KEY%"=="" (
    for /f "tokens=2*" %%a in ('reg query HKCU\Environment /v ANTHROPIC_API_KEY 2^>nul') do (
        set ANTHROPIC_API_KEY=%%b
    )
)

:: ── Lancer SmartCrop ──────────────────────────────────────────────────────
:: (si la cle est toujours absente, l'app demande via sa propre fenetre)
"%VENV%\Scripts\pythonw" "%DIR%smartcrop.py"
