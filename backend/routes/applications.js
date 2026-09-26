const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { sendSms } = require('../utils/aligo');

router.get('/api/applications', requireAdmin, async (req, res) => {
  res.json(await db.all('SELECT * FROM applications ORDER BY created_at DESC'));
});

// {date}(희망일 "M월 D일") / {time}(수업 시간 "H시 M분", 정각이면 "H시") 치환
// 대소문자 무관, 공백 포함 "{ date }" 형태, 한글 "{날짜}"/"{시간}" 표기도 함께 허용
function fillTemplate(content, { preferred_date, class_time }) {
  let dateStr = '', timeStr = '';
  if (preferred_date) {
    const [, m, d] = preferred_date.split('-').map(Number);
    dateStr = `${m}월 ${d}일`;
  }
  if (class_time) {
    const [h, min] = class_time.split(':').map(Number);
    timeStr = min ? `${h}시 ${min}분` : `${h}시`;
  }
  return content
    .replace(/\{\s*(date|날짜)\s*\}/gi, dateStr)
    .replace(/\{\s*(time|시간)\s*\}/gi, timeStr);
}

router.post('/api/applications', async (req, res) => {
  const { type, name, phone, preferred_date, memo, class_time, class_name } = req.body;

  // 휴관일에는 받지 않는다. 화면에서 그 날짜를 못 누르게 막고 있지만,
  // 페이지를 열어둔 사이 휴관일로 지정되면 그대로 신청이 들어오므로 서버에서도 확인한다.
  if (preferred_date) {
    const closed = await db.get(
      "SELECT title FROM calendar_events WHERE event_date = ? AND type = '휴관일'", [preferred_date]);
    if (closed) {
      // 날짜 뒤에 조사를 붙이면 숫자에 따라 '은/는'이 갈려서, 조사 없이 쓴다
      return res.status(409).json({
        error: `휴관일로 지정된 날짜입니다 — ${preferred_date}${closed.title ? ` ${closed.title}` : ''}\n다른 날짜를 선택해주세요.`,
      });
    }
  }

  const r = await db.run('INSERT INTO applications (type, name, phone, preferred_date, memo, class_time, class_name) VALUES (?,?,?,?,?,?,?) RETURNING id',
    [type, name, phone, preferred_date, memo, class_time||null, class_name||null]);

  // 해당 유형(체험/드랍인)에 기본 템플릿이 지정되어 있으면 신청자 번호로 안내 문자 자동 발송
  // 발송 실패해도 신청 접수 자체는 정상 처리한다
  if (phone) {
    try {
      const tpl = await db.get('SELECT content FROM sms_templates WHERE category=? AND is_default=TRUE', [type]);
      if (tpl) {
        const msg = fillTemplate(tpl.content, { preferred_date, class_time });
        const result = await sendSms({ receiver: phone, msg });
        await db.run('INSERT INTO sms_logs (category, name, phone, content, status, error_msg) VALUES (?,?,?,?,?,?)',
          [type, name, phone, msg, result.success ? '성공' : '실패', result.success ? null : result.error]);
      }
    } catch (e) {
      console.error('신청 안내 문자 자동 발송 실패:', e);
    }
  }

  res.json({ id: r.lastInsertRowid, message: '신청이 접수되었습니다' });
});

router.put('/api/applications/:id', requireAdmin, async (req, res) => {
  const existing = await db.get('SELECT * FROM applications WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: '신청을 찾을 수 없습니다' });

  // 보낸 값만 반영, 안 보낸 필드는 기존 값 유지
  const pick = (v, fallback) => (v === undefined ? fallback : v);
  const status         = pick(req.body.status,         existing.status);
  const amount         = pick(req.body.amount,         existing.amount);
  const payment_method = pick(req.body.payment_method, existing.payment_method);

  await db.run('UPDATE applications SET status=?, amount=?, payment_method=? WHERE id=?',
    [status, amount||0, payment_method||null, req.params.id]);
  res.json({ message: '처리 완료' });
});

router.delete('/api/applications/:id', requireAdmin, async (req, res) => {
  await db.run('DELETE FROM applications WHERE id=?', [req.params.id]);
  res.json({ message: '삭제 완료' });
});

module.exports = router;
