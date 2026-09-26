const { Pool, types } = require('pg');

// COUNT(*)/SUM(integer 컬럼)은 Postgres에서 bigint(OID 20)로 반환되어 pg가 기본적으로 문자열로 파싱함
// (better-sqlite3는 항상 JS number를 반환했으므로, 프론트/라우트에서 숫자 연산이 깨지지 않도록 여기서 number로 강제)
types.setTypeParser(20, (val) => parseInt(val, 10));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 로컬 Postgres는 SSL을 안 쓰므로 localhost면 끈다 (운영 Neon은 그대로 SSL)
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false },
});

// better-sqlite3의 `?` 위치 플레이스홀더를 pg의 `$1,$2,...`로 순서대로 변환
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function get(sql, params = []) {
  const r = await pool.query(toPg(sql), params);
  return r.rows[0];
}

async function all(sql, params = []) {
  const r = await pool.query(toPg(sql), params);
  return r.rows;
}

async function run(sql, params = []) {
  const r = await pool.query(toPg(sql), params);
  return { lastInsertRowid: r.rows[0]?.id, changes: r.rowCount };
}

// 한 트랜잭션 안에서 여러 문을 원자적으로 실행. fn(tx)에 get/all/run과 동일한 인터페이스를 넘겨준다.
async function withTransaction(fn) {
  const client = await pool.connect();
  const tx = {
    get: async (sql, params = []) => (await client.query(toPg(sql), params)).rows[0],
    all: async (sql, params = []) => (await client.query(toPg(sql), params)).rows,
    run: async (sql, params = []) => {
      const r = await client.query(toPg(sql), params);
      return { lastInsertRowid: r.rows[0]?.id, changes: r.rowCount };
    },
  };
  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// SQLite의 datetime('now','localtime')과 동일한 포맷('YYYY-MM-DD HH:MI:SS', KST)의 기본값
const KST_NOW = `to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS')`;

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      age_group TEXT,
      region TEXT,
      source TEXT,
      source_detail TEXT,
      memo TEXT,
      insta TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (${KST_NOW}),
      password TEXT,
      birth_date TEXT,
      injury TEXT,
      goal TEXT,
      photo TEXT,
      privacy_agreed INTEGER DEFAULT 0,
      must_change_password INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS member_registrations (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL,
      reg_type TEXT DEFAULT '등록비',
      plan TEXT,
      period INTEGER,
      amount INTEGER DEFAULT 0,
      payment_method TEXT,
      start_date TEXT,
      end_date TEXT,
      holding_days INTEGER DEFAULT 0,
      holding_total INTEGER DEFAULT 0,
      remaining_count INTEGER,
      is_current INTEGER DEFAULT 0,
      memo TEXT,
      created_at TEXT DEFAULT (${KST_NOW}),
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS lockers (
      id INTEGER PRIMARY KEY,
      member_id INTEGER,
      member_name TEXT,
      start_date TEXT,
      end_date TEXT,
      months INTEGER,
      amount INTEGER,
      payment_method TEXT,
      status TEXT DEFAULT 'empty'
    );

    CREATE TABLE IF NOT EXISTS locker_history (
      id SERIAL PRIMARY KEY,
      locker_id INTEGER NOT NULL,
      member_id INTEGER,
      member_name TEXT,
      action TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      months INTEGER,
      amount INTEGER,
      payment_method TEXT,
      created_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS uniforms (
      id SERIAL PRIMARY KEY,
      member_id INTEGER,
      member_name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      months INTEGER,
      amount INTEGER,
      payment_method TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS uniform_history (
      id SERIAL PRIMARY KEY,
      uniform_id INTEGER,
      member_id INTEGER,
      member_name TEXT,
      action TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      months INTEGER,
      amount INTEGER,
      payment_method TEXT,
      created_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS notices (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      pinned INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS wods (
      id SERIAL PRIMARY KEY,
      wod_date TEXT NOT NULL,
      wod_type TEXT NOT NULL DEFAULT 'CrossFit',
      title TEXT,
      content TEXT NOT NULL,
      publish_at TEXT,
      created_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id SERIAL PRIMARY KEY,
      event_date TEXT NOT NULL,
      title TEXT,
      type TEXT,
      color TEXT,
      memo TEXT
    );

    CREATE TABLE IF NOT EXISTS schedule_templates (
      id SERIAL PRIMARY KEY,
      class_name TEXT NOT NULL,
      dow INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      color TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS schedule_events (
      id SERIAL PRIMARY KEY,
      template_id INTEGER,
      event_date TEXT NOT NULL,
      class_name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      color TEXT,
      memo TEXT,
      is_cancelled INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      birth_date TEXT,
      insta TEXT,
      gender TEXT,
      injury TEXT,
      goal TEXT,
      photo TEXT,
      signature TEXT,
      privacy_agreed INTEGER DEFAULT 0,
      region TEXT,
      source TEXT,
      contract_type TEXT DEFAULT '신규',
      renew_member_id INTEGER,
      extend_locker INTEGER DEFAULT 0,
      extend_uniform INTEGER DEFAULT 0,
      plan TEXT,
      period INTEGER,
      discount REAL DEFAULT 0,
      amount INTEGER,
      locker_months INTEGER,
      uniform_months INTEGER,
      staff_memo TEXT,
      membership_type TEXT DEFAULT '기간제',
      count_total INTEGER,
      status TEXT DEFAULT 'pending',
      member_id INTEGER,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      preferred_date TEXT,
      memo TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (${KST_NOW}),
      class_time TEXT,
      class_name TEXT,
      amount INTEGER DEFAULT 0,
      payment_method TEXT
    );

    CREATE TABLE IF NOT EXISTS holding_requests (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL,
      member_name TEXT,
      days INTEGER NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (${KST_NOW}),
      processed_at TEXT,
      start_date TEXT,
      end_date TEXT
    );

    CREATE TABLE IF NOT EXISTS pricing (
      id SERIAL PRIMARY KEY,
      plan TEXT NOT NULL,
      period INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      label TEXT,
      updated_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS count_usage (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL,
      registration_id INTEGER NOT NULL,
      member_name TEXT,
      used_date TEXT NOT NULL,
      memo TEXT,
      created_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS experiences (
      id SERIAL PRIMARY KEY,
      date TEXT,
      name TEXT,
      source TEXT,
      registered INTEGER DEFAULT 0,
      memo TEXT,
      coach TEXT
    );

    CREATE TABLE IF NOT EXISTS dropins (
      id SERIAL PRIMARY KEY,
      date TEXT,
      name TEXT,
      source TEXT,
      payment_method TEXT,
      amount INTEGER,
      box TEXT
    );

    CREATE TABLE IF NOT EXISTS special_extensions (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL,
      member_name TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS member_messages (
      id SERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (${KST_NOW}),
      read_at TEXT,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      detail TEXT,
      entry_date TEXT NOT NULL,
      is_fixed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS sms_templates (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TEXT DEFAULT (${KST_NOW}),
      updated_at TEXT DEFAULT (${KST_NOW})
    );

    CREATE TABLE IF NOT EXISTS sms_logs (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT,
      phone TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      error_msg TEXT,
      sent_at TEXT DEFAULT (${KST_NOW})
    );
  `);

  // sms_templates에 is_default 컬럼 추가 (이미 생성된 테이블에도 적용되도록 별도 마이그레이션)
  await pool.query(`ALTER TABLE sms_templates ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE`);
  // 가입경로 상세 (네이버 아이디 / 지인 이름 / 양도한 사람 이름 등) — 기존 DB에도 적용되도록 별도 마이그레이션
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS source_detail TEXT`);
  // 코치(부운영자) — 회원 테이블을 그대로 쓰되 직원 표시와 열람 권한만 덧붙인다.
  // permissions 는 권한 키 배열의 JSON 문자열 ('[]' 이면 아무것도 못 본다)
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS is_staff INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS permissions TEXT`);

  // 이름 중복 방지를 DB 에 맡긴다.
  // 라우트에서 "이미 있나 확인 → 없으면 넣기" 로만 막으면, 두 사람이 같은 순간에 누를 때
  // 둘 다 '없음' 을 보고 둘 다 넣어 버린다 (같은 이름으로 3번 동시에 누르면 3명이 만들어졌다).
  // 회원 로그인이 이름으로 이뤄지므로 이름은 원래 유일해야 한다.
  // 이미 중복이 있으면 인덱스를 못 만드니, 그때는 건너뛰고 경고만 남긴다.
  try {
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS members_name_unique ON members (name)');
  } catch (e) {
    console.warn('[주의] 이름이 중복된 회원이 있어 유일 인덱스를 만들지 못했습니다. 이름을 구분한 뒤 서버를 다시 띄우세요.');
  }

  // 계약서로 회원 등록을 마치면 같은 사진(base64, 한 장 20~30KB)이 contracts 와 members 양쪽에 남는다.
  // 회원 쪽에 사진이 실제로 있는 등록 완료 계약서만 사본을 비운다 (화면에서는 회원 사진으로 대신 보여준다).
  await pool.query(`
    UPDATE contracts c SET photo = NULL
     WHERE c.photo IS NOT NULL
       AND c.member_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM members m
                    WHERE m.id = c.member_id AND m.photo IS NOT NULL AND m.photo <> '')
  `);

  // 락커 152개 초기 시딩 (lockers는 AUTOINCREMENT가 아닌 고정 ID 1~152 테이블)
  const lockerCount = await get('SELECT COUNT(*) as cnt FROM lockers');
  if (Number(lockerCount.cnt) === 0) {
    for (let i = 1; i <= 152; i++) {
      await run('INSERT INTO lockers (id, status) VALUES (?, ?)', [i, 'empty']);
    }
  }

  // 가격표 초기값
  const pricingCount = await get('SELECT COUNT(*) as cnt FROM pricing');
  if (Number(pricingCount.cnt) === 0) {
    // 프로모션 요금제는 한시적으로만 운영하므로 초기 시드에 넣지 않음 (관리자 화면에서 추가)
    const prices = [
      { plan: '일반2', period: 1, amount: 200000, label: '일반2 1개월' },
      { plan: '일반2', period: 3, amount: 550000, label: '일반2 3개월' },
      { plan: '일반2', period: 6, amount: 990000, label: '일반2 6개월' },
      { plan: 'VIP', period: 1, amount: 180000, label: 'VIP 1개월' },
      { plan: 'VIP', period: 3, amount: 495000, label: 'VIP 3개월' },
      { plan: 'VIP', period: 6, amount: 891000, label: 'VIP 6개월' },
    ];
    for (const p of prices) {
      await run('INSERT INTO pricing (plan, period, amount, label) VALUES (?,?,?,?)', [p.plan, p.period, p.amount, p.label]);
    }
  }
}

module.exports = { pool, get, all, run, withTransaction, ready: init() };
