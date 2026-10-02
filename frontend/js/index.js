document.addEventListener('DOMContentLoaded', () => {
    const nicknameInput = document.getElementById('nickname-input');
    const masterPasswordBox = document.getElementById('master-password-box');
    const masterPassword = document.getElementById('master-password');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const joinForm = document.getElementById('join-form');
    const resumeBanner = document.getElementById('resume-banner');
    const resumeName = document.getElementById('resume-name');
    const resumeBtn = document.getElementById('resume-btn');

    const MASTER_EMAIL = 'skpark@iconix.co.kr';

    // 1. 기존 고객 세션 확인
    const savedSession = localStorage.getItem('oz_client_session');
    const savedNickname = localStorage.getItem('oz_client_nickname');
    const savedRoomId = localStorage.getItem('oz_client_room_id');

    if (savedSession && savedNickname && savedRoomId) {
        resumeName.textContent = `${savedNickname} 님의 이전 상담`;
        resumeBanner.classList.remove('hidden');

        resumeBtn.addEventListener('click', () => {
            window.location.href = '/client';
        });
    }

    // 2. 입력값 실시간 감지 (마스터 이메일 확인)
    nicknameInput.addEventListener('input', () => {
        const val = nicknameInput.value.trim().toLowerCase();
        if (val === MASTER_EMAIL) {
            masterPasswordBox.classList.remove('hidden');
            btnText.textContent = '마스터 로그인';
            submitBtn.classList.remove('bg-teal-600', 'hover:bg-teal-700');
            submitBtn.classList.add('bg-slate-800', 'hover:bg-slate-900');
        } else {
            masterPasswordBox.classList.add('hidden');
            btnText.textContent = '프로필 생성 & 대화 시작';
            submitBtn.classList.remove('bg-slate-800', 'hover:bg-slate-900');
            submitBtn.classList.add('bg-teal-600', 'hover:bg-teal-700');
        }
    });

    // 3. 제출 처리
    joinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputVal = nicknameInput.value.trim();
        if (!inputVal) {
            alert('이름 또는 문구를 입력해주세요.');
            nicknameInput.focus();
            return;
        }

        // A. 마스터 계정 로그인 분기
        if (inputVal.toLowerCase() === MASTER_EMAIL) {
            const pwd = masterPassword.value.trim();
            if (!pwd) {
                alert('마스터 비밀번호를 입력해주세요.');
                masterPassword.focus();
                return;
            }

            try {
                const res = await fetch('/api/auth/master', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: inputVal, password: pwd })
                });

                const data = await res.json();
                if (res.ok && data.success) {
                    sessionStorage.setItem('oz_master_auth', JSON.stringify(data.user));
                    window.location.href = '/master';
                } else {
                    alert(data.detail || '비밀번호가 올바르지 않습니다.');
                    masterPassword.focus();
                }
            } catch (err) {
                console.error(err);
                alert('서버 연결 중 오류가 발생했습니다.');
            }
            return;
        }

        // B. 일반 고객 프로필 생성 및 대화방 입장
        try {
            submitBtn.disabled = true;
            btnText.textContent = '대화방 생성 중...';

            const payload = {
                nickname: inputVal,
                session_id: localStorage.getItem('oz_client_session') || null
            };

            const res = await fetch('/api/auth/client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok && data.success) {
                localStorage.setItem('oz_client_session', data.session_id);
                localStorage.setItem('oz_client_nickname', data.nickname);
                localStorage.setItem('oz_client_room_id', data.room_id);
                localStorage.setItem('oz_client_user_id', data.user_id);
                window.location.href = '/client';
            } else {
                alert(data.detail || '대화방 생성에 실패했습니다.');
            }
        } catch (err) {
            console.error(err);
            alert('서버 연결 중 오류가 발생했습니다.');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = '프로필 생성 & 대화 시작';
        }
    });
});
