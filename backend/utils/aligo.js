// 알리고(Aligo) SMS 발송 래퍼 — https://smartsms.aligo.in/admin/api/spec.html
const ALIGO_SEND_URL = 'https://apis.aligo.in/send/';

function normalizePhone(phone) {
  return (phone || '').replace(/[^0-9]/g, '');
}

// 콘텐츠 바이트 길이(EUC-KR 기준 한글 2바이트)가 90바이트 넘으면 LMS로 자동 전환
function smsType(content) {
  let bytes = 0;
  for (const ch of content) bytes += ch.charCodeAt(0) > 127 ? 2 : 1;
  return bytes > 90 ? 'LMS' : 'SMS';
}

async function sendSms({ receiver, msg, title }) {
  const userId = process.env.ALIGO_USER_ID;
  const apiKey = process.env.ALIGO_API_KEY;
  const sender = process.env.ALIGO_SENDER;
  if (!userId || !apiKey || !sender) {
    return { success: false, error: 'ALIGO_USER_ID / ALIGO_API_KEY / ALIGO_SENDER 환경변수가 설정되지 않았습니다' };
  }

  const type = smsType(msg);
  // LMS는 제목을 안 넘기면 알리고가 본문 앞부분을 제목으로 자동 채워 넣어 인사말이 중복 표시되는 문제가 있어 기본값 지정
  const finalTitle = title || (type === 'LMS' ? 'CrossFit Box' : '');

  const body = new URLSearchParams({
    key: apiKey,
    user_id: userId,
    sender: normalizePhone(sender),
    receiver: normalizePhone(receiver),
    msg,
    msg_type: type,
  });
  if (finalTitle) body.set('title', finalTitle);

  try {
    const res = await fetch(ALIGO_SEND_URL, { method: 'POST', body });
    const data = await res.json();
    // 알리고 성공 응답: { result_code: '1', message: 'success', ... }
    if (String(data.result_code) === '1') {
      return { success: true, raw: data };
    }
    return { success: false, error: data.message || '알리고 발송 실패', raw: data };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { sendSms };
