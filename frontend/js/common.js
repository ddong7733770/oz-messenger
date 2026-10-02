// 공통 유틸리티 함수 모듈

// 1. Web Audio API를 활용한 알림 차임벨 사운드 (파일 다운로드 없이 즉시 재생)
let audioCtx = null;
function playNotificationSound() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;
        // 딩 (880Hz - A5)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.15, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // 동 (1174.66Hz - D6)
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1174.66, now + 0.12);
        gain2.gain.setValueAtTime(0.2, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.6);
    } catch (e) {
        console.warn("오디오 알림 재생 실패:", e);
    }
}

// 2. 파일 크기 사람이 읽기 좋은 포맷
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// 3. HTML 특수문자 이스케이프 (XSS 방지)
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 4. URL 링크 자동 하이퍼링크 변환
function linkify(text) {
    const escaped = escapeHtml(text);
    const urlPattern = /(\b(https?:\/\/|www\.)[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return escaped.replace(urlPattern, function(match) {
        let url = match;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="underline hover:opacity-80">${match}</a>`;
    }).replace(/\n/g, '<br>');
}

// 5. 이미지 라이트박스 확대 뷰어
function openLightbox(src) {
    let modal = document.getElementById('lightbox-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lightbox-modal';
        modal.className = 'lightbox-modal';
        modal.onclick = () => modal.remove();
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div class="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <img src="${src}" alt="확대 이미지" class="max-h-[85vh] rounded-lg shadow-2xl">
            <button class="absolute -top-10 right-0 text-white text-2xl font-bold p-2 hover:text-gray-300">&times; 닫기</button>
        </div>
    `;
}
