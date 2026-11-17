@echo off
rem Starts the R&D Command Center (close this window to stop it)
cd /d "%~dp0"
rem Shared passcode for changes: remove "rem" on the next line and choose your own before sharing the link.
rem set RND_EDIT_KEY=choose-a-passcode
echo Colleagues on the office network open: http://%COMPUTERNAME%:8080/
python server.py
pause
