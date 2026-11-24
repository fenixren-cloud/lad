// dates.js — календарные дни для журнала, серии и повторений. День — строка «ГГГГ-ММ-ДД» по местному времени
// (занятие в 00:30 — это уже новый день там, где ты живёшь, а не по Гринвичу). Чистая логика.

const pad = n => String(n).padStart(2, '0');

/** «2026-11-24» — местный день даты */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** День → дата в полдень (так переход на летнее время не сдвигает день) */
export const dayDate = day => { const [y, m, dd] = String(day).split('-').map(Number); return new Date(y, (m || 1) - 1, dd || 1, 12); };

/** День + n дней */
export const addDays = (day, n) => { const d = dayDate(day); d.setDate(d.getDate() + n); return localDay(d); };

/** Сколько дней от a до b (b позже — положительное) */
export const daysBetween = (a, b) => Math.round((dayDate(b).getTime() - dayDate(a).getTime()) / 86400000);

/** Похоже ли на день «ГГГГ-ММ-ДД» */
export const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** «24 ноября», «пн, 24 ноября» */
export function dayLabel(day, { weekday = false } = {}) {
  const s = new Intl.DateTimeFormat('ru-RU', { ...(weekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'long' }).format(dayDate(day));
  return s;
}
