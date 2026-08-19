import QRCode from 'qrcode';

// QR рисуются на сервере и вшиваются в HTML как data:-URI.
// Никаких внешних CDN и картинок с чужих доменов: страницу открывают из
// России, где половина CDN либо тормозит, либо недоступна.

const cache = new Map(); // текст -> Promise<data:image/png;base64,...>

const OPTIONS = {
  errorCorrectionLevel: 'M',
  type: 'image/png',
  margin: 1,
  width: 320,
  color: { dark: '#111111ff', light: '#ffffffff' },
};

export function qrDataUrl(text) {
  const key = String(text);
  let pending = cache.get(key);
  if (!pending) {
    pending = QRCode.toDataURL(key, OPTIONS).catch((err) => {
      cache.delete(key); // не кэшируем провал — вдруг это разовый сбой
      throw err;
    });
    cache.set(key, pending);
  }
  return pending;
}

async function view(role, profiles, routingLink) {
  return {
    id: role.id,
    brand: role.brand,
    manual: role.manual,
    profiles: await Promise.all(profiles.map(async (p) => ({ ...p, qr: await qrDataUrl(p.sub) }))),
    routing: { link: routingLink, qr: await qrDataUrl(routingLink) },
  };
}

/**
 * Готовит данные для рендера одной роли: профили с QR + QR для routing-ссылки.
 * Результат кэшируется целиком при первом запросе роли — профилей мало.
 */
const roleCache = new Map();

export function buildRoleView(role, routingLink) {
  let pending = roleCache.get(role.id);
  if (!pending) {
    pending = view(role, role.profiles, routingLink).catch((err) => {
      roleCache.delete(role.id);
      throw err;
    });
    roleCache.set(role.id, pending);
  }
  return pending;
}

/**
 * То же самое для персональной ссылки — но в объект кладётся ровно один
 * профиль. Дальше по конвейеру чужих данных просто нет, скрывать нечего.
 * Кэш по токену: у каждого человека свой набор QR.
 */
const profileCache = new Map();

export function buildProfileView(role, profile, routingLink) {
  let pending = profileCache.get(profile.token);
  if (!pending) {
    pending = view(role, [profile], routingLink).catch((err) => {
      profileCache.delete(profile.token);
      throw err;
    });
    profileCache.set(profile.token, pending);
  }
  return pending;
}
