// Вся конфигурация приходит из переменных окружения.
// В репозитории не должно быть ни одного реального адреса, ключа или пароля.

import fs from 'node:fs';

const ROLES = ['sadko', 'alexde'];

const ENV_KEYS = {
  sadko: {
    password: 'PAGE_PASSWORD_SADKO',
    profiles: 'PROFILES_SADKO_JSON',
    profilesFile: 'PROFILES_SADKO_FILE',
    manual: 'MANUAL_SADKO_JSON',
    brand: 'BRAND_SADKO',
    defaultBrand: 'Садко-VPN',
  },
  alexde: {
    password: 'PAGE_PASSWORD_ALEXDE',
    profiles: 'PROFILES_ALEXDE_JSON',
    profilesFile: 'PROFILES_ALEXDE_FILE',
    manual: 'MANUAL_ALEXDE_JSON',
    brand: 'BRAND_ALEXDE',
    defaultBrand: 'ALEXDE VPN',
  },
};

function fail(messages) {
  console.error('\nsadko-page: не могу стартовать, конфигурация неполная.\n');
  for (const m of messages) console.error('  - ' + m);
  console.error('\nСписок переменных окружения — в README.md.\n');
  process.exit(1);
}

// Токен персональной ссылки: ровно 32 hex-символа, как `openssl rand -hex 16`.
const TOKEN_RE = /^[0-9a-f]{32}$/;

// В сообщениях об ошибках токен показывается обрезанным: старт пишет их в
// stderr платформы, а токен — это ключ доступа к чужому конфигу.
const shortToken = (token) => `${String(token).slice(0, 8)}…`;

function parseProfiles(raw, envName, errors, seenTokens) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    errors.push(`${envName}: невалидный JSON (${e.message})`);
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push(`${envName}: ожидается JSON-массив вида [{"name":"...","sub":"...","token":"..."}]`);
    return [];
  }
  const profiles = [];
  value.forEach((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${envName}[${i}]: ожидается объект`);
      return;
    }
    if (typeof item.name !== 'string' || !item.name.trim()) {
      errors.push(`${envName}[${i}]: отсутствует непустое поле "name"`);
      return;
    }
    if (typeof item.sub !== 'string' || !item.sub.trim()) {
      errors.push(`${envName}[${i}]: отсутствует непустое поле "sub"`);
      return;
    }
    const name = item.name.trim();
    const where = `${envName}[${i}] («${name}»)`;
    if (typeof item.token !== 'string' || !item.token.trim()) {
      errors.push(`${where}: отсутствует поле "token" — без него человеку нечего выдать, персональная ссылка /u/<token> не построится`);
      return;
    }
    const token = item.token.trim();
    if (!TOKEN_RE.test(token)) {
      errors.push(`${where}: "token" должен быть 32 hex-символа (0-9a-f), получено ${JSON.stringify(token)}; сгенерировать: openssl rand -hex 16`);
      return;
    }
    // Уникальность — глобальная, поверх всех ролей: совпадение токенов
    // означало бы, что по одной ссылке отдаётся чужой конфиг.
    const clash = seenTokens.get(token);
    if (clash) {
      errors.push(
        `токены профилей должны различаться: ${shortToken(token)} задан и в ${clash.envName} («${clash.name}»), и в ${envName} («${name}») — по одной персональной ссылке открывался бы конфиг другого человека`
      );
      return;
    }
    seenTokens.set(token, { envName, name });
    profiles.push({
      name,
      sub: item.sub.trim(),
      token,
      note: typeof item.note === 'string' ? item.note.trim() : '',
    });
  });
  return profiles;
}

function parseManual(raw, envName, errors) {
  if (!raw || !raw.trim()) return [];
  let value;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    errors.push(`${envName}: невалидный JSON (${e.message})`);
    return [];
  }
  const list = Array.isArray(value) ? value : [value];
  const blocks = [];
  list.forEach((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${envName}[${i}]: ожидается объект с параметрами`);
      return;
    }
    const { label, ...rest } = item;
    const params = Object.entries(rest)
      .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
      .map(([k, v]) => [String(k), String(v)]);
    if (!params.length) return;
    blocks.push({ label: typeof label === 'string' ? label.trim() : '', params });
  });
  return blocks;
}

export function loadConfig(env = process.env) {
  const errors = [];

  for (const name of ['SESSION_SECRET', 'ROUTING_LINK']) {
    if (!env[name] || !env[name].trim()) errors.push(`не задана обязательная переменная ${name}`);
  }

  const roles = {};
  const skipped = [];
  const seenTokens = new Map(); // token -> { envName, name } — общая на все роли
  for (const role of ROLES) {
    const keys = ENV_KEYS[role];
    const password = env[keys.password];
    // Список профилей длинный: 27 человек дают больше четырёх тысяч символов, а поля
    // переменных в панелях бывают короче. Поэтому его можно положить файлом и указать
    // путь — так работает любое монтирование конфигов или секретов.
    let profilesRaw = env[keys.profiles];
    const profilesPath = (env[keys.profilesFile] || '').trim();
    if (profilesPath) {
      if (profilesRaw && profilesRaw.trim()) {
        errors.push(`заданы одновременно ${keys.profiles} и ${keys.profilesFile} — оставьте что-то одно, иначе непонятно, что считать актуальным`);
      }
      try {
        profilesRaw = fs.readFileSync(profilesPath, 'utf8');
      } catch (e) {
        errors.push(`${keys.profilesFile}: не удалось прочитать ${profilesPath} — ${e.code || e.message}`);
        profilesRaw = '';
      }
    }

    // Роль можно не настраивать: группа появляется позже (например, когда выдадут
    // второй IP). Но пароль и профили задаются только парой — иначе роль либо
    // недоступна при живых конфигах, либо пускает в пустоту.
    const configured = Boolean((password && password.trim()) || (profilesRaw && profilesRaw.trim()) || profilesPath);
    if (!configured) {
      skipped.push(role);
      continue;
    }
    if (!password || !password.trim()) {
      errors.push(`задан ${keys.profiles}, но не задан ${keys.password}`);
    }
    if (!profilesRaw || !profilesRaw.trim()) {
      errors.push(`задан ${keys.password}, но не задан ни ${keys.profiles}, ни ${keys.profilesFile}`);
    }
    const profiles = profilesRaw ? parseProfiles(profilesRaw, keys.profiles, errors, seenTokens) : [];
    if (profilesRaw && profiles.length === 0 && !errors.length) {
      errors.push(`${keys.profiles}: список профилей пуст`);
    }
    roles[role] = {
      id: role,
      password: password || '',
      brand: (env[keys.brand] || '').trim() || keys.defaultBrand,
      profiles,
      manual: parseManual(env[keys.manual], keys.manual, errors),
    };
  }

  if (Object.keys(roles).length === 0) {
    errors.push('не настроена ни одна роль: задайте хотя бы пару PAGE_PASSWORD_* и PROFILES_*_JSON');
  }

  // Одинаковые пароли у ролей — молчаливая утечка: roleForPassword вернёт последнюю
  // совпавшую роль, и вошедший под «своим» паролем увидит чужие конфиги.
  const given = Object.values(roles).map((r) => r.password);
  if (given.length > 1 && new Set(given).size !== given.length) {
    errors.push('пароли ролей должны различаться: одинаковые значения дали бы одной группе доступ к конфигам другой');
  }

  const port = Number.parseInt(env.PORT || '3000', 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push(`PORT: ожидается число 1..65535, получено ${JSON.stringify(env.PORT)}`);
  }

  if (errors.length) fail(errors);

  // Индекс строится один раз на старте: на запросе /u/:token нужен один
  // Map.get, а не перебор всех профилей всех ролей.
  const byToken = new Map();
  for (const role of Object.values(roles)) {
    for (const profile of role.profiles) byToken.set(profile.token, { role, profile });
  }

  return {
    port,
    sessionSecret: env.SESSION_SECRET,
    routingLink: env.ROUTING_LINK.trim(),
    cookieSecure: env.COOKIE_INSECURE !== '1',
    trustProxy: env.TRUST_PROXY === '1',
    roles,
    roleIds: Object.keys(roles),
    byToken,
  };
}

export { ROLES, TOKEN_RE };
