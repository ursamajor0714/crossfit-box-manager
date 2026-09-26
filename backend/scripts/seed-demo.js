#!/usr/bin/env node
/**
 * 데모용 목업 데이터 시드 — 화면마다 볼 것이 있도록 모든 기능에 값을 넣는다.
 *
 *   node backend/scripts/seed-demo.js --reset   전부 비우고 새로 넣기 (권장)
 *   node backend/scripts/seed-demo.js           비어 있을 때만 넣기
 *
 * 날짜는 실행한 날을 기준으로 계산하므로 언제 돌려도 "지금" 화면이 채워진다.
 * 실제 회원 정보는 들어 있지 않다. 이름·전화번호·메모 전부 지어낸 것이다.
 */
require('dotenv').config();

const db = require('../db');
const { hashPassword } = require('../utils/password');

// ── 안전장치 ──────────────────────────────────────────────────────────────
// 이 스크립트는 테이블을 통째로 비운다. 로컬이 아닌 DB 에서는 기본적으로 거부한다.
const URL = process.env.DATABASE_URL || '';
const IS_LOCAL = /localhost|127\.0\.0\.1|host\.docker\.internal/.test(URL);
if (!URL) {
  console.error('DATABASE_URL 이 없습니다. .env.example 를 .env 로 복사해서 채우세요.');
  process.exit(1);
}
if (!IS_LOCAL && !process.argv.includes('--allow-remote')) {
  console.error('로컬 DB 가 아닙니다. 데이터를 지울 수 있으므로 중단합니다.');
  console.error('정말 원격 DB 에 넣으려면 --allow-remote 를 붙이세요.');
  process.exit(1);
}

// ── 날짜 도우미 (KST) ─────────────────────────────────────────────────────
const d = (off = 0) => new Date(Date.now() + off * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
const addMonths = (date, m) => { const x = new Date(date); x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10); };
const month = (off = 0) => { const x = new Date(); x.setMonth(x.getMonth() + off); return x.toISOString().slice(0, 7); };
// 매출은 created_at(결제일시) 기준으로 집계되므로, 과거 등록은 created_at 도 과거로 넣어야
// 월별 매출이 실제로 그 달에 잡힌다. (안 넣으면 전부 오늘 매출로 몰린다)
const paidAt = (off = 0) => d(off) + ' 14:00:00';

const TABLES = [
  'member_messages', 'count_usage', 'special_extensions', 'holding_requests',
  'member_registrations', 'locker_history', 'lockers', 'uniform_history', 'uniforms',
  'contracts', 'applications', 'experiences', 'dropins', 'ledger_entries',
  'sms_logs', 'sms_templates', 'notices', 'wods', 'calendar_events',
  'schedule_events', 'schedule_templates', 'pricing', 'members',
];

async function reset() {
  await db.pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  // 락커는 1~152 고정 ID 테이블이라 비운 뒤 다시 깔아준다
  for (let i = 1; i <= 152; i++) {
    await db.run('INSERT INTO lockers (id, status) VALUES (?, ?)', [i, 'empty']);
  }
  console.log('· 기존 데이터 삭제 + 락커 152칸 초기화');
}

// ── 목업 정의 ─────────────────────────────────────────────────────────────

// 코치(부운영자) — 권한 범위가 다른 두 명을 넣어 권한 화면을 확인할 수 있게 한다
const STAFF = [
  { name: '김코치', phone: '010-2001-1111', gender: '여', insta: 'coach_kim',
    goal: '컨디셔닝 클래스 담당', injury: '없음',
    perms: ['home', 'members.list', 'members.register', 'members.holding', 'members.counts', 'contract.write'] },
  { name: '박코치', phone: '010-2002-2222', gender: '남', insta: null,
    goal: '스트렝스 클래스 담당', injury: '어깨 회전근 주의',
    perms: ['home', 'revenue.ledger'] },
];

// 회원 — 상태를 일부러 다양하게 깔아 목록 필터가 전부 동작하는지 볼 수 있게 한다
const MEMBERS = [
  { name: '이가입', phone: '010-3001-0001', gender: '여', age_group: '30대', region: '군자',
    source: '인스타', source_detail: '@grove_official', insta: 'lee_gaip',
    goal: '체중 감량', injury: '없음', memo: '오전 수업 선호',
    reg: { plan: '일반2', period: 3, amount: 550000, pay: '카드', start: -20 },
    locker: { id: 12, months: 3, amount: 45000 } },

  { name: '박등록', phone: '010-3002-0002', gender: '남', age_group: '20대', region: '중곡',
    source: '지인', source_detail: '이가입 소개', goal: '근력 향상',
    reg: { plan: 'VIP', period: 1, amount: 180000, pay: '계좌이체', start: -8 } },

  { name: '최횟수', phone: '010-3003-0003', gender: '여', age_group: '40대', region: '광진',
    source: '네이버', source_detail: 'choi_blog', goal: '주 2회 꾸준히',
    memo: '횟수권 — 잔여 확인 필요',
    count: { total: 10, used: 3, amount: 300000, pay: '현금', start: -30 } },

  { name: '정만료', phone: '010-3004-0004', gender: '남', age_group: '30대', region: '자양',
    source: '오프라인', insta: 'jung_m', goal: '크로스핏 입문', injury: '무릎 통증',
    memo: '재등록 상담 예정',
    reg: { plan: '일반2', period: 1, amount: 200000, pay: '카드', start: -45 } },

  { name: '한홀딩', phone: '010-3005-0005', gender: '여', age_group: '20대', region: '군자',
    source: '인스타', goal: '체력 회복', injury: '발목 염좌 회복 중',
    reg: { plan: '일반2', period: 6, amount: 990000, pay: '카드', start: -60 },
    holding: { days: 14, reason: '출장', status: 'approved' } },

  { name: '오재등록', phone: '010-3006-0006', gender: '남', age_group: '40대', region: '중곡',
    source: '지인', goal: '체형 교정',
    reg: { plan: 'VIP', period: 3, amount: 495000, pay: '카드', start: -5 },
    prevReg: { plan: 'VIP', period: 3, amount: 495000, pay: '카드', start: -95 },
    locker: { id: 34, months: 3, amount: 45000 } },

  { name: '서대기', phone: '010-3007-0007', gender: '여', age_group: '30대', region: '광진',
    source: '네이버', goal: '다이어트', status: 'inactive', memo: '휴면 — 연락 두절' },

  { name: '강꾸준', phone: '010-3008-0008', gender: '여', age_group: '30대', region: '군자',
    source: '인스타', goal: '주 3회 유지',
    reg: { plan: '일반2', period: 6, amount: 990000, pay: '카드', start: -110 },
    locker: { id: 7, months: 6, amount: 90000 } },

  { name: '윤장기', phone: '010-3009-0009', gender: '남', age_group: '40대', region: '자양',
    source: '지인', goal: '체력 유지',
    reg: { plan: 'VIP', period: 6, amount: 891000, pay: '계좌이체', start: -88 } },

  { name: '임신규', phone: '010-3010-0010', gender: '여', age_group: '20대', region: '중곡',
    source: '인스타', source_detail: '@grove_official', goal: '첫 크로스핏',
    reg: { plan: '일반2', period: 3, amount: 550000, pay: '카드', start: -62 } },

  { name: '노주말', phone: '010-3011-0011', gender: '남', age_group: '30대', region: '광진',
    source: '오프라인', goal: '주말반만 참여',
    reg: { plan: '일반2', period: 3, amount: 550000, pay: '카드', start: -34 } },

  { name: '배복귀', phone: '010-3012-0012', gender: '여', age_group: '40대', region: '군자',
    source: '지인', goal: '재활 후 복귀', injury: '허리 디스크 — 무거운 중량 제외',
    reg: { plan: 'VIP', period: 1, amount: 180000, pay: '현금', start: -15 } },
];

const NOTICES = [
  { title: '10월 정기 휴관 안내', pinned: 1,
    content: '10월 3일(개천절)과 10월 9일(한글날)은 휴관합니다.\n주말반은 정상 운영합니다.' },
  { title: '신규 스트렝스 클래스 개설', pinned: 0,
    content: '매주 화·목 오후 8시에 스트렝스 클래스가 열립니다.\n정원 12명, 선착순 마감입니다.' },
  { title: '락커 정기 점검', pinned: 0,
    content: '이번 주 목요일 오전에 락커 점검이 있습니다. 귀중품은 미리 빼주세요.' },
];

const WODS = [
  { off: 0, type: 'CrossFit', title: 'FRAN',
    content: '21-15-9\nThrusters (43/30kg)\nPull-ups\n\nTime cap 10분' },
  { off: 0, type: 'Strength', title: 'Back Squat',
    content: '5-5-5-5-5\n직전 기록 대비 2.5kg 증량' },
  { off: 1, type: 'CrossFit', title: 'CINDY',
    content: 'AMRAP 20분\n5 Pull-ups\n10 Push-ups\n15 Air Squats' },
  { off: -1, type: 'CrossFit', title: 'DT',
    content: '5 Rounds\n12 Deadlifts\n9 Hang Power Cleans\n6 Push Jerks' },
  { off: 2, type: 'CrossFit', title: 'HELEN',
    content: '3 Rounds\n400m Run\n21 KB Swings (24/16kg)\n12 Pull-ups' },
];

const SCHEDULE = [
  { class_name: '오전반', dow: 1, start_time: '06:30', color: '#4A90D9' },
  { class_name: '오전반', dow: 3, start_time: '06:30', color: '#4A90D9' },
  { class_name: '오전반', dow: 5, start_time: '06:30', color: '#4A90D9' },
  { class_name: '점심반', dow: 2, start_time: '12:00', color: '#59B87C' },
  { class_name: '점심반', dow: 4, start_time: '12:00', color: '#59B87C' },
  { class_name: '저녁반', dow: 1, start_time: '19:00', color: '#E2896B' },
  { class_name: '저녁반', dow: 2, start_time: '19:00', color: '#E2896B' },
  { class_name: '저녁반', dow: 3, start_time: '19:00', color: '#E2896B' },
  { class_name: '저녁반', dow: 4, start_time: '19:00', color: '#E2896B' },
  { class_name: '스트렝스', dow: 2, start_time: '20:00', color: '#8B7BD8' },
  { class_name: '스트렝스', dow: 4, start_time: '20:00', color: '#8B7BD8' },
  { class_name: '주말반', dow: 6, start_time: '10:00', color: '#D9A34A' },
];

const CALENDAR = [
  { off: 3, title: '체험 데이', type: '이벤트', color: '#59B87C', memo: '무료 체험 오픈' },
  { off: 10, title: '내부 대회', type: '대회', color: '#E2896B', memo: '팀전 4인 1조' },
  { off: -4, title: '휴관', type: '휴관', color: '#999999', memo: '설비 점검' },
];

const LEDGER = [
  { kind: '매출', category: '물품판매', amount: 120000, detail: '그립·보호대 판매', off: -2 },
  { kind: '매출', category: '기타', amount: 80000, detail: '드롭인 4건', off: -6 },
  { kind: '지출', category: '임대료', amount: 1200000, detail: '월 임대료', off: -100, fixed: 1 },
  { kind: '지출', category: '인건비', amount: 600000, detail: '코치 급여(파트)', off: -100, fixed: 1 },
  { kind: '지출', category: '공과금', amount: 210000, detail: '전기·수도', off: -3 },
  { kind: '지출', category: '비품', amount: 340000, detail: '케틀벨 3개 추가', off: -12 },
  { kind: '매출', category: '물품판매', amount: 95000, detail: '단백질 보충제 판매', off: -40 },
  { kind: '매출', category: '기타', amount: 150000, detail: '내부 대회 참가비', off: -70 },
  { kind: '지출', category: '비품', amount: 180000, detail: '바벨 칼라 교체', off: -75 },
  { kind: '지출', category: '광고', amount: 300000, detail: '인스타 광고 집행', off: -50 },
];

const SMS_TEMPLATES = [
  { category: '만료안내', title: '회원권 만료 임박', is_default: true,
    content: '[크로스핏 그로브] #{이름}님, 회원권이 #{만료일}에 만료됩니다. 재등록 문의는 답장 주세요.' },
  { category: '만료안내', title: '만료 후 재등록 권유', is_default: false,
    content: '[크로스핏 그로브] #{이름}님, 다시 뵙고 싶습니다. 재등록 시 첫 달 할인 혜택이 있습니다.' },
  { category: '공지', title: '휴관 안내', is_default: true,
    content: '[크로스핏 그로브] #{날짜} 휴관합니다. 착오 없으시길 바랍니다.' },
  { category: '체험', title: '체험 예약 확인', is_default: true,
    content: '[크로스핏 그로브] #{이름}님, #{날짜} 체험 수업이 예약되었습니다. 편한 운동복으로 오세요.' },
];

const EXPERIENCES = [
  { off: -2, name: '윤체험', source: '인스타', registered: 1, coach: '김코치', memo: '당일 등록' },
  { off: -5, name: '강체험', source: '네이버', registered: 0, coach: '박코치', memo: '고민 중 — 재연락 예정' },
  { off: 3, name: '문체험', source: '지인', registered: 0, coach: '김코치', memo: '예약만 완료' },
];

const DROPINS = [
  { off: -6, name: 'Chris', source: '해외', payment_method: '카드', amount: 25000, box: 'CrossFit Sydney' },
  { off: -6, name: '노드롭', source: '타박스', payment_method: '현금', amount: 25000, box: '크로스핏 성수' },
  { off: -13, name: '임드롭', source: '타박스', payment_method: '카드', amount: 25000, box: '크로스핏 판교' },
];

// ── 넣기 ──────────────────────────────────────────────────────────────────

async function seedMembers() {
  const ids = {};

  for (const s of STAFF) {
    const pw = hashPassword(s.phone.replace(/[^0-9]/g, '').slice(-4));
    const r = await db.run(
      `INSERT INTO members (name, phone, gender, region, insta, goal, injury, status,
                            password, must_change_password, privacy_agreed, is_staff, permissions)
       VALUES (?,?,?,?,?,?,?,'active',?,0,1,1,?) RETURNING id`,
      [s.name, s.phone, s.gender, '군자', s.insta, s.goal, s.injury, pw, JSON.stringify(s.perms)]
    );
    ids[s.name] = r.lastInsertRowid;
  }
  console.log(`· 코치 ${STAFF.length}명 (비밀번호 = 전화번호 뒷 4자리)`);

  for (const m of MEMBERS) {
    const pw = hashPassword(m.phone.replace(/[^0-9]/g, '').slice(-4));
    const r = await db.run(
      `INSERT INTO members (name, phone, gender, age_group, region, source, source_detail, memo,
                            insta, goal, injury, status, password, must_change_password, privacy_agreed)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,1) RETURNING id`,
      [m.name, m.phone, m.gender, m.age_group, m.region, m.source, m.source_detail || null, m.memo || null,
       m.insta || null, m.goal || null, m.injury || null, m.status || 'active', pw]
    );
    const id = r.lastInsertRowid;
    ids[m.name] = id;

    // 지난 회원권(재등록 이력) — is_current = 0
    if (m.prevReg) {
      const p = m.prevReg, start = d(p.start);
      await db.run(
        `INSERT INTO member_registrations (member_id, reg_type, plan, period, amount, payment_method,
                                           start_date, end_date, holding_total, is_current, created_at)
         VALUES (?,'등록비',?,?,?,?,?,?,?,0,?)`,
        [id, p.plan, p.period, p.amount, p.pay, start, addMonths(start, p.period), 10, paidAt(p.start)]
      );
    }

    // 기간제 회원권
    if (m.reg) {
      const g = m.reg, start = d(g.start);
      await db.run(
        `INSERT INTO member_registrations (member_id, reg_type, plan, period, amount, payment_method,
                                           start_date, end_date, holding_days, holding_total, is_current, created_at)
         VALUES (?,'등록비',?,?,?,?,?,?,?,?,1,?)`,
        [id, g.plan, g.period, g.amount, g.pay, start, addMonths(start, g.period),
         m.holding ? m.holding.days : 0, g.period >= 3 ? 10 : 0, paidAt(g.start)]
      );
    }

    // 횟수권 + 사용 이력
    if (m.count) {
      const c = m.count, start = d(c.start);
      const reg = await db.run(
        `INSERT INTO member_registrations (member_id, reg_type, plan, period, amount, payment_method,
                                           start_date, remaining_count, is_current, created_at)
         VALUES (?,'횟수권','횟수권',?,?,?,?,?,1,?) RETURNING id`,
        [id, c.total, c.amount, c.pay, start, c.total - c.used, paidAt(c.start)]
      );
      for (let i = 0; i < c.used; i++) {
        await db.run(
          `INSERT INTO count_usage (member_id, registration_id, member_name, used_date, memo)
           VALUES (?,?,?,?,?)`,
          [id, reg.lastInsertRowid, m.name, d(-3 * (i + 1)), i === 0 ? '첫 수업' : null]
        );
      }
    }

    // 락커 배정 + 이력
    if (m.locker) {
      const l = m.locker, start = d(m.reg.start);
      const end = addMonths(start, l.months);
      await db.run(
        `UPDATE lockers SET member_id=?, member_name=?, start_date=?, end_date=?, months=?,
                            amount=?, payment_method=?, status='occupied' WHERE id=?`,
        [id, m.name, start, end, l.months, l.amount, m.reg.pay, l.id]
      );
      await db.run(
        `INSERT INTO locker_history (locker_id, member_id, member_name, action, start_date, end_date,
                                     months, amount, payment_method, created_at)
         VALUES (?,?,?,'배정',?,?,?,?,?,?)`,
        [l.id, id, m.name, start, end, l.months, l.amount, m.reg.pay, paidAt(m.reg.start)]
      );
    }

    // 홀딩 신청
    if (m.holding) {
      const h = m.holding, start = d(-10);
      await db.run(
        `INSERT INTO holding_requests (member_id, member_name, days, reason, status, processed_at, start_date, end_date)
         VALUES (?,?,?,?,?,?,?,?)`,
        [id, m.name, h.days, h.reason, h.status, h.status === 'approved' ? d(-10) + ' 10:00:00' : null,
         start, d(-10 + h.days)]
      );
    }
  }
  console.log(`· 회원 ${MEMBERS.length}명 (기간제·횟수권·만료·홀딩·휴면·재등록 각 1건 이상)`);

  // 승인 대기 중인 홀딩 — 관리자 화면의 '처리 대기' 확인용
  await db.run(
    `INSERT INTO holding_requests (member_id, member_name, days, reason, status, start_date, end_date)
     VALUES (?,?,?,?,'pending',?,?)`,
    [ids['이가입'], '이가입', 7, '해외 여행', d(2), d(9)]
  );

  // 특별 연장 (사장님 재량 연장)
  await db.run(
    `INSERT INTO special_extensions (member_id, member_name, start_date, end_date, days, reason)
     VALUES (?,?,?,?,?,?)`,
    [ids['박등록'], '박등록', d(-3), d(4), 7, '시설 점검 휴관 보상']
  );

  // 회원에게 보낸 쪽지 (읽음/안읽음 각 1건)
  await db.run(`INSERT INTO member_messages (member_id, content, read_at) VALUES (?,?,?)`,
    [ids['정만료'], '회원권이 곧 만료됩니다. 재등록 상담 원하시면 답장 주세요.', null]);
  await db.run(`INSERT INTO member_messages (member_id, content, read_at) VALUES (?,?,?)`,
    [ids['이가입'], '락커 번호가 12번으로 배정되었습니다.', d(-15) + ' 09:20:00']);

  console.log('· 홀딩 신청 2건(대기·승인), 특별연장 1건, 쪽지 2건');
  return ids;
}

async function seedFront(ids) {
  for (const n of NOTICES) {
    await db.run('INSERT INTO notices (title, content, pinned) VALUES (?,?,?)', [n.title, n.content, n.pinned]);
  }

  for (const w of WODS) {
    await db.run('INSERT INTO wods (wod_date, wod_type, title, content, publish_at) VALUES (?,?,?,?,?)',
      [d(w.off), w.type, w.title, w.content, d(w.off) + ' 05:00:00']);
  }

  for (const c of CALENDAR) {
    await db.run('INSERT INTO calendar_events (event_date, title, type, color, memo) VALUES (?,?,?,?,?)',
      [d(c.off), c.title, c.type, c.color, c.memo]);
  }

  // 시간표 템플릿 → 앞으로 2주치 실제 수업으로 펼친다
  const tplIds = [];
  for (const s of SCHEDULE) {
    const r = await db.run(
      'INSERT INTO schedule_templates (class_name, dow, start_time, color, is_active) VALUES (?,?,?,?,1) RETURNING id',
      [s.class_name, s.dow, s.start_time, s.color]);
    tplIds.push({ ...s, id: r.lastInsertRowid });
  }
  let events = 0;
  for (let off = -7; off <= 14; off++) {
    const date = d(off);
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    for (const t of tplIds.filter(t => t.dow === dow)) {
      // 휴관일 하루는 취소 처리해서 '취소된 수업' 표시를 확인할 수 있게 한다
      const cancelled = off === -4 ? 1 : 0;
      await db.run(
        `INSERT INTO schedule_events (template_id, event_date, class_name, start_time, color, memo, is_cancelled)
         VALUES (?,?,?,?,?,?,?)`,
        [t.id, date, t.class_name, t.start_time, t.color, cancelled ? '설비 점검 휴관' : null, cancelled]);
      events++;
    }
  }
  console.log(`· 공지 ${NOTICES.length}건, WOD ${WODS.length}건, 캘린더 ${CALENDAR.length}건, 시간표 ${SCHEDULE.length}종 → 수업 ${events}건`);
}

async function seedOps(ids) {
  // 계약서 — 대기 1건(관리자가 처리해볼 수 있게), 완료 1건
  await db.run(
    `INSERT INTO contracts (name, phone, birth_date, gender, region, source, goal, injury,
                            privacy_agreed, signature, contract_type, plan, period, amount,
                            membership_type, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,1,?, '신규', ?,?,?, '기간제', 'pending', ?)`,
    ['신규작성', '010-4001-0001', '1994-05-12', '여', '군자', '인스타', '체력 증진', '없음',
     'data:image/png;base64,iVBORw0KGgo=', '일반2', 3, 550000, paidAt(-1)]);

  await db.run(
    `INSERT INTO contracts (name, phone, gender, region, source, privacy_agreed, signature,
                            contract_type, plan, period, amount, membership_type, status,
                            member_id, start_date, end_date, created_at)
     VALUES (?,?,?,?,?,1,?, '신규', ?,?,?, '기간제', '완료', ?,?,?,?)`,
    ['이가입', '010-3001-0001', '여', '군자', '인스타', 'data:image/png;base64,iVBORw0KGgo=',
     '일반2', 3, 550000, ids['이가입'], d(-20), addMonths(d(-20), 3), paidAt(-20)]);

  // 신청 — 체험/방문 각각, 대기·완료 섞어서
  const APPS = [
    { type: '체험', name: '문체험', phone: '010-5001-0001', off: 3, status: 'pending',
      class_name: '저녁반', class_time: '19:00', memo: '직장인, 퇴근 후 희망', amount: 0 },
    { type: '방문', name: '조방문', phone: '010-5002-0002', off: 1, status: 'pending',
      memo: '시설 둘러보고 싶어요', amount: 0 },
    { type: '체험', name: '윤체험', phone: '010-5003-0003', off: -2, status: '완료',
      class_name: '오전반', class_time: '06:30', amount: 20000, payment_method: '카드' },
  ];
  for (const a of APPS) {
    await db.run(
      `INSERT INTO applications (type, name, phone, preferred_date, memo, status, class_time, class_name, amount, payment_method)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [a.type, a.name, a.phone, d(a.off), a.memo || null, a.status,
       a.class_time || null, a.class_name || null, a.amount, a.payment_method || null]);
  }

  for (const e of EXPERIENCES) {
    await db.run('INSERT INTO experiences (date, name, source, registered, memo, coach) VALUES (?,?,?,?,?,?)',
      [d(e.off), e.name, e.source, e.registered, e.memo, e.coach]);
  }

  for (const x of DROPINS) {
    await db.run('INSERT INTO dropins (date, name, source, payment_method, amount, box) VALUES (?,?,?,?,?,?)',
      [d(x.off), x.name, x.source, x.payment_method, x.amount, x.box]);
  }

  console.log(`· 계약서 2건(대기·완료), 신청 ${APPS.length}건, 체험 ${EXPERIENCES.length}건, 드롭인 ${DROPINS.length}건`);
}

async function seedMoney() {
  for (const l of LEDGER) {
    await db.run(
      'INSERT INTO ledger_entries (kind, category, amount, detail, entry_date, is_fixed) VALUES (?,?,?,?,?,?)',
      [l.kind, l.category, l.amount, l.detail, d(l.off), l.fixed || 0]);
  }

  // 가격표 (db.js 의 init 은 테이블이 비어 있을 때만 넣으므로 reset 후에는 여기서 채운다)
  const PRICES = [
    ['일반2', 1, 200000, '일반2 1개월'], ['일반2', 3, 550000, '일반2 3개월'], ['일반2', 6, 990000, '일반2 6개월'],
    ['VIP', 1, 180000, 'VIP 1개월'], ['VIP', 3, 495000, 'VIP 3개월'], ['VIP', 6, 891000, 'VIP 6개월'],
    ['횟수권', 10, 300000, '횟수권 10회'], ['횟수권', 20, 550000, '횟수권 20회'],
  ];
  for (const p of PRICES) {
    await db.run('INSERT INTO pricing (plan, period, amount, label) VALUES (?,?,?,?)', p);
  }

  const fixedFrom = LEDGER.filter(l => l.fixed).map(l => d(l.off).slice(0, 7)).sort()[0];
  console.log(`· 가계부 ${LEDGER.length}건(고정비 2건 포함 — ${fixedFrom}부터 매달 반복), 가격표 ${PRICES.length}종`);
}

async function seedSms() {
  for (const t of SMS_TEMPLATES) {
    await db.run('INSERT INTO sms_templates (category, title, content, is_default) VALUES (?,?,?,?)',
      [t.category, t.title, t.content, t.is_default]);
  }

  const LOGS = [
    { category: '만료안내', name: '정만료', phone: '010-3004-0004', status: '성공', off: -1,
      content: '[크로스핏 그로브] 정만료님, 회원권이 만료되었습니다. 재등록 문의는 답장 주세요.' },
    { category: '공지', name: '이가입', phone: '010-3001-0001', status: '성공', off: -4,
      content: '[크로스핏 그로브] 10월 3일 휴관합니다.' },
    { category: '체험', name: '문체험', phone: '010-5001-0001', status: '실패', off: -2,
      content: '[크로스핏 그로브] 문체험님, 체험 수업이 예약되었습니다.', error_msg: '수신 거부 번호' },
  ];
  for (const l of LOGS) {
    await db.run(
      'INSERT INTO sms_logs (category, name, phone, content, status, error_msg, sent_at) VALUES (?,?,?,?,?,?,?)',
      [l.category, l.name, l.phone, l.content, l.status, l.error_msg || null, d(l.off) + ' 11:00:00']);
  }
  console.log(`· 문자 템플릿 ${SMS_TEMPLATES.length}종, 발송 이력 ${LOGS.length}건(성공 2·실패 1)`);
}

async function main() {
  await db.ready;

  if (process.argv.includes('--reset')) {
    await reset();
  } else {
    const c = await db.get('SELECT COUNT(*) AS cnt FROM members');
    if (Number(c.cnt) > 0) {
      console.log('이미 데이터가 있습니다. 새로 넣으려면 --reset 을 붙이세요.');
      process.exit(0);
    }
  }

  const ids = await seedMembers();
  await seedFront(ids);
  await seedOps(ids);
  await seedMoney();
  await seedSms();

  console.log('\n끝났습니다.');
  console.log('  관리자 로그인 — .env 의 ADMIN_PASSWORD');
  console.log('  회원 로그인   — 이름 + 전화번호 뒷 4자리 (예: 이가입 / 0001)');
  console.log('  코치 로그인   — 김코치 / 1111,  박코치 / 2222');
  await db.pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
