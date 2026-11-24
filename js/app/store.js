// store.js — ЕДИНСТВЕННЫЙ модуль, который трогает хранилище браузера.
//
//  • Данные лежат в localStorage под ключами «lad.<имя>», значения — JSON.
//  • У данных есть версия схемы (lad.__schema) и миграции. Перед миграцией прежние данные
//    сохраняются целиком (lad.__before-migration) — её можно откатить.
//  • Все обращения обёрнуты в try/catch. Нет хранилища (приватный режим, запрет, переполнение) —
//    приложение работает «в памяти» и честно говорит, что не сохраняет.
//  • Резервная копия файлом и восстановление с «вернуть как было».

export const PREFIX = 'lad.';
export const SCHEMA_VERSION = 1;
const META = '__schema';
const BEFORE_MIGRATION = '__before-migration';
const UNDO = '__undo-restore';
const SERVICE = new Set([META, BEFORE_MIGRATION, UNDO]);

/**
 * Миграции: по порядку, каждая поднимает данные до версии `to`. Получает объект { ключ: значение }
 * и возвращает новый. Миграции — чистые функции, проверяются в Node.
 * @type {{ to: number, run: (data: Record<string, any>) => Record<string, any> }[]}
 */
export const MIGRATIONS = [];

/** @typedef {{ getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void, key(i: number): string | null, readonly length: number }} Backend */

/** localStorage, если он есть и в него можно писать; иначе null */
export function browserBackend() {
  try {
    const ls = /** @type {any} */ (globalThis).localStorage;
    if (!ls) return null;
    const probe = PREFIX + '__probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return /** @type {Backend} */ (ls);
  } catch {
    return null;
  }
}

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * @param {{ backend?: Backend | null, version?: number, migrations?: typeof MIGRATIONS, now?: () => Date }} [opts]
 */
export function createStore({ backend = browserBackend(), version = SCHEMA_VERSION, migrations = MIGRATIONS, now = () => new Date() } = {}) {
  /** @type {Map<string, any>} */
  const mem = new Map();
  /** @type {Set<(key: string) => void>} */
  const listeners = new Set();
  let persistent = !!backend;
  /** @type {string | null} */
  let problem = backend ? null : 'Хранилище браузера недоступно: прогресс не сохранится после закрытия.';
  let readOnly = false;

  const raw = {
    get(k) { try { return backend ? backend.getItem(PREFIX + k) : null; } catch { return null; } },
    set(k, v) {
      if (!backend || readOnly) return false;
      try { backend.setItem(PREFIX + k, v); return true; } catch (e) {
        persistent = false;
        problem = /quota/i.test(String(e && /** @type {any} */ (e).name)) ? 'Хранилище переполнено: новые данные не сохраняются.' : 'Не удалось сохранить данные.';
        return false;
      }
    },
    del(k) { try { backend?.removeItem(PREFIX + k); } catch { /* не страшно */ } },
    keys() {
      const out = [];
      try {
        for (let i = 0; backend && i < backend.length; i++) {
          const k = backend.key(i);
          if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
        }
      } catch { /* нет доступа — значит, пусто */ }
      return out;
    },
  };
  const parse = s => { try { return s == null ? undefined : JSON.parse(s); } catch { return undefined; } };

  // ---------- чтение и миграция ----------
  /** @type {Record<string, any>} */
  let data = {};
  for (const k of raw.keys()) if (!SERVICE.has(k)) { const v = parse(raw.get(k)); if (v !== undefined) data[k] = v; }
  const stored = Number(parse(raw.get(META))) || (Object.keys(data).length ? 1 : version);
  let migrated = false;
  if (stored > version) {
    // данные от более новой версии приложения: читаем, но не перезаписываем
    readOnly = true;
    persistent = false;
    problem = 'Данные сохранены более новой версией приложения — обнови его, чтобы ничего не потерять.';
  } else if (stored < version) {
    raw.set(BEFORE_MIGRATION, JSON.stringify({ schema: stored, saved: now().toISOString(), data }));
    for (const m of migrations) if (m.to > stored && m.to <= version) data = m.run(clone(data));
    for (const k of raw.keys()) if (!SERVICE.has(k) && !(k in data)) raw.del(k);
    for (const [k, v] of Object.entries(data)) raw.set(k, JSON.stringify(v));
    migrated = true;
  }
  if (!readOnly) raw.set(META, JSON.stringify(version));
  for (const [k, v] of Object.entries(data)) mem.set(k, v);

  const emit = key => { for (const fn of listeners) { try { fn(key); } catch (e) { console.error(e); } } };

  const api = {
    /** Пишет ли хранилище на диск; если нет — почему */
    get persistent() { return persistent; },
    get problem() { return problem; },
    get migrated() { return migrated; },
    get schema() { return version; },

    /** Значение по ключу (копия) или запасное */
    get(key, fallback = undefined) { return mem.has(key) ? clone(mem.get(key)) : fallback; },
    set(key, value) {
      if (SERVICE.has(key)) throw new Error(`Служебный ключ: ${key}`);
      mem.set(key, clone(value));
      raw.set(key, JSON.stringify(value));
      emit(key);
    },
    /** Изменить значение функцией: update('records', r => ({ ...r, x: 1 }), {}) */
    update(key, fn, fallback = undefined) { const next = fn(api.get(key, fallback)); api.set(key, next); return next; },
    remove(key) { mem.delete(key); raw.del(key); emit(key); },
    keys() { return [...mem.keys()]; },
    /** Подписка на изменения; вернёт отписку */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** Всё содержимое — для резервной копии */
    snapshot() { return { app: 'lad', schema: version, created: now().toISOString(), data: Object.fromEntries([...mem].map(([k, v]) => [k, clone(v)])) }; },

    /**
     * Заменить все данные копией. Текущие сохраняются — их можно вернуть (undoRestore).
     * Копия старой схемы сначала проходит те же миграции.
     * @param {{ schema?: number, data: Record<string, any> }} backup уже проверенная копия (см. core/backup.js)
     */
    restore(backup) {
      raw.set(UNDO, JSON.stringify(api.snapshot()));
      let next = clone(backup.data);
      for (const m of migrations) if (m.to > (backup.schema ?? version) && m.to <= version) next = m.run(next);
      replaceAll(next);
    },
    /** Есть ли что «вернуть как было» */
    get canUndoRestore() { return parse(raw.get(UNDO)) !== undefined; },
    undoRestore() {
      const prev = parse(raw.get(UNDO));
      if (!prev) return false;
      replaceAll(prev.data);
      raw.del(UNDO);
      return true;
    },
    /** Откатить последнюю миграцию схемы (если что-то пошло не так) */
    rollbackMigration() {
      const prev = parse(raw.get(BEFORE_MIGRATION));
      if (!prev) return false;
      replaceAll(prev.data);
      raw.set(META, JSON.stringify(prev.schema));
      return true;
    },
  };

  function replaceAll(next) {
    for (const k of [...mem.keys()]) { mem.delete(k); raw.del(k); }
    for (const [k, v] of Object.entries(next || {})) if (!SERVICE.has(k)) { mem.set(k, clone(v)); raw.set(k, JSON.stringify(v)); }
    emit('*');
  }

  return api;
}

/**
 * Прочитать (только прочитать!) данные другого приложения на этом же адресе — например, «Гитарного круга»
 * (ключи gk3.*). Ничего не меняет и не удаляет. Нет хранилища — пусто.
 * @param {string} prefix например 'gk3.'
 * @param {Backend | null} [backend]
 * @returns {Record<string, any>} ключи без префикса
 */
export function readForeign(prefix, backend = browserBackend()) {
  const out = {};
  try {
    for (let i = 0; backend && i < backend.length; i++) {
      const k = backend.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try { const v = JSON.parse(backend.getItem(k) ?? 'null'); if (v !== null) out[k.slice(prefix.length)] = v; } catch { /* битая запись — пропускаем */ }
    }
  } catch { /* нет доступа — пусто */ }
  return out;
}

/** @type {ReturnType<typeof createStore> | null} */
let shared = null;
/** Общее хранилище приложения (создаётся при первом обращении) */
export function store() {
  shared ??= createStore();
  return shared;
}
