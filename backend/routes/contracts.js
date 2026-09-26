const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin, requireContract } = require('../middleware/auth');

// 직원(코치) 계약서는 회원권이 없으므로 돈에 관한 칸을 모두 비운 채로 들어온다.
const STAFF_TYPE = '직원';

router.get('/api/contract-members', requireContract, async (req, res) => {
  const members = await db.all("SELECT id, name, phone, birth_date FROM members ORDER BY name");
  const out = [];
  for (const m of members) {
    const locker = await db.get("SELECT id, end_date FROM lockers WHERE member_id=? AND status='active'", [m.id]);
    const uniform = await db.get("SELECT id, end_date FROM uniforms WHERE member_id=? AND status='active'", [m.id]);
    out.push({
      id: m.id,
      name: m.name,
      phone: m.phone || '',
      phone_tail: m.phone ? String(m.phone).replace(/[^0-9]/g,'').slice(-4) : '',
      birth_date: m.birth_date || '',
      locker: locker ? { id: locker.id, end_date: locker.end_date } : null,
      uniform: uniform ? { end_date: uniform.end_date } : null,
    });
  }
  res.json(out);
});

router.post('/api/contracts', requireContract, async (req, res) => {
  const { name, phone, birth_date, insta, gender, injury, goal, photo, signature, privacy_agreed,
    region, source, plan, period, discount, amount, locker_months, uniform_months, staff_memo,
    contract_type, renew_member_id, extend_locker, extend_uniform, start_date, end_date,
    membership_type, count_total } = req.body;
  if (!name) return res.status(400).json({ error: '이름은 필수입니다' });
  if (!privacy_agreed) return res.status(400).json({ error: '개인정보 수집 동의가 필요합니다' });
  if (!signature) return res.status(400).json({ error: '서명이 필요합니다' });
  const r = await db.run(`INSERT INTO contracts (name, phone, birth_date, insta, gender, injury, goal, photo, signature, privacy_agreed,
    region, source, plan, period, discount, amount, locker_months, uniform_months, staff_memo, contract_type, renew_member_id, extend_locker, extend_uniform, start_date, end_date, membership_type, count_total)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`, [
    name, phone, birth_date, insta, gender, injury, goal, photo||null, signature, privacy_agreed?1:0,
    region||null, source||null, plan||null, period||null, discount||0, amount||null, locker_months||null, uniform_months||null, staff_memo||null,
    contract_type||'신규', renew_member_id||null, extend_locker?1:0, extend_uniform?1:0, start_date||null, end_date||null,
    membership_type||'기간제', count_total||null]);

  // 직원 등록은 결제가 없어 관리자가 따로 등록할 게 없다. 제출과 동시에 회원 정보에 직원으로 넣는다.
  if (membership_type === STAFF_TYPE) {
    const dup = await db.get('SELECT id FROM members WHERE name=?', [name]);
    if (dup) {
      return res.status(409).json({ error: `이미 "${name}" 님이 등록되어 있습니다. 동명이인이면 이름을 구분해주세요.` });
    }
    // 회원 등록과 계약서 연결은 한 덩어리다. 중간에 끊기면 회원은 생겼는데 계약서는 미등록으로 남아
    // 같은 사람을 또 등록하게 된다. 한 트랜잭션으로 묶는다.
    const m = await db.withTransaction(async (tx) => {
      const created = await tx.run(`INSERT INTO members (name, phone, gender, region, source, insta, birth_date, injury, goal, photo, privacy_agreed, is_staff, permissions)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1,'[]') RETURNING id`,
        [name, phone||null, gender||null, region||null, source||null, insta||null, birth_date||null,
         injury||null, goal||null, photo||null, privacy_agreed?1:0]);
      // 사진은 회원 쪽에 들어갔으므로 계약서에 같은 사진을 또 들고 있지 않는다 (같은 사진 두 벌 방지)
      await tx.run("UPDATE contracts SET status='registered', member_id=?, photo=NULL WHERE id=?",
        [created.lastInsertRowid, r.lastInsertRowid]);
      return created;
    });
    // 열람 권한은 비어 있는 상태로 시작한다 — 사장님이 회원 상세 > 열람 권한에서 하나씩 켜 준다.
    return res.json({ id: r.lastInsertRowid, member_id: m.lastInsertRowid, staff: true,
      message: '직원으로 등록되었습니다' });
  }

  res.json({ id: r.lastInsertRowid, message: '계약서가 제출되었습니다' });
});

router.get('/api/contracts', requireAdmin, async (req, res) => {
  // 사진 본문은 목록에서 내려주지 않는다 (한 장 20~30KB). 등록이 끝나 사본을 비운 계약서는
  // 연결된 회원에게 사진이 있는지로 판단해, 목록의 📷 표시가 사라지지 않게 한다.
  res.json(await db.all(`SELECT c.id, c.name, c.phone, c.birth_date, c.insta, c.gender, c.injury, c.goal, c.privacy_agreed, c.status, c.member_id, c.created_at,
    c.region, c.source, c.plan, c.period, c.discount, c.amount, c.locker_months, c.uniform_months, c.staff_memo, c.contract_type, c.renew_member_id, c.extend_locker, c.extend_uniform, c.start_date, c.end_date, c.membership_type, c.count_total,
    CASE WHEN c.photo IS NOT NULL
           OR EXISTS (SELECT 1 FROM members m
                       WHERE m.id = c.member_id AND m.photo IS NOT NULL AND m.photo <> '')
         THEN 1 ELSE 0 END AS has_photo
    FROM contracts c ORDER BY c.created_at DESC`));
});

router.get('/api/contracts/:id', requireAdmin, async (req, res) => {
  const c = await db.get('SELECT * FROM contracts WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: '계약서를 찾을 수 없습니다' });
  // 등록이 끝난 계약서는 사진 사본을 지워 두므로(같은 사진 두 벌 방지),
  // 화면에 보여줄 때는 연결된 회원의 사진을 대신 가져온다.
  if (!c.photo && c.member_id) {
    const m = await db.get('SELECT photo FROM members WHERE id=?', [c.member_id]);
    if (m && m.photo) c.photo = m.photo;
  }
  res.json(c);
});

router.put('/api/contracts/:id/link', requireAdmin, async (req, res) => {
  const { member_id } = req.body;
  // 등록이 끝났으면 계약서가 들고 있던 사진 사본도 같이 비운다
  // (한 장에 20~30KB짜리가 두 벌 쌓이는 것을 막는다).
  // 회원 쪽에 사진이 실제로 들어갔을 때만 비운다 — 아니면 사진이 아예 사라진다.
  // 같은 행이므로 두 번 나눠 고치지 않고 한 문장으로 끝낸다.
  let clearPhoto = false;
  if (member_id) {
    const m = await db.get('SELECT photo FROM members WHERE id=?', [member_id]);
    clearPhoto = !!(m && m.photo);
  }
  await db.run(
    clearPhoto
      ? "UPDATE contracts SET status='registered', member_id=?, photo=NULL WHERE id=?"
      : "UPDATE contracts SET status='registered', member_id=? WHERE id=?",
    [member_id||null, req.params.id]);
  res.json({ message: '등록 완료로 처리되었습니다' });
});

router.delete('/api/contracts/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM contracts WHERE id=?', [req.params.id]);
  res.json({ message: '삭제되었습니다' });
});

module.exports = router;
