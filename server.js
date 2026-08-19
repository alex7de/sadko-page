import express from 'express';
import cookieParser from 'cookie-parser';

import { loadConfig } from './config.js';
import { createAuth, COOKIE_NAME } from './auth.js';
import { renderLogin, renderPage } from './views/render.js';

const config = loadConfig();
const auth = createAuth(config);

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(cookieParser());
app.use(express.urlencoded({ extended: false, limit: '8kb' }));

app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
});

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

app.get('/', (req, res) => {
  if (!req.role) {
    res.status(401).type('html').send(renderLogin());
    return;
  }
  // Сюда попадает только объект своей роли — чужие профили в ответ не строятся.
  res.type('html').send(
    renderPage({
      role: config.roles[req.role],
      routingLink: config.routingLink,
    })
  );
});

app.use((req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

app.listen(config.port, () => {
  console.log(`sadko-page слушает :${config.port}`);
});
