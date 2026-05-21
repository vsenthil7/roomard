@echo off
REM ============================================================================
REM  Roomard - Integration Test Runner (the schema-drift regression layer)
REM ============================================================================
REM  Runs all 12 real-database integration tests across guest/tenant/capture.
REM  These run the ACTUAL production code against the REAL Postgres database,
REM  so any column drift raises Postgres error 42703 and the test FAILS - which
REM  the mocked unit suite cannot do (it never validates column names).
REM
REM  Usage:  scripts\run-integration-tests.bat
REM  Needs:  the dev stack running (docker compose up -d) so Postgres is on 5532.
REM ============================================================================
setlocal
set ROOT=C:\Users\v_sen\Documents\Projects\0009_AT_Hack0019_Roomard\roomard
set DATABASE_URL=postgres://roomard:roomard_dev_pwd@127.0.0.1:5532/roomard
set JWT_SECRET=test-only-do-not-use-in-production-32bytes!
set LOG=%ROOT%\_session\integration-run.log

echo ============================================================ > "%LOG%"
echo  Roomard real-database integration tests >> "%LOG%"
echo  Started: %DATE% %TIME% >> "%LOG%"
echo  DATABASE_URL: %DATABASE_URL% >> "%LOG%"
echo ============================================================ >> "%LOG%"

echo. >> "%LOG%"
echo ### guest-svc (G-41 guard): real GuestRepo.getPreferences/getHistory/analyseComplaintTrajectory >> "%LOG%"
cd /d "%ROOT%\services\guest"
call pnpm exec vitest run tests/integration --reporter=verbose >> "%LOG%" 2>&1
echo GUEST_EXIT=%ERRORLEVEL% >> "%LOG%"

echo. >> "%LOG%"
echo ### tenant-svc (G-42 guard): real /v1/tenant + /v1/properties routes via app.inject >> "%LOG%"
cd /d "%ROOT%\services\tenant"
call pnpm exec vitest run tests/integration --reporter=verbose >> "%LOG%" 2>&1
echo TENANT_EXIT=%ERRORLEVEL% >> "%LOG%"

echo. >> "%LOG%"
echo ### capture-svc (G-43 guard): real GET /v1/captures/:id (evidence join card_captures) >> "%LOG%"
cd /d "%ROOT%\services\capture"
call pnpm exec vitest run tests/integration --reporter=verbose >> "%LOG%" 2>&1
echo CAPTURE_EXIT=%ERRORLEVEL% >> "%LOG%"

echo. >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo  Finished: %DATE% %TIME% >> "%LOG%"
echo ============================================================ >> "%LOG%"
endlocal
