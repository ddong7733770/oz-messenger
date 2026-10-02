FROM python:3.11-slim

WORKDIR /app

# 기본 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 소스 코드 복사
COPY . .

# 업로드 폴더 생성
RUN mkdir -p backend/uploads

# 포트 노출
EXPOSE 8000

# 서버 실행
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
