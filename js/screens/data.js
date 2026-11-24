// data.js — «Мои данные»: резервная копия файлом, восстановление и «вернуть как было».
// Так же переносятся данные между телефоном и ноутбуком.
import { h } from '../ui/dom.js';
import { screenHeader, card, button } from '../ui/components.js';
import { parseBackup, backupFileName } from '../core/backup.js';
import { parseV2Backup, summarizeV2, describeV2, fromV2, V2_PREFIX } from '../core/migrate.js';
import { normalizeSettings } from '../core/settings.js';
import { store, readForeign } from '../app/store.js';
import { settings } from '../app/state.js';
import { applyTheme } from '../app/theme.js';
import { today } from '../app/activity.js';

/** После восстановления или переноса — настройки снова из хранилища (строй, нотация, тема) */
function reloadSettings() {
  settings.value = normalizeSettings(store().get('settings'));
  applyTheme();
}

/** @param {import('../core/routes.js').Route} r */
export function render(r) {
  const s = store();
  const status = h('p', { class: 'status muted', 'aria-live': 'polite' });
  const undo = button({ kind: 'ghost', icon: 'undo', label: 'Вернуть как было', onclick: () => {
    if (s.undoRestore()) { reloadSettings(); status.textContent = 'Готово: данные снова такие, какими были до восстановления или переноса.'; refresh(); }
  }, attrs: { 'data-action': 'undo' } });
  const refresh = () => { undo.hidden = !s.canUndoRestore; };

  const save = () => {
    const blob = new Blob([JSON.stringify(s.snapshot(), null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: backupFileName() });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.getAttribute('href') || ''), 4000);
    status.textContent = `Сохранён файл ${backupFileName()}. Его можно открыть здесь же или на другом устройстве.`;
  };

  const file = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'restore-file', onchange: async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    const res = parseBackup(await f.text(), s.schema);
    if ('error' in res) { status.textContent = res.error; return; }
    s.restore(res.backup);
    reloadSettings();
    status.textContent = `Восстановлено из копии${res.backup.created ? ' от ' + new Date(res.backup.created).toLocaleDateString('ru-RU') : ''}. Если что-то не так — есть «Вернуть как было».`;
    refresh();
  } }));

  const el = h('div', { class: 'screen' },
    screenHeader({ eyebrow: 'Прогресс', title: 'Мои данные', back: '#/progress' }),
    card({ title: 'Резервная копия', id: 'backup' },
      h('p', { class: 'muted' }, 'Настройки, рекорды, риффы и история — одним файлом. Сохрани его, чтобы ничего не потерять, или чтобы перенести всё между телефоном и ноутбуком.'),
      h('div', { class: 'stack' },
        button({ kind: 'ghost', icon: 'download', label: 'Сохранить копию', onclick: save, attrs: { 'data-action': 'save' } }),
        h('label', { class: 'btn btn-ghost', for: 'restore-file', 'data-action': 'restore', tabindex: '0', role: 'button', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } },
          h('span', null, 'Восстановить из файла…')),
        file,
        undo),
      status),
    migrateCard(),
    card({ title: 'Где хранится', id: 'where' },
      h('p', { class: s.persistent ? 'muted' : 'warn' }, s.persistent ? 'В этом браузере на этом устройстве. Очистка данных сайта сотрёт их — поэтому полезна копия.' : s.problem)));
  refresh();
  if (r?.query?.migrate) requestAnimationFrame(() => el.querySelector('#migrate')?.scrollIntoView({ block: 'start' }));
  return { el, title: 'Мои данные' };

  // ---------- перенос из «Гитарного круга» ----------
  function migrateCard() {
    const mstatus = h('div', { class: 'mstatus', 'aria-live': 'polite' });
    const withSettings = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: true, 'data-option': 'settings' }));
    const run = (v2, source) => {
      const { patch, report } = fromV2(v2, s.snapshot().data, { settings: withSettings.checked, day: today(), source });
      // нечего переносить — данные не трогаем (и «вернуть как было» остаётся прежним)
      if (!Object.keys(patch).some(k => k !== 'migratedV2')) { mstatus.replaceChildren(h('p', null, h('b', null, 'Нового для переноса нет — всё уже здесь.'))); return; }
      s.restore({ schema: s.schema, data: { ...s.snapshot().data, ...patch } });
      reloadSettings();
      mstatus.replaceChildren(...[
        h('p', null, h('b', null, report.length ? 'Перенесено:' : 'Нового для переноса нет — всё уже здесь.')),
        report.length ? h('ul', { class: 'plain-list' }, ...report.map(x => h('li', null, x))) : null,
        h('p', { class: 'muted note' }, 'Данные «Гитарного круга» остались как были. Если что-то не так — «Вернуть как было» выше.')].filter(Boolean));
      refresh();
    };
    const local = readForeign(V2_PREFIX);
    const sum = summarizeV2(local);
    const done = s.get('migratedV2');
    const localBox = sum.any
      ? h('div', { class: 'stack' },
        h('p', null, `В этом браузере: ${describeV2(sum)}.`),
        button({ kind: 'primary', label: done ? 'Перенести ещё раз' : 'Перенести мои данные', onclick: () => run(readForeign(V2_PREFIX), 'storage'), attrs: { 'data-action': 'migrate-local' } }))
      : h('p', { class: 'muted' }, 'В этом браузере данных «Гитарного круга» не нашлось. Если они на другом устройстве — сохрани там резервную копию и открой её здесь.');
    const v2file = /** @type {HTMLInputElement} */ (h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', id: 'v2-file', onchange: async () => {
      const f = v2file.files && v2file.files[0];
      v2file.value = '';
      if (!f) return;
      const res = parseV2Backup(await f.text());
      if (!res.ok) { mstatus.textContent = /** @type {any} */ (res).error; return; }
      mstatus.replaceChildren(h('p', null, `В копии${res.created ? ` от ${new Date(res.created).toLocaleDateString('ru-RU')}` : ''}: ${describeV2(summarizeV2(res.data))}.`),
        button({ kind: 'primary', label: 'Перенести из файла', onclick: () => run(res.data, 'file'), attrs: { 'data-action': 'migrate-file' } }));
    } }));
    return card({ title: 'Из «Гитарного круга»', id: 'migrate' },
      h('p', { class: 'muted' }, 'Риффы, рекорды упражнений, история теста ритма, рекорды и настройки слуха, настройки инструментов. Старые данные только читаются — ничего не удаляется. Повторный перенос ничего не задваивает.'),
      done ? h('p', { class: 'note' }, `Перенос уже был: ${done.day || ''}.`) : null,
      h('label', { class: 'check-row' }, withSettings, h('span', null, 'и общие настройки: строй, нотация, подписи, ориентация грифа')),
      localBox,
      h('label', { class: 'btn btn-ghost', for: 'v2-file', 'data-action': 'v2-file', tabindex: '0', role: 'button', onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); v2file.click(); } } },
        h('span', null, 'Открыть копию «Гитарного круга»…')),
      v2file,
      mstatus);
  }
}
