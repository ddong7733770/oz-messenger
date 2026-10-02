@echo off
chcp 65001 > nul
title 오즈샵 (Oz Shop) 메신저 서버 실행기

echo ======================================================
echo          🌿 오즈샵 (Oz Shop) 실시간 메신저 서버 시작
echo ======================================================
echo.

cd /d "%~dp0"

echo [1/3] 로컬 IP 주소 확인 중...
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0 ^| findstr /v "0.0.0.0.*0.0.0.0"') do (
    set LOCAL_IP=%%a
)

echo.
echo ======================================================
echo  [접속 주소 안내]
echo  - PC 웹 접속:   http://localhost:8000
echo  - 모바일 웹:    http://%LOCAL_IP%:8000 (동일 Wi-Fi)
echo.
echo  * 마스터 계정:   skpark@iconix.co.kr
echo  * 마스터 암호:   7810
echo  * 대화명:        오즈샵
echo ======================================================
echo.

echo [2/3] 브라우저를 엽니다...
start http://localhost:8000

echo [3/3] FastAPI & WebSocket 서버 가동 중... (종료: Ctrl + C)
echo.
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

pause
