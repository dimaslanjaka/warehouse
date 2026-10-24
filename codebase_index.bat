@echo off
setlocal

REM Get the directory containing this batch script
set "REPO_PATH=%~dp0"

REM Remove trailing backslash
if "%REPO_PATH:~-1%"=="\" set "REPO_PATH=%REPO_PATH:~0,-1%"

echo ==========================================
echo  Codebase Memory - Repository Indexer
echo ==========================================
echo Repository: "%REPO_PATH%"
echo.

REM Run full repository indexing with persistence enabled
codebase-memory-mcp cli index_repository --repo-path "%REPO_PATH%" --mode full --persistence true

if errorlevel 1 (
    echo.
    echo [ERROR] Repository indexing failed.
    exit /b 1
)

echo.
echo [SUCCESS] Repository indexing completed.
exit /b 0