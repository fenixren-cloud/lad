// backup.js — резервная копия файлом: имя файла и проверка того, что открыли. Чистая логика.
// Формат: { app: 'lad', schema, created, data: { ключ: значение } }.

export const BACKUP_APP = 'lad';
const KEY = /^[A-Za-z0-9_.-]{1,48}$/;
const pad = n => String(n).padStart(2, '0');

/** «lad-2026-11-23.json» */
export const backupFileName = (d = new Date()) => `lad-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;

/**
 * Разобрать файл копии. Ошибки — понятными словами.
 * @param {string} text
 * @param {number} schema версия схемы приложения
 * @returns {{ ok: true, backup: { app: string, schema: number, created: string | null, data: Record<string, any> } } | { ok: false, error: string }}
 */
export function parseBackup(text, schema) {
  let obj;
  try {
    obj = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: 'Это не файл резервной копии: внутри не JSON.' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'Это не файл резервной копии.' };
  if (obj.app === 'gitarnyy-krug') return { ok: false, error: 'Это копия «Гитарного круга» — её открывает «Перенос из „Гитарного круга“».' };
  if (obj.app !== BACKUP_APP) return { ok: false, error: 'Это файл не от «Лада».' };
  if (!Number.isInteger(obj.schema) || obj.schema < 1) return { ok: false, error: 'Файл повреждён: нет версии данных.' };
  if (obj.schema > schema) return { ok: false, error: 'Копия сделана более новой версией приложения — сначала обнови приложение.' };
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) return { ok: false, error: 'Файл повреждён: нет данных.' };
  if (Object.keys(obj.data).some(k => !KEY.test(k) || k.startsWith('__'))) return { ok: false, error: 'Файл повреждён: непонятные записи.' };
  const created = typeof obj.created === 'string' && !Number.isNaN(Date.parse(obj.created)) ? obj.created : null;
  return { ok: true, backup: { app: BACKUP_APP, schema: obj.schema, created, data: obj.data } };
}
