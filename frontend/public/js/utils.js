// 사용자 입력값을 innerHTML로 렌더링할 때 저장형 XSS를 막기 위한 공용 이스케이프 함수
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON.stringify() 결과를 onclick='...(...)' 처럼 홑따옴표 속성 안에 그대로 넣을 때,
// 값에 홑따옴표가 들어있으면 속성이 조기 종료되어 임의 스크립트가 삽입될 수 있음 (DOM XSS) — 방지용
function escapeJsonForAttr(json) {
  return String(json).replace(/&/g, '&amp;').replace(/'/g, '&#39;');
}

// 메모를 읽기 좋게 정리한다 (표시 전용 — 저장된 값은 그대로 둔다).
// 엑셀 이전 과정에서 줄바꿈이 사라져 "…내역1) 2025-07-15 ~ … · 1개월2) …" 처럼 한 덩어리로 붙은 메모가 많아
// 항목 번호와 구분선 앞에서 줄을 다시 나눠준다.
function formatMemo(raw) {
  if (raw == null || raw === '') return '';
  return String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/(과거\s*계약\s*내역)\s*(?=\d+\))/g, '$1\n')  // "내역1)" 앞에서 줄바꿈
    .replace(/(개월)\s*(?=\d+\))/g, '$1\n')                // "1개월2)" 앞에서 줄바꿈
    .replace(/\n*[ \t]*─{3,}[ \t]*\n*/g, '\n──────────\n')  // 구분선은 한 줄로 (앞뒤 빈 줄이 겹치지 않게)
    .split('\n')
    .map(s => s.trim())
    .filter((s, i, arr) => !(s === '' && (i === 0 || arr[i - 1] === '')))
    .join('\n')
    .trim();
}

// 메모 안의 "과거 계약 내역" 블록을 파싱한다.
// 형식: 헤더 → "1) 2025-04-03 ~ 2025-07-09 · 3개월" 줄들 → 구분선 → "총 N건 · 누적 M개월 · 전체기간 …"
// 블록 밖의 자유 메모는 앞/뒤로 나눠 그대로 보존한다.
function parseContractMemo(memo) {
  const ENTRY   = /^(\d+)\)\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})\s*·\s*(\d+)\s*개월\s*$/;
  const HEADER  = /과거\s*계약\s*내역/;
  const SEP     = /^─+$/;
  const SUMMARY = /^총\s*\d+\s*건\s*·\s*누적\s*\d+\s*개월(\s*\(\d{4}-\d{2}-\d{2}\s*부터\))?(\s*·\s*전체기간\s*\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2})?/;

  const res = { header: null, entries: [], prefix: [], suffix: [] };
  const text = formatMemo(memo);
  if (!text) return res;

  // 요약줄 어디에 붙어 있든 "· 전체기간 A ~ B"는 재계산 대상이라 떼어낸다
  const RANGE = /·?\s*전체기간\s*\d{4}-\d{2}-\d{2}\s*~\s*\d{4}-\d{2}-\d{2}/g;

  let inBlock = false;
  for (const line of text.split('\n')) {
    if (line === '') continue;                       // 빈 줄은 버린다 (재적용 시 줄이 늘어나지 않도록)
    if (!inBlock && HEADER.test(line)) { res.header = line; inBlock = true; continue; }
    const m = line.match(ENTRY);
    if (m) { res.entries.push({ start: m[2], end: m[3], months: parseInt(m[4], 10) }); inBlock = true; continue; }
    if (SEP.test(line)) { inBlock = true; continue; }
    if (SUMMARY.test(line)) {
      // 요약줄에 수기로 덧붙인 메모("… 누적 14개월", "(횟수권 기간 포함)")가 있으면 살려둔다
      const rest = line.replace(SUMMARY, '').replace(RANGE, '').replace(/^\s*·\s*/, '').trim();
      if (rest) res.suffix.push(rest);
      inBlock = true; continue;
    }
    (inBlock ? res.suffix : res.prefix).push(line);
  }
  return res;
}

// 두 날짜 사이의 개월수 (기간이 기록돼 있지 않은 계약의 보정용)
function monthsBetweenDates(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00Z'), e = new Date(end + 'T00:00:00Z');
  if (isNaN(s) || isNaN(e)) return 0;
  return Math.max(1, Math.round((e - s) / 86400000 / 30.44));
}

// 재등록 공백이 이 일수를 넘으면 "끊긴 것"으로 보고 누적 개월을 다시 센다.
// (전체기간·건수는 영향 없음 — 회원권 할인 기준이 되는 누적 개월만 초기화)
const CONTRACT_BREAK_DAYS = 14;

// 정렬된 이력에서, 마지막으로 끊긴 지점의 인덱스를 찾는다. 한 번도 안 끊겼으면 0.
function contractStreakStart(entries) {
  let startIdx = 0;
  let prevEnd = entries.length ? entries[0].end : null;
  for (let i = 1; i < entries.length; i++) {
    const gapDays = Math.round(
      (new Date(entries[i].start + 'T00:00:00Z') - new Date(prevEnd + 'T00:00:00Z')) / 86400000
    );
    if (gapDays > CONTRACT_BREAK_DAYS) startIdx = i;
    if (entries[i].end > prevEnd) prevEnd = entries[i].end;  // 기간이 겹쳐도 가장 늦은 만료일 기준
  }
  return startIdx;
}

// 재등록 시, 끝나는 계약을 "과거 계약 내역"에 다음 번호로 추가하고 요약줄을 다시 계산한다.
// 같은 기간이 이미 들어있으면 중복으로 넣지 않는다 (폼을 여러 번 열어도 안전).
function appendContractToMemo(memo, reg) {
  const p = parseContractMemo(memo);

  if (reg && reg.start_date && reg.end_date && reg.reg_type !== '횟수권') {
    const already = p.entries.some(e => e.start === reg.start_date && e.end === reg.end_date);
    if (!already) {
      // period가 비었거나 0·음수인 등록이 실제로 있어서(예: -10), 이상하면 날짜로 다시 계산한다
      const declared = parseInt(reg.period, 10);
      const months = declared > 0 ? declared : monthsBetweenDates(reg.start_date, reg.end_date);
      p.entries.push({ start: reg.start_date, end: reg.end_date, months: Math.max(1, months) });
    }
  }
  if (!p.entries.length) return formatMemo(memo);

  p.entries.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  // 건수와 전체기간은 이력 전체를 그대로 누적한다.
  const firstStart = p.entries[0].start;
  const lastEnd = p.entries.reduce((mx, e) => (e.end > mx ? e.end : mx), p.entries[0].end);

  // 누적 개월은 회원권 할인 기준이라, 공백이 2주를 넘으면 거기서 다시 센다.
  const streakStart = contractStreakStart(p.entries);
  const streak = p.entries.slice(streakStart);
  const totalMonths = streak.reduce((s, e) => s + e.months, 0);
  const restarted = streakStart > 0;

  const out = [...p.prefix];
  out.push(p.header || '과거 계약 내역');
  p.entries.forEach((e, i) => out.push(`${i + 1}) ${e.start} ~ ${e.end} · ${e.months}개월`));
  out.push('──────────');
  out.push(`총 ${p.entries.length}건 · 누적 ${totalMonths}개월` +
    (restarted ? ` (${streak[0].start}부터)` : '') +
    ` · 전체기간 ${firstStart} ~ ${lastEnd}`);
  out.push(...p.suffix);

  return out.join('\n').trim();
}

// 목록/드롭다운처럼 좁은 곳에 메모를 한 줄로 요약해서 보여줄 때 사용
function memoPreview(raw, max = 60) {
  const one = formatMemo(raw).replace(/\s*\n\s*/g, ' · ').replace(/\s{2,}/g, ' ').trim();
  return one.length > max ? one.slice(0, max) + '…' : one;
}

// onclick="fn('${value}')" 처럼 큰따옴표 속성 안의 홑따옴표 JS 문자열에 값을 넣을 때 사용.
// 값에 홑따옴표가 있으면 JS 문자열이 조기 종료되고, 큰따옴표가 있으면 속성이 조기 종료될 수 있어 둘 다 이스케이프.
function escapeJsAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
