#!/usr/bin/env node
/**
 * 데모용 목업 데이터 시드 — 화면마다 볼 것이 있도록 모든 기능에 값을 넣는다.
 *
 *   node backend/scripts/seed-demo.js --reset   전부 비우고 새로 넣기 (권장)
 *   node backend/scripts/seed-demo.js           비어 있을 때만 넣기
 *
 * 회원 90명 규모의 "돌아가고 있는 박스"를 만든다.
 * 날짜는 실행한 날을 기준으로 계산하므로 언제 돌려도 "지금" 화면이 채워지고,
 * 난수는 고정 시드를 써서 몇 번을 돌려도 같은 결과가 나온다.
 *
 * 실제 회원 정보는 들어 있지 않다. 이름·전화번호·메모 전부 지어낸 것이다.
 */
require('dotenv').config();

const db = require('../db');
const { hashPassword } = require('../utils/password');

// ── 안전장치 ──────────────────────────────────────────────────────────────
// 이 스크립트는 테이블을 통째로 비운다. 로컬이 아닌 DB 에서는 기본적으로 거부한다.
const URL = process.env.DATABASE_URL || '';
if (!URL) {
  console.error('DATABASE_URL 이 없습니다. .env.example 를 .env 로 복사해서 채우세요.');
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1|host\.docker\.internal/.test(URL) && !process.argv.includes('--allow-remote')) {
  console.error('로컬 DB 가 아닙니다. 데이터를 지울 수 있으므로 중단합니다.');
  console.error('정말 원격 DB 에 넣으려면 --allow-remote 를 붙이세요.');
  process.exit(1);
}

// ── 난수 (고정 시드) ──────────────────────────────────────────────────────
// 돌릴 때마다 회원 구성이 바뀌면 화면 확인이 어려우므로 결과를 고정한다.
let _s = 20260926;
const rnd = () => {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = p => rnd() < p;

// ── 날짜 (KST) ────────────────────────────────────────────────────────────
const d = (off = 0) => new Date(Date.now() + off * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
const addMonths = (date, m) => { const x = new Date(date + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };
const subMonths = (date, m) => addMonths(date, -m);
const addDays = (date, n) => new Date(new Date(date + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
// 매출은 created_at(결제일시) 기준으로 집계된다. 과거 등록은 created_at 도 과거로 넣어야
// 월별 매출이 실제 그 달에 잡힌다 (안 넣으면 전부 오늘 매출로 몰린다).
const paidAtOf = (dateStr) => dateStr + ' ' + String(int(9, 21)).padStart(2, '0') + ':' + pick(['05','17','23','38','44','51']) + ':00';

// ── 이름·프로필 재료 ──────────────────────────────────────────────────────
const SURNAME = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','전','홍','고','문','손','양','배','백','허','유','남','심'];
const GIVEN = ['서준','서연','도윤','하윤','시우','지우','주원','서현','하준','민서','지호','수아','예준','지유','준우','채원','건우','지민','우진','다은',
  '선우','은서','현우','하은','유준','예은','정우','서윤','승우','수빈','지훈','윤아','도현','소율','민준','아린','재윤','시은','성민','다인',
  '태윤','유나','준서','예린','시윤','하율','승현','나윤','지안','セ'].filter(n => /^[가-힣]+$/.test(n));

const REGION = ['군자','중곡','자양','광진','화양','구의','능동','성수'];
const SOURCE = ['인스타','네이버','지인','오프라인','유튜브'];
const GOAL = ['체중 감량','근력 향상','체력 유지','바디프로필 준비','재활 후 복귀','대회 준비','자세 교정','스트레스 해소', null, null];
const INJURY = ['없음','무릎 통증','어깨 회전근 주의','허리 디스크 — 고중량 제외','발목 염좌 회복 중','손목 통증', null, null, null];
const MEMO = [
  '오전 수업 선호', '주 3회 목표', '샤워실 이용 안내함', '재등록 상담 예정', '친구 소개로 등록',
  '무리하지 않도록 중량 조절 필요', '주말반만 참여', '출장 잦아 홀딩 가능성 있음',
  '대회 준비 중 — 별도 프로그램', '초보라 기본 동작부터', '락커 연장 문의함', '카카오로 연락 선호',
  null, null, null, null,
];
const PAY = ['카드','카드','카드','계좌이체','현금'];

const PLANS = [
  { plan: '일반2', period: 1, amount: 200000, w: 2 },
  { plan: '일반2', period: 3, amount: 550000, w: 4 },
  { plan: '일반2', period: 6, amount: 990000, w: 2 },
  { plan: 'VIP',   period: 1, amount: 180000, w: 2 },
  { plan: 'VIP',   period: 3, amount: 495000, w: 3 },
  { plan: 'VIP',   period: 6, amount: 891000, w: 1 },
];
const PLAN_POOL = PLANS.flatMap(p => Array(p.w).fill(p));

const TOTAL = 90;
const LOCKER_COUNT = 152;

const TABLES = [
  'member_messages', 'count_usage', 'special_extensions', 'holding_requests',
  'member_registrations', 'locker_history', 'lockers', 'uniform_history', 'uniforms',
  'contracts', 'applications', 'experiences', 'dropins', 'ledger_entries',
  'sms_logs', 'sms_templates', 'notices', 'wods', 'calendar_events',
  'schedule_events', 'schedule_templates', 'pricing', 'members',
];

async function reset() {
  await db.pool.query('TRUNCATE ' + TABLES.join(', ') + ' RESTART IDENTITY CASCADE');
  for (let i = 1; i <= LOCKER_COUNT; i++) {
    await db.run('INSERT INTO lockers (id, status) VALUES (?, ?)', [i, 'empty']);
  }
  console.log('· 기존 데이터 삭제 + 락커 ' + LOCKER_COUNT + '칸 초기화');
}

// ── 회원 명단 만들기 ──────────────────────────────────────────────────────
// 화면마다 볼 것이 있도록 상태를 의도적으로 배분한다.
function buildRoster() {
  const used = new Set();
  const uniqueName = () => {
    for (let i = 0; i < 2000; i++) {
      const n = pick(SURNAME) + pick(GIVEN);
      if (!used.has(n)) { used.add(n); return n; }
    }
    throw new Error('이름 후보가 모자랍니다');
  };

  const roster = [];
  for (let i = 0; i < TOTAL; i++) {
    const age = pick(['20대','20대','30대','30대','30대','40대','40대','50대']);
    const span = age === '20대' ? [20,29] : age === '30대' ? [30,39] : age === '40대' ? [40,49] : [50,58];
    roster.push({
      name: uniqueName(),
      phone: '010-' + String(3000 + i).padStart(4, '0') + '-' + int(1000, 9999),
      age_group: age,
      gender: chance(0.55) ? '여' : '남',
      region: pick(REGION),
      source: pick(SOURCE),
      insta: chance(0.35) ? pick(['run','wod','fit','box','lift']) + '_' + int(100, 999) : null,
      goal: pick(GOAL),
      injury: pick(INJURY),
      memo: pick(MEMO),
      birthYear: new Date().getFullYear() - int(span[0], span[1]),
      birthMonthDay: null,
      kind: 'term',
      endsIn: null,
    });
  }

  // 생일 — 먼저 한 해 전체에 흩는다
  for (const m of roster) {
    m.birthMonthDay = String(int(1, 12)).padStart(2, '0') + '-' + String(int(1, 28)).padStart(2, '0');
  }
  // 홈의 '7일 이내 생일' 위젯을 볼 수 있도록 5명만 오늘~6일 뒤로 맞춘다.
  // 만료 임박(0~5번)·휴면(16~27번)과 겹치지 않도록 정상 회원 구간에서 고른다.
  for (let i = 0; i < 5; i++) roster[45 + i * 3].birthMonthDay = d(i + int(0, 1)).slice(5);

  // 회원권 상태 — 만료 임박 6 · 이달 만료 10 · 만료 휴면 12 · 횟수권 10 · 나머지 정상
  let c = 0;
  const assign = (n, fn) => { for (let i = 0; i < n; i++) fn(roster[c++]); };
  assign(6,  m => { m.kind = 'term';    m.endsIn = int(1, 7); });
  assign(10, m => { m.kind = 'term';    m.endsIn = int(8, 28); });
  assign(12, m => { m.kind = 'expired'; m.endsIn = -int(3, 120); });
  assign(10, m => { m.kind = 'count';   m.endsIn = null; });
  while (c < roster.length) { const m = roster[c++]; m.kind = 'term'; m.endsIn = int(29, 170); }

  return roster;
}

const STAFF = [
  { name: '김코치', phone: '010-2001-1111', gender: '여', insta: 'coach_kim',
    goal: '컨디셔닝 클래스 담당', injury: '없음', birth_date: '1993-04-18',
    perms: ['home', 'members.list', 'members.register', 'members.holding', 'members.counts', 'contract.write'] },
  { name: '박코치', phone: '010-2002-2222', gender: '남', insta: null,
    goal: '스트렝스 클래스 담당', injury: '어깨 회전근 주의', birth_date: '1989-11-02',
    perms: ['home', 'revenue.ledger'] },
];

async function seedStaff() {
  for (const s of STAFF) {
    const pw = hashPassword(s.phone.replace(/[^0-9]/g, '').slice(-4));
    await db.run(
      'INSERT INTO members (name, phone, gender, region, insta, goal, injury, birth_date, status,' +
      ' password, must_change_password, privacy_agreed, is_staff, permissions)' +
      " VALUES (?,?,?,?,?,?,?,?,'active',?,0,1,1,?)",
      [s.name, s.phone, s.gender, '군자', s.insta, s.goal, s.injury, s.birth_date, pw, JSON.stringify(s.perms)]);
  }
  console.log('· 코치 ' + STAFF.length + '명 (비밀번호 = 전화번호 뒷 4자리)');
}

async function seedMembers(roster) {
  let lockerNext = 1, lockers = 0, prevRegs = 0, holdings = 0, counts = 0, usages = 0;
  const made = [];

  for (const m of roster) {
    const birth = m.birthYear + '-' + m.birthMonthDay;
    const status = m.kind === 'expired' ? 'inactive' : 'active';
    const pw = hashPassword(m.phone.replace(/[^0-9]/g, '').slice(-4));

    const r = await db.run(
      'INSERT INTO members (name, phone, gender, age_group, region, source, source_detail, memo,' +
      ' insta, goal, injury, birth_date, status, password, must_change_password, privacy_agreed)' +
      ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1) RETURNING id',
      [m.name, m.phone, m.gender, m.age_group, m.region, m.source,
       m.source === '지인' ? pick(SURNAME) + pick(GIVEN) + ' 소개' : null,
       m.memo, m.insta, m.goal, m.injury, birth, status, pw]);
    const id = r.lastInsertRowid;
    made.push({ id: id, name: m.name, phone: m.phone, gender: m.gender, region: m.region,
                source: m.source, memo: m.memo, status: status, birthYear: m.birthYear, birthMonthDay: m.birthMonthDay });

    if (m.kind === 'count') {
      const total = pick([10, 10, 20]);
      const amount = total === 10 ? 300000 : 550000;
      const used = int(1, Math.min(total - 1, 12));
      const start = d(-int(20, 90));
      const reg = await db.run(
        "INSERT INTO member_registrations (member_id, reg_type, plan, period, amount, payment_method," +
        " start_date, remaining_count, is_current, created_at)" +
        " VALUES (?,'횟수권','횟수권',?,?,?,?,?,1,?) RETURNING id",
        [id, total, amount, pick(PAY), start, total - used, paidAtOf(start)]);
      for (let i = 0; i < used; i++) {
        await db.run(
          'INSERT INTO count_usage (member_id, registration_id, member_name, used_date, memo) VALUES (?,?,?,?,?)',
          [id, reg.lastInsertRowid, m.name, d(-int(1, 60)), chance(0.15) ? '지각 — 부분 참여' : null]);
        usages++;
      }
      counts++;
      continue;
    }

    // 기간제 — 만료일을 먼저 정하고 거기서 시작일을 역산한다
    const p = pick(PLAN_POOL);
    const end = d(m.endsIn);
    const start = subMonths(end, p.period);
    const holdingDays = chance(0.18) ? int(3, 21) : 0;

    if (chance(0.25)) {
      const pEnd = start, pStart = subMonths(pEnd, p.period);
      await db.run(
        "INSERT INTO member_registrations (member_id, reg_type, plan, period, amount, payment_method," +
        " start_date, end_date, holding_total, is_current, created_at)" +
        " VALUES (?,'등록비',?,?,?,?,?,?,?,0,?)",
        [id, p.plan, p.period, p.amount, pick(PAY), pStart, pEnd, p.period >= 3 ? 10 : 0, paidAtOf(pStart)]);
      prevRegs++;
    }

    await db.run(
      "INSERT INTO member_registrations (member_id, reg_type, plan, period, amount, payment_method," +
      " start_date, end_date, holding_days, holding_total, is_current, created_at)" +
      " VALUES (?,'등록비',?,?,?,?,?,?,?,?,1,?)",
      [id, p.plan, p.period, p.amount, pick(PAY), start, end, holdingDays, p.period >= 3 ? 10 : 0, paidAtOf(start)]);

    if (holdingDays > 0) {
      const hs = d(-int(10, 80));
      await db.run(
        "INSERT INTO holding_requests (member_id, member_name, days, reason, status, processed_at, start_date, end_date)" +
        " VALUES (?,?,?,?,'approved',?,?,?)",
        [id, m.name, holdingDays, pick(['출장','여행','부상','개인 사정','시험 기간']),
         hs + ' 10:00:00', hs, addDays(hs, holdingDays)]);
      holdings++;
    }

    // 락커 — 활성 회원의 약 45%. status 는 앱이 실제로 쓰는 'active'
    if (status === 'active' && chance(0.45) && lockerNext <= LOCKER_COUNT) {
      const lid = lockerNext++;
      const months = pick([1, 3, 3, 6]);
      const amount = months * 15000;
      const lEnd = addMonths(start, months);
      const pay = pick(PAY);
      await db.run(
        "UPDATE lockers SET member_id=?, member_name=?, start_date=?, end_date=?, months=?," +
        " amount=?, payment_method=?, status='active' WHERE id=?",
        [id, m.name, start, lEnd, months, amount, pay, lid]);
      await db.run(
        "INSERT INTO locker_history (locker_id, member_id, member_name, action, start_date, end_date," +
        " months, amount, payment_method, created_at) VALUES (?,?,?,'배정',?,?,?,?,?,?)",
        [lid, id, m.name, start, lEnd, months, amount, pay, paidAtOf(start)]);
      lockers++;
    }
  }

  const act = made.filter(x => x.status === 'active').length;
  console.log('· 회원 ' + roster.length + '명 — 활성 ' + act + ' / 휴면 ' + (made.length - act));
  console.log('    만료 임박(7일 내) 6, 이달 만료 10, 만료 휴면 12, 횟수권 ' + counts + '(사용 ' + usages + '회), 재등록 이력 ' + prevRegs);
  console.log('    생일 전원 등록 (그중 5명은 7일 이내), 회원메모 ' + made.filter(x => x.memo).length + '명');
  console.log('· 락커 ' + lockers + '/' + LOCKER_COUNT + '칸 배정 + 이력, 홀딩 승인 이력 ' + holdings + '건');
  return made;
}

async function seedPending(members) {
  const active = members.filter(m => m.status === 'active');

  for (let i = 0; i < 3; i++) {
    const m = active[int(0, active.length - 1)];
    const s = d(int(1, 10)), days = int(5, 21);
    await db.run(
      "INSERT INTO holding_requests (member_id, member_name, days, reason, status, start_date, end_date)" +
      " VALUES (?,?,?,?,'pending',?,?)",
      [m.id, m.name, days, pick(['해외 여행','출장','부상 회복','가족 행사']), s, addDays(s, days)]);
  }

  for (let i = 0; i < 3; i++) {
    const m = active[int(0, active.length - 1)];
    const s = d(-int(5, 40)), days = int(3, 10);
    await db.run(
      'INSERT INTO special_extensions (member_id, member_name, start_date, end_date, days, reason) VALUES (?,?,?,?,?,?)',
      [m.id, m.name, s, addDays(s, days), days, pick(['시설 점검 휴관 보상','수업 취소 보상','장기 회원 감사'])]);
  }

  let msgs = 0;
  for (const m of members.slice(0, 18)) {
    await db.run('INSERT INTO member_messages (member_id, content, read_at) VALUES (?,?,?)',
      [m.id, pick([
        '회원권이 곧 만료됩니다. 재등록 상담 원하시면 답장 주세요.',
        '락커가 배정되었습니다. 비밀번호는 데스크에서 확인해주세요.',
        '이번 주 토요일 내부 대회 참가 신청 받습니다.',
        '홀딩 신청이 승인되었습니다.',
        '등록해주셔서 감사합니다. 첫 수업 전에 10분 일찍 와주세요.',
      ]), chance(0.5) ? d(-int(1, 20)) + ' 09:20:00' : null]);
    msgs++;
  }
  console.log('· 홀딩 신청 대기 3건, 특별연장 3건, 쪽지 ' + msgs + '건');
}

async function seedFunnel(members) {
  const CLASSES = [['오전반','06:30'],['점심반','12:00'],['저녁반','19:00'],['스트렝스','20:00'],['주말반','10:00']];

  for (let i = 0; i < 8; i++) {
    const isTrial = i < 5;
    const cls = pick(CLASSES);
    await db.run(
      "INSERT INTO applications (type, name, phone, preferred_date, memo, status, class_time, class_name, amount, payment_method, created_at)" +
      " VALUES (?,?,?,?,?,'pending',?,?,0,NULL,?)",
      [isTrial ? '체험' : '방문', pick(SURNAME) + pick(GIVEN), '010-5' + int(100, 999) + '-' + int(1000, 9999),
       d(int(1, 12)), pick(['퇴근 후 희망','주말만 가능','시설 먼저 보고 싶어요','크로스핏 처음입니다', null]),
       isTrial ? cls[1] : null, isTrial ? cls[0] : null, d(-int(0, 4)) + ' 13:00:00']);
  }

  for (let i = 0; i < 22; i++) {
    const isTrial = chance(0.7);
    const cls = pick(CLASSES);
    const day = d(-int(1, 110));
    await db.run(
      "INSERT INTO applications (type, name, phone, preferred_date, memo, status, class_time, class_name, amount, payment_method, created_at)" +
      " VALUES (?,?,?,?,NULL,'완료',?,?,?,?,?)",
      [isTrial ? '체험' : '방문', pick(SURNAME) + pick(GIVEN), '010-5' + int(100, 999) + '-' + int(1000, 9999),
       day, isTrial ? cls[1] : null, isTrial ? cls[0] : null,
       isTrial ? 20000 : 0, isTrial ? pick(PAY) : null, paidAtOf(day)]);
  }

  for (let i = 0; i < 28; i++) {
    await db.run('INSERT INTO experiences (date, name, source, registered, memo, coach) VALUES (?,?,?,?,?,?)',
      [d(-int(0, 120)), pick(SURNAME) + pick(GIVEN), pick(SOURCE), chance(0.4) ? 1 : 0,
       pick(['당일 등록','고민 중 — 재연락 예정','가격 안내함','친구와 같이 옴', null, null]),
       pick(['김코치','박코치'])]);
  }

  const BOXES = ['크로스핏 성수','크로스핏 판교','크로스핏 광교','CrossFit Sydney','CrossFit Tokyo','크로스핏 해운대','크로스핏 노원'];
  for (let i = 0; i < 24; i++) {
    await db.run('INSERT INTO dropins (date, name, source, payment_method, amount, box) VALUES (?,?,?,?,?,?)',
      [d(-int(0, 120)), chance(0.2) ? pick(['Chris','Emma','Kenji','Marco']) : pick(SURNAME) + pick(GIVEN),
       chance(0.25) ? '해외' : '타박스', pick(PAY), 25000, pick(BOXES)]);
  }

  for (let i = 0; i < 4; i++) {
    const p = pick(PLAN_POOL);
    await db.run(
      "INSERT INTO contracts (name, phone, birth_date, gender, region, source, goal, injury," +
      " privacy_agreed, signature, contract_type, plan, period, amount, membership_type, status, created_at)" +
      " VALUES (?,?,?,?,?,?,?,?,1,?,'신규',?,?,?,'기간제','pending',?)",
      [pick(SURNAME) + pick(GIVEN), '010-4' + int(100, 999) + '-' + int(1000, 9999),
       int(1985, 2004) + '-' + String(int(1, 12)).padStart(2, '0') + '-' + String(int(1, 28)).padStart(2, '0'),
       chance(0.5) ? '여' : '남', pick(REGION), pick(SOURCE), pick(GOAL), pick(INJURY),
       'data:image/png;base64,iVBORw0KGgo=', p.plan, p.period, p.amount, d(-int(0, 3)) + ' 15:30:00']);
  }
  for (const m of members.slice(0, 12)) {
    const p = pick(PLAN_POOL);
    const s = d(-int(10, 120));
    await db.run(
      "INSERT INTO contracts (name, phone, birth_date, gender, region, source, privacy_agreed, signature," +
      " contract_type, plan, period, amount, membership_type, status, member_id, start_date, end_date, created_at)" +
      " VALUES (?,?,?,?,?,?,1,?,'신규',?,?,?,'기간제','완료',?,?,?,?)",
      [m.name, m.phone, m.birthYear + '-' + m.birthMonthDay, m.gender, m.region, m.source,
       'data:image/png;base64,iVBORw0KGgo=', p.plan, p.period, p.amount, m.id, s, addMonths(s, p.period), paidAtOf(s)]);
  }

  console.log('· 신청 30건(대기 8 · 완료 22), 체험 28건, 드롭인 24건');
  console.log('· 계약서 16건(작성 대기 4 · 등록 완료 12)');
}

const NOTICES = [
  { title: '10월 정기 휴관 안내', pinned: 1, content: '10월 3일(개천절)과 10월 9일(한글날)은 휴관합니다.\n주말반은 정상 운영합니다.' },
  { title: '신규 스트렝스 클래스 개설', pinned: 1, content: '매주 화·목 오후 8시에 스트렝스 클래스가 열립니다.\n정원 12명, 선착순 마감입니다.' },
  { title: '락커 정기 점검', pinned: 0, content: '이번 주 목요일 오전에 락커 점검이 있습니다. 귀중품은 미리 빼주세요.' },
  { title: '내부 대회 참가 신청', pinned: 0, content: '다음 달 내부 대회 참가 신청을 받습니다.\n팀전 4인 1조이며 데스크에서 접수합니다.' },
  { title: '샤워실 온수 공사 완료', pinned: 0, content: '온수 공사가 끝났습니다. 이용에 불편을 드려 죄송합니다.' },
  { title: '주차 안내', pinned: 0, content: '건물 지하 주차장은 2시간 무료입니다. 데스크에서 등록해주세요.' },
];

const WOD_LIB = [
  ['FRAN', '21-15-9\nThrusters (43/30kg)\nPull-ups\n\nTime cap 10분'],
  ['CINDY', 'AMRAP 20분\n5 Pull-ups\n10 Push-ups\n15 Air Squats'],
  ['DT', '5 Rounds\n12 Deadlifts\n9 Hang Power Cleans\n6 Push Jerks'],
  ['HELEN', '3 Rounds\n400m Run\n21 KB Swings (24/16kg)\n12 Pull-ups'],
  ['MURPH', '1mile Run\n100 Pull-ups\n200 Push-ups\n300 Air Squats\n1mile Run'],
  ['GRACE', '30 Clean & Jerks (61/43kg)\nFor time'],
  ['ANNIE', '50-40-30-20-10\nDouble Unders\nSit-ups'],
  ['DIANE', '21-15-9\nDeadlifts (102/70kg)\nHandstand Push-ups'],
];
const STRENGTH_LIB = [
  ['Back Squat', '5-5-5-5-5\n직전 기록 대비 2.5kg 증량'],
  ['Deadlift', '3-3-3-3-3 @ 80% 1RM'],
  ['Strict Press', '5-5-5\n마지막 세트 AMRAP'],
  ['Front Squat', '3x5 @ 75%'],
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
  { class_name: '저녁반', dow: 5, start_time: '19:00', color: '#E2896B' },
  { class_name: '스트렝스', dow: 2, start_time: '20:00', color: '#8B7BD8' },
  { class_name: '스트렝스', dow: 4, start_time: '20:00', color: '#8B7BD8' },
  { class_name: '주말반', dow: 6, start_time: '10:00', color: '#D9A34A' },
  { class_name: '주말반', dow: 6, start_time: '11:00', color: '#D9A34A' },
];

const CALENDAR = [
  { off: 3,   title: '체험 데이',   type: '이벤트', color: '#59B87C', memo: '무료 체험 오픈' },
  { off: 10,  title: '내부 대회',   type: '대회',   color: '#E2896B', memo: '팀전 4인 1조' },
  { off: 21,  title: '오픈 워크숍', type: '이벤트', color: '#8B7BD8', memo: '올림픽 리프팅 기초' },
  { off: -4,  title: '휴관',        type: '휴관',   color: '#999999', memo: '설비 점검' },
  { off: -25, title: '지역 대회',   type: '대회',   color: '#E2896B', memo: '회원 6명 출전' },
];

async function seedContent() {
  for (const n of NOTICES) {
    await db.run('INSERT INTO notices (title, content, pinned, created_at) VALUES (?,?,?,?)',
      [n.title, n.content, n.pinned, d(-int(1, 40)) + ' 10:00:00']);
  }

  let wods = 0;
  for (let off = -21; off <= 7; off++) {
    const date = d(off);
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    if (dow === 0) continue;
    const w = WOD_LIB[Math.abs(off) % WOD_LIB.length];
    await db.run('INSERT INTO wods (wod_date, wod_type, title, content, publish_at) VALUES (?,?,?,?,?)',
      [date, 'CrossFit', w[0], w[1], date + ' 05:00:00']);
    wods++;
    if (dow >= 1 && dow <= 5 && off % 2 === 0) {
      const s = STRENGTH_LIB[Math.abs(off) % STRENGTH_LIB.length];
      await db.run('INSERT INTO wods (wod_date, wod_type, title, content, publish_at) VALUES (?,?,?,?,?)',
        [date, 'Strength', s[0], s[1], date + ' 05:00:00']);
      wods++;
    }
  }

  for (const c of CALENDAR) {
    await db.run('INSERT INTO calendar_events (event_date, title, type, color, memo) VALUES (?,?,?,?,?)',
      [d(c.off), c.title, c.type, c.color, c.memo]);
  }

  const tpl = [];
  for (const s of SCHEDULE) {
    const r = await db.run(
      'INSERT INTO schedule_templates (class_name, dow, start_time, color, is_active) VALUES (?,?,?,?,1) RETURNING id',
      [s.class_name, s.dow, s.start_time, s.color]);
    tpl.push({ id: r.lastInsertRowid, dow: s.dow, class_name: s.class_name, start_time: s.start_time, color: s.color });
  }
  let events = 0;
  for (let off = -21; off <= 21; off++) {
    const date = d(off);
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    for (const t of tpl.filter(x => x.dow === dow)) {
      const cancelled = off === -4 ? 1 : 0;
      await db.run(
        'INSERT INTO schedule_events (template_id, event_date, class_name, start_time, color, memo, is_cancelled)' +
        ' VALUES (?,?,?,?,?,?,?)',
        [t.id, date, t.class_name, t.start_time, t.color, cancelled ? '설비 점검 휴관' : null, cancelled]);
      events++;
    }
  }
  console.log('· 공지 ' + NOTICES.length + '건, WOD ' + wods + '건(3주 전~1주 후), 캘린더 ' + CALENDAR.length + '건, 시간표 ' + SCHEDULE.length + '종 → 수업 ' + events + '건');
}

async function seedMoney() {
  const FIXED = [
    ['임대료', 3200000, '월 임대료'],
    ['인건비', 2600000, '코치 급여'],
    ['공과금', 180000, '인터넷·정수기'],
  ];
  for (const f of FIXED) {
    await db.run("INSERT INTO ledger_entries (kind, category, amount, detail, entry_date, is_fixed) VALUES ('지출',?,?,?,?,1)",
      [f[0], f[1], f[2], d(-160)]);
  }

  const ONEOFF = [
    ['매출','물품판매','그립·보호대 판매'], ['매출','물품판매','단백질 보충제 판매'],
    ['매출','기타','내부 대회 참가비'], ['매출','기타','워크숍 참가비'],
    ['지출','공과금','전기·수도'], ['지출','비품','케틀벨 3개 추가'],
    ['지출','비품','바벨 칼라 교체'], ['지출','비품','고무 매트 보수'],
    ['지출','광고','인스타 광고 집행'], ['지출','광고','네이버 플레이스 광고'],
    ['지출','기타','정기 소독'], ['지출','기타','회식'],
  ];
  for (let i = 0; i < 26; i++) {
    const o = ONEOFF[i % ONEOFF.length];
    await db.run('INSERT INTO ledger_entries (kind, category, amount, detail, entry_date, is_fixed) VALUES (?,?,?,?,?,0)',
      [o[0], o[1], o[0] === '매출' ? int(6, 28) * 10000 : int(9, 45) * 10000, o[2], d(-int(1, 165))]);
  }

  const PRICES = [
    ['일반2', 1, 200000, '일반2 1개월'], ['일반2', 3, 550000, '일반2 3개월'], ['일반2', 6, 990000, '일반2 6개월'],
    ['VIP', 1, 180000, 'VIP 1개월'], ['VIP', 3, 495000, 'VIP 3개월'], ['VIP', 6, 891000, 'VIP 6개월'],
    ['횟수권', 10, 300000, '횟수권 10회'], ['횟수권', 20, 550000, '횟수권 20회'],
  ];
  for (const p of PRICES) await db.run('INSERT INTO pricing (plan, period, amount, label) VALUES (?,?,?,?)', p);

  console.log('· 가계부 ' + (FIXED.length + 26) + '건 (고정비 ' + FIXED.length + '건은 ' + d(-160).slice(0, 7) + '부터 매달 반복), 가격표 ' + PRICES.length + '종');
}

const SMS_TEMPLATES = [
  { category: '만료안내', title: '회원권 만료 임박', is_default: true,
    content: '[크로스핏 그로브] #{이름}님, 회원권이 #{만료일}에 만료됩니다. 재등록 문의는 답장 주세요.' },
  { category: '만료안내', title: '만료 후 재등록 권유', is_default: false,
    content: '[크로스핏 그로브] #{이름}님, 다시 뵙고 싶습니다. 재등록 시 첫 달 할인 혜택이 있습니다.' },
  { category: '공지', title: '휴관 안내', is_default: true,
    content: '[크로스핏 그로브] #{날짜} 휴관합니다. 착오 없으시길 바랍니다.' },
  { category: '공지', title: '이벤트 안내', is_default: false,
    content: '[크로스핏 그로브] 내부 대회 참가 신청을 받습니다. 데스크로 문의 주세요.' },
  { category: '체험', title: '체험 예약 확인', is_default: true,
    content: '[크로스핏 그로브] #{이름}님, #{날짜} 체험 수업이 예약되었습니다. 편한 운동복으로 오세요.' },
  { category: '생일', title: '생일 축하', is_default: true,
    content: '[크로스핏 그로브] #{이름}님, 생일 축하드립니다! 데스크에서 작은 선물 받아가세요.' },
];

async function seedSms(members) {
  for (const t of SMS_TEMPLATES) {
    await db.run('INSERT INTO sms_templates (category, title, content, is_default) VALUES (?,?,?,?)',
      [t.category, t.title, t.content, t.is_default]);
  }
  for (let i = 0; i < 42; i++) {
    const m = members[int(0, members.length - 1)];
    const t = pick(SMS_TEMPLATES);
    const ok = chance(0.9);
    await db.run(
      'INSERT INTO sms_logs (category, name, phone, content, status, error_msg, sent_at) VALUES (?,?,?,?,?,?,?)',
      [t.category, m.name, m.phone, t.content.replace('#{이름}', m.name),
       ok ? '성공' : '실패', ok ? null : pick(['수신 거부 번호', '잘못된 번호', '통신사 오류']),
       d(-int(1, 90)) + ' 11:00:00']);
  }
  console.log('· 문자 템플릿 ' + SMS_TEMPLATES.length + '종, 발송 이력 42건');
}

async function main() {
  await db.ready;

  if (process.argv.includes('--reset')) {
    await reset();
  } else {
    const c = await db.get('SELECT COUNT(*) AS cnt FROM members');
    if (Number(c.cnt) > 0) { console.log('이미 데이터가 있습니다. 새로 넣으려면 --reset 을 붙이세요.'); process.exit(0); }
  }

  await seedStaff();
  const members = await seedMembers(buildRoster());
  await seedPending(members);
  await seedFunnel(members);
  await seedContent();
  await seedMoney();
  await seedSms(members);

  console.log('\n끝났습니다.');
  console.log('  관리자 — .env 의 ADMIN_PASSWORD');
  console.log('  코치   — 김코치 / 1111 (회원관리),  박코치 / 2222 (가계부)');
  console.log('  회원   — 이름 + 전화번호 뒷 4자리');
  for (const s of members.slice(0, 3)) console.log('           ' + s.name + ' / ' + s.phone.slice(-4));
  await db.pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
