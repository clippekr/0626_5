(function () {
  'use strict';

  /* ─────────── 설정 ─────────── */
  const API_URL    = '/api/chat';
  const MAX_HIST   = 10; // 최근 10개 메시지(5턴) 유지
  const WELCOME    = '안녕하세요! 👋 저는 S마케팅 AI 상담사 **S봇**이에요.\n서비스, 비용, 진행 방식 등 궁금한 점을 편하게 물어보세요!';
  const OPEN_DELAY = 1000; // 환영 메시지 표시까지 대기(ms)

  let history  = [];
  let loading  = false;

  /* ─────────── 스타일 ─────────── */
  const CSS = `
    #scb-btn {
      position:fixed; bottom:28px; right:28px;
      width:58px; height:58px; border-radius:50%;
      background:#F2994A; border:none; cursor:pointer;
      box-shadow:0 4px 24px rgba(242,153,74,.45);
      z-index:9999; display:flex; align-items:center; justify-content:center;
      transition:transform .2s, background .2s;
      font-family:'Pretendard','Inter',sans-serif;
    }
    #scb-btn:hover { transform:scale(1.09); background:#e08537; }
    #scb-btn .scb-ico-chat  { display:flex; }
    #scb-btn .scb-ico-close { display:none; }
    #scb-btn.open .scb-ico-chat  { display:none; }
    #scb-btn.open .scb-ico-close { display:flex; }

    /* 알림 뱃지 */
    #scb-badge {
      position:absolute; top:-3px; right:-3px;
      width:14px; height:14px; border-radius:50%;
      background:#e53e3e; border:2px solid #fff;
      display:none;
    }
    #scb-badge.show { display:block; }

    /* 채팅 창 */
    #scb-win {
      position:fixed; bottom:100px; right:28px;
      width:380px; max-width:calc(100vw - 40px);
      height:540px; max-height:calc(100vh - 130px);
      background:#fff; border-radius:16px;
      box-shadow:0 8px 40px rgba(0,0,0,.18);
      z-index:9998; display:flex; flex-direction:column;
      overflow:hidden;
      font-family:'Pretendard','Inter',sans-serif;
      transform:translateY(18px); opacity:0; pointer-events:none;
      transition:transform .28s cubic-bezier(.4,0,.2,1), opacity .28s ease;
    }
    #scb-win.open { transform:translateY(0); opacity:1; pointer-events:all; }

    /* 헤더 */
    #scb-header {
      background:#1E3A5F; color:#fff; flex-shrink:0;
      padding:14px 18px; display:flex; align-items:center; gap:12px;
    }
    .scb-avatar {
      width:38px; height:38px; border-radius:50%;
      background:#F2994A; color:#1E3A5F;
      display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:17px; flex-shrink:0;
      font-family:'Pretendard',sans-serif;
    }
    .scb-hd-title { font-size:15px; font-weight:700; line-height:1.2; }
    .scb-hd-sub   { font-size:11px; color:rgba(255,255,255,.6); margin-top:2px; }
    .scb-online-dot {
      width:8px; height:8px; border-radius:50%;
      background:#48bb78; margin-right:4px; display:inline-block;
    }

    /* 메시지 영역 */
    #scb-msgs {
      flex:1; overflow-y:auto; padding:18px 14px;
      display:flex; flex-direction:column; gap:10px;
      background:#F8F9FB;
    }
    #scb-msgs::-webkit-scrollbar { width:4px; }
    #scb-msgs::-webkit-scrollbar-thumb { background:#ddd; border-radius:4px; }

    .scb-row       { display:flex; gap:8px; max-width:88%; }
    .scb-row.bot   { align-self:flex-start; }
    .scb-row.user  { align-self:flex-end; flex-direction:row-reverse; }

    .scb-bubble {
      padding:10px 14px; border-radius:14px;
      font-size:14px; line-height:1.6; word-break:break-word;
      white-space:pre-wrap;
    }
    .scb-row.bot  .scb-bubble {
      background:#fff; color:#333;
      border:1px solid #e8e8e8; border-bottom-left-radius:4px;
      box-shadow:0 1px 4px rgba(0,0,0,.06);
    }
    .scb-row.user .scb-bubble {
      background:#F2994A; color:#fff; border-bottom-right-radius:4px;
    }

    /* 로딩 점 */
    .scb-dots {
      display:flex; gap:5px; padding:12px 14px;
      background:#fff; border:1px solid #e8e8e8;
      border-radius:14px; border-bottom-left-radius:4px;
      box-shadow:0 1px 4px rgba(0,0,0,.06);
    }
    .scb-dot {
      width:7px; height:7px; border-radius:50%; background:#bbb;
      animation:scbPulse 1.2s ease-in-out infinite;
    }
    .scb-dot:nth-child(2){ animation-delay:.2s; }
    .scb-dot:nth-child(3){ animation-delay:.4s; }
    @keyframes scbPulse {
      0%,80%,100%{ transform:scale(.7); opacity:.45; }
      40%        { transform:scale(1);  opacity:1;   }
    }

    /* 에러 */
    .scb-err {
      align-self:center; font-size:12px; color:#c53030;
      background:#fff5f5; border:1px solid #fed7d7;
      border-radius:8px; padding:7px 14px;
    }

    /* 입력 영역 */
    #scb-form {
      padding:10px 12px; border-top:1px solid #eee;
      display:flex; gap:8px; background:#fff; flex-shrink:0;
      align-items:flex-end;
    }
    #scb-input {
      flex:1; border:1px solid #e0e0e0; border-radius:22px;
      padding:9px 16px; font-size:14px;
      font-family:'Pretendard','Inter',sans-serif;
      outline:none; resize:none; overflow:hidden;
      background:#F8F9FB; color:#333; line-height:1.5;
      max-height:100px; transition:border-color .2s, background .2s;
    }
    #scb-input:focus { border-color:#1E3A5F; background:#fff; }
    #scb-send {
      width:40px; height:40px; flex-shrink:0; border-radius:50%;
      background:#1E3A5F; border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      transition:background .2s, transform .15s;
    }
    #scb-send:hover:not(:disabled) { background:#16293F; transform:scale(1.06); }
    #scb-send:disabled { background:#ccc; cursor:default; }
    #scb-send svg { width:17px; height:17px; }

    /* 모바일 */
    @media(max-width:480px){
      #scb-win  { right:20px; bottom:84px; }
      #scb-btn  { bottom:20px; right:20px; }
    }
  `;

  /* ─────────── SVG 아이콘 ─────────── */
  const ICON_CHAT = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`;

  const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  const ICON_SEND = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>`;

  /* ─────────── UI 구성 ─────────── */
  function buildUI() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // 플로팅 버튼
    const btn = document.createElement('button');
    btn.id = 'scb-btn';
    btn.setAttribute('aria-label', '채팅 상담 열기');
    btn.innerHTML = `
      <span class="scb-ico-chat">${ICON_CHAT}</span>
      <span class="scb-ico-close">${ICON_CLOSE}</span>
      <span id="scb-badge"></span>`;

    // 채팅 창
    const win = document.createElement('div');
    win.id = 'scb-win';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'S마케팅 챗봇 상담');
    win.innerHTML = `
      <div id="scb-header">
        <div class="scb-avatar">S</div>
        <div>
          <div class="scb-hd-title">S봇</div>
          <div class="scb-hd-sub"><span class="scb-online-dot"></span>S마케팅 AI 상담사</div>
        </div>
      </div>
      <div id="scb-msgs" role="log" aria-live="polite"></div>
      <form id="scb-form" autocomplete="off">
        <textarea id="scb-input" rows="1"
          placeholder="궁금한 점을 입력하세요…"
          maxlength="500" aria-label="메시지 입력"></textarea>
        <button id="scb-send" type="submit" aria-label="전송">${ICON_SEND}</button>
      </form>`;

    document.body.appendChild(btn);
    document.body.appendChild(win);
  }

  /* ─────────── 메시지 렌더 ─────────── */
  function $msgs() { return document.getElementById('scb-msgs'); }

  function addMsg(role, text) {
    const row    = document.createElement('div');
    row.className = `scb-row ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'scb-bubble';
    // **굵게** 마크다운 최소 파싱
    bubble.innerHTML = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    row.appendChild(bubble);
    $msgs().appendChild(row);
    $msgs().scrollTop = $msgs().scrollHeight;
    return row;
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function showLoading() {
    const row = document.createElement('div');
    row.id = 'scb-loading';
    row.className = 'scb-row bot';
    row.innerHTML = `<div class="scb-dots">
      <div class="scb-dot"></div><div class="scb-dot"></div><div class="scb-dot"></div>
    </div>`;
    $msgs().appendChild(row);
    $msgs().scrollTop = $msgs().scrollHeight;
  }

  function hideLoading() {
    const el = document.getElementById('scb-loading');
    if (el) el.remove();
  }

  function addError(msg) {
    const div = document.createElement('div');
    div.className = 'scb-err';
    div.textContent = msg;
    $msgs().appendChild(div);
    $msgs().scrollTop = $msgs().scrollHeight;
  }

  /* ─────────── API 호출 ─────────── */
  async function send(userText) {
    if (loading) return;
    loading = true;

    history.push({ role: 'user', content: userText });
    if (history.length > MAX_HIST) history = history.slice(-MAX_HIST);

    addMsg('user', userText);
    showLoading();

    const sendBtn = document.getElementById('scb-send');
    if (sendBtn) sendBtn.disabled = true;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      hideLoading();

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data  = await res.json();
      const reply = data.reply || '죄송합니다, 응답을 받지 못했습니다.';

      history.push({ role: 'assistant', content: reply });
      if (history.length > MAX_HIST) history = history.slice(-MAX_HIST);

      addMsg('bot', reply);
    } catch (e) {
      hideLoading();
      console.error('[S봇]', e);
      // 실패한 사용자 메시지는 히스토리에서 제거
      if (history.at(-1)?.role === 'user') history.pop();
      addError('⚠️ 응답을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      loading = false;
      if (sendBtn) sendBtn.disabled = false;
      const inp = document.getElementById('scb-input');
      if (inp) inp.focus();
    }
  }

  /* ─────────── 창 토글 ─────────── */
  let isOpen = false;

  function toggle() {
    isOpen = !isOpen;
    document.getElementById('scb-btn').classList.toggle('open', isOpen);
    document.getElementById('scb-win').classList.toggle('open', isOpen);
    document.getElementById('scb-badge').classList.remove('show');

    if (isOpen) {
      setTimeout(() => {
        const inp = document.getElementById('scb-input');
        if (inp) inp.focus();
      }, 300);
    }
  }

  /* ─────────── textarea 자동 높이 ─────────── */
  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  /* ─────────── 초기화 ─────────── */
  function init() {
    buildUI();

    document.getElementById('scb-btn').addEventListener('click', toggle);

    const form = document.getElementById('scb-form');
    const inp  = document.getElementById('scb-input');

    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = inp.value.trim();
      if (!text || loading) return;
      inp.value = '';
      autoResize(inp);
      send(text);
    });

    // Enter 전송 / Shift+Enter 줄바꿈
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.dispatchEvent(new Event('submit', { bubbles: true }));
      }
    });

    inp.addEventListener('input', () => autoResize(inp));

    // 환영 메시지 (1초 후 메시지 추가 + 뱃지 표시)
    setTimeout(() => {
      addMsg('bot', WELCOME);
      if (!isOpen) {
        document.getElementById('scb-badge').classList.add('show');
      }
    }, OPEN_DELAY);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
