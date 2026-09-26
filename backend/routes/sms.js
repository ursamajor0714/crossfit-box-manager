const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendSms } = require('../utils/aligo');

// ── 템플릿 ──
router.get('/api/sms/templates', requireAdmin, async (req, res) => {
  const { category } = req.query;
  const sql = category
    ? 'SELECT * FROM sms_templates WHERE category=? ORDER BY id DESC'
    : 'SELECT * FROM sms_templates ORDER BY id DESC';
  res.json(await db.all(sql, category ? [category] : []));
});

router.post('/api/sms/templates', requireAdmin, async (req, res) => {
  const { category, title, content } = req.body;
  if (!category || !title || !content) return res.status(400).json({ error: '카테고리/제목/내용은 필수입니다' });
  const r = await db.run('INSERT INTO sms_templates (category, title, content) VALUES (?,?,?) RETURNING id',
    [category, title, content]);
  res.json({ id: r.lastInsertRowid, message: '템플릿 저장 완료' });
});

router.put('/api/sms/templates/:id', requireAdmin, async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: '제목/내용은 필수입니다' });
  await db.run(`UPDATE sms_templates SET title=?, content=?, updated_at=to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI:SS') WHERE id=?`,
    [title, content, req.params.id]);
  res.json({ message: '템플릿 수정 완료' });
});

router.delete('/api/sms/templates/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM sms_templates WHERE id=?', [req.params.id]);
  res.json({ message: '템플릿 삭제 완료' });
});

// 카테고리(체험/드랍인)별 기본 템플릿 지정 — 같은 카테고리 내 기존 기본 템플릿은 해제
router.put('/api/sms/templates/:id/default', requireAdmin, async (req, res) => {
  const tpl = await db.get('SELECT category FROM sms_templates WHERE id=?', [req.params.id]);
  if (!tpl) return res.status(404).json({ error: '템플릿을 찾을 수 없습니다' });
  await db.withTransaction(async (tx) => {
    await tx.run('UPDATE sms_templates SET is_default=FALSE WHERE category=?', [tpl.category]);
    await tx.run('UPDATE sms_templates SET is_default=TRUE WHERE id=?', [req.params.id]);
  });
  res.json({ message: '기본 템플릿으로 지정되었습니다' });
});

// ── 발송 내역 ──
router.get('/api/sms/logs', requireAdmin, async (req, res) => {
  const { category } = req.query;
  const sql = category
    ? 'SELECT * FROM sms_logs WHERE category=? ORDER BY sent_at DESC'
    : 'SELECT * FROM sms_logs ORDER BY sent_at DESC';
  res.json(await db.all(sql, category ? [category] : []));
});

// ── 발송 ──
router.post('/api/sms/send', requireAdmin, async (req, res) => {
  const { category, name, phone, content } = req.body;
  if (!category || !phone || !content) return res.status(400).json({ error: '카테고리/수신번호/내용은 필수입니다' });

  const result = await sendSms({ receiver: phone, msg: content });
  await db.run('INSERT INTO sms_logs (category, name, phone, content, status, error_msg) VALUES (?,?,?,?,?,?)',
    [category, name || '', phone, content, result.success ? '성공' : '실패', result.success ? null : result.error]);

  if (!result.success) return res.status(502).json({ error: result.error || '문자 발송에 실패했습니다' });
  res.json({ message: '문자를 발송했습니다' });
});

module.exports = router;
