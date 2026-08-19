// HTML собирается строками: шаблонизатора, фреймворка и сборщика здесь нет
// намеренно. Единственный скрипт — инлайновый переключатель устройств и
// кнопки «скопировать».
//
// Главное правило: в ответ попадают данные ТОЛЬКО той роли, что в сессии.
// Никаких чужих профилей — ни в разметке, ни в скрытых блоках.

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const DEVICES = [
  { id: 'ios', label: 'iPhone' },
  { id: 'android', label: 'Android' },
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
];

const STYLE = `
  :root {
    color-scheme: light dark;
    --bg: #f4f6f9;
    --fg: #171a1f;
    --muted: #5d6672;
    --card: #ffffff;
    --line: #dfe3e9;
    --accent: #2a6df4;
    --accent-fg: #ffffff;
    --soft: #eef3fe;
    --warn-bg: #fff6e5;
    --warn-line: #f0d49a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a;
      --fg: #e8eaee;
      --muted: #a0a8b4;
      --card: #1c1f25;
      --line: #2e333c;
      --accent: #4d86ff;
      --accent-fg: #0b1020;
      --soft: #1f2735;
      --warn-bg: #2a2317;
      --warn-line: #4c3f22;
    }
  }
  * { box-sizing: border-box; }
  html, body { max-width: 100%; overflow-x: hidden; }
  body {
    margin: 0;
    padding: 20px 14px 56px;
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--bg);
    color: var(--fg);
    -webkit-text-size-adjust: 100%;
  }
  main { max-width: 760px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.2px; }
  h2 { font-size: 18px; margin: 0 0 12px; }
  h3 { font-size: 16px; margin: 20px 0 8px; }
  p { margin: 0 0 12px; }
  ul, ol { margin: 0 0 12px; padding-left: 22px; }
  li { margin-bottom: 8px; }
  a { color: var(--accent); }
  .sub { color: var(--muted); margin: 0; font-size: 14px; }
  header { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; justify-content: space-between; margin-bottom: 18px; }
  header .out { font-size: 14px; }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px;
    margin-bottom: 14px;
  }
  .step { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 6px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; }
  .tab {
    flex: 1 1 calc(50% - 8px);
    min-width: 120px;
    padding: 11px 8px;
    font: inherit;
    font-size: 15px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--card);
    color: var(--fg);
    cursor: pointer;
  }
  .tab[aria-selected="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .btn {
    display: inline-block;
    padding: 11px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--soft);
    color: var(--fg);
    font: inherit;
    font-size: 15px;
    text-decoration: none;
    text-align: center;
    cursor: pointer;
  }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .btn.small { padding: 6px 10px; font-size: 13px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .actions .btn { flex: 1 1 180px; }
  .profile { border-top: 1px solid var(--line); padding-top: 16px; margin-top: 16px; }
  .profile:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
  .profile h3 { margin-top: 0; }
  .qr {
    display: block;
    width: 100%;
    max-width: 240px;
    height: auto;
    margin: 0 0 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #fff;
    padding: 8px;
  }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; word-break: break-all; }
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { white-space: nowrap; color: var(--muted); font-weight: 600; }
  td code { user-select: all; }
  .note { background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: 10px; padding: 12px 14px; }
  .note p:last-child { margin-bottom: 0; }
  .error { color: #b3261e; margin: 0 0 12px; }
  [data-device="ios"] .d:not(.d-ios),
  [data-device="android"] .d:not(.d-android),
  [data-device="windows"] .d:not(.d-windows),
  [data-device="macos"] .d:not(.d-macos) { display: none; }
  @media (max-width: 340px) {
    .tab { flex: 1 1 100%; }
    .actions .btn { flex: 1 1 100%; }
  }
`;

const SCRIPT = `
(function () {
  var root = document.documentElement;
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  function apply(device) {
    if (!device) return;
    root.setAttribute('data-device', device);
    tabs.forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.device === device));
    });
    try { localStorage.setItem('device', device); } catch (e) {}
  }

  function guess() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Windows/i.test(ua)) return 'windows';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
    return 'ios';
  }

  var saved = null;
  try { saved = localStorage.getItem('device'); } catch (e) {}
  apply(saved || guess());

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { apply(t.dataset.device); });
  });

  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('[data-copy]') : null;
    if (!btn) return;
    ev.preventDefault();
    var text = btn.getAttribute('data-copy');
    var done = function () {
      var old = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', old);
      btn.textContent = 'Скопировано';
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      document.body.removeChild(area);
    }
  });
})();
`;

function head(title) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>`;
}

export function renderLogin({ error = '', status = '' } = {}) {
  return `<!doctype html>
<html lang="ru">
<head>
${head('Вход')}
<style>${STYLE}
  .login { max-width: 380px; margin: 12vh auto 0; }
  .login form { display: flex; flex-direction: column; gap: 10px; }
  .login input {
    font: inherit; font-size: 16px; padding: 12px;
    border: 1px solid var(--line); border-radius: 10px;
    background: var(--card); color: var(--fg);
  }
  .login button { border: 0; }
</style>
</head>
<body>
<main class="login">
  <div class="card">
    <h1>Подключение к VPN</h1>
    <p class="sub">Введите пароль, который вам выдали.</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    ${status ? `<p class="sub">${escapeHtml(status)}</p>` : ''}
    <form method="post" action="/login">
      <input type="password" name="password" autocomplete="current-password"
             autocapitalize="off" autocorrect="off" spellcheck="false"
             placeholder="Пароль" aria-label="Пароль" required autofocus>
      <button class="btn primary" type="submit">Войти</button>
    </form>
  </div>
</main>
</body>
</html>`;
}

function deviceTabs() {
  return `<div class="tabs" role="tablist" aria-label="Ваше устройство">
${DEVICES.map(
  (d) =>
    `      <button class="tab" type="button" role="tab" data-device="${d.id}"
              aria-selected="${d.id === 'ios' ? 'true' : 'false'}">${escapeHtml(d.label)}</button>`
).join('\n')}
    </div>`;
}

function installSection() {
  return `<section class="card">
    <p class="step">Шаг 1</p>
    <h2>Установите Happ</h2>
    <p class="sub">Happ — обычное приложение-клиент. Сам по себе он ничего не подключает: доступ появится после шага 2.</p>

    <div class="d d-ios">
      <div class="actions">
        <a class="btn primary" href="https://apps.apple.com/app/happ-proxy-utility/id6504287215">Открыть в App&nbsp;Store</a>
      </div>
      <p class="sub" style="margin-top:10px">Если в российском App Store приложение не находится, понадобится аккаунт другой страны — либо ставьте из TestFlight со страницы <a href="https://www.happ.su/main">happ.su</a>.</p>
    </div>

    <div class="d d-android">
      <div class="actions">
        <a class="btn primary" href="https://play.google.com/store/apps/details?id=com.happproxy">Открыть в Google&nbsp;Play</a>
        <a class="btn" href="https://github.com/Happ-proxy/happ-android/releases/latest">Скачать APK с GitHub</a>
      </div>
      <p class="sub" style="margin-top:10px">Если Google Play недоступен, APK с GitHub — тот же официальный сборщик.</p>
    </div>

    <div class="d d-windows">
      <div class="actions">
        <a class="btn primary" href="https://github.com/Happ-proxy/happ-desktop/releases/latest">Скачать установщик с GitHub</a>
        <button class="btn" type="button" data-copy="winget install --id Happ.Happ">Скопировать команду winget</button>
      </div>
      <p class="sub" style="margin-top:10px">В PowerShell: <code>winget install --id Happ.Happ</code></p>
    </div>

    <div class="d d-macos">
      <div class="actions">
        <a class="btn primary" href="https://apps.apple.com/app/happ-proxy-utility/id6504287215">Открыть в App&nbsp;Store</a>
        <a class="btn" href="https://github.com/Happ-proxy/happ-desktop/releases/latest">Скачать .dmg с GitHub</a>
      </div>
    </div>
  </section>`;
}

// Ссылка подписки печатается ровно один раз на строку разметки: так проверка
// изоляции ролей (grep -c по маркеру) даёт честные 1 и 0, а не «сколько раз
// я вставил один и тот же URL».
function profileCard(profile) {
  const sub = escapeHtml(profile.sub);
  return `    <div class="profile">
      <h3>${escapeHtml(profile.name)}</h3>
      ${profile.note ? `<p class="sub">${escapeHtml(profile.note)}</p>` : ''}
      <img class="qr" src="${escapeHtml(profile.qr)}" alt="QR-код подписки для «${escapeHtml(profile.name)}»" width="320" height="320">
      <div class="actions"><a class="btn primary" href="happ://add/${sub}">Добавить в Happ</a><button class="btn" type="button" data-copy="${sub}">Скопировать ссылку</button></div>
    </div>`;
}

function subscriptionSection(role) {
  return `<section class="card">
    <p class="step">Шаг 2</p>
    <h2>Подписка — ${escapeHtml(role.brand)}</h2>
    <p>Найдите себя в списке. В Happ нажмите <b>+</b> → <b>Сканировать QR</b> и наведите камеру на свой код. С этого же устройства проще нажать «Добавить в Happ».</p>
    <p class="sub">Ссылка личная — она и есть ваш ключ доступа. Не пересылайте её дальше.</p>
${role.profiles.map(profileCard).join('\n')}
    <p class="sub" style="margin-top:16px">После добавления откройте профиль и <b>включите</b> подключение — при первом запуске система спросит разрешение на VPN, его нужно дать.</p>
  </section>`;
}

function routingSection(role) {
  const link = escapeHtml(role.routing.link);
  return `<section class="card">
    <p class="step">Шаг 3</p>
    <h2>Маршрутизация «РФ мимо VPN»</h2>
    <p>Отсканируйте второй QR или нажмите кнопку — Happ добавит и сразу включит профиль маршрутизации.</p>
    <img class="qr" src="${escapeHtml(role.routing.qr)}" alt="QR-код профиля маршрутизации" width="320" height="320">
    <div class="actions"><a class="btn primary" href="${link}">Добавить маршрутизацию в Happ</a><button class="btn" type="button" data-copy="${link}">Скопировать ссылку</button></div>
    <p style="margin-top:14px">После этого российские сайты и приложения пойдут напрямую, мимо VPN: банки, госуслуги и маркетплейсы перестанут ругаться на вход с иностранного IP, а зарубежные сервисы продолжат работать через туннель. Заодно меньше трафика идёт через сервер — всё быстрее.</p>
  </section>`;
}

function manualSection(role) {
  if (!role.manual.length) return '';
  const blocks = role.manual
    .map(
      (block) => `    ${block.label ? `<h3>${escapeHtml(block.label)}</h3>` : ''}
      <div class="scroll">
        <table>
          <tbody>
${block.params
  .map(
    ([key, value]) =>
      `            <tr><th>${escapeHtml(key)}</th><td><code>${escapeHtml(value)}</code></td></tr>`
  )
  .join('\n')}
          </tbody>
        </table>
      </div>`
    )
    .join('\n');
  return `<section class="card">
    <h2>Ручной ввод</h2>
    <p class="sub">Нужно только если клиент не умеет сканировать QR. Протокол — VLESS + Reality + Vision. UUID берётся из вашей персональной ссылки выше.</p>
${blocks}
  </section>`;
}

function troublesSection() {
  return `<section class="card">
    <h2>Если не работает</h2>
    <ol>
      <li><b>Проверьте, что VPN действительно включён.</b> Добавить профиль — не то же самое, что подключиться: нужно нажать кнопку подключения и разрешить системе создать VPN-конфигурацию (запрос появляется один раз). Без этого разрешения трафик идёт напрямую, а профиль выглядит добавленным.</li>
      <li><b>Судите по реальным сайтам, а не по «пингу» в приложении.</b> Встроенная проверка задержки открывает голое TCP-соединение без TLS-рукопожатия, сервер такой запрос отбрасывает — и она показывает таймаут на полностью рабочем туннеле. Откройте любой заблокированный сайт: грузится — значит всё в порядке.</li>
      <li><b>При ручном вводе сверьте параметр <code>flow</code>.</b> Если он не совпадает с серверным, Reality молча уводит вас на сайт-камуфляж: соединение открывается и тут же закрывается, ошибки нет, интернета тоже. То же касается <code>pbk</code>, <code>sid</code> и <code>sni</code> — сверяйте посимвольно или, лучше, добавляйтесь по QR.</li>
    </ol>
    <div class="note">
      <p>Не помогло — напишите, какое устройство, какой профиль и что именно происходит: «не подключается», «подключается, но сайты не грузятся» и «работает через раз» лечатся по-разному.</p>
    </div>
  </section>`;
}

export function renderPage({ role }) {
  return `<!doctype html>
<html lang="ru" data-device="ios">
<head>
${head(role.brand)}
<style>${STYLE}</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>${escapeHtml(role.brand)}</h1>
      <p class="sub">Инструкция по подключению. Занимает пару минут.</p>
    </div>
    <a class="out" href="/logout">Выйти</a>
  </header>

  <section class="card">
    <h2>Ваше устройство</h2>
    ${deviceTabs()}
    <p class="sub" style="margin:12px 0 0">Инструкция ниже подстроится под выбор.</p>
  </section>

  ${installSection()}

  ${subscriptionSection(role)}

  ${routingSection(role)}

  ${manualSection(role)}

  ${troublesSection()}
</main>
<script>${SCRIPT}</script>
</body>
</html>`;
}
