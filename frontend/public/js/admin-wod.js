// ============================================================
// WOD 관리: 등록/수정/삭제, 예약 발행
// CrossFit Box 관리자 - admin.html에서 분리된 스크립트
// ============================================================

let wodEditingId = null;

function initWodPage() {
  const dateInput = document.getElementById('wod-date');
  if (dateInput && !dateInput.value) dateInput.value = todayKST();
  updateWodDayLabel();
  loadWodForDate();
  loadWodList();
}

// 날짜 하루 이동
function changeWodDay(delta) {
  const dateInput = document.getElementById('wod-date');
  const base = dateInput.value || todayKST();
  dateInput.value = addDaysKST(base, delta);
  updateWodDayLabel();
  loadWodForDate();
}

// 요일 라벨 갱신
function updateWodDayLabel() {
  const dateInput = document.getElementById('wod-date');
  const label = document.getElementById('wod-day-label');
  if (!label || !dateInput.value) return;
  const dowIdx = new Date(dateInput.value + 'T00:00:00+09:00').getDay();
  const dow = ['일','월','화','수','목','금','토'][dowIdx];
  const isToday = dateInput.value === todayKST();
  label.textContent = dow + '요일' + (isToday ? ' · 오늘' : '');
  if (isToday) label.style.color = '#2e7d32';
  else if (dowIdx === 0) label.style.color = '#c62828';
  else if (dowIdx === 6) label.style.color = '#1565c0';
  else label.style.color = '#888';
}

// 선택한 날짜에 이미 WOD가 있으면 폼에 불러오기
async function loadWodForDate() {
  const date = document.getElementById('wod-date').value;
  if (!date) return;
  updateWodDayLabel();
  const wods = await adminFetch(API + '/wods/admin/' + date).then(r => r.json());
  const w = wods[0];
  if (w) {
    wodEditingId = w.id;
    document.getElementById('wod-title').value = w.title || '';
    document.getElementById('wod-content').value = w.content || '';
    // publish_at(YYYY-MM-DD HH:MM:SS) → 날짜/시간 필드로 분리
    document.getElementById('wod-publish-date').value = w.publish_at ? w.publish_at.slice(0,10) : '';
    document.getElementById('wod-publish-time').value = w.publish_at ? w.publish_at.slice(11,16) : '';
    document.getElementById('wod-delete-btn').style.display = 'inline-block';
  } else {
    wodEditingId = null;
    document.getElementById('wod-title').value = '';
    document.getElementById('wod-content').value = '';
    document.getElementById('wod-publish-date').value = '';
    document.getElementById('wod-publish-time').value = '12:00';
    document.getElementById('wod-delete-btn').style.display = 'none';
  }
}

async function submitWod() {
  const wod_date = document.getElementById('wod-date').value;
  const content = document.getElementById('wod-content').value.trim();
  if (!wod_date) return alert('날짜를 선택해주세요');
  if (!content) return alert('WOD 내용을 입력해주세요');
  const title = document.getElementById('wod-title').value.trim();

  // 공개 날짜 비우면 → 전날 자동 설정, 시간은 입력된 값(다이얼로 고른 값) 그대로 사용, 비었으면 낮 12시
  let pubDate = document.getElementById('wod-publish-date').value;
  let pubTime = document.getElementById('wod-publish-time').value;
  if (!pubDate) {
    // wod_date 하루 전 날짜 계산 (문자열 직접 연산으로 UTC 오차 방지)
    const [y, m, d] = wod_date.split('-').map(Number);
    const prev = new Date(y, m - 1, d - 1);
    pubDate = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}-${String(prev.getDate()).padStart(2,'0')}`;
  }
  if (!pubTime) pubTime = '12:00';
  const publish_at = `${pubDate} ${pubTime}:00`;
  // 폼에도 계산된 기본값 반영
  document.getElementById('wod-publish-date').value = pubDate;
  document.getElementById('wod-publish-time').value = pubTime;

  const data = await adminFetch(API + '/wods', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ wod_date, title, content, publish_at })
  }).then(r => r.json());
  if (data.error) return alert(data.error);
  alert(data.message);
  loadWodForDate();
  loadWodList();
}

async function deleteWod() {
  if (!wodEditingId) return;
  if (!confirm('이 날짜의 WOD를 삭제하시겠습니까?')) return;
  const data = await adminFetch(API + '/wods/' + wodEditingId, {method:'DELETE'}).then(r => r.json());
  if (data.error) return alert(data.error);
  alert('삭제되었습니다');
  loadWodForDate();
  loadWodList();
}

async function loadWodList() {
  const wods = await adminFetch(API + '/wods').then(r => r.json());
  const tbody = document.getElementById('wod-tbody');
  if (!wods.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">등록된 WOD가 없습니다</td></tr>'; return; }
  const now = new Date(Date.now() + 9*60*60*1000).toISOString().slice(0,16).replace('T',' ');
  tbody.innerHTML = wods.map(w => {
    let pub = '즉시 공개';
    if (w.publish_at) {
      const scheduled = w.publish_at.slice(0,16);
      pub = (scheduled > now)
        ? `<span style="color:#e65100">⏱ ${scheduled} 예약</span>`
        : scheduled;
    }
    return `<tr>
      <td style="font-weight:500">${w.wod_date}</td>
      <td>${escapeHtml(w.title) || '-'}</td>
      <td style="font-size:12px;color:#888">${pub}</td>
      <td><button class="action-btn" onclick="editWodFromList('${w.wod_date}')">수정</button></td>
    </tr>`;
  }).join('');
}

function editWodFromList(date) {
  document.getElementById('wod-date').value = date;
  updateWodDayLabel();
  loadWodForDate();
  window.scrollTo({top:0, behavior:'smooth'});
}

// ============================================================
// 공지 관리: 목록/추가/수정/삭제, 상단 고정
// ============================================================
async function loadNotices() {
  const list = await adminFetch(API + '/notices').then(r => r.json()).catch(() => []);
  const tbody = document.getElementById('notices-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">등록된 공지가 없습니다</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(n => {
    const date = (n.created_at || '').slice(0, 10);
    const contentShort = (n.content || '').length > 40 ? (n.content.slice(0, 40) + '…') : (n.content || '-');
    return `<tr>
      <td style="text-align:center;font-size:16px">${n.pinned ? '📌' : ''}</td>
      <td style="font-weight:500">${escapeHtml(n.title)}</td>
      <td style="font-size:13px;color:#888">${escapeHtml(contentShort)}</td>
      <td style="font-size:12px;color:#888">${date}</td>
      <td>
        <button class="action-btn" onclick='editNotice(${n.id})'>수정</button>
        <button class="action-btn danger" onclick="deleteNotice(${n.id})">삭제</button>
      </td>
    </tr>`;
  }).join('');
  window._noticesCache = list;
}

function openNoticeModal() {
  document.getElementById('notice-modal-title').textContent = '공지 추가';
  document.getElementById('notice-id').value = '';
  document.getElementById('notice-title').value = '';
  document.getElementById('notice-content').value = '';
  document.getElementById('notice-pinned').checked = false;
  document.getElementById('notice-modal').classList.add('open');
}

function editNotice(id) {
  const n = (window._noticesCache || []).find(x => x.id === id);
  if (!n) return;
  document.getElementById('notice-modal-title').textContent = '공지 수정';
  document.getElementById('notice-id').value = n.id;
  document.getElementById('notice-title').value = n.title || '';
  document.getElementById('notice-content').value = n.content || '';
  document.getElementById('notice-pinned').checked = !!n.pinned;
  document.getElementById('notice-modal').classList.add('open');
}

async function submitNotice() {
  const id = document.getElementById('notice-id').value;
  const title = document.getElementById('notice-title').value.trim();
  if (!title) return alert('제목을 입력해주세요');
  const content = document.getElementById('notice-content').value.trim();
  const pinned = document.getElementById('notice-pinned').checked;
  const body = JSON.stringify({ title, content, pinned });

  let res;
  if (id) {
    res = await adminFetch(API + '/notices/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
  } else {
    res = await adminFetch(API + '/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  }
  const data = await res.json().catch(() => ({}));
  if (data.error) return alert(data.error);
  closeModal('notice-modal');
  loadNotices();
}

async function deleteNotice(id) {
  if (!confirm('이 공지를 삭제하시겠습니까?')) return;
  const data = await adminFetch(API + '/notices/' + id, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
  if (data.error) return alert(data.error);
  loadNotices();
}