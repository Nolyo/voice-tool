@echo off
rem Launch from the directory of this .bat (Windows path)
powershell -NoProfile -WindowStyle Hidden -Command "Set-Location '%~dp0'; python main.py"