import type { Mode, SimConfig } from './sim/types';

/** API приложения, которым пользуется панель управления. */
export interface AppApi {
  cfg: SimConfig;
  isRunning(): boolean;
  playPause(): boolean;
  reset(): void;
  jam(): void;
  cycleSpeed(): number;
  toggleDiagram(): boolean;
  /** пересобрать симуляцию после структурного изменения конфига */
  structural(): void;
  /** живо изменить число машин на кольце */
  setVehicleCount(n: number): void;
  applyPreset(key: string): void;
  saveCfg(): void;
}

type Kind = 'hot' | 'structural' | 'vcount';

interface SliderDef {
  label: string;
  min: number;
  max: number;
  step: number;
  kind: Kind;
  modes: Mode[] | null;
  get(c: SimConfig): number;
  set(c: SimConfig, v: number): void;
  fmt(v: number): string;
}

const SLIDERS: { section: string; modes: Mode[] | null; items: SliderDef[] }[] = [
  {
    section: '🛣 Дорога — кольцо',
    modes: ['ring'],
    items: [
      {
        label: 'Длина кольца', min: 200, max: 2000, step: 50, kind: 'structural', modes: null,
        get: (c) => c.ringLength, set: (c, v) => (c.ringLength = v), fmt: (v) => `${v} м`,
      },
      {
        label: 'Машины (плотность)', min: 0, max: 150, step: 1, kind: 'vcount', modes: null,
        get: (c) => c.numVehicles, set: (c, v) => (c.numVehicles = v), fmt: (v) => `${v}`,
      },
      {
        label: 'Светофоры на кольце', min: 0, max: 4, step: 1, kind: 'structural', modes: null,
        get: (c) => c.ringLights, set: (c, v) => (c.ringLights = v), fmt: (v) => `${v}`,
      },
    ],
  },
  {
    section: '🛣 Дорога — магистраль',
    modes: ['arterial'],
    items: [
      {
        label: 'Перекрёстки', min: 1, max: 12, step: 1, kind: 'structural', modes: null,
        get: (c) => c.numIntersections, set: (c, v) => (c.numIntersections = v), fmt: (v) => `${v}`,
      },
      {
        label: 'Дистанция между ними', min: 60, max: 500, step: 10, kind: 'structural', modes: null,
        get: (c) => c.spacing, set: (c, v) => (c.spacing = v), fmt: (v) => `${v} м`,
      },
      {
        label: 'Поток на въезде', min: 0, max: 40, step: 1, kind: 'hot', modes: null,
        get: (c) => c.spawnPerMin, set: (c, v) => (c.spawnPerMin = v), fmt: (v) => `${v} маш/мин`,
      },
    ],
  },
  {
    section: '🚗 Водители',
    modes: null,
    items: [
      {
        label: 'Желаемая скорость', min: 20, max: 130, step: 5, kind: 'hot', modes: null,
        get: (c) => Math.round(c.idm.v0 * 3.6), set: (c, v) => (c.idm.v0 = v / 3.6), fmt: (v) => `${v} км/ч`,
      },
      {
        label: 'Интервал T (нервозность)', min: 0.6, max: 2.5, step: 0.1, kind: 'hot', modes: null,
        get: (c) => c.idm.T, set: (c, v) => (c.idm.T = v), fmt: (v) => `${v.toFixed(1)} с`,
      },
      {
        label: 'Разгон a (вялый ↔ бодрый)', min: 0.3, max: 2.5, step: 0.1, kind: 'hot', modes: null,
        get: (c) => c.idm.a, set: (c, v) => (c.idm.a = v), fmt: (v) => `${v.toFixed(1)} м/с²`,
      },
    ],
  },
  {
    section: '🚦 Светофоры',
    modes: null,
    items: [
      {
        label: 'Зелёный', min: 5, max: 60, step: 1, kind: 'hot', modes: null,
        get: (c) => c.cycle.green, set: (c, v) => (c.cycle.green = v), fmt: (v) => `${v} с`,
      },
      {
        label: 'Красный', min: 5, max: 60, step: 1, kind: 'hot', modes: null,
        get: (c) => c.cycle.red, set: (c, v) => (c.cycle.red = v), fmt: (v) => `${v} с`,
      },
      {
        label: 'Зелёная волна (сдвиг фаз)', min: 0, max: 60, step: 1, kind: 'hot', modes: ['arterial'],
        get: (c) => c.greenWave, set: (c, v) => (c.greenWave = v), fmt: (v) => `${v} с`,
      },
    ],
  },
];

const PRESET_LABELS: [string, string][] = [
  ['sugiyama', '🔄 Кольцо Сугиямы'],
  ['rush', '🌆 Час пик'],
  ['wave', '🟢 Зелёная волна'],
  ['smart', '🧠 Умные светофоры'],
];

function btn(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

export function buildToolbar(el: HTMLElement, api: AppApi, panel: HTMLElement): void {
  const play = btn('⏸', 'tb main', () => {
    play.textContent = api.playPause() ? '⏸' : '▶️';
  });
  const speed = btn('×1', 'tb', () => {
    speed.textContent = `×${api.cycleSpeed()}`;
  });
  el.append(
    play,
    btn('⟲', 'tb', () => api.reset()),
    btn('💥 Пробка', 'tb jam', () => api.jam()),
    speed,
    btn('📈', 'tb', () => api.toggleDiagram()),
    btn('⚙️', 'tb', () => panel.classList.toggle('collapsed')),
  );
}

export interface PanelHandle {
  refresh(): void;
}

export function buildPanel(el: HTMLElement, api: AppApi): PanelHandle {
  let structuralTimer = 0;

  function rebuild(): void {
    el.textContent = '';
    const cfg = api.cfg;

    // пресеты
    const presets = document.createElement('div');
    presets.className = 'chips';
    for (const [key, label] of PRESET_LABELS) {
      presets.append(btn(label, 'chip', () => api.applyPreset(key)));
    }
    el.append(presets);

    // режим
    const modeRow = document.createElement('div');
    modeRow.className = 'seg';
    const mkMode = (m: Mode, label: string) => {
      const b = btn(label, cfg.mode === m ? 'segbtn active' : 'segbtn', () => {
        if (cfg.mode === m) return;
        cfg.mode = m;
        api.structural();
        api.saveCfg();
        rebuild();
      });
      return b;
    };
    modeRow.append(mkMode('ring', '⭕ Кольцо'), mkMode('arterial', '🛣 Магистраль'));
    el.append(modeRow);

    // слайдеры по секциям
    for (const sec of SLIDERS) {
      if (sec.modes && !sec.modes.includes(cfg.mode)) continue;
      const h = document.createElement('div');
      h.className = 'sechead';
      h.textContent = sec.section;
      el.append(h);
      for (const def of sec.items) {
        if (def.modes && !def.modes.includes(cfg.mode)) continue;
        const row = document.createElement('label');
        row.className = 'srow';
        const name = document.createElement('span');
        name.className = 'sname';
        name.textContent = def.label;
        const val = document.createElement('span');
        val.className = 'sval';
        val.textContent = def.fmt(def.get(cfg));
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(def.min);
        input.max = String(def.max);
        input.step = String(def.step);
        input.value = String(def.get(cfg));
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          def.set(cfg, v);
          val.textContent = def.fmt(v);
          api.saveCfg();
          if (def.kind === 'vcount') {
            api.setVehicleCount(Math.round(v));
          } else if (def.kind === 'structural') {
            clearTimeout(structuralTimer);
            structuralTimer = window.setTimeout(() => api.structural(), 300);
          }
        });
        row.append(name, input, val);
        el.append(row);
      }
    }

    // адаптивные светофоры
    const adRow = document.createElement('label');
    adRow.className = 'srow check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = cfg.adaptive;
    cb.addEventListener('change', () => {
      cfg.adaptive = cb.checked;
      api.saveCfg();
    });
    const adName = document.createElement('span');
    adName.className = 'sname';
    adName.textContent = '🧠 Адаптивные светофоры (по очередям)';
    adRow.append(cb, adName);
    el.append(adRow);

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent =
      'Фантомная пробка: включи «Кольцо», подними плотность до ~40+ машин и нажми 💥 — ' +
      'волна затора побежит назад по потоку без всякой причины. На диаграмме 📈 она видна ' +
      'как красные наклонные полосы.';
    el.append(hint);
  }

  rebuild();
  return { refresh: rebuild };
}
