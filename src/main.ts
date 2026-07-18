import { GameLoop } from './loop';
import { Renderer } from './renderer';
import { GridRenderer } from './render/gridRenderer';
import { Simulation } from './sim/simulation';
import { GridSim } from './sim/grid/gridSim';
import { DEFAULT_CONFIG, defaultLightCfg, type SimConfig, type SimStats } from './sim/types';
import { SpaceTime } from './spacetime';
import { buildEditor, buildPanel, buildToolbar, type AppApi } from './ui';
import './styles.css';

const LS_KEY = 'tjs-cfg-v2';

function loadCfg(): SimConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SimConfig>;
      return {
        ...structuredClone(DEFAULT_CONFIG),
        ...p,
        idm: { ...DEFAULT_CONFIG.idm, ...(p.idm ?? {}) },
        cycle: { ...DEFAULT_CONFIG.cycle, ...(p.cycle ?? {}) },
        grid: {
          ...structuredClone(DEFAULT_CONFIG.grid),
          ...(p.grid ?? {}),
          defLight: { ...DEFAULT_CONFIG.grid.defLight, ...(p.grid?.defLight ?? {}) },
          overrides: p.grid?.overrides ?? {},
        },
      };
    }
  } catch {
    /* повреждённый конфиг игнорируем */
  }
  return structuredClone(DEFAULT_CONFIG);
}

const PRESETS: Record<string, (c: SimConfig) => void> = {
  sugiyama: (c) => {
    c.mode = 'ring';
    c.ringLength = 600;
    c.numVehicles = 42;
    c.ringLights = 0;
    c.idm.v0 = 50 / 3.6;
    c.idm.T = 1.2;
    c.idm.a = 0.7;
  },
  rush: (c) => {
    c.mode = 'arterial';
    c.numIntersections = 8;
    c.spacing = 220;
    c.spawnPerMin = 26;
    c.idm.v0 = 50 / 3.6;
    c.idm.T = 1.4;
    c.idm.a = 1.5;
    c.cycle = { green: 18, amber: 3, red: 18 };
    c.greenWave = 0;
    c.adaptive = false;
  },
  wave: (c) => {
    PRESETS.rush(c);
    c.spawnPerMin = 14;
    c.greenWave = Math.round(c.spacing / c.idm.v0 + c.idm.v0 / (2 * c.idm.a));
  },
  smart: (c) => {
    PRESETS.rush(c);
    c.spawnPerMin = 18;
    c.adaptive = true;
  },
  grid: (c) => {
    c.mode = 'grid';
    c.idm.v0 = 45 / 3.6;
    c.idm.T = 1.3;
    c.idm.a = 1.5;
    c.grid.rows = 4;
    c.grid.cols = 4;
    c.grid.spacing = 130;
    c.grid.spawnPerMin = 90;
    c.grid.defLight = defaultLightCfg();
    c.grid.overrides = {};
  },
};

// --- DOM ---
const bg = document.getElementById('bg') as HTMLCanvasElement;
const fg = document.getElementById('fg') as HTMLCanvasElement;
const stCanvas = document.getElementById('st') as HTMLCanvasElement;
const stWrap = document.getElementById('stwrap') as HTMLElement;
const hudEl = document.getElementById('hud') as HTMLElement;
const toolbarEl = document.getElementById('toolbar') as HTMLElement;
const panelEl = document.getElementById('panel') as HTMLElement;
const editorEl = document.getElementById('editor') as HTMLElement;

// --- ядро ---
const cfg = loadCfg();
const sim = new Simulation(cfg);
const renderer = new Renderer(bg, fg);
const spacetime = new SpaceTime(stCanvas);

let gridSim = makeGridSim();
const gridRenderer = new GridRenderer(bg, fg);

function makeGridSim(): GridSim {
  return new GridSim(
    {
      rows: cfg.grid.rows,
      cols: cfg.grid.cols,
      spacing: cfg.grid.spacing,
      spawnPerMin: cfg.grid.spawnPerMin,
      idm: cfg.idm,
      defLight: cfg.grid.defLight,
    },
    cfg.grid.overrides,
  );
}

const isGrid = () => cfg.mode === 'grid';

const SPEEDS = [1, 2, 4, 8, 0.5];
let speedIdx = 0;
let saveTimer = 0;

const loop = new GameLoop(
  (dt) => {
    if (isGrid()) {
      gridSim.cfg.spawnPerMin = cfg.grid.spawnPerMin;
      gridSim.step(dt);
    } else {
      sim.step(dt);
      if (!stWrap.classList.contains('hidden')) spacetime.sample(sim, dt);
    }
  },
  () => {
    if (isGrid()) gridRenderer.draw(gridSim);
    else renderer.draw(sim);
    hudTick();
  },
);

let lastHud = 0;
function hudTick(): void {
  const now = performance.now();
  if (now - lastHud < 250) return;
  lastHud = now;
  const st: SimStats = isGrid() ? gridSim.stats() : sim.stats();
  hudEl.innerHTML =
    `<span>🚗 ${st.n}</span>` +
    `<span>⌀ ${(st.avgV * 3.6).toFixed(0)} км/ч</span>` +
    `<span>⇥ ${st.flowPerH.toFixed(0)}/ч</span>` +
    `<span>🔴 ${(st.stoppedFrac * 100).toFixed(0)}%</span>` +
    `<span>⏱ ${formatWait(st.totalWait)}</span>`;
}

function formatWait(s: number): string {
  if (s < 90) return `${s.toFixed(0)} с`;
  return `${(s / 60).toFixed(1)} мин`;
}

/** Пересобрать активный движок и подогнать рендер под экран. */
function rebuildActive(): void {
  if (isGrid()) {
    gridSim = makeGridSim();
    gridRenderer.selected = -1;
    editor.close();
    gridRenderer.fit(gridSim);
    stWrap.classList.add('hidden');
  } else {
    sim.rebuild();
    renderer.fit(sim);
    spacetime.clear();
  }
}

const api: AppApi = {
  cfg,
  isRunning: () => loop.running,
  playPause() {
    loop.running = !loop.running;
    return loop.running;
  },
  reset() {
    rebuildActive();
  },
  jam() {
    if (isGrid()) gridSim.triggerJam();
    else sim.triggerJam();
  },
  cycleSpeed() {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    loop.speed = SPEEDS[speedIdx];
    return loop.speed;
  },
  toggleDiagram() {
    if (isGrid()) return false; // диаграмма пространство-время не для сетки
    stWrap.classList.toggle('hidden');
    const visible = !stWrap.classList.contains('hidden');
    requestAnimationFrame(() => {
      renderer.fit(sim);
      if (visible) spacetime.resize();
    });
    return visible;
  },
  structural() {
    rebuildActive();
  },
  setVehicleCount(n) {
    if (!isGrid()) sim.setVehicleCount(n);
  },
  applyPreset(key) {
    PRESETS[key]?.(cfg);
    rebuildActive();
    this.saveCfg();
    panel.refresh();
  },
  saveCfg() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(cfg));
      } catch {
        /* приватный режим и т.п. */
      }
    }, 300);
  },
  gridLightCfg: (node) => gridSim.lightCfgFor(node),
  setLight(node, patch) {
    gridSim.setLight(node, patch);
    this.saveCfg();
  },
  setAllLights(patch) {
    gridSim.setAllLights(patch);
    this.saveCfg();
  },
  resetLight(node) {
    delete cfg.grid.overrides[gridSim.key(node)];
    const light = gridSim.lightOf[node];
    if (light) light.cfg = gridSim.lightCfgFor(node);
    this.saveCfg();
  },
  gridLabel(node) {
    const n = gridSim.net.nodes[node];
    return `ряд ${n.r + 1} · кол ${n.c + 1}`;
  },
};

buildToolbar(toolbarEl, api, panelEl);
const panel = buildPanel(panelEl, api);
const editor = buildEditor(editorEl, api);

// тап по перекрёстку в grid-режиме → редактор
fg.addEventListener('pointerdown', (ev) => {
  if (!isGrid()) return;
  const node = gridRenderer.pick(ev.clientX, ev.clientY);
  if (node >= 0) {
    gridRenderer.selected = node;
    editor.open(node);
  } else {
    gridRenderer.selected = -1;
    editor.close();
  }
});

// начальная подгонка
if (isGrid()) {
  gridRenderer.fit(gridSim);
  stWrap.classList.add('hidden');
} else {
  renderer.fit(sim);
  spacetime.resize();
}

new ResizeObserver(() => {
  if (isGrid()) gridRenderer.fit(gridSim);
  else renderer.fit(sim);
}).observe(document.getElementById('stage')!);

loop.start();
