@echo off
chcp 65001 > nul
title 오즈 메신저 - 외부 인터넷 공개 링크 생성기 (Cloudflare Tunnel)

echo ======================================================
echo    🌐 오즈 메신저 무료 퍼블릭 웹 링크 생성기
echo ======================================================
echo.
echo * 안내: 먼저 오즈 메신저 서버(run_oz_messenger.bat)가 실행 중이어야 합니다.
echo.

cd /d "%~dp0\.."

if not exist "cloudflared.exe" (
    echo [경고] cloudflared.exe 파일을 찾을 수 없습니다.
    pause
    exit /b
)

echo [1/2] 외부 인터넷에서 누구나 접속 가능한 보안 HTTPS 링크를 발급받습니다...
echo.
echo 아래 생성되는 "https://xxxx.trycloudflare.com" 형태의 주소를 복사하여
echo 모바일 스마트폰이나 고객에게 전달하시면 즉시 웹으로 접속 가능합니다!
echo.
echo ======================================================
echo.

cloudflared.exe tunnel --url http://localhost:8000

pause
