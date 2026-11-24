// settings.js — глобальные настройки: какие бывают, значения по умолчанию, проверка. Чистая логика.
// Хранятся через app/store.js, применяются в app/state.js.

/**
 * Перечисляемые настройки: значения по порядку, подписи и короткое объяснение — для экрана настроек
 * и для быстрых переключателей прямо над грифом.
 */
export const CHOICES = Object.freeze({
  tuning: {
    title: 'Строй',
    hint: 'Drop D: 6-я струна опущена до ре — пауэр-аккорд от неё берётся одним пальцем.',
    options: [['std', 'Standard E'], ['dropd', 'Drop D']],
    default: 'std',
  },
  tone: {
    title: 'Звук гитары',
    hint: 'Как звучат примеры: чисто или с перегрузом.',
    options: [['clean', 'Чистый'], ['dist', 'Перегруз']],
    default: 'clean',
  },
  notation: {
    title: 'Нотация',
    hint: 'В немецкой нотации си — это H, а B — си-бемоль.',
    options: [['german', '… A H'], ['english', '… A B']],
    default: 'german',
  },
  labels: {
    title: 'Подписи на грифе',
    hint: 'Ступени показывают роль ноты: 1 — тоника, ♭3 — малая терция…',
    options: [['degrees', 'Ступени'], ['notes', 'Ноты']],
    default: 'degrees',
  },
  orientation: {
    title: 'Гриф',
    hint: 'Вертикальный удобнее на узком экране, горизонтальный — как в учебниках.',
    options: [['horizontal', 'Горизонтально'], ['vertical', 'Вертикально']],
    default: 'horizontal',
  },
  terms: {
    title: 'Термины',
    hint: 'Немецкие: Dur, Moll, Grundton, Terz, Quinte, Vorzeichen, Quintenzirkel.',
    options: [['ru', 'Русские'], ['de', 'Немецкие']],
    default: 'ru',
  },
  theme: {
    title: 'Тема',
    hint: 'Тёмная — для вечера и сцены, светлая — для дневного света, «Авто» — как в системе.',
    options: [['dark', 'Тёмная'], ['light', 'Светлая'], ['auto', 'Авто']],
    default: 'dark',
  },
});

/** Числовые настройки */
export const RANGES = Object.freeze({
  volume: { title: 'Громкость', min: 0, max: 1, step: 0.05, default: 0.8 },
});

/** @typedef {{ tuning: string, tone: string, notation: string, labels: string, orientation: string, terms: string, theme: string, volume: number }} Settings */

/** @returns {Settings} */
export function defaultSettings() {
  /** @type {any} */
  const out = {};
  for (const [k, c] of Object.entries(CHOICES)) out[k] = c.default;
  for (const [k, r] of Object.entries(RANGES)) out[k] = r.default;
  return out;
}

/**
 * Привести что угодно (старые или битые данные) к правильным настройкам: неизвестное — по умолчанию.
 * @returns {Settings}
 */
export function normalizeSettings(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = defaultSettings();
  for (const [k, c] of Object.entries(CHOICES)) if (c.options.some(([v]) => v === src[k])) out[k] = src[k];
  for (const [k, r] of Object.entries(RANGES)) {
    const v = Number(src[k]);
    if (src[k] !== null && src[k] !== '' && Number.isFinite(v)) out[k] = Math.min(r.max, Math.max(r.min, v));
  }
  return out;
}

/** Тема на экране: «авто» превращается в тёмную или светлую по системе */
export const resolveTheme = (theme, systemDark) => (theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme);
