@echo off
echo ==========================================
echo      AUTO GIT PUSH SCRIPT FOR KAI AI
echo ==========================================

echo [1] Adding all files...
git add .

echo [2] Committing changes...
set "timestamp=%date% %time%"
git commit -m "Auto-update: %timestamp%"

echo [3] Pushing to GitHub (https://github.com/eimifukadaa/ai-kai)...
git push target_repo master

echo ==========================================
echo              DONE!
echo ==========================================
pause
