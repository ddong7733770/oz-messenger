document.addEventListener('DOMContentLoaded', async () => {
    // 1. 세션 확인
    const sessionId = localStorage.getItem('oz_client_session');
    const roomId = localStorage.getItem('oz_client_room_id');
    const myNickname = localStorage.getItem('oz_client_nickname') || '고객';

    if (!sessionId || !roomId) {
        alert('세션 정보가 없습니다. 대화명을 먼저 입력해주세요.');
        window.location.href = '/';
        return;
    }

    document.getElementById('my-name-display').textContent = myNickname;

    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const attachToggleBtn = document.getElementById('attach-toggle-btn');
    const attachMenu = document.getElementById('attach-menu');
    const imageInput = document.getElementById('image-input');
    const fileInput = document.getElementById('file-input');

    let ws = null;

    // 첨부 메뉴 토글
    attachToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        attachMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
        attachMenu.classList.add('hidden');
    });

    // 자동 높이 조절
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });

    // 스크롤 최하단 이동
    function scrollToBottom(smooth = true) {
        setTimeout(() => {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }, 50);
    }

    // 메시지 HTML 생성
    function renderMessage(msg) {
        const isMaster = (msg.sender_type === 'master');
        const container = document.createElement('div');
        container.className = `flex flex-col msg-anim ${isMaster ? 'items-start' : 'items-end'}`;

        let bodyContent = '';
        if (msg.msg_type === 'image') {
            bodyContent = `
                <div class="cursor-pointer overflow-hidden rounded-xl" onclick="openLightbox('${msg.content}')">
                    <img src="${msg.content}" alt="사진" class="max-w-[220px] max-h-[300px] object-cover hover:scale-105 transition duration-200">
                </div>
            `;
        } else if (msg.msg_type === 'file') {
            bodyContent = `
                <a href="${msg.content}" download="${escapeHtml(msg.file_name)}" class="flex items-center space-x-2.5 p-2 rounded-xl hover:opacity-90 transition">
                    <div class="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <div class="overflow-hidden text-left">
                        <p class="text-xs font-semibold truncate max-w-[150px]">${escapeHtml(msg.file_name || '첨부파일')}</p>
                        <p class="text-[10px] opacity-75">${formatFileSize(msg.file_size)}</p>
                    </div>
                </a>
            `;
        } else {
            bodyContent = `<div class="text-sm break-words leading-relaxed whitespace-pre-wrap">${linkify(msg.content)}</div>`;
        }

        if (isMaster) {
            // 마스터 대화: 왼쪽 배치
            container.innerHTML = `
                <div class="flex items-end space-x-2 max-w-[85%]">
                    <!-- 오즈샵 아바타 -->
                    <div class="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 shadow-sm mb-1">
                        오즈샵
                    </div>
                    <div>
                        <span class="text-[11px] font-semibold text-slate-500 ml-1 mb-1 block">오즈샵 (담당자)</span>
                        <div class="bubble-master p-3.5 border border-slate-200/80">
                            ${bodyContent}
                        </div>
                    </div>
                </div>
                <span class="text-[10px] text-slate-400 mt-1 ml-10">${msg.created_at || ''}</span>
            `;
        } else {
            // 일반 계정(본인) 대화: 오른쪽 배치
            container.innerHTML = `
                <div class="max-w-[85%]">
                    <div class="bubble-client p-3.5">
                        ${bodyContent}
                    </div>
                </div>
                <span class="text-[10px] text-slate-400 mt-1 mr-1">${msg.created_at || ''}</span>
            `;
        }

        chatMessages.appendChild(container);
    }

    // 2. 기존 대화 기록 불러오기
    async function loadHistory() {
        try {
            const res = await fetch(`/api/rooms/${roomId}/messages?is_master=false`);
            if (res.ok) {
                const data = await res.json();
                chatMessages.innerHTML = '';
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => renderMessage(msg));
                }
                scrollToBottom(false);
            }
        } catch (e) {
            console.error('대화 내역 불러오기 실패:', e);
        }
    }

    await loadHistory();

    // 3. WebSocket 연결
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/room/${roomId}`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('대화방 WebSocket 연결 성공');
        };

        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.event === 'new_message') {
                    renderMessage(payload.message);
                    scrollToBottom(true);
                    if (payload.message.sender_type === 'master') {
                        playNotificationSound();
                    }
                }
            } catch (err) {
                console.error('소켓 메시지 파싱 오류:', err);
            }
        };

        ws.onclose = () => {
            console.warn('소켓 연결 종료. 3초 후 재연결 시도...');
            setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (err) => {
            console.error('소켓 에러:', err);
            ws.close();
        };
    }

    connectWebSocket();

    // 4. 메시지 전송 함수
    function sendMessage(msgType, content, fileName = '', fileSize = 0) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            alert('연결이 불안정합니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        ws.send(JSON.stringify({
            sender_type: 'client',
            sender_name: myNickname,
            msg_type: msgType,
            content: content,
            file_name: fileName,
            file_size: fileSize
        }));
    }

    // 텍스트 전송
    function handleSendText() {
        const text = messageInput.value.trim();
        if (!text) return;

        sendMessage('text', text);
        messageInput.value = '';
        messageInput.style.height = 'auto';
        messageInput.focus();
    }

    sendBtn.addEventListener('click', handleSendText);

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendText();
        }
    });

    // 5. 사진 업로드 처리 (모바일 갤러리/카메라)
    imageInput.addEventListener('change', async () => {
        const file = imageInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok && data.success) {
                sendMessage('image', data.url, data.file_name, data.file_size);
            } else {
                alert('사진 업로드에 실패했습니다.');
            }
        } catch (e) {
            console.error(e);
            alert('사진 전송 중 오류가 발생했습니다.');
        } finally {
            imageInput.value = '';
            attachMenu.classList.add('hidden');
        }
    });

    // 6. 파일 첨부 처리
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (res.ok && data.success) {
                sendMessage(data.msg_type, data.url, data.file_name, data.file_size);
            } else {
                alert('파일 업로드에 실패했습니다.');
            }
        } catch (e) {
            console.error(e);
            alert('파일 전송 중 오류가 발생했습니다.');
        } finally {
            fileInput.value = '';
            attachMenu.classList.add('hidden');
        }
    });
});
