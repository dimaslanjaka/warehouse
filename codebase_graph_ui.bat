@echo off
setlocal

set "REPO_PATH=%~dp0"
if "%REPO_PATH:~-1%"=="\" set "REPO_PATH=%REPO_PATH:~0,-1%"

echo Repository: "%REPO_PATH%"
echo Starting Codebase Memory Graph UI...

start "" "http://localhost:9749"
codebase-memory-mcp --ui=true --port=9749

endlocal