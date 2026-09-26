// ============================================================
// 회원 메시지: 1회성 안내 메시지 발송/이력 (48시간 내 미확인 시 만료)
// CrossFit Box 관리자 - admin-members.js에서 분리된 스크립트
// ============================================================

// ── 회원 메시지 (1회성 안내, 48시간 내 미확인 시 만료) ──
function openMessageModal(id, name) {
  document.getElementById('msg-target-id').value = id;
  document.getElementById('msg-target-name').textContent = name;
  document.getElementById('msg-content').value = '';
  document.getElementById('message-modal').classList.add('open');
}

async function submitMessage() {
  const id = document.getElementById('msg-target-id').value;
  const content = document.getElementById('msg-content').value.trim();
  if (!content) return alert('메시지 내용을 입력해주세요');
  try {
    const res = await adminFetch(API + '/members/' + id + '/messages', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (!res.ok || data.error) return alert(data.error || '메시지 전송에 실패했습니다.');
    alert('메시지를 보냈습니다.');
    closeModal('message-modal');
  } catch (e) {
    alert('메시지 전송 중 오류가 발생했습니다. 서버가 최신 버전으로 재시작되었는지 확인해주세요.');
  }
}

async function openMessageHistory(id, name) {
  document.getElementById('msg-history-title').textContent = `${name} — 메시지 이력`;
  let list = [];
  let failed = false;
  try {
    const res = await adminFetch(API + '/members/' + id + '/messages');
    if (!res.ok) throw new Error('failed');
    list = await res.json();
  } catch (e) { failed = true; }
  const box = document.getElementById('msg-history-list');
  if (failed) {
    box.innerHTML = '<div class="empty-state">이력을 불러오지 못했습니다. 서버 상태를 확인해주세요.</div>';
    document.getElementById('message-history-modal').classList.add('open');
    return;
  }
  box.innerHTML = list.length
    ? list.map(m => {
        const st = messageStatusInfo(m);
        return `
      <div style="border:1px solid #e5e5e5;border-radius:10px;padding:12px 14px;margin-bottom:10px">
        <div style="font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word">${escapeHtml(m.content)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:11px;color:#aaa">
          <span>${m.created_at}</span>
          <span style="color:${st.color};font-weight:600">${st.text}</span>
        </div>
      </div>`;
      }).join('')
    : '<div class="empty-state">보낸 메시지가 없습니다</div>';
  document.getElementById('message-history-modal').classList.add('open');
}

// 메시지 상태 판별: 확인함 / 기간만료(48시간 내 미확인) / 미확인
const MESSAGE_EXPIRY_MS = 48 * 60 * 60 * 1000;
function messageStatusInfo(m) {
  if (m.read_at) return { text: '✅ 확인함 · ' + m.read_at, color: '#2e7d32' };
  const createdMs = new Date(String(m.created_at).replace(' ', 'T')).getTime();
  const expired = !isNaN(createdMs) && (Date.now() - createdMs > MESSAGE_EXPIRY_MS);
  if (expired) return { text: '⏰ 기간만료', color: '#999' };
  return { text: '⏳ 미확인', color: '#e65100' };
}
