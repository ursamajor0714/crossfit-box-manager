// ============================================================
// 횟수권 관리: 등록/사용 처리/사용 이력
// CrossFit Grove 관리자 - admin-members.js에서 분리된 스크립트
// ============================================================

// 횟수권 등록 폼 토글
function toggleCountRegister() {
  const card = document.getElementById('ct-register-card');
  const btn = document.getElementById('ct-toggle-btn');
  const show = card.style.display === 'none';
  card.style.display = show ? 'block' : 'none';
  btn.textContent = show ? '✕ 닫기' : '+ 횟수권 등록';
  if (show) {
    const cs = document.getElementById('ct-start');
    if (cs && !cs.value) cs.value = todayKST();
  }
}

// 횟수권 전용 등록
async function submitCount() {
  const name = document.getElementById('ct-name').value.trim();
  if (!name) return alert('회원명을 입력해주세요');
  const total = parseInt(document.getElementById('ct-count').value);
  if (!total || total < 1) return alert('총 횟수를 입력해주세요');
  const start_date = document.getElementById('ct-start').value;
  if (!start_date) return alert('등록일을 선택해주세요');

  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
  const body = {
    name,
    phone: document.getElementById('ct-phone').value,
    gender: document.getElementById('ct-gender').value,
    age_group: document.getElementById('ct-age').value,
    source: document.getElementById('ct-source').value,
    region: val('ct-region') || null,
    birth_date: val('ct-birth') || null,
    insta: val('ct-insta').trim() || null,
    goal: val('ct-goal').trim() || null,
    injury: val('ct-injury').trim() || null,
    memo: document.getElementById('ct-memo').value,
    reg_type: '횟수권',
    plan: '횟수권',
    period: total,                 // 총 횟수 (표시용 'N회')
    remaining_count: total,        // 잔여 횟수 초기값
    amount: parseInt(document.getElementById('ct-amount').value) || 0,
    payment_method: document.getElementById('ct-payment').value,
    start_date,
    end_date: null,                // 횟수권은 만료일 개념 없음
  };
  const res = await adminFetch(API + '/members', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  const data = await res.json().catch(() => ({}));
  if (data.error) return alert(data.error);
  // 계약서에서 넘어온 횟수권 등록이면 계약서를 '등록완료'로 연결
  if (window._registeringCountContractId) {
    await adminFetch(API + '/contracts/' + window._registeringCountContractId + '/link', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ member_id: data.id || null })
    }).catch(()=>{});
    window._registeringCountContractId = null;
    if (typeof loadContracts === 'function') loadContracts();
  }
  alert(`${name} 님 횟수권 등록 완료! (${total}회)`);
  // 폼 초기화
  ['ct-name','ct-phone','ct-count','ct-amount','ct-memo','ct-region','ct-birth','ct-insta','ct-goal','ct-injury'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  // 등록 폼 닫기
  const card = document.getElementById('ct-register-card');
  const btn = document.getElementById('ct-toggle-btn');
  if (card) card.style.display = 'none';
  if (btn) btn.textContent = '+ 횟수권 등록';
  loadCounts();
}

async function loadCounts() {
  const counts = await adminFetch(API + '/counts').then(r => r.json());
  const tbody = document.getElementById('counts-tbody');
  if (!counts.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">횟수권 회원이 없습니다</td></tr>'; return; }
  tbody.innerHTML = counts.map(c => {
    const remainBadge = c.remaining_count > 0
      ? `<span class="badge badge-active">${c.remaining_count}회 남음</span>`
      : `<span class="badge badge-done">완료</span>`;
    return `<tr>
      <td style="font-weight:500">${escapeHtml(c.name)}</td>
      <td style="color:#888">${escapeHtml(c.phone)||'-'}</td>
      <td>${remainBadge}</td>
      <td style="color:#888">${c.used_count}회 사용</td>
      <td>${c.start_date||'-'}</td>
      <td>${(c.amount||0).toLocaleString('ko-KR')}원</td>
      <td><button class="action-btn" onclick="openCountModal(${c.reg_id},'${escapeJsAttr(c.name)}',${c.remaining_count},${c.used_count})">관리</button></td>
    </tr>`;
  }).join('');
}

async function openCountModal(regId, name, remaining, used) {
  document.getElementById('count-modal-title').textContent = `${name} — 횟수권`;
  const usage = await adminFetch(API + '/counts/' + regId + '/usage').then(r => r.json());
  const today = todayKST();

  const usageRows = usage.length
    ? usage.map(u => `<tr>
        <td>${u.used_date}</td>
        <td style="color:#888">${escapeHtml(u.memo)||'-'}</td>
        <td><button class="action-btn danger" onclick="cancelCountUsage(${u.id},${regId},'${escapeJsAttr(name)}',${remaining},${used})">취소</button></td>
      </tr>`).join('')
    : '<tr><td colspan="3" class="empty-state">사용 이력 없음</td></tr>';

  document.getElementById('count-modal-content').innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:20px">
      <div class="metric" style="flex:1;margin:0"><div class="metric-label">잔여 횟수</div><div class="metric-value" style="color:${remaining>0?'#2e7d32':'#c62828'}">${remaining}회</div></div>
      <div class="metric" style="flex:1;margin:0"><div class="metric-label">사용 횟수</div><div class="metric-value">${used}회</div></div>
    </div>

    ${remaining > 0 ? `
    <div class="section-box" style="margin-bottom:16px">
      <div class="section-box-title">✅ 사용 처리</div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <div class="form-group" style="flex:1"><label>날짜</label><input type="date" id="use-date" value="${today}"></div>
        <div class="form-group" style="flex:1"><label>메모 (선택)</label><input type="text" id="use-memo" placeholder="예: 오전 WOD"></div>
        <button class="action-btn" style="padding:9px 14px;white-space:nowrap" onclick="useCount(${regId},'${escapeJsAttr(name)}',${remaining},${used})">사용 추가</button>
      </div>
    </div>` : ''}

    <div class="card-title" style="margin-bottom:8px">사용 이력</div>
    <table>
      <thead><tr><th>날짜</th><th>메모</th><th>관리</th></tr></thead>
      <tbody>${usageRows}</tbody>
    </table>`;

  document.getElementById('count-modal').classList.add('open');
}

async function useCount(regId, name, remaining, used) {
  const date = document.getElementById('use-date').value;
  const memo = document.getElementById('use-memo').value;
  if (!date) return alert('날짜를 선택해주세요');
  const data = await adminFetch(API + '/counts/' + regId + '/use', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({used_date: date, memo})
  }).then(r=>r.json());
  if (data.error) return alert(data.error);
  alert(`사용 처리 완료! 잔여: ${data.remaining}회`);
  openCountModal(regId, name, data.remaining, used+1);
  loadCounts();
}

async function cancelCountUsage(usageId, regId, name, remaining, used) {
  if (!confirm('사용 취소하시겠습니까?')) return;
  await adminFetch(API + '/counts/usage/' + usageId, {method:'DELETE'});
  openCountModal(regId, name, remaining+1, used-1);
  loadCounts();
}
