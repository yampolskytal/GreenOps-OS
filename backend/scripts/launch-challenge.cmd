@echo off
cd /d "%~dp0.."
python app.py serve --data "inputs\sprintd-basel-green-ai-data-main" --policy "challenge-policy.json"
