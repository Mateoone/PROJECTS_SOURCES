@echo off
setlocal enabledelayedexpansion
:: ─────────────────────────────────────────────────────────────────────────────
:: SmartCrop — Build Windows (.exe)
:: Genere dist\SmartCrop\SmartCrop.exe — autonome, sans Python requis.
:: Ce script doit etre execute SUR un PC Windows.
:: ─────────────────────────────────────────────────────────────────────────────

set DIR=%~dp0
set VENV=%DIR%.venv

echo.
echo ==========================================
echo   SmartCrop ^— Build Windows (.exe)
echo ==========================================
echo.

:: ── Verifier le venv ──────────────────────────────────────────────────────
if not exist "%VENV%\Scripts\python.exe" (
    echo [ERREUR] Environnement virtuel introuvable.
    echo Lancez d'abord install_windows.bat
    pause
    exit /b 1
)

:: ── Installer PyInstaller ─────────────────────────────────────────────────
echo [ ] Installation de PyInstaller...
"%VENV%\Scripts\pip" install pyinstaller --upgrade --quiet
echo [OK] PyInstaller pret

:: ── Nettoyer les anciens builds ───────────────────────────────────────────
if exist "%DIR%dist" rmdir /s /q "%DIR%dist"
if exist "%DIR%build" rmdir /s /q "%DIR%build"
if exist "%DIR%SmartCrop.spec" del "%DIR%SmartCrop.spec"

:: ── Build ─────────────────────────────────────────────────────────────────
echo [ ] Construction de SmartCrop.exe (peut prendre 2-3 min)...

"%VENV%\Scripts\pyinstaller" ^
    --name "SmartCrop" ^
    --windowed ^
    --onedir ^
    --noconfirm ^
    --collect-all customtkinter ^
    --collect-all anthropic ^
    --collect-all httpx ^
    --collect-all httpcore ^
    --collect-all anyio ^
    --collect-all certifi ^
    --collect-all PIL ^
    --collect-all numpy ^
    --hidden-import "tkinter" ^
    --hidden-import "tkinter.filedialog" ^
    --hidden-import "tkinter.messagebox" ^
    "%DIR%smartcrop.py"

:: ── Resultat ─────────────────────────────────────────────────────────────
if exist "%DIR%dist\SmartCrop\SmartCrop.exe" (
    echo.
    echo ==========================================
    echo   [OK] SmartCrop.exe cree avec succes !
    echo.
    echo   Emplacement : dist\SmartCrop\SmartCrop.exe
    echo.
    echo   Distribution :
    echo   Compressez le dossier dist\SmartCrop\ en ZIP
    echo   et envoyez-le a vos collegues.
    echo   Ils n'ont qu'a decompresser et lancer SmartCrop.exe
    echo ==========================================
    explorer "%DIR%dist\SmartCrop"
) else (
    echo.
    echo [ERREUR] Build echoue — consultez les messages ci-dessus.
)

echo.
pause
