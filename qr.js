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

// В QR и в кнопку идёт ссылка на /s/<токен> этой же страницы, а не прямой адрес
// подписки на VPN-сервере. Причина практическая: сервер отдаёт подписки на порту
// 8444, и мобильные операторы его режут — у пользователя страница открывалась,
// а конфиг не подтягивался. Через 443 проходит везде.
async function view(role, profiles, routingLink, origin) {
  const subUrl = (p) => (origin ? `${origin}/s/${p.token}` : p.sub);
  return {
    id: role.id,
    brand: role.brand,
    manual: role.manual,
    profiles: await Promise.all(
      profiles.map(async (p) => ({ ...p, sub: subUrl(p), qr: await qrDataUrl(subUrl(p)) })),
    ),
    routing: { link: routingLink, qr: await qrDataUrl(routingLink) },
  };
}

/**
 * Готовит данные для рендера одной роли: профили с QR + QR для routing-ссылки.
 * Результат кэшируется целиком при первом запросе роли — профилей мало.
 */
const roleCache = new Map();

export function buildRoleView(role, routingLink, origin) {
  const key = `${role.id}|${origin}`;
  let pending = roleCache.get(key);
  if (!pending) {
    pending = view(role, role.profiles, routingLink, origin).catch((err) => {
      roleCache.delete(key);
      throw err;
    });
    roleCache.set(key, pending);
  }
  return pending;
}

/**
 * То же самое для персональной ссылки — но в объект кладётся ровно один
 * профиль. Дальше по конвейеру чужих данных просто нет, скрывать нечего.
 * Кэш по токену: у каждого человека свой набор QR.
 */
const profileCache = new Map();

export function buildProfileView(role, profile, routingLink, origin) {
  const key = `${profile.token}|${origin}`;
  let pending = profileCache.get(key);
  if (!pending) {
    pending = view(role, [profile], routingLink, origin).catch((err) => {
      profileCache.delete(key);
      throw err;
    });
    profileCache.set(key, pending);
  }
  return pending;
}
