const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

router.get('/api/schedule/templates', async (req, res) => {
  res.json(await db.all('SELECT * FROM schedule_templates ORDER BY dow, start_time'));
});

router.post('/api/schedule/templates', requireAdmin, async (req, res) => {
  const { class_name, dow, start_time, color } = req.body;
  if (!class_name || dow == null || !start_time) return res.status(400).json({ error: '수업명, 요일, 시간은 필수입니다' });
  const r = await db.run('INSERT INTO schedule_templates (class_name, dow, start_time, color) VALUES (?,?,?,?) RETURNING id',
    [class_name, dow, start_time, color || '#1a1a1a']);
  res.json({ id: r.lastInsertRowid, message: '템플릿 추가 완료' });
});

router.put('/api/schedule/templates/:id', requireAdmin, async (req, res) => {
  const { class_name, dow, start_time, color, is_active } = req.body;
  await db.run('UPDATE schedule_templates SET class_name=?, dow=?, start_time=?, color=?, is_active=? WHERE id=?',
    [class_name, dow, start_time, color || '#1a1a1a', is_active ?? 1, req.params.id]);
  res.json({ message: '수정 완료' });
});

router.delete('/api/schedule/templates/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM schedule_templates WHERE id=?', [req.params.id]);
  res.json({ message: '삭제 완료' });
});

router.post('/api/schedule/generate', requireAdmin, async (req, res) => {
  const { year, month } = req.body;
  if (!year || !month) return res.status(400).json({ error: 'year, month 필요' });
  const templates = await db.all('SELECT * FROM schedule_templates WHERE is_active=1');
  if (!templates.length) return res.status(400).json({ error: '활성 템플릿이 없습니다' });
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let created = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    const dow = date.getUTCDay();
    const dateStr = date.toISOString().split('T')[0];
    for (const t of templates) {
      if (t.dow !== dow) continue;
      const exists = await db.get('SELECT id FROM schedule_events WHERE template_id=? AND event_date=?', [t.id, dateStr]);
      if (exists) continue;
      await db.run('INSERT INTO schedule_events (template_id, event_date, class_name, start_time, color) VALUES (?,?,?,?,?)',
        [t.id, dateStr, t.class_name, t.start_time, t.color]);
      created++;
    }
  }
  res.json({ message: `${year}년 ${month}월 이벤트 ${created}개 생성 완료` });
});

// ─── 시간표 이벤트 ────────────────────────────────────

router.get('/api/schedule/events/:year/:month', async (req, res) => {
  const { year, month } = req.params;
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const to   = `${year}-${String(month).padStart(2,'0')}-31`;
  res.json(await db.all('SELECT * FROM schedule_events WHERE event_date BETWEEN ? AND ? ORDER BY event_date, start_time', [from, to]));
});

router.post('/api/schedule/events', requireAdmin, async (req, res) => {
  const { event_date, class_name, start_time, color, memo, template_id } = req.body;
  if (!event_date || !class_name || !start_time) return res.status(400).json({ error: '날짜, 수업명, 시간은 필수입니다' });
  const r = await db.run('INSERT INTO schedule_events (template_id, event_date, class_name, start_time, color, memo) VALUES (?,?,?,?,?,?) RETURNING id',
    [template_id || null, event_date, class_name, start_time, color || '#1a1a1a', memo || null]);
  res.json({ id: r.lastInsertRowid, message: '등록 완료' });
});

router.put('/api/schedule/events/:id', requireAdmin, async (req, res) => {
  const { class_name, start_time, color, memo, is_cancelled } = req.body;
  await db.run('UPDATE schedule_events SET class_name=?, start_time=?, color=?, memo=?, is_cancelled=? WHERE id=?',
    [class_name, start_time, color || '#1a1a1a', memo || null, is_cancelled ?? 0, req.params.id]);
  res.json({ message: '수정 완료' });
});

router.delete('/api/schedule/events/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM schedule_events WHERE id=?', [req.params.id]);
  res.json({ message: '삭제 완료' });
});

module.exports = router;
