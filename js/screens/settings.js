// settings.js — экран настроек: глобальные переключатели, громкость, проверка звука, хранилище, «О приложении».
// Те же переключатели (строй, подписи) потом появятся прямо над грифом — там, где они нужны.
import { h, bindText } from '../ui/dom.js';
import { screenHeader, segmented, card, button } from '../ui/components.js';
import { disposer } from '../core/signal.js';
import { CHOICES, RANGES } from '../core/settings.js';
import { settings, setSetting, settingSignal } from '../app/state.js';
import { store } from '../app/store.js';
import { APP_VERSION } from '../app/version.js';

/** Звуки для проверки: что сыграть и как подписать */
const SOUNDS = [
  { id: 'a2', label: 'Ля · A2', play: i => i.guitar.play(45, undefined, { choke: true }) },
  { id: 'power', label: 'Пауэр-аккорд', play: (i, s) => (s.tuning === 'dropd' ? i.guitar.strum([38, 45, 50]) : i.guitar.strum([40, 47, 52])) },
  { id: 'bass', label: 'Бас · ре', play: i => i.bass.play(38, undefined, { choke: true }) },
  { id: 'drums', label: 'Барабаны', play: () => {} },
];

/** Такт рока со сбивкой по томам и крэш: [голос, доля (120 BPM), сила] */
const FILL = [['k', 0], ['h', 0], ['h', 0.5, 0.65], ['s', 1], ['h', 1], ['h', 1.5, 0.65], ['k', 1.5], ['k', 2], ['h', 2], ['h', 2.5, 0.65],
  ['t1', 3], ['t1', 3.25, 0.8], ['t2', 3.5], ['t2', 3.75, 0.8], ['c', 4], ['k', 4]];

async function playFill(status) {
  const [{ unlockAudio }, { loadDrumKit }, { playVoice }] = await Promise.all([import('../audio/engine.js'), import('../audio/drumkit.js'), import('../audio/percussion.js')]);
  const a = await unlockAudio();
  if (!a) { status.textContent = 'Без звука: в этом браузере нет Web Audio.'; return; }
  status.textContent = 'Загружаю барабаны…';
  const ok = await loadDrumKit(a.ctx);
  const t0 = a.ctx.currentTime + 0.05;
  for (const [v, at, g = 1] of FILL) playVoice(a.ctx, a.master, String(v), 'drums', t0 + Number(at) * 0.5, Number(g) * 0.8);
  status.textContent = ok ? 'Звучат барабаны: бочка, малый, хай-хэт, томы и крэш.' : 'Записи барабанов не загрузились — звучит синтез.';
}

function soundCheck() {
  const status = h('p', { class: 'status muted', 'aria-live': 'polite' }, 'Нажми — услышишь сэмплы гитары и баса (в выбранном звуке и строе) и барабаны.');
  const run = async s => {
    if (s.id === 'drums') return playFill(status);
    const { prepareInstruments } = await import('../audio/instruments.js');
    const inst = await prepareInstruments(msg => { status.textContent = msg; });
    if (!inst) return;
    s.play(inst, settings.value);
    status.textContent = `Звучит: ${s.label}${s.id === 'power' ? (settings.value.tuning === 'dropd' ? ' D5 (Drop D)' : ' E5') : ''}, ${settings.value.tone === 'dist' ? 'перегруз' : 'чистый звук'}.`;
  };
  return h('div', null,
    h('div', { class: 'row' }, ...SOUNDS.map(s => button({ label: s.label, onclick: () => run(s), attrs: { dataset: { sound: s.id } } }))),
    status);
}

/** Раскрывающийся текст лицензии из app/licenses (грузится при открытии) */
function licenseBlock(title, file) {
  const pre = h('pre', { class: 'license' });
  const details = /** @type {HTMLDetailsElement} */ (h('details', null, h('summary', null, title), pre));
  details.addEventListener('toggle', async () => {
    if (!details.open || pre.textContent) return;
    try {
      const { loadBytes } = await import('../audio/assets.js');
      pre.textContent = new TextDecoder().decode(await loadBytes(`licenses/${file}`));
    } catch {
      pre.textContent = `Текст лицензии лежит в файле licenses/${file} рядом с приложением.`;
    }
  });
  return details;
}

export function render() {
  const d = disposer();
  const choice = key => {
    const c = CHOICES[key];
    const sig = settingSignal(key);
    return h('div', { class: 'setting' },
      h('div', { class: 'setting-text' }, h('b', { id: `set-${key}` }, c.title), h('span', { class: 'muted' }, c.hint)),
      segmented({ label: c.title, name: key, options: c.options, sig, onchange: v => setSetting(key, v) }));
  };

  const vol = RANGES.volume;
  const volValue = h('output', { for: 'set-volume' });
  const volInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'range', id: 'set-volume', min: vol.min, max: vol.max, step: vol.step, value: settings.value.volume,
    'aria-label': 'Громкость', oninput: e => setSetting('volume', Number(e.target.value)),
  }));
  d.add(bindText(volValue, settingSignal('volume'), v => `${Math.round(v * 100)} %`));

  const s = store();
  const el = h('div', { class: 'screen settings' },
    screenHeader({ eyebrow: 'Лад', title: 'Настройки', back: '#/today' }),
    card({ title: 'Гитара и гриф', id: 'set-neck' }, choice('tuning'), choice('notation'), choice('labels'), choice('orientation'), choice('terms')),
    card({ title: 'Звук', id: 'set-sound' }, choice('tone'),
      h('div', { class: 'setting' }, h('div', { class: 'setting-text' }, h('b', null, 'Громкость'), h('span', { class: 'muted' }, 'В тихой квартире и в наушниках часто хватает половины.')),
        h('div', { class: 'range-row' }, volInput, volValue)),
      soundCheck()),
    card({ title: 'Вид', id: 'set-look' }, choice('theme')),
    card({ title: 'Данные', id: 'set-data' },
      h('p', { class: s.persistent ? 'muted' : 'warn' }, s.persistent ? 'Настройки и прогресс сохраняются в этом браузере.' : s.problem),
      h('a', { class: 'btn btn-ghost', href: '#/progress/data' }, 'Мои данные: копия и восстановление')),
    card({ title: 'О приложении', id: 'set-about' },
      h('p', null, `«Лад» — тренер для занятий на электрогитаре. Версия ${APP_VERSION}.`),
      h('p', { class: 'muted' }, 'Звук с микрофона обрабатывается только на этом устройстве и никуда не отправляется.'),
      h('p', { class: 'muted' }, 'Сэмплы гитары и баса — проект tonejs-instruments (Nicholaus Brosowsky), лицензия ',
        h('a', { href: 'https://creativecommons.org/licenses/by/3.0/', rel: 'noopener', target: '_blank' }, 'CC BY 3.0'),
        '. Изменения: пропуск тишины в начале, бас укорочен до 3,2 с.'),
      h('p', { class: 'muted' }, 'Барабаны — набор Virtuosity Drums (Versilian Studios), общественное достояние (CC0 1.0). ',
        'Взято 15 ударов (20 записей с разных микрофонов): микрофоны сведены в моно, удары укорочены с затуханием.'),
      h('p', { class: 'muted' }, 'Шрифт Onest — The Onest Project Authors, SIL Open Font License 1.1.'),
      licenseBlock('Лицензия шрифта Onest (SIL OFL 1.1)', 'OFL-Onest.txt'),
      licenseBlock('Лицензия записей барабанов (CC0 1.0)', 'CC0-1.0.txt')));
  return { el, title: 'Настройки', dispose: () => d.dispose() };
}
