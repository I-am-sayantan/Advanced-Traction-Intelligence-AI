@echo off
echo ========================================
echo Starting Frontend Server (React)
echo ========================================
echo.

cd /d "%~dp0frontend"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Node modules not found. Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies!
        pause
        exit /b 1
    )
)

echo.
echo Starting React development server...
echo Frontend will be available at: http://localhost:3000
echo.

call npm start

pause
