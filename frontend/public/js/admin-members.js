// ============================================================
// 회원 관리: 회원 목록/상세/수정/삭제/환불
// CrossFit Box 관리자 - admin.html에서 분리된 스크립트
// 모든 함수/변수는 전역 스코프 공유 (일반 <script> 로드)
// ============================================================

async function loadMembers() {
  allMembers = await adminFetch(API + '/members').then(r => r.json());
  const lockers = await adminFetch(API + '/lockers').then(r => r.json());
  const uniforms = await adminFetch(API + '/uniforms').then(r => r.json());
  // 회원별 락커/운동복 매핑
  allMembers = allMembers.map(m => ({
    ...m,
    locker: lockers.find(l => l.member_id == m.id && l.status === 'active'),
    uniform: uniforms.find(u => u.member_id == m.id && u.status === 'active'),
  }));
  filterMembers();
}

let sortField = null;
let sortDir = 1;
let filterLocker = false;
let filterStatus = false;

function toggleSort(field) {
  if (sortField === field) sortDir *= -1;
  else { sortField = field; sortDir = 1; }
  document.querySelectorAll('[id^="sort-"]').forEach(el => el.textContent = '↕');
  const map = {name:'sort-name', start:'sort-start', end:'sort-end', regcreated:'sort-regcreated'};
  if (map[field]) document.getElementById(map[field]).textContent = sortDir === 1 ? '↑' : '↓';
  filterMembers();
}

let sortLockerExpiry = false;

function toggleFilter(type) {
  if (type === 'locker') {
    filterLocker = !filterLocker;
    sortLockerExpiry = filterLocker;
    document.getElementById('th-locker').style.color = filterLocker ? '#1a1a1a' : '';
    document.getElementById('th-locker').style.fontWeight = filterLocker ? '700' : '';
    document.getElementById('th-locker').title = filterLocker ? '락커 만료임박 순 정렬 중 (다시 클릭해제)' : '클릭: 락커 있는 회원만 / 만료임박 순';
  }
  if (type === 'status') {
    filterStatus = !filterStatus;
    document.getElementById('th-status').style.color = filterStatus ? '#1a1a1a' : '';
    document.getElementById('th-status').style.fontWeight = filterStatus ? '700' : '';
  }
  filterMembers();
}

function filterMembers() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const f = document.getElementById('filter-status').value;
  const today = todayKST();
  const in7 = addDaysKST(today, 7);

  let list = allMembers.filter(m => {
    const matchQ = m.name.includes(q) || (m.phone||'').includes(q);
    let matchF = true;
    if (f === 'active') matchF = m.status === 'active' && (m.end_date||'') > in7;
    if (f === 'expiring') matchF = m.status === 'active' && m.end_date && m.end_date <= in7;
    if (f === 'inactive') matchF = m.status === 'inactive';
    if (filterLocker) matchF = matchF && !!m.locker;
    if (filterStatus) matchF = matchF && (m.status === 'active' || (m.reg_type === '횟수권' && m.remaining_count > 0));
    return matchQ && matchF;
  });

  // 정렬: 만료임박 → 활성 → 만료(관리자 처리)
  const today2 = todayKST();
  const in7d = addDaysKST(today2, 7);

  function sortPriority(m) {
    if (m.status === 'inactive') return 2;  // 만료 (관리자가 처리) → 맨 아래
    if (m.reg_type === '횟수권') return (m.remaining_count > 0) ? 1 : 2;
    if (m.end_date && m.end_date <= in7d) return 0; // 만료임박 (7일내 or 이미 지남) → 맨 위
    return 1;                                       // 활성 → 중간
  }

  list = [...list].sort((a, b) => {
    // 정렬 컬럼을 명시적으로 선택한 경우: 그룹 우선순위 무시하고 순수 정렬 (오름/내림차순)
    if (sortField) {
      let va, vb;
      if (sortField==='name') { va=a.name||''; vb=b.name||''; }
      else if (sortField==='start') { va=a.start_date||''; vb=b.start_date||''; }
      else if (sortField==='regcreated') { va=a.reg_created_at||''; vb=b.reg_created_at||''; }
      else { va=a.end_date||''; vb=b.end_date||''; }
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    }
    const pa = sortPriority(a), pb = sortPriority(b);
    if (pa !== pb) return pa - pb;
    // 같은 그룹 내에서 만료임박은 만료일 오름차순
    if (pa === 0) return (a.end_date||'') < (b.end_date||'') ? -1 : 1;
    // 락커 만료임박 정렬
    if (sortLockerExpiry && a.locker && b.locker) {
      return (a.locker.end_date||'') < (b.locker.end_date||'') ? -1 : 1;
    }
    return 0;
  });

  const tbody = document.getElementById('member-tbody');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-state">회원이 없습니다</td></tr>'; return; }
  tbody.innerHTML = list.map(m => {
    let badge = '<span class="badge badge-active">활성</span>';
    if (m.status === 'inactive') {
      // 관리자가 만료 처리한 회원
      badge = '<span class="badge badge-done">만료</span>';
    } else if (m.reg_type === '횟수권') {
      badge = (m.remaining_count > 0) ? '<span class="badge badge-active">활성</span>' : '<span class="badge badge-done">만료</span>';
    } else if (m.end_date && m.end_date <= in7) {
      // 활성 상태인데 만료일이 7일 이내이거나 이미 지남 → 재등록 유도
      if (m.end_date < today2) {
        // 만료일이 이미 지남 → 붉은색 '만료일 경과'
        badge = `<span class="badge badge-overdue" style="cursor:pointer" onclick="event.stopPropagation();confirmExpire(${m.id},'${escapeJsAttr(m.name)}','${m.end_date}')" title="클릭하면 만료 처리">만료일 경과</span>`;
      } else {
        // 만료일이 아직 안 지남(7일 이내) → 노란색 '만료 임박'
        badge = `<span class="badge badge-expire" style="cursor:pointer" onclick="event.stopPropagation();confirmExpire(${m.id},'${escapeJsAttr(m.name)}','${m.end_date}')" title="클릭하면 만료 처리">만료 임박</span>`;
      }
    }

    const in7d2 = in7d;
    const today3 = today2;
    let lockerCell = '<span style="color:#ccc">-</span>';
    if (m.locker) {
      const le = m.locker.end_date || '';
      const lockerExpiring = le && le <= in7d2 && le >= today3;
      const lockerExpired = le && le < today3;
      const lockerStyle = lockerExpired ? 'background:#fff8e1;color:#e65100;border-color:#ffcc02'
        : lockerExpiring ? 'background:#fff8e1;color:#e65100;border-color:#ffcc02' : '';
      lockerCell = `<span class="badge badge-assign" style="${lockerStyle}" title="락커 ${m.locker.id}번 · 만료: ${le||'-'}">${m.locker.id}번${lockerExpiring||lockerExpired?' ⚠':''}`;
      lockerCell += `</span>`;
    }
    const regAt = m.reg_created_at ? m.reg_created_at.slice(0,16).replace('T',' ') : '-';
    const payAmount = (m.amount != null && m.amount !== '') ? Number(m.amount).toLocaleString('ko-KR') + '원' : '-';
    const payMethod = m.payment_method || '';
    const payLine = (payAmount !== '-' || payMethod)
      ? `<div style="color:#2e7d32;font-size:11px;margin-top:2px">${payAmount}${payMethod ? ' · ' + payMethod : ''}</div>`
      : '';
    const regCell = `<div style="color:#888;font-size:12px;white-space:nowrap">${regAt}</div>${payLine}`;
    const staffTag = m.is_staff ? ' <span class="badge" style="background:#ede7f6;color:#4527a0">코치</span>' : '';
    const missing = missingInfoFields(m);
    const missingCell = missing.length
      ? missing.map(f => `<span class="badge" style="background:#fff3e0;color:#e65100;margin:1px 2px 1px 0">${f}</span>`).join('')
      : '<span style="color:#ccc">-</span>';
    return `<tr><td style="font-weight:500">${escapeHtml(m.name)}${staffTag}</td><td>${regCell}</td><td>${m.start_date||'-'}</td><td>${m.end_date||'-'}</td><td>${lockerCell}</td><td style="max-width:180px">${missingCell}</td><td>${badge}</td><td><button class="action-btn" onclick="openMemberModal(${m.id})">상세</button></td></tr>`;
  }).join('');
}

// 회원 상세에서 비어 있는 칸 = 나중에 더 받아야 하는 보충자료.
// 목록의 '보충자료 필요' 열과 상세 화면이 같은 기준을 쓰도록 판정은 여기 한 곳에만 둔다.
//
// 인스타 아이디는 저장되는 곳이 둘이다.
//   - members.insta        : 계약서 1단계의 '인스타그램 아이디' 칸 (가입경로와 무관하게 받는다)
//   - members.source_detail: 가입경로가 '인스타'일 때 뜨는 '인스타 아이디' 칸 (정보 수정에서 고칠 수 있는 쪽)
// 그래서 둘 중 하나라도 있으면 채워진 것으로 보고, **인스타로 들어온 회원에게만** 요구한다.
// (지인·오프라인으로 들어온 회원에게 인스타 아이디를 보충자료로 요구할 이유가 없다.)
const SUPPLEMENT_FIELDS = [
  { key: 'insta',  label: '인스타 아이디',
    need: m => m.source === '인스타',
    filled: m => !!String(m.insta || '').trim() || !!String(m.source_detail || '').trim() },
  { key: 'photo',  label: '사진' },
  { key: 'goal',   label: '운동방향성' },
  { key: 'injury', label: '부상/특이사항' },
];

function missingInfoFields(m) {
  // 목록 응답에는 사진 본문이 없고 has_photo 만 온다 (응답이 무거워지지 않도록). 상세에는 photo 가 온다.
  const filled = f => {
    if (f.filled) return f.filled(m);
    if (f.key === 'photo') return 'has_photo' in m ? !!m.has_photo : !!String(m.photo || '').trim();
    return !!String(m[f.key] || '').trim();
  };
  return SUPPLEMENT_FIELDS.filter(f => (!f.need || f.need(m)) && !filled(f)).map(f => f.label);
}

async function openMemberModal(id) {
  const m = await adminFetch(API + '/members/' + id).then(r => r.json());
  window._currentMember = m; // 환불 등에서 재사용 (locker/uniform 포함)
  document.getElementById('modal-name').textContent = m.name;
  // 만료일은 바로 위 "락커 만료일" 항목에 따로 있으니 여기서는 번호만 표시
  const lockerInfo = m.locker ? `${m.locker.id}번` : '없음';
  const cur = (m.registrations||[]).find(r => r.is_current === 1) || {};
  const isCount = cur.reg_type === '횟수권';
  // 코치 임명·해제와 열람 권한은 사장님만 건드릴 수 있다
  const isOwner = !!adminSession && adminSession.role === 'owner';
  const canEditPerms = !!m.is_staff && isOwner;

  const historyRows = (m.registrations||[]).map(r => {
    const isCur = r.is_current === 1;
    const badge = isCur ? '<span class=\"badge badge-active\">현재</span>' : '<span class=\"badge badge-done\">종료</span>';
    const planLabel = r.reg_type === '횟수권' ? `횟수권 (잔여 ${r.remaining_count??'-'}회)` : (r.plan||'-');
    const regMemo = formatMemo(r.memo);
    return `<tr style="${isCur?'background:#f9fdf9':''}"><td>${badge}</td><td>${r.start_date||'-'}</td><td>${r.end_date||'-'}</td><td>${planLabel}</td><td>${r.period||'-'}${r.reg_type==='횟수권'?'회':'개월'}</td><td>${(r.amount||0).toLocaleString('ko-KR')}원</td><td>${r.payment_method||'-'}</td><td>${r.holding_days||0}일</td><td style="color:#888;font-size:12px">${r.created_at ? r.created_at.slice(0,16).replace('T',' ') : '-'}</td><td class="memo-cell" style="font-size:12px;color:#666">${escapeHtml(regMemo)||'-'}</td></tr>`;
  }).join('');

  document.getElementById('modal-content').innerHTML = `
    <div class="tabs-inline" style="margin-bottom:16px">
      <button class="tab-sm active" onclick="switchMemberTab(this,'view')">기본 정보</button>
      <button class="tab-sm" onclick="switchMemberTab(this,'history')">등록 이력</button>
      <button class="tab-sm" onclick="switchMemberTab(this,'edit')">정보 수정</button>
      ${canEditPerms ? `<button class="tab-sm" onclick="switchMemberTab(this,'perms')">열람 권한</button>` : ''}
    </div>
    <div id="member-view">
      ${m.photo ? `<div style="text-align:center;margin-bottom:14px"><img src="${escapeHtml(m.photo)}" style="width:110px;height:110px;border-radius:12px;object-fit:cover;border:1px solid #eee"></div>` : ''}
      <div class="form-grid" style="font-size:13px">
        <div><span style="color:#888">연락처</span><br><b>${escapeHtml(m.phone)||'-'}</b></div>
        <div><span style="color:#888">성별/연령대</span><br><b>${escapeHtml(m.gender)||'-'} / ${escapeHtml(m.age_group)||'-'}</b></div>
        <div><span style="color:#888">요금제</span><br><b>${escapeHtml(cur.plan)||'-'}</b></div>
        <div><span style="color:#888">${isCount?'잔여 횟수':'기간'}</span><br><b>${isCount?(cur.remaining_count??'-')+'회':(cur.period||'-')+'개월'}</b></div>
        <div><span style="color:#888">시작일</span><br><b>${cur.start_date||'-'}</b></div>
        <div><span style="color:#888">만료일</span><br><b>${cur.end_date||'-'}</b></div>
        <div><span style="color:#888">락커 시작일</span><br><b>${m.locker?.start_date||'-'}</b></div>
        <div><span style="color:#888">락커 만료일</span><br><b>${m.locker?.end_date||'-'}</b></div>
        <div><span style="color:#888">결제금액</span><br><b>${(cur.amount||0).toLocaleString('ko-KR')}원</b></div>
        <div><span style="color:#888">결제수단</span><br><b>${escapeHtml(cur.payment_method)||'-'}</b></div>
        <div><span style="color:#888">등록 시각</span><br><b>${cur.created_at ? cur.created_at.slice(0,16).replace('T',' ') : '-'}</b></div>
        <div><span style="color:#888">홀딩 (사용/총부여)</span><br><b>${m.holding_used||0} / ${cur.holding_total||0}일</b></div>
        <div><span style="color:#888">홀딩 관리</span><br><button class="action-btn" onclick="goToHoldingTab('${escapeJsAttr(m.name)}')" style="margin-top:2px">홀딩 내역 보기 →</button></div>
        <div><span style="color:#888">락커</span><br><b>${lockerInfo}</b></div>
        <div><span style="color:#888">지역</span><br><b>${escapeHtml(m.region)||'-'}</b></div>
        <div><span style="color:#888">가입경로</span><br><b>${escapeHtml(m.source)||'-'}</b></div>
        <div><span style="color:#888">생년월일</span><br><b>${m.birth_date||'-'}</b></div>
        <div><span style="color:#888">인스타그램</span><br><b>${escapeHtml(m.insta || (m.source === '인스타' ? m.source_detail : '')) || '-'}</b></div>
        <div style="grid-column:1/-1"><span style="color:#888">운동 방향성</span><br><b>${escapeHtml(m.goal)||'-'}</b></div>
        <div style="grid-column:1/-1"><span style="color:#888">부상/특이사항</span><br><b>${escapeHtml(m.injury)||'-'}</b></div>
      </div>
      <div style="margin-top:14px">
        <div class="memo-card-label">📝 메모</div>
        <div class="memo-card${formatMemo(m.memo) ? '' : ' empty'}">${escapeHtml(formatMemo(m.memo)) || '메모 없음'}</div>
      </div>
      ${isCount ? `<div class="section-box" style="margin-top:16px"><div class="section-box-title">🎟 횟수권 차감</div><div style="display:flex;align-items:center;gap:12px"><span style="font-size:13px;color:#888">잔여 <b style="color:#1a1a1a;font-size:16px">${cur.remaining_count??0}회</b></span><button class="action-btn" onclick="deductCount(${m.id})">1회 차감</button></div></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="action-btn" style="flex:1;padding:8px 4px;background:#2e7d32;border-color:#2e7d32;color:#fff" onclick="goToRenew(${m.id})">재등록</button>
        <button class="action-btn" style="flex:1;padding:8px 4px" onclick="openMemberLockerModal(${m.id},'${escapeJsAttr(m.name)}','${cur.start_date||''}','${cur.end_date||''}')">락커 등록</button>
        <button class="action-btn" style="flex:1;padding:8px 4px" onclick="openMessageModal(${m.id},'${escapeJsAttr(m.name)}')">메시지 보내기</button>
        <button class="action-btn" style="flex:1;padding:8px 4px" onclick="openMessageHistory(${m.id},'${escapeJsAttr(m.name)}')">메시지 이력</button>
        <button class="action-btn" style="flex:1;padding:8px 4px" onclick="resetMemberPassword(${m.id},'${escapeJsAttr(m.name)}')">비번 초기화</button>
        ${isOwner && !m.is_staff ? `<button class="action-btn" style="flex:1;padding:8px 4px;background:#4527a0;border-color:#4527a0;color:#fff" onclick="setStaff(${m.id},'${escapeJsAttr(m.name)}',true)">코치 임명</button>` : ''}
        <button class="action-btn" style="flex:1;padding:8px 4px;background:#e65100;border-color:#e65100;color:#fff" onclick="openMemberRefund(${m.id},'${escapeJsAttr(m.name)}','${m.end_date||''}','${m.amount||0}')">환불</button>
        <button class="action-btn danger" style="flex:1;padding:8px 4px" onclick="deleteMember(${m.id})">삭제</button>
      </div>
    </div>
    <div id="member-history" style="display:none">
      <div class="table-scroll">
      <table>
        <thead><tr><th>상태</th><th>시작일</th><th>만료일</th><th>요금제</th><th>기간</th><th>금액</th><th>결제수단</th><th>홀딩</th><th>등록시각</th><th>메모</th></tr></thead>
        <tbody>${historyRows || '<tr><td colspan=\"10\" class=\"empty-state\">이력 없음</td></tr>'}</tbody>
      </table>
      </div>
    </div>
    <div id="member-edit" style="display:none">
      <div class="form-group form-full" style="margin-bottom:14px">
        <label>사진</label>
        <div style="display:flex;align-items:flex-start;gap:14px;margin-top:4px">
          <div id="e-photo-preview" class="edit-photo-preview">
            ${m.photo ? `<img src="${escapeHtml(m.photo)}" style="width:100%;height:100%;object-fit:cover">` : '사진 없음'}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start">
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="action-btn" type="button" id="e-cam-btn" onclick="startEditCamera()">📷 카메라 켜기</button>
              <button class="action-btn" type="button" id="e-shoot-btn" onclick="takeEditPhoto()" style="display:none;background:#2e7d32;border-color:#2e7d32;color:#fff">촬영</button>
              <button class="action-btn" type="button" id="e-flip-btn" onclick="flipEditCamera()" style="display:none">🔄 전/후면</button>
              <button class="action-btn danger" type="button" onclick="clearEditPhoto()">사진 삭제</button>
            </div>
            <span style="font-size:11px;color:#888;line-height:1.6">회원 식별용이라 <b>카메라로 직접 촬영</b>합니다. 파일 업로드는 받지 않습니다.<br>
            휴대폰으로 접속하면 그 자리에서 찍히고, 320×320으로 잘라 가볍게 저장합니다.</span>
          </div>
        </div>
      </div>
      <div class="form-grid">
        <div class="form-group"><label>회원명</label><input type="text" id="e-name" value="${escapeHtml(m.name)}"></div>
        <div class="form-group"><label>연락처</label><input type="text" id="e-phone" value="${escapeHtml(m.phone)}"></div>
        <div class="form-group"><label>성별</label><select id="e-gender"><option value="">선택</option><option value="남" ${m.gender==='남'?'selected':''}>남</option><option value="여" ${m.gender==='여'?'selected':''}>여</option></select></div>
        <div class="form-group"><label>연령대</label><select id="e-age">${['10대','20대','30대','40대','50대'].map(a=>`<option value="${a}" ${m.age_group===a?'selected':''}>${a}</option>`).join('')}</select></div>
        <div class="form-group"><label>생년월일</label><input type="date" id="e-birth" value="${m.birth_date||''}"></div>
        <div class="form-group"><label>지역</label><input type="text" id="e-region" value="${escapeHtml(m.region)}"></div>
        <div class="form-group"><label>가입경로</label><select id="e-source" onchange="updateSourceDetailField()">${['인스타','네이버','지인','기존','오프라인','양도'].map(s=>`<option value="${s}" ${m.source===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label id="e-source-detail-label">추가 정보</label><input type="text" id="e-source-detail" value="${escapeHtml(m.source_detail||'')}"></div>
        <div class="form-group"><label>락커 등록일</label><input type="date" id="e-locker-start" value="${m.locker?m.locker.start_date||'':''}" ${m.locker?'':'disabled'}></div>
        <div class="form-group"><label>락커 마감일</label><input type="date" id="e-locker-end" value="${m.locker?m.locker.end_date||'':''}" ${m.locker?'':'disabled'} title="${m.locker?'':'사용 중인 락커가 없습니다'}"></div>
        <div class="form-group"><label>회원권 등록일</label><input type="date" id="e-start" value="${cur.start_date||''}"></div>
        <div class="form-group"><label>회원권 마감일</label><input type="date" id="e-end" value="${cur.end_date||''}"></div>
        <div class="form-group"><label>운동 방향성</label><textarea id="e-goal" rows="3" placeholder="미입력">${escapeHtml(m.goal||'')}</textarea></div>
        <div class="form-group"><label>부상/특이사항</label><textarea id="e-injury" rows="3" placeholder="미입력">${escapeHtml(m.injury||'')}</textarea></div>
        <div class="form-group form-full"><label>메모</label><textarea id="e-memo" class="memo-box" rows="6">${escapeHtml(formatMemo(m.memo))}</textarea></div>
      </div>
      <div style="border-top:1px solid #f0f0f0;margin:16px 0;padding-top:16px;font-size:12px;color:#888;font-weight:500">현재 등록 정보 수정</div>
      <div class="form-grid">
        <div class="form-group"><label>요금제</label><select id="e-plan">${(() => {
          let plans = (typeof pricingData !== 'undefined' && pricingData.length) ? [...new Set(pricingData.map(p => p.plan))] : [];
          if (cur.plan && !plans.includes(cur.plan)) plans = [cur.plan, ...plans];
          return '<option value="">선택...</option>' + plans.map(p => `<option value="${p}" ${cur.plan===p?'selected':''}>${p}</option>`).join('');
        })()}</select></div>
        <div class="form-group"><label>금액</label><input type="number" id="e-amount" value="${cur.amount||0}"></div>
        <div class="form-group"><label>결제수단</label><select id="e-payment">${(() => {
          const methods = ['카드','계좌이체','현금'];
          const list = (cur.payment_method && !methods.includes(cur.payment_method)) ? [cur.payment_method, ...methods] : methods;
          return '<option value="">선택...</option>' + list.map(pm => `<option value="${pm}" ${cur.payment_method===pm?'selected':''}>${pm}</option>`).join('');
        })()}</select></div>
        <div class="form-group"><label>기간(개월)</label><input type="number" id="e-period" value="${cur.period||''}"></div>
        <div class="form-group"><label>부여 홀딩(일)</label><input type="number" id="e-holding-total" value="${cur.holding_total||0}"></div>
        ${isCount ? `<div class="form-group"><label>잔여 횟수</label><input type="number" id="e-count" value="${cur.remaining_count||0}"></div>` : ''}
      </div>
      <button class="submit-btn" onclick="saveMember(${m.id},${cur.id||'null'})">저장 완료</button>
    </div>
    ${canEditPerms ? `<div id="member-perms" style="display:none">${renderPermissionTab(m)}</div>` : ''}`;
  editPhoto = m.photo || null;   // 정보 수정 탭에서 바꾼 사진 (안 건드리면 원래 값 그대로)
  document.getElementById('member-modal').classList.add('open');
  updateSourceDetailField();
}

// ─── 정보 수정 탭의 사진 ───────────────────────────
// 계약서 화면과 같은 방식 — 파일 업로드가 아니라 카메라로 찍는다.
// 여는 방법·자르는 규격(320x320 jpeg 0.7)은 photo-capture.js 한 곳에 있다.
let editPhoto = null;        // 저장될 사진 (안 건드리면 원래 값 그대로)
let editStream = null;       // 켜져 있는 카메라
let editFacing = 'user';     // 전면/후면

function startEditCamera() {
  const preview = document.getElementById('e-photo-preview');
  editStream = stopStream(editStream);
  openSquareCamera(preview, editFacing).then(st => {
    editStream = st;
    preview.classList.add('live');
    document.getElementById('e-cam-btn').textContent = '다시 켜기';
    document.getElementById('e-shoot-btn').style.display = '';
    document.getElementById('e-flip-btn').style.display = '';
  }).catch(() => {
    alert('카메라를 사용할 수 없습니다.\n브라우저 권한을 확인하거나, 카메라가 있는 기기(휴대폰)에서 열어 주세요.');
  });
}

function flipEditCamera() {
  editFacing = (editFacing === 'user') ? 'environment' : 'user';
  startEditCamera();
}

function takeEditPhoto() {
  const preview = document.getElementById('e-photo-preview');
  const shot = captureSquarePhoto(preview, editFacing);
  if (!shot) return;
  editPhoto = shot;
  stopEditCamera();
  preview.innerHTML = `<img src="${editPhoto}" style="width:100%;height:100%;object-fit:cover">`;
}

// 카메라를 켜 둔 채 모달을 닫거나 다른 탭으로 가면 불이 계속 켜져 있으므로 반드시 끈다
function stopEditCamera() {
  editStream = stopStream(editStream);
  const preview = document.getElementById('e-photo-preview');
  if (preview) preview.classList.remove('live');
  const cam = document.getElementById('e-cam-btn');
  if (cam) cam.textContent = '📷 카메라 켜기';
  const shoot = document.getElementById('e-shoot-btn');
  if (shoot) shoot.style.display = 'none';
  const flip = document.getElementById('e-flip-btn');
  if (flip) flip.style.display = 'none';
}

function clearEditPhoto() {
  stopEditCamera();
  if (!editPhoto) return;
  if (!confirm('사진을 지우시겠습니까?\n(저장 완료를 눌러야 실제로 지워집니다.)')) return;
  editPhoto = null;
  document.getElementById('e-photo-preview').innerHTML = '사진 없음';
}

function switchMemberTab(btn, tab) {
  document.querySelectorAll('#modal-content .tab-sm').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('member-view').style.display    = tab==='view'    ? 'block':'none';
  document.getElementById('member-history').style.display = tab==='history' ? 'block':'none';
  document.getElementById('member-edit').style.display    = tab==='edit'    ? 'block':'none';
  const perms = document.getElementById('member-perms');
  if (perms) perms.style.display = tab==='perms' ? 'block':'none';
  if (tab !== 'edit') stopEditCamera();
}

// ─── 열람 권한 (코치 전용 탭) ─────────────────────────
// 목록은 서버가 /api/admin/me 로 내려준 것을 그대로 쓴다. 화면에만 추가하고 서버에 빠뜨리는 일이 없도록
// 권한 키는 backend/permissions.js 한 곳에서만 정한다.
function renderPermissionTab(m) {
  const granted = (() => {
    try { const a = JSON.parse(m.permissions || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  })();
  const tree = (adminSession && adminSession.tree) || [];
  const groups = tree.map(g => `
    <div class="section-box" style="margin-bottom:12px">
      <div class="section-box-title">${escapeHtml(g.group)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px 18px">
        ${g.items.map(i => `
          <label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer;min-width:120px">
            <input type="checkbox" class="perm-check" value="${i.key}" ${granted.includes(i.key)?'checked':''} style="width:16px;height:16px">
            ${escapeHtml(i.label)}
          </label>`).join('')}
      </div>
    </div>`).join('');

  return `
    <div class="detail-notice" style="margin-bottom:14px;line-height:1.7">
      <b>${escapeHtml(m.name)}</b> 코치가 관리자 화면에서 볼 수 있는 곳을 고릅니다.<br>
      <span style="color:#888">고르지 않은 곳은 "열람 권한이 없습니다." 가 뜹니다.</span><br>
      <span style="color:#888">관리자 화면 로그인은 <b>비밀번호만</b> 넣습니다 — 본인 비밀번호를 넣으면 본인으로 들어갑니다.
      첫 비밀번호는 <b>전화번호 뒷 4자리</b>이고, 들어오면 바꾸라는 창이 뜹니다
      (바꿀 때까지 들어올 때마다 뜹니다).</span>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="action-btn" onclick="togglePermAll(true)">전체 선택</button>
      <button class="action-btn" onclick="togglePermAll(false)">전체 해제</button>
    </div>
    ${groups}
    <button class="submit-btn" onclick="savePermissions(${m.id})">열람 권한 저장</button>
    <div style="border-top:1px solid #f0f0f0;margin-top:20px;padding-top:16px">
      <div style="font-size:12px;color:#888;line-height:1.7;margin-bottom:10px">
        그만두셨나요? <b>코치 해제</b>를 누르면 관리자 화면에 들어오지 못합니다.<br>
        회원 정보와 매출 기록은 그대로 남고, 지금 체크한 열람 권한도 기억해 둡니다 —
        다시 임명하면 이대로 돌아옵니다.
      </div>
      <button class="action-btn danger" onclick="setStaff(${m.id},'${escapeJsAttr(m.name)}',false)">코치 해제</button>
    </div>`;
}

function togglePermAll(on) {
  document.querySelectorAll('#member-perms .perm-check').forEach(c => { c.checked = on; });
}

// 코치 임명 / 해제 — 같은 버튼이 두 방향으로 쓰인다
async function setStaff(id, name, makeStaff) {
  const msg = makeStaff
    ? `${name} 님을 코치로 임명하시겠습니까?\n관리자 화면에 들어올 수 있게 되고, 볼 곳은 다음 화면에서 정합니다.`
    : `${name} 님의 코치 권한을 해제하시겠습니까?\n\n· 관리자 화면에 못 들어옵니다 (접속 중이면 바로 끊깁니다)\n· 회원 정보와 매출 기록은 그대로 남습니다\n· 지금 체크한 열람 권한은 기억해 두었다가 다시 임명하면 되돌립니다`;
  if (!confirm(msg)) return;

  const res = await adminFetch(API + '/members/' + id + '/staff', {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ is_staff: makeStaff })
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) return alert(data.error);

  alert(data.message);
  await openMemberModal(id);   // 바뀐 상태로 상세를 다시 그린다 (탭 구성이 달라진다)
  loadMembers();
}

async function savePermissions(id) {
  const permissions = [...document.querySelectorAll('#member-perms .perm-check:checked')].map(c => c.value);
  const res = await adminFetch(API + '/members/' + id + '/permissions', {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ permissions })
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) return alert(data.error);
  alert(`열람 권한을 저장했습니다. (${permissions.length}개 허용)`);
}

// 가입경로에 따라 추가 정보 칸의 라벨/입력 가능 여부를 바꾼다
// (인스타·네이버→아이디, 지인→이름, 양도→양도한 사람 이름. 그 외(기존/오프라인)는 입력할 게 없어 비활성화)
const SOURCE_DETAIL_LABELS = { '인스타': '인스타 아이디', '네이버': '네이버 아이디', '지인': '지인 이름', '양도': '양도한 사람 이름' };
function updateSourceDetailField() {
  const sourceEl = document.getElementById('e-source');
  const labelEl = document.getElementById('e-source-detail-label');
  const inputEl = document.getElementById('e-source-detail');
  if (!sourceEl || !labelEl || !inputEl) return;
  const label = SOURCE_DETAIL_LABELS[sourceEl.value];
  labelEl.textContent = label || '추가 정보';
  inputEl.disabled = !label;
  inputEl.placeholder = label ? `${label} 입력` : '해당 없음';
}

async function saveMember(memberId, regId) {
  const memberBody = {
    name: document.getElementById('e-name').value.trim(),
    phone: document.getElementById('e-phone').value,
    gender: document.getElementById('e-gender').value,
    age_group: document.getElementById('e-age').value,
    region: document.getElementById('e-region').value,
    source: document.getElementById('e-source').value,
    source_detail: document.getElementById('e-source-detail').value.trim() || null,
    birth_date: document.getElementById('e-birth').value || null,
    goal: document.getElementById('e-goal').value.trim() || null,
    injury: document.getElementById('e-injury').value.trim() || null,
    photo: editPhoto,
    memo: document.getElementById('e-memo').value,
    status: 'active',
  };
  if (!memberBody.name) return alert('회원명을 입력해주세요');

  // 회원권 기간 검증
  const regStart = document.getElementById('e-start').value;
  const regEnd = document.getElementById('e-end').value;
  if (regId && regStart && regEnd && regEnd < regStart) {
    return alert('회원권 마감일은 등록일 이후여야 합니다');
  }

  // 락커 기간 검증 (배정된 락커가 있을 때만 저장 대상)
  const locker = window._currentMember && window._currentMember.locker;
  let lockerStart, lockerEnd;
  if (locker) {
    lockerStart = document.getElementById('e-locker-start').value;
    lockerEnd = document.getElementById('e-locker-end').value;
    if (!lockerStart || !lockerEnd) return alert('락커 등록일과 마감일을 모두 입력해주세요');
    if (lockerEnd < lockerStart) return alert('락커 마감일은 등록일 이후여야 합니다');
  }

  const memberRes = await adminFetch(API+'/members/'+memberId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(memberBody)});
  const memberData = await memberRes.json().catch(()=>({}));
  if (memberData.error) return alert(memberData.error);

  if (regId) {
    const regBody = {
      plan:           document.getElementById('e-plan').value,
      amount:         parseInt(document.getElementById('e-amount').value)||0,
      payment_method: document.getElementById('e-payment').value,
      start_date:     regStart,
      end_date:       regEnd,
      period:         parseInt(document.getElementById('e-period').value)||0,
      holding_total:  parseInt(document.getElementById('e-holding-total').value)||0,
      remaining_count:document.getElementById('e-count') ? parseInt(document.getElementById('e-count').value)||0 : null,
    };
    const regRes = await adminFetch(API+'/registrations/'+regId, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(regBody)});
    const regData = await regRes.json().catch(()=>({}));
    if (regData.error) return alert('회원 정보는 저장됐지만 회원권 정보 저장에 실패했습니다: ' + regData.error);
  }

  if (locker) {
    const lockerRes = await adminFetch(API+'/lockers/'+locker.id+'/dates', {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({start_date:lockerStart, end_date:lockerEnd})
    });
    const lockerData = await lockerRes.json().catch(()=>({}));
    if (lockerData.error) return alert('다른 정보는 저장됐지만 락커 기간 저장에 실패했습니다: ' + lockerData.error);
  }

  alert('수정 완료!');
  closeModal('member-modal');
  loadMembers();
}

async function deductCount(memberId) {
  if (!confirm('1회 차감하시겠습니까?')) return;
  const data = await adminFetch(API+'/members/'+memberId+'/count', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({count:1})}).then(r=>r.json());
  alert(data.message + `\n잔여: ${data.remaining}회`);
  closeModal('member-modal');
  loadMembers();
}

// 회원권 환불 — 남은 기간 비례로 환불액 자동 제안 (수정 가능)
function openMemberRefund(id, name, endDate, amount) {
  // 회원 모달이 받아둔 단건 데이터 우선 (locker/uniform 정확), 없으면 목록에서
  let m = (window._currentMember && window._currentMember.id == id) ? window._currentMember : null;
  if (!m) m = (allMembers||[]).find(x => x.id === id) || {};
  // 회원권 환불 제안액 계산
  let memberRefund = 0, hint = '환불 금액을 입력하세요. (수정 가능)';
  const paid = parseInt(amount) || 0;
  // 현재 회원권 시작일 (단건 데이터는 registrations 안에, 목록 데이터는 flat)
  let startDate = m.start_date;
  if (!startDate && m.registrations) {
    const curReg = m.registrations.find(r => r.is_current === 1);
    if (curReg) startDate = curReg.start_date;
  }
  if (startDate && endDate && paid) {
    const s = new Date(startDate), e = new Date(endDate), today = new Date(todayKST());
    const totalDays = Math.max(1, Math.round((e - s)/86400000));
    const leftDays = Math.max(0, Math.round((e - today)/86400000));
    memberRefund = Math.round(paid * leftDays / totalDays / 100) * 100;
    hint = `회원권 남은 기간 ${remainingText(endDate)}`;
  }

  // 락커 환불액 계산 (남은 개월 × 단가)
  const lockerRefund = m.locker ? monthsLeft(m.locker.end_date) * LOCKER_MONTHLY_FEE : 0;

  refundContext = {
    type:'member', id,
    memberRefund,
    locker: m.locker ? { id:m.locker.id, refund:lockerRefund } : null,
  };

  document.getElementById('refund-modal-title').textContent = '회원권 환불';
  document.getElementById('refund-date').value = todayKST();
  document.getElementById('refund-memo').value = '';
  // 이름은 회원이 직접 적은 글자다. onclick 속성으로 넘어오면서 escapeJsAttr 가 <를 &lt;로 바꿨지만,
  // 브라우저가 속성값의 엔티티를 되돌리므로 여기 도착할 때는 다시 <가 되어 있다.
  // innerHTML 에 넣기 전에 반드시 escapeHtml 로 한 번 더 막는다 (저장형 XSS).
  document.getElementById('refund-info').innerHTML =
    `<b>${escapeHtml(name)}</b>` + (endDate ? ` · 만료일 ${escapeHtml(endDate)}` : '');

  // 연동 영역 표시 (옛 HTML 캐시 대비 null 방어)
  const linkedBox = document.getElementById('refund-linked');
  const lockerRow = document.getElementById('refund-locker-row');
  const lockerCheck = document.getElementById('refund-locker-check');
  if (lockerCheck) lockerCheck.checked = false;
  if (linkedBox && m.locker) {
    linkedBox.style.display = 'block';
    if (lockerRow) {
      lockerRow.style.display = 'flex';
      const ll = document.getElementById('refund-locker-label');
      if (ll) ll.textContent = `🔒 락커 ${m.locker.id}번 반납 (남은 ${remainingText(m.locker.end_date)})`;
    }
  } else if (linkedBox) {
    linkedBox.style.display = 'none';
  }

  document.getElementById('refund-calc-hint').textContent = hint;
  document.getElementById('refund-amount').value = memberRefund || '';
  refundManualEdit = false;
  document.getElementById('refund-modal').classList.add('open');
}

// 락커 체크 시 환불 총액 재계산
let refundManualEdit = false;
function recalcRefundTotal() {
  if (!refundContext || refundContext.type !== 'member') return;
  const lc = document.getElementById('refund-locker-check');
  let total = refundContext.memberRefund || 0;
  const incl = [];
  if (lc && lc.checked && refundContext.locker) { total += refundContext.locker.refund; incl.push('락커'); }
  document.getElementById('refund-amount').value = total;
  document.getElementById('refund-calc-hint').textContent = incl.length
    ? `${incl.join('·')} 포함`
    : '';
}

async function goToRenew(id) {
  closeModal('member-modal');
  openPage('members');
  await new Promise(r => setTimeout(r, 50));
  const regBtn = document.querySelector('#page-members > .sub-tabs .sub-tab:nth-child(2)');
  openMemberSubTab('register', regBtn);
  await new Promise(r => setTimeout(r, 50));
  document.querySelectorAll('#member-sub-register .tab-sm').forEach(b => b.classList.remove('active'));
  const renewBtn = Array.from(document.querySelectorAll('#member-sub-register .tab-sm')).find(b => b.textContent.trim() === '재등록');
  if (renewBtn) renewBtn.classList.add('active');
  const regNew = document.getElementById('reg-new'); if (regNew) regNew.style.display = 'none';
  const regRenew = document.getElementById('reg-renew'); if (regRenew) regRenew.style.display = 'block';
  await selectRenewMember(id);
}

async function deleteMember(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  await adminFetch(API + '/members/' + id, {method:'DELETE'});
  closeModal('member-modal');
  loadMembers();
}

async function resetMemberPassword(id, name) {
  if (!confirm(`${name} 님의 비밀번호를 초기화하시겠습니까?\n전화번호 뒷 4자리로 리셋됩니다.`)) return;
  const data = await adminFetch(API + '/members/' + id + '/reset-password', {method:'POST'}).then(r=>r.json());
  if (data.error) return alert(data.error);
  alert(`비밀번호가 초기화되었습니다.\n새 비밀번호: ${data.default_password}`);
}

async function confirmExpire(memberId, name, endDate) {
  if (!confirm(`${name} 님을 만료 처리하시겠습니까?\n(만료일: ${endDate})`)) return;
  await adminFetch(API + '/members/' + memberId + '/status', {
    method:'PATCH', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({status:'inactive'})
  });
  alert('만료 처리 완료!');
  loadMembers();
}
