import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "messenger.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # 1. users 테이블
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        user_type TEXT NOT NULL, -- 'master' or 'client'
        nickname TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL
    )
    """)
    
    # 2. rooms 테이블 (각 일반 클라이언트와 마스터 간의 1:1 방)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER UNIQUE NOT NULL,
        status TEXT DEFAULT 'waiting', -- 'waiting', 'active', 'closed'
        memo TEXT DEFAULT '',
        unread_master INTEGER DEFAULT 0,
        last_message TEXT DEFAULT '',
        last_message_at TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (client_id) REFERENCES users (id)
    )
    """)
    
    # 3. messages 테이블
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        sender_type TEXT NOT NULL, -- 'master' or 'client'
        sender_name TEXT NOT NULL,
        msg_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'image', 'file'
        content TEXT NOT NULL,
        file_name TEXT DEFAULT '',
        file_size INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        FOREIGN KEY (room_id) REFERENCES rooms (id),
        FOREIGN KEY (sender_id) REFERENCES users (id)
    )
    """)
    
    # 4. canned_responses (자주 쓰는 빠른 답변)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS canned_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL
    )
    """)
    
    # 마스터 계정 초기 생성 확인
    cursor.execute("SELECT id FROM users WHERE user_type = 'master'")
    master_user = cursor.fetchone()
    if not master_user:
        cursor.execute("""
        INSERT INTO users (session_id, user_type, nickname, email, created_at)
        VALUES (?, ?, ?, ?, ?)
        """, (
            "master_fixed_session",
            "master",
            "오즈",
            "skpark@iconix.co.kr",
            datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ))
    
    # 기본 빠른 답변 템플릿 추가
    cursor.execute("SELECT COUNT(*) FROM canned_responses")
    if cursor.fetchone()[0] == 0:
        default_templates = [
            ("인사", "안녕하세요! 오즈 메신저입니다. 문의사항 있으시면 언제든 편하게 남겨주세요."),
            ("계좌 안내", "입금 계좌: 국민은행 123-456-789012 (예금주: 오즈) / 입금 후 주문자명을 남겨주시면 확인이 빠릅니다."),
            ("배송 안내", "평일 오후 3시 이전 주문 건은 당일 출고되며, 출고 후 1~2일 내에 수령 가능합니다."),
            ("교환/반품 안내", "상품 수령 후 7일 이내에 미개봉 상태로 접수 시 교환 및 반품이 가능합니다.")
        ]
        cursor.executemany("INSERT INTO canned_responses (title, content) VALUES (?, ?)", default_templates)
        
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
