// ─── 부운영자(코치) 열람 권한 ─────────────────────────────────
// 관리자 화면의 탭 하나 = 권한 키 하나. 사장님(owner)은 항상 전부 열람하고,
// 직원(staff)은 여기 키 중 사장님이 체크해 준 것만 볼 수 있다.
// 화면 구성과 서버 검사가 갈라지지 않도록 목록은 이 파일 한 곳에만 둔다.
const PERMISSION_TREE = [
  { group: '홈', items: [
    { key: 'home', label: '홈' },
  ]},
  { group: '매출 관리', items: [
    { key: 'revenue.list',   label: '매출 내역' },
    { key: 'revenue.ledger', label: '가계부' },
  ]},
  { group: '회원 관리', items: [
    { key: 'members.list',      label: '회원 목록' },
    { key: 'members.register',  label: '등록' },
    { key: 'members.contracts', label: '계약서' },
    { key: 'members.counts',    label: '횟수권' },
    { key: 'members.holding',   label: '홀딩' },
    { key: 'members.special',   label: '특별연장' },
    { key: 'members.pricing',   label: '가격표' },
    { key: 'contract.write',    label: '계약서 작성' },
  ]},
  { group: '그 외', items: [
    { key: 'locker',   label: '락커' },
    { key: 'schedule', label: '시간표/신청' },
    { key: 'wod',      label: 'WOD' },
    { key: 'notices',  label: '공지' },
    { key: 'sms',      label: '문자 발송' },
  ]},
];

const ALL_KEYS = PERMISSION_TREE.flatMap(g => g.items.map(i => i.key));

// 회원 정보를 읽어야 돌아가는 탭들 — 이 중 하나라도 있으면 회원 조회는 열어준다
// (홀딩·횟수권·특별연장 화면 모두 회원 목록을 읽기 때문에 회원목록 권한만으로 막으면 탭이 깨진다)
const MEMBER_READERS = ['members.list','members.register','members.contracts','members.counts',
                        'members.holding','members.special','contract.write'];

// [메서드, 경로, 필요한 권한(하나라도 있으면 통과)] — null 이면 누구나(로그인한 직원이면) 통과
const RULES = [
  ['GET',  /^\/api\/stats/,                       ['home']],
  ['GET',  /^\/api\/revenue\/(monthly|forecast)/, ['home', 'revenue.list']],
  ['*',    /^\/api\/revenue/,                     ['revenue.list']],
  ['*',    /^\/api\/ledger/,                      ['revenue.ledger']],
  ['POST', /^\/api\/members$/,                    ['members.register']],
  ['*',    /^\/api\/contracts/,                   ['members.contracts', 'contract.write']],
  ['*',    /^\/api\/contract-members/,            ['contract.write']],
  ['*',    /^\/api\/counts/,                      ['members.counts']],
  ['*',    /^\/api\/holding-requests/,            ['members.holding']],
  ['*',    /^\/api\/special-extensions/,          ['members.special']],
  // 요금표 조회는 등록·재등록·계약서 화면이 모두 필요로 하므로 넓게 열되,
  // 요금표도 결국 금액이라 '홈'만 허용된 코치에게는 내려주지 않는다
  ['GET',  /^\/api\/pricing/,                     ['members.pricing','members.register','members.list','members.contracts','contract.write']],
  ['*',    /^\/api\/pricing/,                     ['members.pricing']],
  ['*',    /^\/api\/members/,                     MEMBER_READERS],
  ['*',    /^\/api\/registrations/,               MEMBER_READERS],
  ['*',    /^\/api\/lockers/,                     ['locker', ...MEMBER_READERS]],
  ['GET',  /^\/api\/applications$/,               ['home','schedule']],   // 홈의 '오늘 방문 예정' 위젯
  ['*',    /^\/api\/(schedule|applications|calendar)/, ['schedule']],
  ['*',    /^\/api\/wods/,                        ['wod']],
  ['*',    /^\/api\/notices/,                     ['notices']],
  ['*',    /^\/api\/sms/,                         ['sms']],
];

// 이 요청에 필요한 권한 목록. 규칙에 없는 경로는 undefined(검사 대상 아님).
function requiredPerms(method, path) {
  for (const [m, re, perms] of RULES) {
    if ((m === '*' || m === method) && re.test(path)) return perms;
  }
  return undefined;
}

module.exports = { PERMISSION_TREE, ALL_KEYS, requiredPerms };
