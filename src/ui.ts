import type { LightCfg, Mode, SimConfig } from './sim/types';

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
  /** grid: настройки выбранного перекрёстка (с учётом дефолта) */
  gridLightCfg(node: number): LightCfg;
  /** grid: применить настройки к перекрёстку */
  setLight(node: number, patch: Partial<LightCfg>): void;
  /** grid: применить ко всем перекрёсткам */
  setAllLights(patch: Partial<LightCfg>): void;
  /** grid: сбросить настройки перекрёстка к дефолту */
  resetLight(node: number): void;
  /** grid: подпись перекрёстка, напр. "ряд 2 · кол 3" */
  gridLabel(node: number): string;
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
    section: '🏙 Дорога — сетка',
    modes: ['grid'],
    items: [
      {
        label: 'Ряды (улицы ↕)', min: 2, max: 8, step: 1, kind: 'structural', modes: null,
        get: (c) => c.grid.rows, set: (c, v) => (c.grid.rows = v), fmt: (v) => `${v}`,
      },
      {
        label: 'Колонки (улицы ↔)', min: 2, max: 8, step: 1, kind: 'structural', modes: null,
        get: (c) => c.grid.cols, set: (c, v) => (c.grid.cols = v), fmt: (v) => `${v}`,
      },
      {
        label: 'Длина квартала', min: 70, max: 260, step: 10, kind: 'structural', modes: null,
        get: (c) => c.grid.spacing, set: (c, v) => (c.grid.spacing = v), fmt: (v) => `${v} м`,
      },
      {
        label: 'Поток на въездах', min: 0, max: 240, step: 5, kind: 'hot', modes: null,
        get: (c) => c.grid.spawnPerMin, set: (c, v) => (c.grid.spawnPerMin = v), fmt: (v) => `${v} маш/мин`,
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
    modes: ['ring', 'arterial'],
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
  ['grid', '🏙 Город (сетка)'],
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
    modeRow.append(mkMode('ring', '⭕ Кольцо'), mkMode('arterial', '🛣 Магистраль'), mkMode('grid', '🏙 Сетка'));
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

    // адаптивные светофоры (глобально) — только кольцо/магистраль
    if (cfg.mode !== 'grid') {
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
    }

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent =
      cfg.mode === 'grid'
        ? '👆 Тапни по любому перекрёстку, чтобы настроить его светофор отдельно: режим ' +
          '(фиксированный/адаптивный), зелёный С↕Ю и З↔В, сдвиг фазы. Так можно собрать «зелёную ' +
          'волну» вручную или сравнить умные светофоры с обычными.'
        : 'Фантомная пробка: включи «Кольцо», подними плотность до ~40+ машин и нажми 💥 — ' +
          'волна затора побежит назад по потоку без всякой причины. На диаграмме 📈 она видна ' +
          'как красные наклонные полосы.';
    el.append(hint);
  }

  rebuild();
  return { refresh: rebuild };
}

export interface EditorHandle {
  open(node: number): void;
  close(): void;
  isOpen(): boolean;
}

interface EditSlider {
  label: string;
  min: number;
  max: number;
  step: number;
  key: keyof LightCfg;
  fmt: (v: number) => string;
}

const EDIT_SLIDERS: EditSlider[] = [
  { label: 'Зелёный С↕Ю', min: 4, max: 60, step: 1, key: 'greenNS', fmt: (v) => `${v} с` },
  { label: 'Зелёный З↔В', min: 4, max: 60, step: 1, key: 'greenEW', fmt: (v) => `${v} с` },
  { label: 'Жёлтый', min: 1, max: 6, step: 1, key: 'amber', fmt: (v) => `${v} с` },
  { label: 'Сдвиг фазы', min: 0, max: 60, step: 1, key: 'offset', fmt: (v) => `${v} с` },
];

/** Плавающий редактор одного перекрёстка (grid-режим). */
export function buildEditor(el: HTMLElement, api: AppApi): EditorHandle {
  let node = -1;

  function render(): void {
    el.textContent = '';
    if (node < 0) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const cfg = api.gridLightCfg(node);

    const head = document.createElement('div');
    head.className = 'edhead';
    const title = document.createElement('span');
    title.textContent = `🚦 ${api.gridLabel(node)}`;
    const close = btn('✕', 'edx', () => handle.close());
    head.append(title, close);
    el.append(head);

    // режим фиксированный/адаптивный
    const seg = document.createElement('div');
    seg.className = 'seg';
    const mk = (adaptive: boolean, label: string) =>
      btn(label, cfg.adaptive === adaptive ? 'segbtn active' : 'segbtn', () => {
        api.setLight(node, { adaptive });
        render();
      });
    seg.append(mk(false, '⏱ Фиксированный'), mk(true, '🧠 Адаптивный'));
    el.append(seg);

    // слайдеры
    for (const s of EDIT_SLIDERS) {
      if (s.key === 'offset' && cfg.adaptive) continue; // сдвиг фазы не для адаптивного
      const row = document.createElement('label');
      row.className = 'srow';
      const name = document.createElement('span');
      name.className = 'sname';
      name.textContent = s.label;
      const val = document.createElement('span');
      val.className = 'sval';
      const cur = cfg[s.key] as number;
      val.textContent = s.fmt(cur);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(cur);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        val.textContent = s.fmt(v);
        api.setLight(node, { [s.key]: v } as Partial<LightCfg>);
      });
      row.append(name, input, val);
      el.append(row);
    }

    // главное направление
    const dirRow = document.createElement('div');
    dirRow.className = 'seg';
    const mkDir = (ns: boolean, label: string) =>
      btn(label, cfg.startNS === ns ? 'segbtn active' : 'segbtn', () => {
        api.setLight(node, { startNS: ns });
        render();
      });
    dirRow.append(mkDir(true, 'Старт С↕Ю'), mkDir(false, 'Старт З↔В'));
    el.append(dirRow);

    // действия
    const acts = document.createElement('div');
    acts.className = 'chips';
    acts.append(
      btn('📋 Ко всем', 'chip', () => {
        const c = api.gridLightCfg(node);
        api.setAllLights({
          greenNS: c.greenNS,
          greenEW: c.greenEW,
          amber: c.amber,
          adaptive: c.adaptive,
          startNS: c.startNS,
        });
      }),
      btn('↺ Сброс узла', 'chip', () => {
        api.resetLight(node);
        render();
      }),
    );
    el.append(acts);
  }

  const handle: EditorHandle = {
    open(n) {
      node = n;
      render();
    },
    close() {
      node = -1;
      render();
    },
    isOpen: () => node >= 0,
  };
  render();
  return handle;
}
