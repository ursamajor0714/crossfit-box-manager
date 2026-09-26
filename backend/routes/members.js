const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin, requireOwner, requireSelfOrAdmin, adminTokens } = require('../middleware/auth');
const { ALL_KEYS } = require('../permissions');
const { addMonths } = require('../utils/date');
const { hashPassword, verifyPassword, isValidPassword, PASSWORD_POLICY_HINT } = require('../utils/password');

router.get('/api/member/:id/info', requireSelfOrAdmin, async (req, res) => {
  const member = await db.get('SELECT id, name, phone, gender, age_group, region, must_change_password FROM members WHERE id = ?', [req.params.id]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });

  const cur = await db.get("SELECT * FROM member_registrations WHERE member_id=? AND is_current=1", [req.params.id]);
  if (cur && cur.reg_type === '등록비') {
    cur.holding_remaining = (cur.holding_total || 0) - (cur.holding_days || 0);
  }
  const locker = await db.get("SELECT * FROM lockers WHERE member_id=? AND status='active'", [req.params.id]);
  const uniform = await db.get("SELECT * FROM uniforms WHERE member_id=? AND status='active'", [req.params.id]);
  const holdingReqs = await db.all("SELECT * FROM holding_requests WHERE member_id=? ORDER BY start_date DESC LIMIT 100", [req.params.id]);
  const countUsages = await db.all("SELECT * FROM count_usage WHERE member_id=? ORDER BY used_date DESC, id DESC LIMIT 200", [req.params.id]);
  const specialExtensions = await db.all("SELECT * FROM special_extensions WHERE member_id=? ORDER BY start_date DESC LIMIT 100", [req.params.id]);

  res.json({ ...member, registration: cur||null, locker: locker||null, uniform: uniform||null, holding_requests: holdingReqs, count_usages: countUsages, special_extensions: specialExtensions });
});

router.post('/api/member/:id/password', requireSelfOrAdmin, async (req, res) => {
  const { current_password, new_password } = req.body;
  const member = await db.get('SELECT * FROM members WHERE id = ?', [req.params.id]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });

  // 현재 비밀번호 검증 (로그인과 동일한 규칙: password 컬럼이 비어있으면 전화번호 뒷 4자리)
  const defaultPw = member.phone ? member.phone.replace(/[^0-9]/g, '').slice(-4) : '';
  const ok = member.password ? verifyPassword(current_password, member.password) : current_password === defaultPw;
  if (!ok) return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다' });

  if (!isValidPassword(new_password)) return res.status(400).json({ error: `새 비밀번호 조건을 만족하지 않습니다: ${PASSWORD_POLICY_HINT}` });

  await db.run('UPDATE members SET password=?, must_change_password=0 WHERE id=?', [hashPassword(new_password), req.params.id]);
  // 관리자 화면에 로그인해 있는 본인 세션의 '변경창 띄우기' 표시도 바로 푼다
  for (const [, sess] of adminTokens) {
    if (sess.role === 'staff' && String(sess.member_id) === String(req.params.id)) sess.must_change_password = false;
  }
  res.json({ message: '비밀번호가 변경되었습니다' });
});

router.get('/api/members', requireAdmin, async (req, res) => {
  // 사진(base64)은 한 장에 20~30KB라, 목록에서 전원 것을 내려주면 회원이 늘수록 응답이 MB 단위로 불어난다.
  // (500명이면 12MB — Render 무료 인스턴스 메모리로는 위험하다.)
  // 목록은 '사진이 있는지'만 알면 되므로 본문은 빼고 has_photo 만 보낸다. 사진 자체는 상세에서 받는다.
  const members = await db.all(`
    SELECT m.id, m.name, m.phone, m.gender, m.age_group, m.region, m.source, m.source_detail,
      m.memo, m.insta, m.status, m.created_at, m.birth_date, m.injury, m.goal,
      m.privacy_agreed, m.must_change_password, m.is_staff, m.permissions,
      CASE WHEN m.photo IS NOT NULL AND m.photo <> '' THEN 1 ELSE 0 END AS has_photo,
      r.plan, r.period, r.amount, r.payment_method,
      r.start_date, r.end_date, r.holding_days, r.reg_type,
      r.remaining_count, r.id as reg_id, r.created_at as reg_created_at
    FROM members m
    LEFT JOIN member_registrations r ON r.member_id = m.id AND r.is_current = 1
    ORDER BY m.created_at DESC
  `);
  res.json(members);
});

// 코치(부운영자) 열람 권한 저장 — 사장님만 바꿀 수 있다 (코치가 스스로 권한을 늘리지 못하게)
router.put('/api/members/:id/permissions', requireOwner, async (req, res) => {
  const member = await db.get('SELECT id, is_staff FROM members WHERE id=?', [req.params.id]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });
  if (!member.is_staff) return res.status(400).json({ error: '직원으로 등록된 사람만 권한을 정할 수 있습니다' });

  const raw = Array.isArray(req.body.permissions) ? req.body.permissions : [];
  const perms = [...new Set(raw.filter(k => ALL_KEYS.includes(k)))];
  await db.run('UPDATE members SET permissions=? WHERE id=?', [JSON.stringify(perms), req.params.id]);

  // 이미 로그인해 있는 본인 세션에도 바로 반영한다 (다시 로그인할 때까지 옛 권한이 남지 않도록)
  for (const [, sess] of adminTokens) {
    if (sess.role === 'staff' && String(sess.member_id) === String(req.params.id)) sess.perms = perms;
  }
  res.json({ permissions: perms, message: '열람 권한을 저장했습니다' });
});

// 코치 임명 / 해제 — 한 버튼이 두 상태를 오간다. 사장님만 누를 수 있다.
//
// 해제는 **삭제가 아니다.** 직원 표시만 끈다. 이름·등록 이력·매출 기록은 그대로 남는다.
// 그만둔 코치를 지우려고 회원을 통째로 삭제하면 그 사람 매출까지 사라지기 때문이다.
//
// 권한 체크도 지우지 않는다. 다시 임명하면 전에 주던 권한이 그대로 돌아온다 —
// 그만뒀다 돌아온 코치에게 처음부터 다시 체크하게 만들 이유가 없다.
router.put('/api/members/:id/staff', requireOwner, async (req, res) => {
  const member = await db.get('SELECT id, name, is_staff FROM members WHERE id=?', [req.params.id]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });

  const makeStaff = !!req.body.is_staff;
  if (!!member.is_staff === makeStaff) {
    return res.json({ is_staff: makeStaff, message: '이미 그 상태입니다' });
  }

  // 임명할 때 권한 칸이 비어 있으면 '아무 곳도 못 봄' 으로 시작한다 (전에 주던 것이 있으면 그대로 둔다)
  if (makeStaff) {
    await db.run("UPDATE members SET is_staff=1, permissions=COALESCE(permissions,'[]') WHERE id=?", [req.params.id]);
    return res.json({ is_staff: true, message: `${member.name} 님을 코치로 임명했습니다` });
  }

  await db.run('UPDATE members SET is_staff=0 WHERE id=?', [req.params.id]);

  // 접속해 있는 세션을 그 자리에서 끊는다.
  // 로그인은 is_staff=1 인 사람만 찾으므로 다음 로그인은 자동으로 막히지만,
  // 이미 발급된 토큰은 12시간 살아 있어서 해제해도 하루 가까이 들어와 있게 된다.
  let cut = 0;
  for (const [token, sess] of adminTokens) {
    if (sess.role === 'staff' && String(sess.member_id) === String(req.params.id)) {
      adminTokens.delete(token);
      cut++;
    }
  }
  res.json({ is_staff: false, sessions_cut: cut,
    message: `${member.name} 님의 코치 권한을 해제했습니다${cut ? ' (접속 중이던 화면도 끊었습니다)' : ''}` });
});

// 회원 단건 (등록이력 + 락커 + 운동복 포함)
router.get('/api/members/:id', requireAdmin, async (req, res) => {
  const member = await db.get('SELECT * FROM members WHERE id = ?', [req.params.id]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });

  const registrations = await db.all(
    'SELECT * FROM member_registrations WHERE member_id = ? ORDER BY id DESC', [req.params.id]
  );

  const locker = await db.get(
    "SELECT * FROM lockers WHERE member_id = ? AND status = 'active'", [req.params.id]
  );

  const uniform = await db.get(
    "SELECT * FROM uniforms WHERE member_id = ? AND status = 'active'", [req.params.id]
  );

  res.json({ ...member, registrations, locker: locker||null, uniform: uniform||null });
});

// 회원 등록
router.post('/api/members', requireAdmin, async (req, res) => {
  const { name, phone, gender, age_group, region, source, memo, insta,
    birth_date, goal, injury, photo,
    plan, period, amount, payment_method, start_date, end_date, holding_days, reg_type,
    remaining_count, holding_total,
    locker_id, locker_months, locker_amount, locker_payment,
    uniform_months, uniform_amount, uniform_payment, is_new_registration } = req.body;

  // 신규 등록인데 같은 이름이 이미 있으면 차단 (재등록은 예외)
  if (is_new_registration) {
    const dup = await db.get('SELECT id FROM members WHERE name=?', [name]);
    if (dup) {
      return res.status(409).json({ error: `이미 "${name}" 님이 등록되어 있습니다. 동명이인이면 이름을 구분해주세요.` });
    }
  }

  // 기존 회원 여부 확인 (이름+전화번호)
  const existingMember = phone
    ? await db.get('SELECT * FROM members WHERE name=? AND phone=?', [name, phone])
    : null;

  // 위의 '이미 있나' 검사와 아래 삽입 사이에는 아주 짧은 틈이 있다. 그 사이에 같은 이름이 들어오면
  // 이제 DB 의 유일 인덱스가 막아 준다(23505). 그때도 위와 같은 안내 문구가 나가도록 여기서 받는다.
  let memberId;
  try {
    memberId = await db.withTransaction(async (tx) => {
    let memberId;
    if (existingMember) {
      memberId = existingMember.id;
      // 재등록 시 입력한 메모를 회원정보 메모에도 반영한다.
      // (재등록 폼이 기존 메모를 미리 채워주므로 덮어써도 이전 내용이 사라지지 않는다.
      //  비워서 보낸 경우에는 기존 메모를 지우지 않고 그대로 둔다.)
      const hasMemo = memo != null && String(memo).trim() !== '';
      if (hasMemo) {
        await tx.run('UPDATE members SET status=?, memo=? WHERE id=?', ['active', memo, memberId]);
      } else {
        await tx.run('UPDATE members SET status=? WHERE id=?', ['active', memberId]);
      }
    } else {
      const r = await tx.run(
        'INSERT INTO members (name,phone,gender,age_group,region,source,memo,insta,birth_date,goal,injury,photo,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id',
        [name,phone,gender,age_group,region,source,memo,insta||null,birth_date||null,goal||null,injury||null,photo||null,'active']
      );
      memberId = r.lastInsertRowid;
    }

    // 기존 is_current 해제
    await tx.run('UPDATE member_registrations SET is_current=0 WHERE member_id=?', [memberId]);

    // 새 등록 이력 추가
    await tx.run(`
      INSERT INTO member_registrations
        (member_id, reg_type, plan, period, amount, payment_method,
         start_date, end_date, holding_days, holding_total, remaining_count, is_current, memo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)
    `, [memberId, reg_type||'등록비', plan, period||0, amount||0, payment_method,
        start_date, end_date, holding_days||0, holding_total||0, remaining_count||null, memo||null]);

    // 락커 동시 등록
    if (locker_id) {
      const lockerEnd = addMonths(start_date, locker_months||period||1);
      await tx.run("UPDATE lockers SET member_id=?,member_name=?,start_date=?,end_date=?,months=?,amount=?,payment_method=?,status='active' WHERE id=?",
        [memberId,name,start_date,lockerEnd,locker_months||period,locker_amount||0,locker_payment||payment_method,locker_id]);
      await tx.run("INSERT INTO locker_history (locker_id,member_id,member_name,action,start_date,end_date,months,amount,payment_method) VALUES (?,?,?,'배정',?,?,?,?,?)",
        [locker_id,memberId,name,start_date,lockerEnd,locker_months||period,locker_amount||0,locker_payment||payment_method]);
    }

    // 운동복 동시 등록
    if (uniform_months) {
      const uniformEnd = addMonths(start_date, uniform_months);
      const ur = await tx.run("INSERT INTO uniforms (member_id,member_name,start_date,end_date,months,amount,payment_method,status) VALUES (?,?,?,?,?,?,?,'active') RETURNING id",
        [memberId,name,start_date,uniformEnd,uniform_months,uniform_amount||0,uniform_payment||payment_method]);
      await tx.run("INSERT INTO uniform_history (uniform_id,member_id,member_name,action,start_date,end_date,months,amount,payment_method) VALUES (?,?,?,'등록',?,?,?,?,?)",
        [ur.lastInsertRowid,memberId,name,start_date,uniformEnd,uniform_months,uniform_amount||0,uniform_payment||payment_method]);
    }

    return memberId;
  });
  } catch (e) {
    if (e && e.code === '23505') {
      return res.status(409).json({ error: `이미 "${name}" 님이 등록되어 있습니다. 동명이인이면 이름을 구분해주세요.` });
    }
    throw e;
  }

  res.json({ id: memberId, message: '등록 완료' });
});

// 회원 상태만 빠르게 변경
router.patch('/api/members/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  await db.run('UPDATE members SET status=? WHERE id=?', [status, req.params.id]);
  res.json({ message: '상태 변경 완료' });
});

// 회원 기본정보 수정
router.put('/api/members/:id', requireAdmin, async (req, res) => {
  // birth_date·goal·injury 는 정보수정 화면이 보내오는데도 여기서 빠져 있어 저장되지 않고 버려지고 있었다
  const { name,phone,gender,age_group,region,source,source_detail,memo,status,birth_date,goal,injury,photo } = req.body;
  // 사진은 photo 를 실제로 보낸 요청에서만 건드린다.
  // 안 그러면 사진을 안 보내는 다른 호출이 들어올 때 멀쩡한 사진이 지워진다.
  // 같은 행이므로 두 문장으로 나누지 않고 한 번에 고친다 (중간에 끊겨 반쪽만 저장되는 일이 없다).
  const touchPhoto = 'photo' in req.body;
  if (touchPhoto) {
    // 화면은 320x320 으로 줄여서 보내지만(약 25KB), API 를 직접 부르면 원본이 그대로 올 수 있다.
    // 목록·백업이 통째로 무거워지므로 여기서 잘라 둔다.
    const MAX_PHOTO_BYTES = 400 * 1024;
    if (photo && typeof photo === 'string') {
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo)) {
        return res.status(400).json({ error: '사진 형식이 올바르지 않습니다' });
      }
      if (photo.length > MAX_PHOTO_BYTES) {
        return res.status(413).json({ error: '사진이 너무 큽니다 (400KB 이하)' });
      }
    }
  }

  // SQL 을 조각내 이어 붙이지 않고 두 문장을 통째로 적어 둔다.
  // 짧게 만들자고 SQL 에 문자열을 끼워 넣기 시작하면, 나중에 그 조각이 밖에서 올 때 막을 방법이 없다.
  const params = [name,phone,gender,age_group,region,source,source_detail||null,memo,status||'active',
    birth_date||null,goal||null,injury||null];
  if (touchPhoto) params.push(photo || null);
  params.push(req.params.id);
  await db.run(touchPhoto
    ? `UPDATE members SET name=?,phone=?,gender=?,age_group=?,region=?,source=?,source_detail=?,memo=?,status=?,
       birth_date=?,goal=?,injury=?,photo=? WHERE id=?`
    : `UPDATE members SET name=?,phone=?,gender=?,age_group=?,region=?,source=?,source_detail=?,memo=?,status=?,
       birth_date=?,goal=?,injury=? WHERE id=?`,
    params);
  res.json({ message: '수정 완료' });
});

// 등록이력 수정
router.put('/api/registrations/:id', requireAdmin, async (req, res) => {
  const existing = await db.get('SELECT * FROM member_registrations WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '등록 이력을 찾을 수 없습니다' });

  // 프론트가 보낸 값만 반영하고, 안 보낸 필드는 기존 값 유지 (undefined 덮어쓰기 방지)
  const pick = (v, fallback) => (v === undefined ? fallback : v);
  const plan            = pick(req.body.plan,            existing.plan);
  const period          = pick(req.body.period,          existing.period);
  const amount          = pick(req.body.amount,          existing.amount);
  const payment_method  = pick(req.body.payment_method,  existing.payment_method);
  const start_date      = pick(req.body.start_date,      existing.start_date);
  const end_date        = pick(req.body.end_date,        existing.end_date);
  const holding_days    = pick(req.body.holding_days,    existing.holding_days);
  const holding_total   = pick(req.body.holding_total,   existing.holding_total);
  const reg_type        = pick(req.body.reg_type,        existing.reg_type);
  const remaining_count = pick(req.body.remaining_count, existing.remaining_count);
  const memo            = pick(req.body.memo,            existing.memo);

  await db.run('UPDATE member_registrations SET plan=?,period=?,amount=?,payment_method=?,start_date=?,end_date=?,holding_days=?,holding_total=?,reg_type=?,remaining_count=?,memo=? WHERE id=?',
    [plan,period,amount,payment_method,start_date,end_date,holding_days||0,holding_total||0,reg_type,remaining_count,memo,req.params.id]);
  res.json({ message: '수정 완료' });
});

// 회원 삭제
// 회원 삭제 = 잘못 등록한 것을 없던 일로 되돌리는 것.
// 전에는 members 와 member_registrations 만 지워서, **락커 배정과 그 매출 기록이 그대로 남았다.**
// 없는 회원의 락커 요금이 매출에 계속 잡히고, 락커는 사용 중인 채로 묶여 있었다.
// 회원에 딸린 기록을 한 트랜잭션 안에서 전부 정리한다.
router.delete('/api/members/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const result = await db.withTransaction(async (tx) => {
    const member = await tx.get('SELECT id, name FROM members WHERE id=?', [id]);
    if (!member) return null;

    // 락커는 1~152번 고정 행이라 지우지 않고 '비어있음' 으로 되돌린다
    await tx.run(`UPDATE lockers SET member_id=NULL, member_name=NULL, start_date=NULL, end_date=NULL,
      months=NULL, amount=NULL, payment_method=NULL, status='empty' WHERE member_id=?`, [id]);

    // 딸린 기록들 — 매출 근거(락커·운동복 이력)도 함께 지운다.
    // 남겨 두면 없는 회원의 매출이 계속 집계된다.
    // 표 이름을 변수로 끼워 넣지 않고 하나씩 적는다. 반복문으로 줄이면 짧아지지만,
    // SQL 에 이름을 문자열로 붙이는 꼴이 되어 나중에 그 변수가 밖에서 올 때 막을 방법이 없다.
    await tx.run('DELETE FROM locker_history WHERE member_id=?', [id]);
    await tx.run('DELETE FROM uniform_history WHERE member_id=?', [id]);
    await tx.run('DELETE FROM uniforms WHERE member_id=?', [id]);
    await tx.run('DELETE FROM count_usage WHERE member_id=?', [id]);
    await tx.run('DELETE FROM holding_requests WHERE member_id=?', [id]);
    await tx.run('DELETE FROM special_extensions WHERE member_id=?', [id]);
    await tx.run('DELETE FROM member_messages WHERE member_id=?', [id]);
    await tx.run('DELETE FROM member_registrations WHERE member_id=?', [id]);

    // 계약서는 서명이 들어간 문서라 지우지 않는다. 회원 연결만 끊고 '미등록' 으로 되돌려
    // 나중에 다시 등록할 수 있게 한다. (계약서 자체를 지우려면 계약서 탭에서 따로 지운다)
    await tx.run("UPDATE contracts SET member_id=NULL, status='pending' WHERE member_id=?", [id]);

    await tx.run('DELETE FROM members WHERE id=?', [id]);
    return member;
  });
  if (!result) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });
  res.json({ message: '삭제 완료' });
});

// 회원 비밀번호 초기화 — 전화번호 뒷 4자리로 리셋 (password 컬럼을 NULL로 비워 기본값 사용)
router.post('/api/members/:id/reset-password', requireAdmin, async (req, res) => {
  const member = await db.get('SELECT * FROM members WHERE id=?', [req.params.id]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });
  const defaultPw = member.phone ? member.phone.replace(/[^0-9]/g, '').slice(-4) : '';
  if (!defaultPw) return res.status(400).json({ error: '전화번호가 없어 초기화할 수 없습니다' });
  // password 컬럼을 비우면 로그인 시 전화번호 뒷 4자리(defaultPw)가 사용됨 — 초기화된 계정은 다음 로그인 시 다시 비밀번호 변경 강제
  await db.run('UPDATE members SET password=NULL, must_change_password=1 WHERE id=?', [req.params.id]);
  res.json({ message: '비밀번호가 초기화되었습니다', default_password: defaultPw });
});

// 회원권 환불 — 현재 회원권을 환불 처리하고 환불액을 음수 레코드로 기록
router.post('/api/members/:id/refund', requireAdmin, async (req, res) => {
  const memberId = req.params.id;
  const member = await db.get('SELECT * FROM members WHERE id=?', [memberId]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });
  const refund = Math.abs(parseInt(req.body?.refund_amount) || 0);
  const refundDate = req.body?.refund_date || new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
  const memo = req.body?.memo || '';

  // 현재 활성 회원권 만료 처리
  const cur = await db.get('SELECT * FROM member_registrations WHERE member_id=? AND is_current=1', [memberId]);

  await db.withTransaction(async (tx) => {
    if (cur) {
      await tx.run('UPDATE member_registrations SET is_current=0 WHERE id=?', [cur.id]);
    }
    // 환불 레코드 추가 (음수 금액 → 매출에서 자동 차감, start_date=환불일로 해당 월에 반영)
    await tx.run(`INSERT INTO member_registrations (member_id, reg_type, plan, amount, start_date, memo, is_current)
      VALUES (?, '환불', ?, ?, ?, ?, 0)`, [memberId, cur?.plan||null, -refund, refundDate, memo]);
    // 회원 상태 만료로
    await tx.run("UPDATE members SET status='inactive' WHERE id=?", [memberId]);
  });

  res.json({ message: '환불 처리 완료', refund_amount: refund });
});

// 홀딩은 POST /api/holding-requests 한 곳에서만 건다 (backend/routes/holding.js).
// 예전에 여기에도 POST /api/members/:id/holding 이 있었는데, 회원권 만료일만 밀고
// 락커·운동복은 안 밀었고, 홀딩 기록도 안 남겨 나중에 취소할 수 없었다.
// 화면은 관리자·회원 모두 /api/holding-requests 를 쓰고 있어 이 경로는 부르는 곳이 없었다 — 지웠다.

// 회원 본인 횟수권 차감 (출석 체크) - 인증 불필요 (회원 페이지에서 사용)
router.post('/api/member/:id/use-count', requireSelfOrAdmin, async (req, res) => {
  const memberId = req.params.id;
  const reg = await db.get("SELECT * FROM member_registrations WHERE member_id=? AND is_current=1 AND reg_type='횟수권'", [memberId]);
  if (!reg) return res.status(404).json({ error: '횟수권 정보가 없습니다' });
  if ((reg.remaining_count || 0) <= 0) return res.status(400).json({ error: '잔여 횟수가 없습니다' });

  const member = await db.get('SELECT name FROM members WHERE id=?', [memberId]);
  const today = new Date(Date.now() + 9*60*60*1000).toISOString().split('T')[0];

  const newCount = reg.remaining_count - 1;

  await db.withTransaction(async (tx) => {
    await tx.run('UPDATE member_registrations SET remaining_count=?, is_current=? WHERE id=?',
      [newCount, newCount <= 0 ? 0 : 1, reg.id]);
    if (newCount <= 0) await tx.run('UPDATE members SET status=? WHERE id=?', ['inactive', memberId]);

    // 출석 이력 기록
    await tx.run('INSERT INTO count_usage (member_id, registration_id, member_name, used_date, memo) VALUES (?,?,?,?,?)',
      [memberId, reg.id, member ? member.name : null, today, '회원 출석체크']);
  });

  res.json({ message: '출석 완료', remaining_count: newCount });
});

// 횟수권 차감
router.post('/api/members/:id/count', requireAdmin, async (req, res) => {
  const { count } = req.body;
  const reg = await db.get("SELECT * FROM member_registrations WHERE member_id=? AND is_current=1 AND reg_type='횟수권'", [req.params.id]);
  if (!reg) return res.status(404).json({ error: '횟수권 정보가 없습니다' });
  const newCount = (reg.remaining_count||0) - (count||1);
  const status = newCount <= 0 ? 0 : 1;
  await db.withTransaction(async (tx) => {
    await tx.run('UPDATE member_registrations SET remaining_count=?, is_current=? WHERE id=?', [newCount, status, reg.id]);
    if (newCount <= 0) await tx.run('UPDATE members SET status=? WHERE id=?', ['inactive', req.params.id]);
  });
  res.json({ message: '차감 완료', remaining: newCount });
});


module.exports = router;
