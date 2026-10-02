import os
import shutil
import uuid
from typing import List, Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .database import get_db, init_db, get_kst_now, get_kst_str, get_kst_display

# 앱 초기화 및 DB 생성
init_db()

app = FastAPI(title="오즈샵 메신저 (Oz Shop Messenger)")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 정적 파일 서빙
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# --- WebSocket 연결 관리자 ---
class ConnectionManager:
    def __init__(self):
        # room_id -> List[WebSocket] (해당 방을 보고 있는 사용자/클라이언트)
        self.room_connections: Dict[int, List[WebSocket]] = {}
        # 마스터 전체 콘솔 연결 리스트 (전체 룸 알림 및 모니터링용)
        self.master_connections: List[WebSocket] = []

    async def connect_client(self, websocket: WebSocket, room_id: int):
        await websocket.accept()
        if room_id not in self.room_connections:
            self.room_connections[room_id] = []
        self.room_connections[room_id].append(websocket)

    def disconnect_client(self, websocket: WebSocket, room_id: int):
        if room_id in self.room_connections:
            if websocket in self.room_connections[room_id]:
                self.room_connections[room_id].remove(websocket)
            if not self.room_connections[room_id]:
                del self.room_connections[room_id]

    async def connect_master(self, websocket: WebSocket):
        await websocket.accept()
        self.master_connections.append(websocket)

    def disconnect_master(self, websocket: WebSocket):
        if websocket in self.master_connections:
            self.master_connections.remove(websocket)

    async def broadcast_to_room(self, room_id: int, message_data: dict):
        if room_id in self.room_connections:
            dead_sockets = []
            for ws in self.room_connections[room_id]:
                try:
                    await ws.send_json(message_data)
                except Exception:
                    dead_sockets.append(ws)
            for ws in dead_sockets:
                self.disconnect_client(ws, room_id)

    async def broadcast_to_masters(self, event_data: dict):
        dead_masters = []
        for ws in self.master_connections:
            try:
                await ws.send_json(event_data)
            except Exception:
                dead_masters.append(ws)
        for ws in dead_masters:
            self.disconnect_master(ws)


manager = ConnectionManager()


# --- Pydantic 요청 스키마 ---
class MasterLoginRequest(BaseModel):
    email: str
    password: str

class ClientJoinRequest(BaseModel):
    nickname: str
    session_id: Optional[str] = None

class MemoUpdateRequest(BaseModel):
    memo: str

class StatusUpdateRequest(BaseModel):
    status: str

class CannedResponseCreate(BaseModel):
    title: str
    content: str

class CannedResponseUpdate(BaseModel):
    title: str
    content: str


# --- 페이지 라우트 ---
@app.get("/")
async def get_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/client")
async def get_client_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "client.html"))

@app.get("/master")
async def get_master_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "master.html"))


# --- REST API 엔드포인트 ---

# 1. 마스터 로그인
@app.post("/api/auth/master")
async def master_login(req: MasterLoginRequest):
    if req.email.strip().lower() == "skpark@iconix.co.kr" and req.password.strip() == "7810":
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE user_type = 'master'")
        master = cursor.fetchone()
        conn.close()
        return {
            "success": True,
            "user": {
                "id": master["id"],
                "nickname": master["nickname"] or "오즈샵",
                "email": master["email"],
                "user_type": "master",
                "token": "master_authenticated_7810"
            }
        }
    raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")


# 2. 일반 고객 입장 / 프로필 생성
@app.post("/api/auth/client")
async def client_join(req: ClientJoinRequest):
    nickname = req.nickname.strip()
    if not nickname:
        raise HTTPException(status_code=400, detail="대화명을 입력해주세요.")

    conn = get_db()
    cursor = conn.cursor()
    now_str = get_kst_str()
    now_display = get_kst_display()

    # 기존 session_id가 있고 유효한지 확인
    user = None
    if req.session_id:
        cursor.execute("SELECT * FROM users WHERE session_id = ? AND user_type = 'client'", (req.session_id,))
        user = cursor.fetchone()

    is_new = False
    if not user:
        # 새 세션 생성
        new_session_id = "client_" + uuid.uuid4().hex[:12]
        cursor.execute("""
        INSERT INTO users (session_id, user_type, nickname, created_at)
        VALUES (?, 'client', ?, ?)
        """, (new_session_id, nickname, now_str))
        user_id = cursor.lastrowid

        # 해당 고객의 방 생성
        cursor.execute("""
        INSERT INTO rooms (client_id, status, created_at, updated_at, last_message, last_message_at)
        VALUES (?, 'waiting', ?, ?, ?, ?)
        """, (user_id, now_str, now_str, "대화가 시작되었습니다.", now_display))
        room_id = cursor.lastrowid

        # 최초 입장 시 "오즈샵" 마스터의 자동 환영 메시지 생성
        cursor.execute("SELECT id FROM users WHERE user_type = 'master'")
        master = cursor.fetchone()
        master_id = master["id"] if master else 1

        welcome_text = f"안녕하세요, {nickname}님! 오즈샵에 오신 것을 환영합니다. 🌿\n상품 문의나 주문 관련 질문을 남겨주시면 담당자가 신속히 답변해 드리겠습니다."
        cursor.execute("""
        INSERT INTO messages (room_id, sender_id, sender_type, sender_name, msg_type, content, created_at, is_read)
        VALUES (?, ?, 'master', '오즈샵', 'text', ?, ?, 1)
        """, (room_id, master_id, welcome_text, now_display))

        conn.commit()

        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = cursor.fetchone()
        is_new = True
    else:
        # 닉네임 업데이트
        cursor.execute("UPDATE users SET nickname = ? WHERE id = ?", (nickname, user["id"]))
        conn.commit()
        # 방 조회
        cursor.execute("SELECT id FROM rooms WHERE client_id = ?", (user["id"],))
        room_row = cursor.fetchone()
        room_id = room_row["id"] if room_row else None

    conn.close()

    # 새 접속 시 마스터에게 룸 업데이트 브로드캐스트
    if is_new:
        await manager.broadcast_to_masters({
            "event": "new_room",
            "room_id": room_id,
            "nickname": nickname
        })

    return {
        "success": True,
        "session_id": user["session_id"],
        "user_id": user["id"],
        "nickname": nickname,
        "room_id": room_id
    }


# 3. 마스터 전용: 전체 대화방 목록 조회
@app.get("/api/rooms")
async def get_rooms():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT r.id, r.client_id, r.status, r.memo, r.unread_master, r.last_message, r.last_message_at, r.updated_at,
           u.nickname, u.session_id, u.created_at as client_created_at
    FROM rooms r
    JOIN users u ON r.client_id = u.id
    ORDER BY r.updated_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    rooms = [dict(row) for row in rows]
    return {"rooms": rooms}


# 4. 방 상세 대화 내역 조회
@app.get("/api/rooms/{room_id}/messages")
async def get_room_messages(room_id: int, is_master: bool = False):
    conn = get_db()
    cursor = conn.cursor()

    # 마스터가 조회할 경우 읽지 않은 메시지 수 리셋
    if is_master:
        cursor.execute("UPDATE rooms SET unread_master = 0 WHERE id = ?", (room_id,))
        cursor.execute("UPDATE messages SET is_read = 1 WHERE room_id = ? AND sender_type = 'client'", (room_id,))
        conn.commit()

    cursor.execute("""
    SELECT id, room_id, sender_id, sender_type, sender_name, msg_type, content, file_name, file_size, created_at, is_read
    FROM messages
    WHERE room_id = ?
    ORDER BY id ASC
    """, (room_id,))
    messages = [dict(row) for row in cursor.fetchall()]

    # 방 정보도 함께 반환
    cursor.execute("""
    SELECT r.*, u.nickname, u.session_id
    FROM rooms r
    JOIN users u ON r.client_id = u.id
    WHERE r.id = ?
    """, (room_id,))
    room = cursor.fetchone()
    conn.close()

    return {
        "room": dict(room) if room else None,
        "messages": messages
    }


# 5. 마스터 전용: 고객 메모 업데이트
@app.post("/api/rooms/{room_id}/memo")
async def update_room_memo(room_id: int, req: MemoUpdateRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE rooms SET memo = ? WHERE id = ?", (req.memo, room_id))
    conn.commit()
    conn.close()
    return {"success": True, "memo": req.memo}


# 6. 마스터 전용: 상담 상태 업데이트
@app.post("/api/rooms/{room_id}/status")
async def update_room_status(room_id: int, req: StatusUpdateRequest):
    if req.status not in ["waiting", "active", "closed"]:
        raise HTTPException(status_code=400, detail="유효하지 않은 상태값입니다.")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE rooms SET status = ? WHERE id = ?", (req.status, room_id))
    conn.commit()
    conn.close()
    return {"success": True, "status": req.status}


# 7. 파일 및 사진 업로드 API
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    # 파일 확장자 및 고유 파일명 생성
    ext = os.path.splitext(file.filename)[1]
    safe_filename = f"{uuid.uuid4().hex[:16]}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, safe_filename)

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(dest_path)
    file_url = f"/uploads/{safe_filename}"

    # 이미지 여부 판별
    content_type = file.content_type or ""
    is_image = content_type.startswith("image/") or ext.lower() in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]

    return {
        "success": True,
        "url": file_url,
        "file_name": file.filename,
        "file_size": file_size,
        "msg_type": "image" if is_image else "file"
    }


# 8. 빠른 답변(Canned Responses) API - 조회, 추가, 수정, 삭제
@app.get("/api/templates")
async def get_templates():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM canned_responses ORDER BY id ASC")
    templates = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"templates": templates}

@app.post("/api/templates")
async def add_template(req: CannedResponseCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO canned_responses (title, content) VALUES (?, ?)", (req.title, req.content))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"success": True, "id": new_id, "title": req.title, "content": req.content}

@app.put("/api/templates/{template_id}")
async def update_template(template_id: int, req: CannedResponseUpdate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE canned_responses SET title = ?, content = ? WHERE id = ?", (req.title, req.content, template_id))
    conn.commit()
    conn.close()
    return {"success": True, "id": template_id, "title": req.title, "content": req.content}

@app.delete("/api/templates/{template_id}")
async def delete_template(template_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM canned_responses WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()
    return {"success": True, "id": template_id}


# --- 실시간 WebSocket 라우트 ---

# 클라이언트용 웹소켓 (room_id 기준)
@app.websocket("/ws/room/{room_id}")
async def websocket_room(websocket: WebSocket, room_id: int):
    await manager.connect_client(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_json()
            sender_type = data.get("sender_type", "client")
            sender_name = data.get("sender_name", "고객")
            msg_type = data.get("msg_type", "text")
            content = data.get("content", "").strip()
            file_name = data.get("file_name", "")
            file_size = data.get("file_size", 0)

            if not content and msg_type == "text":
                continue

            # 대한민국 표준시(KST) 적용
            now_str = get_kst_str()
            now_display = get_kst_display()

            # DB 저장
            conn = get_db()
            cursor = conn.cursor()

            # 발신자 유저 ID 조회
            if sender_type == "master":
                cursor.execute("SELECT id FROM users WHERE user_type = 'master'")
                master_row = cursor.fetchone()
                sender_id = master_row["id"] if master_row else 1
                sender_name = "오즈샵"  # 마스터 발신명 통일
            else:
                cursor.execute("SELECT client_id FROM rooms WHERE id = ?", (room_id,))
                room_row = cursor.fetchone()
                sender_id = room_row["client_id"] if room_row else 2

            cursor.execute("""
            INSERT INTO messages (room_id, sender_id, sender_type, sender_name, msg_type, content, file_name, file_size, created_at, is_read)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                room_id, sender_id, sender_type, sender_name,
                msg_type, content, file_name, file_size, now_display,
                1 if sender_type == "master" else 0
            ))
            msg_id = cursor.lastrowid

            # 방 최근 대화 및 시간 업데이트, 마스터 미확인수 증가
            summary_text = "[사진]" if msg_type == "image" else ("[파일] " + file_name if msg_type == "file" else content)
            if len(summary_text) > 40:
                summary_text = summary_text[:37] + "..."

            if sender_type == "client":
                cursor.execute("""
                UPDATE rooms
                SET last_message = ?, last_message_at = ?, updated_at = ?, unread_master = unread_master + 1
                WHERE id = ?
                """, (summary_text, now_display, now_str, room_id))
            else:
                cursor.execute("""
                UPDATE rooms
                SET last_message = ?, last_message_at = ?, updated_at = ?
                WHERE id = ?
                """, (summary_text, now_display, now_str, room_id))

            conn.commit()
            conn.close()

            message_payload = {
                "event": "new_message",
                "message": {
                    "id": msg_id,
                    "room_id": room_id,
                    "sender_type": sender_type,
                    "sender_name": sender_name,
                    "msg_type": msg_type,
                    "content": content,
                    "file_name": file_name,
                    "file_size": file_size,
                    "created_at": now_display,
                    "is_read": 1 if sender_type == "master" else 0
                }
            }

            # 1) 해당 방의 모든 클라이언트/마스터에게 메시지 전송
            await manager.broadcast_to_room(room_id, message_payload)

            # 2) 마스터 전체 콘솔에 룸 목록 갱신 이벤트 전송
            await manager.broadcast_to_masters({
                "event": "room_updated",
                "room_id": room_id,
                "sender_type": sender_type,
                "sender_name": sender_name,
                "last_message": summary_text,
                "last_message_at": now_display,
                "updated_at": now_str
            })

    except WebSocketDisconnect:
        manager.disconnect_client(websocket, room_id)
    except Exception as e:
        manager.disconnect_client(websocket, room_id)


# 마스터 콘솔용 웹소켓
@app.websocket("/ws/master")
async def websocket_master(websocket: WebSocket):
    await manager.connect_master(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_master(websocket)
    except Exception:
        manager.disconnect_master(websocket)
