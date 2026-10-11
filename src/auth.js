import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// APP_PASSWORD가 설정된 경우에만 동작하는 단일 비밀번호 인증.
// 세션 토큰 = HMAC(비밀번호, 고정 문자열) 이라 서버를 재시작해도 로그인이 유지되고,
// 비밀번호를 바꾸면 기존 세션이 모두 무효화된다.
const COOKIE = 'mg_session';
const MAX_AGE_S = 30 * 24 * 3600;
const PUBLIC_PATHS = new Set(['/login.html', '/login.js', '/api/login', '/api/logout', '/style.css', '/icon.svg', '/manifest.webmanifest']);

const password = () => process.env.APP_PASSWORD || '';
export const authEnabled = () => password() !== '';
const token = () => createHmac('sha256', password()).update('meokgirok-session-v1').digest('hex');

function safeEqual(a, b) {
  // 길이가 달라도 시간 차이가 나지 않도록 해시 후 비교
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

function cookieOf(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

export function authMiddleware(req, res, next) {
  if (!authEnabled() || PUBLIC_PATHS.has(req.path)) return next();
  if (safeEqual(cookieOf(req, COOKIE), token())) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: '로그인이 필요합니다.' });
  res.redirect('/login.html');
}

const fails = new Map(); // ip -> 실패 시각 목록
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;

export function loginHandler(req, res) {
  if (!authEnabled()) return res.json({ ok: true });
  const now = Date.now();
  const recent = (fails.get(req.ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_FAILS)
    return res.status(429).json({ error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  if (!safeEqual(req.body?.password ?? '', password())) {
    recent.push(now);
    fails.set(req.ip, recent);
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  fails.delete(req.ip);
  // HTTPS(리버스 프록시의 x-forwarded-proto 포함)로 접속했을 때만 Secure 속성 부여
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE, token(), { httpOnly: true, sameSite: 'strict', secure, maxAge: MAX_AGE_S * 1000, path: '/' });
  res.json({ ok: true });
}

export function logoutHandler(_req, res) {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}
