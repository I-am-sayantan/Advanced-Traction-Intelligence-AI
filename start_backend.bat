@echo off
echo ========================================
echo Starting Backend Server (Node.js/TypeScript)
echo ========================================
echo.

cd /d "%~dp0backend-ts"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo Failed to install dependencies!
        pause
        exit /b 1
    )
)

echo.
echo Starting TypeScript dev server...
echo Backend will be available at: http://localhost:8000
echo Health check: http://localhost:8000/api/health
echo.

npx tsx watch src/index.ts

pause
