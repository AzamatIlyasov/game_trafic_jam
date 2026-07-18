import { GameLoop } from './loop';
import { Renderer } from './renderer';
import { Simulation } from './sim/simulation';
import { DEFAULT_CONFIG, type SimConfig } from './sim/types';
import { SpaceTime } from './spacetime';
import { buildPanel, buildToolbar, type AppApi } from './ui';
import './styles.css';

const LS_KEY = 'tjs-cfg-v1';

function loadCfg(): SimConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SimConfig>;
      return {
        ...structuredClone(DEFAULT_CONFIG),
        ...parsed,
        idm: { ...DEFAULT_CONFIG.idm, ...(parsed.idm ?? {}) },
        cycle: { ...DEFAULT_CONFIG.cycle, ...(parsed.cycle ?? {}) },
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
    // время хода между перекрёстками + потеря на разгон с места
    c.greenWave = Math.round(c.spacing / c.idm.v0 + c.idm.v0 / (2 * c.idm.a));
  },
  smart: (c) => {
    PRESETS.rush(c);
    c.spawnPerMin = 18;
    c.adaptive = true;
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

// --- ядро ---
const cfg = loadCfg();
const sim = new Simulation(cfg);
const renderer = new Renderer(bg, fg);
const spacetime = new SpaceTime(stCanvas);

const SPEEDS = [1, 2, 4, 8, 0.5];
let speedIdx = 0;
let saveTimer = 0;

const loop = new GameLoop(
  (dt) => {
    sim.step(dt);
    if (!stWrap.classList.contains('hidden')) spacetime.sample(sim, dt);
  },
  () => {
    renderer.draw(sim);
    hudTick();
  },
);

let lastHud = 0;
function hudTick(): void {
  const now = performance.now();
  if (now - lastHud < 250) return;
  lastHud = now;
  const st = sim.stats();
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

const api: AppApi = {
  cfg,
  isRunning: () => loop.running,
  playPause() {
    loop.running = !loop.running;
    return loop.running;
  },
  reset() {
    sim.rebuild();
    renderer.fit(sim);
    spacetime.clear();
  },
  jam: () => sim.triggerJam(),
  cycleSpeed() {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    loop.speed = SPEEDS[speedIdx];
    return loop.speed;
  },
  toggleDiagram() {
    stWrap.classList.toggle('hidden');
    const visible = !stWrap.classList.contains('hidden');
    requestAnimationFrame(() => {
      renderer.fit(sim);
      if (visible) spacetime.resize();
    });
    return visible;
  },
  structural() {
    sim.rebuild();
    renderer.fit(sim);
    spacetime.clear();
  },
  setVehicleCount(n) {
    sim.setVehicleCount(n);
  },
  applyPreset(key) {
    PRESETS[key]?.(cfg);
    this.structural();
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
};

buildToolbar(toolbarEl, api, panelEl);
const panel = buildPanel(panelEl, api);

renderer.fit(sim);
spacetime.resize();
new ResizeObserver(() => {
  renderer.fit(sim);
}).observe(document.getElementById('stage')!);

loop.start();
