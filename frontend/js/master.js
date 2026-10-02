document.addEventListener('DOMContentLoaded', async () => {
    // 1. 마스터 인증 확인
    const authData = sessionStorage.getItem('oz_master_auth');
    if (!authData) {
        alert('마스터 로그인이 필요합니다.');
        window.location.href = '/';
        return;
    }

    const masterUser = JSON.parse(authData);

    // DOM 요소
    const logoutBtn = document.getElementById('logout-btn');
    const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
    const roomsList = document.getElementById('rooms-list');
    const roomSearchInput = document.getElementById('room-search-input');
    const filterTabs = document.querySelectorAll('.filter-tab');

    const emptyState = document.getElementById('empty-state');
    const activeChatContainer = document.getElementById('active-chat-container');
    const backToRoomsBtn = document.getElementById('back-to-rooms-btn');
    const roomsPanel = document.getElementById('rooms-panel');

    const currentClientName = document.getElementById('current-client-name');
    const currentClientBadge = document.getElementById('current-client-badge');
    const currentClientSub = document.getElementById('current-client-sub');
    const statusSelect = document.getElementById('status-select');
    const masterChatMessages = document.getElementById('master-chat-messages');

    const masterAttachToggleBtn = document.getElementById('master-attach-toggle-btn');
    const masterAttachMenu = document.getElementById('master-attach-menu');
    const masterImageInput = document.getElementById('master-image-input');
    const masterFileInput = document.getElementById('master-file-input');
    const masterMessageInput = document.getElementById('master-message-input');
    const masterSendBtn = document.getElementById('master-send-btn');
    const cannedResponsesBar = document.getElementById('canned-responses-bar');

    // 메모 패널
    const toggleMemoBtn = document.getElementById('toggle-memo-btn');
    const closeMemoBtn = document.getElementById('close-memo-btn');
    const memoPanel = document.getElementById('memo-panel');
    const memoClientName = document.getElementById('memo-client-name');
    const memoClientDate = document.getElementById('memo-client-date');
    const memoTextarea = document.getElementById('memo-textarea');
    const memoSaveStatus = document.getElementById('memo-save-status');

    let currentRoomId = null;
    let currentRoomData = null;
    let allRooms = [];
    let currentFilter = 'all';
    let masterWs = null;
    let currentRoomWs = null;
    let memoDebounceTimer = null;

    // 로그아웃
    logoutBtn.addEventListener('click', () => {
        if (confirm('마스터 콘솔에서 로그아웃하시겠습니까?')) {
            sessionStorage.removeItem('oz_master_auth');
            window.location.href = '/';
        }
    });

    // 2. 마스터 글로벌 WebSocket 연결 (룸 알림 및 전체 수신)
    function connectMasterWs() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/master`;
        masterWs = new WebSocket(wsUrl);

        masterWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'new_room' || data.event === 'room_updated') {
                    // 새 메시지 알림음 (내가 보낸 게 아닌 경우)
                    if (data.sender_type === 'client') {
                        playNotificationSound();
                    }
                    loadRooms(false);
                }
            } catch (err) {
                console.error('마스터 소켓 파싱 오류:', err);
            }
        };

        masterWs.onclose = () => {
            setTimeout(connectMasterWs, 3000);
        };
    }
    connectMasterWs();

    // 3. 룸 목록 조회 및 렌더링
    async function loadRooms(selectFirstIfEmpty = false) {
        try {
            const res = await fetch('/api/rooms');
            if (res.ok) {
                const data = await res.json();
                allRooms = data.rooms || [];
                renderRoomsList();

                // 선택된 방이 아직 없고 PC 화면인 경우 첫 번째 방 자동 선택
                if (selectFirstIfEmpty && !currentRoomId && allRooms.length > 0 && window.innerWidth >= 768) {
                    selectRoom(allRooms[0].id);
                }
            }
        } catch (e) {
            console.error('방 목록 로드 실패:', e);
        }
    }

    function renderRoomsList() {
        const keyword = roomSearchInput.value.trim().toLowerCase();
        const filtered = allRooms.filter(room => {
            const matchName = room.nickname.toLowerCase().includes(keyword);
            if (currentFilter === 'all') return matchName;
            return matchName && room.status === currentFilter;
        });

        roomsList.innerHTML = '';
        if (filtered.length === 0) {
            roomsList.innerHTML = `
                <div class="p-8 text-center text-slate-400 text-xs">
                    조건에 맞는 상담방이 없습니다.
                </div>
            `;
            return;
        }

        filtered.forEach(room => {
            const item = document.createElement('div');
            const isSelected = (currentRoomId === room.id);
            item.className = `p-3.5 flex items-start space-x-3 cursor-pointer transition ${
                isSelected ? 'bg-teal-50/70 border-l-4 border-teal-600' : 'hover:bg-slate-50 border-l-4 border-transparent'
            }`;

            // 상태 배지 클래스
            let statusText = '대기중';
            let statusClass = 'badge-waiting';
            if (room.status === 'active') {
                statusText = '상담중';
                statusClass = 'badge-active';
            } else if (room.status === 'closed') {
                statusText = '완료';
                statusClass = 'badge-closed';
            }

            const unreadBadge = room.unread_master > 0 
                ? `<span class="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">${room.unread_master}</span>`
                : '';

            item.innerHTML = `
                <div class="w-10 h-10 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center flex-shrink-0 text-sm">
                    ${escapeHtml(room.nickname.substring(0, 2))}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                        <h4 class="font-bold text-xs text-slate-800 truncate">${escapeHtml(room.nickname)}</h4>
                        <span class="text-[10px] text-slate-400 flex-shrink-0">${room.last_message_at || ''}</span>
                    </div>
                    <p class="text-xs text-slate-500 truncate mb-1.5">${escapeHtml(room.last_message || '새로운 대화가 시작되었습니다.')}</p>
                    <div class="flex items-center justify-between">
                        <span class="${statusClass} text-[10px] font-semibold px-2 py-0.5 rounded-full">${statusText}</span>
                        ${unreadBadge}
                    </div>
                </div>
            `;

            item.addEventListener('click', () => {
                selectRoom(room.id);
            });

            roomsList.appendChild(item);
        });
    }

    // 4. 특정 대화방 선택
    async function selectRoom(roomId) {
        currentRoomId = roomId;
        renderRoomsList(); // 선택 하이라이트 갱신

        // 모바일인 경우 좌측 패널 숨김
        if (window.innerWidth < 768) {
            roomsPanel.classList.add('-translate-x-full');
            roomsPanel.classList.add('hidden');
        }

        try {
            const res = await fetch(`/api/rooms/${roomId}/messages?is_master=true`);
            if (res.ok) {
                const data = await res.json();
                currentRoomData = data.room;
                
                // 상단 헤더 업데이트
                currentClientName.textContent = currentRoomData.nickname;
                currentClientSub.textContent = `접속 일시: ${currentRoomData.client_created_at || currentRoomData.created_at}`;
                statusSelect.value = currentRoomData.status || 'waiting';
                updateStatusBadge(currentRoomData.status);

                // 메모 업데이트
                memoClientName.textContent = currentRoomData.nickname;
                memoClientDate.textContent = currentRoomData.client_created_at || '-';
                memoTextarea.value = currentRoomData.memo || '';
                memoSaveStatus.textContent = '저장됨';

                // 대화 렌더링
                masterChatMessages.innerHTML = '';
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => renderMasterMessage(msg));
                }

                emptyState.classList.add('hidden');
                activeChatContainer.classList.remove('hidden');

                scrollToBottom(false);

                // 룸 전용 소켓 연결
                connectCurrentRoomWs(roomId);

                // 안 읽은 수 초기화 반영
                const target = allRooms.find(r => r.id === roomId);
                if (target) target.unread_master = 0;
                renderRoomsList();
            }
        } catch (e) {
            console.error('방 상세 조회 실패:', e);
        }
    }

    // 모바일 목록으로 복귀
    backToRoomsBtn.addEventListener('click', () => {
        roomsPanel.classList.remove('hidden');
        roomsPanel.classList.remove('-translate-x-full');
    });

    // 5. 현재 선택된 룸 웹소켓 연결
    function connectCurrentRoomWs(roomId) {
        if (currentRoomWs) {
            currentRoomWs.close();
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/room/${roomId}`;
        currentRoomWs = new WebSocket(wsUrl);

        currentRoomWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.event === 'new_message' && data.message.room_id === currentRoomId) {
                    renderMasterMessage(data.message);
                    scrollToBottom(true);
                }
            } catch (e) {
                console.error(e);
            }
        };
    }

    // 6. 메시지 렌더링 (핵심: 마스터 대화=왼쪽, 일반 계정 대화=오른쪽)
    function renderMasterMessage(msg) {
        const isMaster = (msg.sender_type === 'master');
        const container = document.createElement('div');
        container.className = `flex flex-col msg-anim ${isMaster ? 'items-start' : 'items-end'}`;

        let bodyContent = '';
        if (msg.msg_type === 'image') {
            bodyContent = `
                <div class="cursor-pointer overflow-hidden rounded-xl" onclick="openLightbox('${msg.content}')">
                    <img src="${msg.content}" alt="사진" class="max-w-[240px] max-h-[300px] object-cover hover:scale-105 transition duration-200">
                </div>
            `;
        } else if (msg.msg_type === 'file') {
            bodyContent = `
                <a href="${msg.content}" download="${escapeHtml(msg.file_name)}" class="flex items-center space-x-2.5 p-2 rounded-xl hover:opacity-90 transition">
                    <div class="w-9 h-9 rounded-lg ${isMaster ? 'bg-slate-300/60 text-slate-700' : 'bg-white/20 text-white'} flex items-center justify-center flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <div class="overflow-hidden text-left">
                        <p class="text-xs font-semibold truncate max-w-[170px]">${escapeHtml(msg.file_name || '첨부파일')}</p>
                        <p class="text-[10px] opacity-75">${formatFileSize(msg.file_size)}</p>
                    </div>
                </a>
            `;
        } else {
            bodyContent = `<div class="text-sm break-words leading-relaxed whitespace-pre-wrap">${linkify(msg.content)}</div>`;
        }

        if (isMaster) {
            // [요구사항 4] 마스터 계정 대화는 왼쪽 노출
            container.innerHTML = `
                <div class="flex items-end space-x-2 max-w-[80%]">
                    <div class="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm mb-1">
                        오즈
                    </div>
                    <div>
                        <span class="text-[11px] font-semibold text-teal-700 ml-1 mb-1 block">오즈 (나)</span>
                        <div class="bubble-master p-3.5 border border-slate-200/80">
                            ${bodyContent}
                        </div>
                    </div>
                </div>
                <span class="text-[10px] text-slate-400 mt-1 ml-10">${msg.created_at || ''}</span>
            `;
        } else {
            // [요구사항 4] 일반 계정 대화는 오른쪽 노출
            container.innerHTML = `
                <div class="max-w-[80%]">
                    <span class="text-[11px] font-semibold text-slate-500 mr-1 mb-1 block text-right">${escapeHtml(msg.sender_name)}</span>
                    <div class="bubble-client p-3.5">
                        ${bodyContent}
                    </div>
                </div>
                <span class="text-[10px] text-slate-400 mt-1 mr-1">${msg.created_at || ''}</span>
            `;
        }

        masterChatMessages.appendChild(container);
    }

    function scrollToBottom(smooth = true) {
        setTimeout(() => {
            masterChatMessages.scrollTo({
                top: masterChatMessages.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }, 50);
    }

    // 7. 마스터 메시지 전송 로직
    function sendMasterMessage(msgType, content, fileName = '', fileSize = 0) {
        if (!currentRoomWs || currentRoomWs.readyState !== WebSocket.OPEN) {
            alert('상담방 소켓이 연결되지 않았습니다.');
            return;
        }

        currentRoomWs.send(JSON.stringify({
            sender_type: 'master',
            sender_name: '오즈',
            msg_type: msgType,
            content: content,
            file_name: fileName,
            file_size: fileSize
        }));
    }

    function handleSendMasterText() {
        const text = masterMessageInput.value.trim();
        if (!text) return;

        sendMasterMessage('text', text);
        masterMessageInput.value = '';
        masterMessageInput.style.height = 'auto';
        masterMessageInput.focus();
    }

    masterSendBtn.addEventListener('click', handleSendMasterText);

    masterMessageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMasterText();
        }
    });

    masterMessageInput.addEventListener('input', () => {
        masterMessageInput.style.height = 'auto';
        masterMessageInput.style.height = Math.min(masterMessageInput.scrollHeight, 120) + 'px';
    });

    // 8. 첨부 메뉴 토글 및 업로드
    masterAttachToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        masterAttachMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
        masterAttachMenu.classList.add('hidden');
    });

    masterImageInput.addEventListener('change', async () => {
        const file = masterImageInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok && data.success) {
                sendMasterMessage('image', data.url, data.file_name, data.file_size);
            }
        } catch (e) {
            alert('사진 전송 실패');
        } finally {
            masterImageInput.value = '';
            masterAttachMenu.classList.add('hidden');
        }
    });

    masterFileInput.addEventListener('change', async () => {
        const file = masterFileInput.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok && data.success) {
                sendMasterMessage(data.msg_type, data.url, data.file_name, data.file_size);
            }
        } catch (e) {
            alert('파일 전송 실패');
        } finally {
            masterFileInput.value = '';
            masterAttachMenu.classList.add('hidden');
        }
    });

    // 9. 빠른 답변 템플릿 로드
    async function loadTemplates() {
        try {
            const res = await fetch('/api/templates');
            if (res.ok) {
                const data = await res.json();
                cannedResponsesBar.innerHTML = '';
                data.templates.forEach(tpl => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'px-2.5 py-1 bg-white hover:bg-teal-50 hover:text-teal-700 text-slate-700 rounded-lg border border-slate-200 font-medium whitespace-nowrap transition shadow-sm';
                    btn.textContent = tpl.title;
                    btn.title = tpl.content;

                    btn.addEventListener('click', () => {
                        // 클릭 시 바로 입력창에 삽입
                        masterMessageInput.value = tpl.content;
                        masterMessageInput.focus();
                        masterMessageInput.style.height = 'auto';
                        masterMessageInput.style.height = Math.min(masterMessageInput.scrollHeight, 120) + 'px';
                    });

                    cannedResponsesBar.appendChild(btn);
                });
            }
        } catch (e) {
            console.error(e);
        }
    }
    loadTemplates();

    // 10. 상담 상태 변경
    statusSelect.addEventListener('change', async () => {
        if (!currentRoomId) return;
        const newStatus = statusSelect.value;
        try {
            const res = await fetch(`/api/rooms/${currentRoomId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                updateStatusBadge(newStatus);
                const target = allRooms.find(r => r.id === currentRoomId);
                if (target) target.status = newStatus;
                renderRoomsList();
            }
        } catch (e) {
            console.error('상태 변경 실패:', e);
        }
    });

    function updateStatusBadge(status) {
        currentClientBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full';
        if (status === 'active') {
            currentClientBadge.classList.add('badge-active');
            currentClientBadge.textContent = '상담중';
        } else if (status === 'closed') {
            currentClientBadge.classList.add('badge-closed');
            currentClientBadge.textContent = '완료';
        } else {
            currentClientBadge.classList.add('badge-waiting');
            currentClientBadge.textContent = '대기중';
        }
    }

    // 11. 고객 메모 저장 (디바운스 자동 저장)
    toggleMemoBtn.addEventListener('click', () => {
        memoPanel.classList.toggle('hidden');
    });
    closeMemoBtn.addEventListener('click', () => {
        memoPanel.classList.add('hidden');
    });

    memoTextarea.addEventListener('input', () => {
        memoSaveStatus.textContent = '저장 중...';
        clearTimeout(memoDebounceTimer);
        memoDebounceTimer = setTimeout(async () => {
            if (!currentRoomId) return;
            try {
                await fetch(`/api/rooms/${currentRoomId}/memo`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ memo: memoTextarea.value })
                });
                memoSaveStatus.textContent = '자동 저장됨';
            } catch (e) {
                memoSaveStatus.textContent = '저장 실패';
            }
        }, 600);
    });

    // 12. 필터 및 검색 이벤트
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => {
                t.className = 'filter-tab flex-1 py-1.5 rounded-lg font-semibold text-slate-500 hover:bg-slate-50';
            });
            tab.className = 'filter-tab flex-1 py-1.5 rounded-lg font-semibold bg-teal-50 text-teal-700';
            currentFilter = tab.getAttribute('data-filter');
            renderRoomsList();
        });
    });

    roomSearchInput.addEventListener('input', renderRoomsList);
    refreshRoomsBtn.addEventListener('click', () => loadRooms(false));

    // 최초 룸 로드
    await loadRooms(true);
});
