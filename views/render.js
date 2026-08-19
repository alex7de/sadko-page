// HTML собирается строками: сборщика и шаблонизатора здесь нет намеренно.
// Важнейшее правило: в ответ попадают данные ТОЛЬКО той роли, что в сессии.

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const BASE_STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 16px;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f5f6f8; color: #16181d;
  }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  .card { background: #fff; border: 1px solid #e2e5ea; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  code { word-break: break-all; }
`;

export function renderLogin({ error = '', status = '' } = {}) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Вход</title>
<style>${BASE_STYLE}
  form { display: flex; flex-direction: column; gap: 12px; }
  input { font-size: 16px; padding: 12px; border: 1px solid #c9ced6; border-radius: 8px; }
  button { font-size: 16px; padding: 12px; border: 0; border-radius: 8px; background: #2a6df4; color: #fff; cursor: pointer; }
  .error { color: #b3261e; margin: 0; }
</style>
</head>
<body>
<main>
  <div class="card">
    <h1>Подключение к VPN</h1>
    <p>Введите пароль, который вам выдали.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/login">
      <input type="password" name="password" autocomplete="current-password" autofocus required
             placeholder="Пароль" aria-label="Пароль">
      <button type="submit">Войти</button>
    </form>
    ${status ? `<p>${escapeHtml(status)}</p>` : ''}
  </div>
</main>
</body>
</html>`;
}

export function renderPage({ role }) {
  const profiles = role.profiles
    .map(
      (p) =>
        `<li><b>${escapeHtml(p.name)}</b><br>` +
        `<img src="${escapeHtml(p.qr)}" alt="QR подписки" width="320" height="320"><br>` +
        `<code>${escapeHtml(p.sub)}</code></li>`
    )
    .join('');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(role.brand)}</title>
<style>${BASE_STYLE}</style>
</head>
<body>
<main>
  <h1>${escapeHtml(role.brand)}</h1>
  <div class="card">
    <ul>${profiles}</ul>
  </div>
  <p><a href="/logout">Выйти</a></p>
</main>
</body>
</html>`;
}
