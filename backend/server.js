const express = require('express');
const cors = require('cors');
const path = require('path');
// .env 파일 자동 로드 (dotenv 미설치 시에도 에러 없이 통과)
try { require('dotenv').config(); } catch (e) { /* dotenv 미설치 — 환경변수 직접 주입 시 정상 동작 */ }

const db = require('./db');
const { isValidAdminToken } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); // 리버스 프록시(nginx 등) 뒤에서 실제 IP 인식
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'frontend', 'views'));

// 프론트엔드와 API가 같은 오리진에서 서비스되므로 CORS는 필요 없음 — 열어두면 임의 사이트에서
// 탈취한 토큰으로 API를 호출할 수 있어 기본은 차단하고, 필요한 경우만 ALLOWED_ORIGIN으로 명시 허용
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
if (ALLOWED_ORIGIN) app.use(cors({ origin: ALLOWED_ORIGIN }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  
  // 메인 페이지(/ 또는 /index)에만 엄격한 CSP 설정 적용 (보안 진단 통과용)
  // 나머지 관리자나 내부 페이지는 원활한 동작을 위해 인라인 스크립트 허용
  if (req.path === '/' || req.path === '/index') {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none';");
  } else {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none';");
  }
  next();
});

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// Render 수면 방지(Keep-Alive) 핑 엔드포인트
app.get('/ping', (req, res) => res.status(200).send('pong'));

// 페이지 라우팅
app.get('/', (req, res) => res.render('index'));
app.get('/admin', (req, res) => {
  const isAuth = isValidAdminToken(req);
  res.render('admin', { isAuthenticated: isAuth });
});
app.get('/member', (req, res) => res.render('member'));
app.get('/visit', (req, res) => res.render('visit'));
app.get('/wod-builder', (req, res) => res.render('wod-builder'));
app.get('/contract', (req, res) => res.render('contract'));

// 코치(부운영자)에게 허용되지 않은 탭의 API를 서버에서도 막는다 (라우터보다 먼저)
app.use(require('./middleware/perms').permissionGate);

app.use(require('./routes/auth'));
app.use(require('./routes/notices'));
app.use(require('./routes/wods'));
app.use(require('./routes/applications'));
app.use(require('./routes/contracts'));
app.use(require('./routes/members'));
app.use(require('./routes/messages'));
app.use(require('./routes/holding'));
app.use(require('./routes/specialExtensions'));
app.use(require('./routes/pricing'));
app.use(require('./routes/counts'));
app.use(require('./routes/lockers'));
app.use(require('./routes/uniforms'));
app.use(require('./routes/stats'));
app.use(require('./routes/schedule'));
app.use(require('./routes/calendar'));
app.use(require('./routes/sms'));

// DB 가 "이 값은 못 받는다" 고 거절한 것은 서버가 망가진 게 아니라 요청이 잘못된 것이다.
// 그런 것까지 500 으로 돌려주면 "예상하지 못한 고장" 과 구분이 안 된다.
// 경로 하나하나에 검사를 넣는 대신 여기 한 곳에서 4xx 로 바꿔 준다 (Express 5 는 비동기 오류도 여기로 모인다).
const DB_ERROR_MAP = {
  '22P02': [400, '요청에 숫자가 아닌 값이 들어 있습니다'],        // 예: /api/members/abc
  '22003': [400, '숫자가 너무 큽니다'],                          // 정수 범위를 넘는 금액
  '22001': [400, '입력이 너무 깁니다'],                          // 컬럼 길이 초과
  '23502': [400, '필수 항목이 비어 있습니다'],                    // NOT NULL 위반
  '23503': [400, '연결된 정보가 없어 처리할 수 없습니다'],          // 외래키 위반
  '23505': [409, '이미 같은 값이 등록되어 있습니다'],              // 중복
};

app.use((err, req, res, next) => {
  const mapped = err && err.code && DB_ERROR_MAP[err.code];
  if (mapped) {
    const [status, message] = mapped;
    // 원인을 쫓을 수 있게 서버 로그에는 남기되, 밖으로는 내부 사정을 안 보낸다
    console.warn(`[요청 거절] ${req.method} ${req.path} — ${err.code} ${err.message}`);
    return res.status(status).json({ error: message });
  }
  console.error(err);
  res.status(500).json({ error: '서버 오류가 발생했습니다' });
});

db.ready
  .then(() => {
    app.listen(PORT, () => console.log(`✅ CrossFit Grove 서버 실행 중: http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('DB 초기화 실패:', err);
    process.exit(1);
  });
