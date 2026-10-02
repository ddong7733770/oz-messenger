# 🌐 오즈 메신저 (Oz Messenger) GitHub 업로드 및 무료 상시 배포 가이드

본 가이드는 오즈 메신저를 **GitHub**에 업로드하고, **Render** 등의 무료 클라우드 호스팅 서비스를 통해 전 세계 누구나 24시간 접속할 수 있는 실제 웹 메신저(`https://oz-messenger.onrender.com`)로 배포하는 과정을 안내합니다.

---

## 1단계: GitHub에 소스 코드 업로드하기

Git 명령어를 직접 입력하지 않아도 준비된 전용 업로더를 통해 원클릭으로 GitHub에 업로드할 수 있습니다.

### 준비물: GitHub 개인 액세스 토큰 (1분 소요)
1. [GitHub](https://github.com/) 로그인 후 우측 상단 프로필 클릭 ➔ **Settings** 이동
2. 좌측 메뉴 맨 아래 **Developer settings** ➔ **Personal access tokens** ➔ **Tokens (classic)** 클릭
3. **Generate new token (classic)** 클릭
4. Note란에 `oz-messenger` 입력, Expiration을 `No expiration` 또는 원하는 기간 선택
5. Select scopes에서 **`repo` (Full control of private repositories)** 에 체크
6. 맨 아래 **Generate token** 초록색 버튼 클릭 후 생성된 토큰 문자열(`ghp_...`) 복사

### 업로드 실행
1. 프로젝트 폴더 내 **`upload_to_github.bat`** (또는 상위 폴더의 `upload_oz_messenger_to_github.bat`)을 더블 클릭합니다.
2. 복사한 **GitHub 토큰**을 붙여넣고 엔터를 누릅니다.
3. 저장소 이름(기본값: `oz-messenger`)을 확인하고 엔터를 누르면 자동으로 리포지토리가 생성되고 모든 코드가 업로드됩니다!

---

## 2단계: Render.com에서 무료 24/7 상시 호스팅 배포하기 (추천)

[Render](https://render.com/)는 WebSocket을 완벽하게 지원하며 무료 티어를 제공하여 실시간 메신저 운영에 가장 적합합니다.

1. [Render.com](https://render.com/) 접속 후 **Sign In with GitHub** (깃허브로 간편 로그인)
2. 대시보드 우측 상단 **`New +`** 버튼 클릭 ➔ **`Web Service`** 선택
3. **`Build and deploy from a Git repository`** 선택 후 Next
4. 방금 업로드한 **`oz-messenger`** 저장소를 선택하고 **`Connect`** 클릭
5. 기본 설정 입력:
   - **Name**: `oz-messenger` (원하는 이름 입력)
   - **Region**: `Singapore` (한국과 가까워 빠름)
   - **Branch**: `main`
   - **Runtime**: `Python`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: **`Free`** 선택
6. 맨 아래 **`Deploy Web Service`** 클릭!
7. 약 2~3분 후 상단에 발급된 **`https://oz-messenger-xxxx.onrender.com`** 주소가 활성화됩니다.

---

## 3단계: 누구나 접속하여 사용하기

생성된 주소를 고객에게 공유하면 끝납니다!

- **일반 고객**: 해당 링크 접속 ➔ 이름/대화명 입력 ➔ 담당자 '오즈'와 1:1 상담 시작
- **마스터 관리자**: 해당 링크 접속 ➔ `skpark@iconix.co.kr` 입력 ➔ 암호 `7810` 인증 ➔ 모든 고객의 상담을 실시간 관리

---

## 4단계: 컴퓨터를 켠 상태에서 즉시 임시 무료 링크 사용하기 (Cloudflare Tunnel)
클라우드 배포 없이 지금 당장 내 PC를 서버 삼아 외부에 링크를 보내고 싶다면:
1. `run_oz_messenger.bat`을 실행합니다.
2. `run_public_tunnel.bat`을 실행합니다.
3. 터미널에 생성되는 `https://xxxx.trycloudflare.com` 링크를 고객에게 복사해 보내면 즉시 접속 가능합니다.
