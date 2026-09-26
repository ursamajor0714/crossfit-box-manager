const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/api/special-extensions', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM special_extensions ORDER BY created_at DESC'));
});

// 특별 연장 등록: start_date~end_date 일수만큼 만료일 연장
router.post('/api/special-extensions', requireAdmin, async (req, res) => {
  const { member_id, start_date, end_date, reason } = req.body;
  if (!member_id || !start_date || !end_date) return res.status(400).json({ error: '회원, 시작일, 종료일은 필수입니다' });
  if (end_date < start_date) return res.status(400).json({ error: '종료일은 시작일 이후여야 합니다' });

  const member = await db.get('SELECT * FROM members WHERE id=?', [member_id]);
  if (!member) return res.status(404).json({ error: '회원을 찾을 수 없습니다' });

  const reg = await db.get("SELECT * FROM member_registrations WHERE member_id=? AND is_current=1 AND (reg_type IS NULL OR reg_type != '횟수권')", [member_id]);
  if (!reg) return res.status(400).json({ error: '활성 회원권이 없습니다' });
  if (!reg.end_date) return res.status(400).json({ error: '만료일이 설정된 회원권이 없습니다' });

  // 연장 일수 = (종료일 - 시작일) + 1  (양 끝 포함)
  const days = Math.round((new Date(end_date) - new Date(start_date)) / 86400000) + 1;
  if (days <= 0) return res.status(400).json({ error: '연장 일수가 올바르지 않습니다' });

  const newEnd = new Date(reg.end_date);
  newEnd.setDate(newEnd.getDate() + days);
  const newEndStr = newEnd.toISOString().split('T')[0];

  const locker = await db.get("SELECT * FROM lockers WHERE member_id=? AND status='active'", [member_id]);
  const uniform = await db.get("SELECT * FROM uniforms WHERE member_id=? AND status='active'", [member_id]);

  const insId = await db.withTransaction(async (tx) => {
    // special_extensions 기록
    const ins = await tx.run('INSERT INTO special_extensions (member_id, member_name, start_date, end_date, days, reason) VALUES (?,?,?,?,?,?) RETURNING id',
      [member_id, member.name, start_date, end_date, days, reason || null]);

    // 회원권 만료일 연장
    await tx.run('UPDATE member_registrations SET end_date=? WHERE id=?', [newEndStr, reg.id]);

    // 락커 자동 연장
    if (locker && locker.end_date) {
      const ln = new Date(locker.end_date);
      ln.setDate(ln.getDate() + days);
      await tx.run('UPDATE lockers SET end_date=? WHERE id=?', [ln.toISOString().split('T')[0], locker.id]);
    }

    // 운동복 자동 연장
    if (uniform && uniform.end_date) {
      const un = new Date(uniform.end_date);
      un.setDate(un.getDate() + days);
      await tx.run('UPDATE uniforms SET end_date=? WHERE id=?', [un.toISOString().split('T')[0], uniform.id]);
    }

    return ins.lastInsertRowid;
  });

  res.json({ message: `특별 연장 ${days}일 적용 완료`, new_end_date: newEndStr, id: insId });
});

// 특별 연장 취소: 해당 일수만큼 만료일 되돌리기
router.delete('/api/special-extensions/:id', requireAdmin, async (req, res) => {
  const ext = await db.get('SELECT * FROM special_extensions WHERE id=?', [req.params.id]);
  if (!ext) return res.status(404).json({ error: '연장 내역을 찾을 수 없습니다' });

  const days = ext.days || 0;

  const reg = await db.get("SELECT * FROM member_registrations WHERE member_id=? AND is_current=1 AND (reg_type IS NULL OR reg_type != '횟수권')", [ext.member_id]);
  const locker = await db.get("SELECT * FROM lockers WHERE member_id=? AND status='active'", [ext.member_id]);
  const uniform = await db.get("SELECT * FROM uniforms WHERE member_id=? AND status='active'", [ext.member_id]);

  await db.withTransaction(async (tx) => {
    // 회원권 만료일 원복
    if (reg && reg.end_date && days > 0) {
      const newEnd = new Date(reg.end_date);
      newEnd.setDate(newEnd.getDate() - days);
      await tx.run('UPDATE member_registrations SET end_date=? WHERE id=?', [newEnd.toISOString().split('T')[0], reg.id]);
    }

    // 락커 원복
    if (locker && locker.end_date && days > 0) {
      const ln = new Date(locker.end_date);
      ln.setDate(ln.getDate() - days);
      await tx.run('UPDATE lockers SET end_date=? WHERE id=?', [ln.toISOString().split('T')[0], locker.id]);
    }

    // 운동복 원복
    if (uniform && uniform.end_date && days > 0) {
      const un = new Date(uniform.end_date);
      un.setDate(un.getDate() - days);
      await tx.run('UPDATE uniforms SET end_date=? WHERE id=?', [un.toISOString().split('T')[0], uniform.id]);
    }

    await tx.run('DELETE FROM special_extensions WHERE id=?', [req.params.id]);
  });

  res.json({ message: '특별 연장이 취소되었습니다' });
});

module.exports = router;
