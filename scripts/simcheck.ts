/**
 * Headless-проверка физики: фантомная пробка на кольце и работа светофоров
 * на магистрали. Запуск: npm run sim:check
 */
import { Simulation } from '../src/sim/simulation';
import { DEFAULT_CONFIG, type SimConfig } from '../src/sim/types';

const DT = 1 / 60;

function run(sim: Simulation, seconds: number, onSec?: (t: number) => void): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    sim.step(DT);
    if (onSec && i % 60 === 0) onSec(i / 60);
  }
}

function speedStats(sim: Simulation) {
  const vs = sim.vehicles.map((v) => v.v);
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  const std = Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / vs.length);
  return { mean, std, min: Math.min(...vs), max: Math.max(...vs) };
}

let failures = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`);
  if (!ok) failures++;
}

// ---------- 1. Кольцо: фантомная пробка при высокой плотности ----------
{
  const cfg: SimConfig = structuredClone(DEFAULT_CONFIG);
  cfg.mode = 'ring';
  cfg.ringLength = 600;
  cfg.numVehicles = 42;
  const sim = new Simulation(cfg);
  run(sim, 300);
  const s = speedStats(sim);
  console.log(`   кольцо 600м/42маш @300с: mean=${s.mean.toFixed(2)} std=${s.std.toFixed(2)} min=${s.min.toFixed(2)} max=${s.max.toFixed(2)}`);
  check(
    'Фантомная пробка (высокая плотность)',
    s.std > 1.0 && s.min < 1.0 && s.max > 4.0,
    'ожидаем stop-and-go: разброс скоростей, кто-то стоит, кто-то едет',
  );
}

// ---------- 2. Кольцо: низкая плотность стабильна ----------
{
  const cfg: SimConfig = structuredClone(DEFAULT_CONFIG);
  cfg.mode = 'ring';
  cfg.ringLength = 600;
  cfg.numVehicles = 12;
  const sim = new Simulation(cfg);
  run(sim, 200);
  const s = speedStats(sim);
  console.log(`   кольцо 600м/12маш @200с: mean=${s.mean.toFixed(2)} std=${s.std.toFixed(2)} min=${s.min.toFixed(2)}`);
  check('Свободный поток (низкая плотность)', s.min > 5 && s.std < 1.5, 'все едут, волн нет');
}

// ---------- 3. Кольцо: возмущение при докритической плотности затухает ----------
{
  const cfg: SimConfig = structuredClone(DEFAULT_CONFIG);
  cfg.mode = 'ring';
  cfg.ringLength = 600;
  cfg.numVehicles = 12;
  const sim = new Simulation(cfg);
  run(sim, 100);
  sim.triggerJam();
  run(sim, 120);
  const s = speedStats(sim);
  check('Возмущение затухает при низкой плотности', s.min > 4, `min=${s.min.toFixed(2)}`);
}

// ---------- 4. Магистраль: машины останавливаются на красный и проезжают ----------
{
  const cfg: SimConfig = structuredClone(DEFAULT_CONFIG);
  cfg.mode = 'arterial';
  cfg.numIntersections = 4;
  cfg.spacing = 250;
  cfg.spawnPerMin = 20;
  const sim = new Simulation(cfg);
  let sawStopAtRed = false;
  run(sim, 240, () => {
    for (const light of sim.lights) {
      if (light.state !== 'RED') continue;
      for (const veh of sim.vehicles) {
        const d = light.pos - veh.x;
        if (d > 0 && d < 15 && veh.v < 0.5) sawStopAtRed = true;
      }
    }
  });
  const st = sim.stats();
  console.log(`   магистраль @240с: машин=${st.n} поток=${st.flowPerH.toFixed(0)}/ч ожидание=${st.totalWait.toFixed(0)}с`);
  check('Остановка на красный', sawStopAtRed, 'машина стояла у стоп-линии на красном');
  check('Пропускная способность > 0', st.flowPerH > 100, `поток=${st.flowPerH.toFixed(0)}/ч`);
}

// ---------- 5. Зелёная волна снижает ожидание vs без неё ----------
{
  const base: SimConfig = structuredClone(DEFAULT_CONFIG);
  base.mode = 'arterial';
  base.numIntersections = 6;
  base.spacing = 250;
  base.spawnPerMin = 12;
  base.idm.a = 1.5; // городской водитель с бодрым разгоном
  base.idm.T = 1.4;

  const noWave = new Simulation(structuredClone(base));
  run(noWave, 400);

  const waveCfg = structuredClone(base);
  // время хода между перекрёстками + потеря на разгон с места
  waveCfg.greenWave = waveCfg.spacing / waveCfg.idm.v0 + waveCfg.idm.v0 / (2 * waveCfg.idm.a);
  const wave = new Simulation(waveCfg);
  run(wave, 400);

  const w0 = noWave.totalWait;
  const w1 = wave.totalWait;
  console.log(`   ожидание: без волны=${w0.toFixed(0)}с, с волной=${w1.toFixed(0)}с`);
  check('Зелёная волна помогает', w1 < w0, 'суммарное ожидание меньше с волной');
}

console.log(failures ? `\n${failures} провал(ов)` : '\nВсе проверки пройдены');
if (failures) throw new Error(`${failures} проверок физики провалено`);
