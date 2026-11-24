// mic-panel.js — общая панель «уха» для тюнера, теста ритма и лестницы темпа:
// выбор входа и канала, уровень сигнала, понятная ошибка с советом. Настройки входа запоминаются.
import { h } from './dom.js';
import { icon } from './icons.js';
import { segmented } from './components.js';
import { signal } from '../core/signal.js';
import { store } from '../app/store.js';

/**
 * @param {{ pitch?: boolean, onsets?: boolean, ignoreSelf?: boolean, onReading?: Function, onOnset?: Function, onStart?: Function, onStop?: Function }} opts
 */
export function createMicPanel(opts) {
  const prefs = { deviceId: '', channel: 'auto', ...store().get('mic', {}) };
  const running = signal(false);
  const channel = signal(String(prefs.channel));
  /** @type {any} */
  let session = null;
  let mic = null;

  const select = /** @type {HTMLSelectElement} */ (h('select', { class: 'input-select', 'aria-label': 'Вход', onchange: () => { save({ deviceId: select.value }); if (running.value) start(); } },
    h('option', { value: '' }, 'Вход по умолчанию')));
  const bars = [0, 1, 2, 3, 4, 5].map(() => h('i'));
  const meter = h('span', { class: 'level', 'aria-hidden': 'true' }, ...bars);
  const chanNote = h('span', { class: 'muted chan-note' });
  const error = h('div', { class: 'mic-error', role: 'alert', hidden: true });
  const save = patch => { Object.assign(prefs, patch); store().set('mic', { ...prefs }); };

  const channelSeg = segmented({
    label: 'Канал звуковой карты', name: 'channel',
    options: [['auto', 'Авто'], ['0', 'Вход 1'], ['1', 'Вход 2']],
    sig: channel,
    onchange: v => { channel.value = v; save({ channel: v }); session?.setChannel(v === 'auto' ? 'auto' : Number(v)); },
  });

  async function fillInputs() {
    const list = await mic.listInputs();
    const keep = prefs.deviceId;
    select.replaceChildren(h('option', { value: '' }, 'Вход по умолчанию'), ...list.filter(d => d.id && d.id !== 'default').map(d => h('option', { value: d.id }, d.label)));
    select.value = list.some(d => d.id === keep) ? keep : '';
  }

  function level({ rms, channel: ch, channels }) {
    const db = 20 * Math.log10(Math.max(rms, 1e-6)); // −60…0 дБ
    const lit = Math.max(0, Math.min(6, Math.round((db + 60) / 9)));
    bars.forEach((b, i) => b.classList.toggle('on', i < lit));
    chanNote.textContent = channels > 1 ? `слышу вход ${ch + 1}` : '';
  }

  async function start() {
    error.hidden = true;
    mic ??= await import('../audio/mic.js');
    try {
      session = await mic.startMic({
        deviceId: prefs.deviceId || undefined,
        channel: channel.value === 'auto' ? 'auto' : Number(channel.value),
        pitch: opts.pitch, onsets: opts.onsets, ignoreSelf: opts.ignoreSelf,
        onReading: opts.onReading, onOnset: opts.onOnset, onLevel: level,
        onEnded: reason => {
          session = null;
          running.value = false;
          opts.onStop?.(reason);
          if (reason === 'ended') showError('notfound');
        },
      });
      running.value = true;
      opts.onStart?.(session);
      fillInputs();
    } catch (e) {
      session = null;
      running.value = false;
      showError(e && e.code ? e.code : 'other');
    }
  }
  function showError(code) {
    error.replaceChildren(icon('info', 20), h('span', null, mic?.MIC_HELP[code] || 'Не получилось включить микрофон.'));
    error.hidden = false;
  }
  function stop() {
    session?.stop();
    session = null;
    running.value = false;
    bars.forEach(b => b.classList.remove('on'));
    opts.onStop?.('stop');
  }

  const el = h('div', { class: 'mic-panel' },
    h('div', { class: 'mic-row' }, icon('sound', 20), select, meter),
    h('div', { class: 'mic-row' }, channelSeg, chanNote),
    error);
  return { el, start, stop, running, get session() { return session; }, dispose: stop };
}
