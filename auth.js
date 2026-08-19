import crypto from 'node:crypto';

export const COOKIE_NAME = 'sess';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
// Перебор персональных ссылок ограничивать почти нечем: токен 128-битный, и разница
// между «10 попыток за 15 минут» и «без ограничений» лежит за пределами разумного
// времени. Зато счётчик легко бьёт по своим: коллеги в офисе сидят за общим NAT, и
// десяток устаревших ссылок заблокировал бы всю компанию. Поэтому у ссылок свой,
// щедрый счётчик, не влияющий на вход по паролю.
const TOKEN_MAX_FAILURES = 200;

const sha256 = (value) => crypto.createHash('sha256').update(String(value), 'utf8').digest();

export function createAuth(config) {
  // Эталонные пароли храним как дайджесты фиксированной длины: timingSafeEqual
  // бросает исключение на буферах разной длины, и это утечка длины пароля.
  const reference = new Map(config.roleIds.map((role) => [role, sha256(config.roles[role].password)]));

  const hmac = (payload) =>
    crypto.createHmac('sha256', config.sessionSecret).update(payload, 'utf8').digest('hex');

  /** Возвращает роль по введённому паролю или null. Проверяются все роли — без раннего выхода. */
  function roleForPassword(input) {
    const candidate = sha256(typeof input === 'string' ? input : '');
    let matched = null;
    for (const [role, expected] of reference) {
      if (crypto.timingSafeEqual(candidate, expected)) matched = role;
    }
    return matched;
  }

  function issue(role) {
    const expiry = String(Date.now() + SESSION_TTL_MS);
    const payload = `${role}.${expiry}`;
    return `${payload}.${hmac(payload)}`;
  }

  /** Возвращает роль из cookie либо null: подпись, срок и имя роли проверяются. */
  function roleForCookie(value) {
    if (typeof value !== 'string') return null;
    const parts = value.split('.');
    if (parts.length !== 3) return null;
    const [role, expiry, signature] = parts;
    if (!config.roleIds.includes(role)) return null;
    if (!/^\d+$/.test(expiry)) return null;
    const expected = hmac(`${role}.${expiry}`);
    if (signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))) return null;
    if (Number(expiry) <= Date.now()) return null;
    return role;
  }

  function cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      path: '/',
      maxAge: SESSION_TTL_MS,
    };
  }

  // --- лимит попыток входа: счётчик по IP в памяти ---
  const counters = { login: new Map(), token: new Map() };
  const ceilings = { login: LOGIN_MAX_FAILURES, token: TOKEN_MAX_FAILURES };

  function pruneFailures(store, now) {
    for (const [ip, entry] of store) {
      if (now - entry.first > LOGIN_WINDOW_MS) store.delete(ip);
    }
  }

  function isLocked(ip, kind = 'login') {
    const store = counters[kind];
    const entry = store.get(ip);
    if (!entry) return false;
    if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
      store.delete(ip);
      return false;
    }
    return entry.count >= ceilings[kind];
  }

  function registerFailure(ip, kind = 'login') {
    const store = counters[kind];
    const now = Date.now();
    if (store.size > 5000) pruneFailures(store, now);
    const entry = store.get(ip);
    if (!entry || now - entry.first > LOGIN_WINDOW_MS) {
      store.set(ip, { count: 1, first: now });
      return;
    }
    entry.count += 1;
  }

  function clearFailures(ip, kind = 'login') {
    counters[kind].delete(ip);
  }

  return {
    roleForPassword,
    roleForCookie,
    issue,
    cookieOptions,
    isLocked,
    registerFailure,
    clearFailures,
    limits: { windowMs: LOGIN_WINDOW_MS, maxFailures: LOGIN_MAX_FAILURES, maxTokenMisses: TOKEN_MAX_FAILURES },
  };
}
