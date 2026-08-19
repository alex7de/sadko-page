import express from 'express';
import cookieParser from 'cookie-parser';

import { loadConfig } from './config.js';
import { createAuth, COOKIE_NAME } from './auth.js';
import { buildRoleView, buildProfileView } from './qr.js';
import { renderLogin, renderPage, renderInvalidLink } from './views/render.js';

const config = loadConfig();
const auth = createAuth(config);

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.disable('etag');

app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '8kb' }));

// Страница раздаёт ключи доступа к VPN. Она не должна попадать ни в поисковые
// индексы, ни в веб-архивы, ни в промежуточные кэши, ни в чужие фреймы.
app.use((req, res, next) => {
  // `none` = noindex + nofollow одной директивой; остальное добивает превью,
  // архивные копии, индексацию картинок (QR — это картинка с доступом) и перевод.
  res.set('X-Robots-Tag', 'none, noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, nocache');

  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');

  // Токен стоит в URL, а страница отдаёт конфиги: нельзя оставлять её ни в кэше
  // браузера, ни у промежуточных прокси.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  // Никаких внешних загрузок и никаких фреймов: страница целиком самодостаточна,
  // QR вшиты как data:. Заодно это запрещает кликджекинг поверх кнопок импорта.
  res.set('Content-Security-Policy', [
    "default-src 'none'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; '));
  res.set('X-Frame-Options', 'DENY');
  res.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), interest-cohort=()');

  // Сервер не обязан рассказывать, на чём он написан.
  res.removeHeader('X-Powered-By');
  next();
});

// Отдельные User-agent перечислены не ради вежливости, а потому что часть архиваторов
// и ИИ-краулеров игнорирует групповое правило и подчиняется только именной записи.
const ROBOTS_TXT = [
  'User-agent: *',
  'Disallow: /',
  '',
  ...['ia_archiver', 'archive.org_bot', 'Wayback', 'GPTBot', 'CCBot', 'Bytespider',
      'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'PerplexityBot', 'Amazonbot',
      'YandexBot', 'Googlebot', 'Bingbot', 'DuckDuckBot', 'Baiduspider', 'SemrushBot',
      'AhrefsBot', 'MJ12bot', 'DotBot'].flatMap((ua) => [`User-agent: ${ua}`, 'Disallow: /', '']),
].join('\n');

app.get('/robots.txt', (req, res) => res.type('text/plain').send(ROBOTS_TXT));

// Пустая карта сайта — чтобы автоматика не пыталась угадывать структуру.
app.get('/sitemap.xml', (req, res) => res.status(404).type('text/plain').send('not found'));

app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));

// Роль берётся исключительно из подписанной cookie.
app.use((req, res, next) => {
  req.role = auth.roleForCookie(req.cookies?.[COOKIE_NAME]);
  next();
});

app.post('/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (auth.isLocked(ip)) {
    res
      .status(429)
      .type('html')
      .send(renderLogin({ error: 'Слишком много попыток. Попробуйте через 15 минут.' }));
    return;
  }
  const role = auth.roleForPassword(req.body?.password);
  if (!role) {
    auth.registerFailure(ip);
    res.status(401).type('html').send(renderLogin({ error: 'Неверный пароль.' }));
    return;
  }
  auth.clearFailures(ip);
  res.cookie(COOKIE_NAME, auth.issue(role), auth.cookieOptions());
  res.redirect(303, '/');
});

app.get('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...auth.cookieOptions(), maxAge: undefined });
  res.type('html').send(renderLogin({ status: 'Вы вышли.' }));
});

app.get('/', async (req, res, next) => {
  if (!req.role) {
    // Форма входа — это нормальная страница, а не ошибка: 401 здесь ломал бы
    // health-check платформы. Неверный пароль на POST /login всё так же 401.
    res.type('html').send(renderLogin());
    return;
  }
  try {
    // Сюда попадает только объект своей роли — чужие профили в ответ не строятся.
    const view = await buildRoleView(config.roles[req.role], config.routingLink);
    res.type('html').send(renderPage({ role: view }));
  } catch (err) {
    next(err);
  }
});

// Персональная ссылка — основной способ раздачи: человек получает страницу
// ровно со своим профилем. Ни пароля, ни cookie: токен в URL и есть ключ.
// В ответ строится один профиль из индекса, поэтому чужих данных в HTML нет
// физически — не спрятано стилями, а просто не существует в этом ответе.
app.get('/u/:token', async (req, res, next) => {
  const ip = req.ip || 'unknown';
  if (auth.isLocked(ip, 'token')) {
    res.status(429).type('html').send(renderInvalidLink());
    return;
  }
  const entry = config.byToken.get(req.params.token); // один Map.get, без перебора
  if (!entry) {
    // Тот же счётчик, что у /login: перебор токенов упирается в него же.
    // Удачное попадание счётчик не сбрасывает — иначе один валидный токен
    // обнулял бы лимит перед следующей пачкой попыток.
    auth.registerFailure(ip, 'token');
    res.status(404).type('html').send(renderInvalidLink());
    return;
  }
  try {
    const view = await buildProfileView(entry.role, entry.profile, config.routingLink);
    res.type('html').send(renderPage({ role: view, personal: true }));
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

// eslint-disable-next-line no-unused-vars -- express опознаёт обработчик ошибок по арности
app.use((err, req, res, next) => {
  console.error('Ошибка при обработке запроса:', err);
  res.status(500).type('text/plain').send('Внутренняя ошибка');
});

app.listen(config.port, () => {
  console.log(`sadko-page слушает :${config.port}`);
});
