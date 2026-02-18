@echo off
setlocal

echo [1/3] Starting Infrastructure (Postgres, Redis)...
docker-compose up -d

echo [2/3] Waiting for Database to be ready...
:check_db
docker inspect --format="{{.State.Health.Status}}" wikivoice_db | findstr "healthy" >nul
if %errorlevel% neq 0 (
    timeout /t 2 /nobreak >nul
    goto check_db
)

echo [3/3] Seeding Plans and Initializing Tables...
.venv\Scripts\python.exe seed_plans.py

echo.
echo ==========================================
echo [SUCCESS] Infrastructure is up and seeded!
echo ==========================================
echo.
echo NEXT STEPS:
echo 1. Run API:    uv run uvicorn src.api.main:app --reload
echo 2. Run Worker: dramatiq src.TTS_Workers.tasks
echo.
pause
