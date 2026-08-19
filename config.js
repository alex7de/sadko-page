// Вся конфигурация приходит из переменных окружения.
// В репозитории не должно быть ни одного реального адреса, ключа или пароля.

const ROLES = ['sadko', 'alexde'];

const ENV_KEYS = {
  sadko: {
    password: 'PAGE_PASSWORD_SADKO',
    profiles: 'PROFILES_SADKO_JSON',
    manual: 'MANUAL_SADKO_JSON',
    brand: 'BRAND_SADKO',
    defaultBrand: 'Садко-VPN',
  },
  alexde: {
    password: 'PAGE_PASSWORD_ALEXDE',
    profiles: 'PROFILES_ALEXDE_JSON',
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

function parseProfiles(raw, envName, errors) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (e) {
    errors.push(`${envName}: невалидный JSON (${e.message})`);
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push(`${envName}: ожидается JSON-массив вида [{"name":"...","sub":"..."}]`);
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
    profiles.push({
      name: item.name.trim(),
      sub: item.sub.trim(),
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
  for (const role of ROLES) {
    const keys = ENV_KEYS[role];
    const password = env[keys.password];
    const profilesRaw = env[keys.profiles];
    if (!password || !password.trim()) {
      errors.push(`не задана обязательная переменная ${keys.password}`);
    }
    if (!profilesRaw || !profilesRaw.trim()) {
      errors.push(`не задана обязательная переменная ${keys.profiles}`);
    }
    const profiles = profilesRaw ? parseProfiles(profilesRaw, keys.profiles, errors) : [];
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

  // Одинаковые пароли у ролей — молчаливая утечка: roleForPassword вернёт последнюю
  // совпавшую роль, и вошедший под «своим» паролем увидит чужие конфиги.
  const given = ROLES.map((r) => roles[r].password).filter((v) => v && v.trim());
  if (given.length === ROLES.length && new Set(given).size !== given.length) {
    errors.push('пароли ролей должны различаться: одинаковые значения дали бы одной группе доступ к конфигам другой');
  }

  const port = Number.parseInt(env.PORT || '3000', 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    errors.push(`PORT: ожидается число 1..65535, получено ${JSON.stringify(env.PORT)}`);
  }

  if (errors.length) fail(errors);

  return {
    port,
    sessionSecret: env.SESSION_SECRET,
    routingLink: env.ROUTING_LINK.trim(),
    cookieSecure: env.COOKIE_INSECURE !== '1',
    trustProxy: env.TRUST_PROXY === '1',
    roles,
    roleIds: ROLES,
  };
}

export { ROLES };
