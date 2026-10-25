@echo off
rem End-to-end test with a sample export (application started).
rem Finds Python 3.12 (64 bits), then runs app\portable\launcher.py.
setlocal
cd /d "%~dp0"
set "PYEXE="
py -3.12 -c "import sys" >nul 2>&1 && set "PYEXE=py -3.12"
if not defined PYEXE python -c "import sys; sys.exit(sys.version_info[:2] != (3, 12))" >nul 2>&1 && set "PYEXE=python"
if not defined PYEXE (
    echo Python 3.12 est introuvable. Installer prerequis\python-3.12.10-amd64.exe
    echo en cochant "Add python.exe to PATH", puis recommencer.
    pause
    exit /b 1
)
chcp 65001 >nul
%PYEXE% -X utf8 "%~dp0app\portable\launcher.py" verifier
pause
