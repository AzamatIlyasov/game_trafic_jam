/** Headless-проверка сеточного режима. Запуск: npx tsx scripts/gridcheck.ts */
import { GridSim, type GridSimConfig } from '../src/sim/grid/gridSim';
import { defaultLightCfg } from '../src/sim/grid/gridLight';
import { DEFAULT_IDM } from '../src/sim/types';

const DT = 1 / 60;

function cfg(): GridSimConfig {
  return {
    rows: 4,
    cols: 4,
    spacing: 120,
    spawnPerMin: 120,
    idm: { ...DEFAULT_IDM, v0: 40 / 3.6, a: 1.5, T: 1.2 },
    defLight: defaultLightCfg(),
  };
}

function run(sim: GridSim, seconds: number): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) sim.step(DT);
}

let failures = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`);
  if (!ok) failures++;
}

// 1) поток течёт и машины выезжают (нет вечного gridlock)
{
  const sim = new GridSim(cfg());
  run(sim, 400);
  const st = sim.stats();
  console.log(`   4x4 @400с: машин=${st.n} поток=${st.flowPerH.toFixed(0)}/ч ⌀=${(st.avgV * 3.6).toFixed(1)}км/ч стоят=${(st.stoppedFrac * 100).toFixed(0)}%`);
  check('Машины выезжают из сети', st.flowPerH > 200, `поток=${st.flowPerH.toFixed(0)}/ч`);
  check('Нет тотального gridlock', st.avgV * 3.6 > 5, `⌀ скорость=${(st.avgV * 3.6).toFixed(1)} км/ч`);
  check('Число машин ограничено', st.n < 400, `машин=${st.n}`);
}

// 2) фазы светофоров чередуются (NS ↔ EW)
{
  const sim = new GridSim(cfg());
  const node = sim.net.intersections[5];
  const seen = new Set<string>();
  for (let i = 0; i < 60 / DT; i++) {
    sim.step(DT);
    seen.add(sim.lightOf[node]!.phase);
  }
  check('Фазы чередуются', seen.has('NS') && seen.has('EW'), `фазы: ${[...seen].join(',')}`);
}

// 3) индивидуальная настройка перекрёстка применяется
{
  const sim = new GridSim(cfg());
  const node = sim.net.intersections[0];
  sim.setLight(node, { greenNS: 40, greenEW: 4 });
  check('setLight применяется', sim.lightOf[node]!.cfg.greenNS === 40, `greenNS=${sim.lightOf[node]!.cfg.greenNS}`);
  sim.setAllLights({ adaptive: true });
  const allAdaptive = sim.net.intersections.every((n) => sim.lightOf[n]!.cfg.adaptive);
  check('setAllLights применяется', allAdaptive, 'все адаптивные');
}

// 4) адаптивный режим не хуже фиксированного по ожиданию
{
  const fixedCfg = cfg();
  const fixed = new GridSim(fixedCfg);
  run(fixed, 400);

  const adCfg = cfg();
  adCfg.defLight = { ...defaultLightCfg(), adaptive: true };
  const adaptive = new GridSim(adCfg);
  run(adaptive, 400);

  console.log(`   ожидание: фикс=${fixed.totalWait.toFixed(0)}с адапт=${adaptive.totalWait.toFixed(0)}с`);
  check('Адаптивный конечен и работает', adaptive.stats().flowPerH > 200, `поток адапт=${adaptive.stats().flowPerH.toFixed(0)}/ч`);
}

console.log(failures ? `\n${failures} провал(ов)` : '\nВсе grid-проверки пройдены');
if (failures) throw new Error(`${failures} grid-проверок провалено`);
