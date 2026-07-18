import { idmAccel } from './idm';
import { makeRing, makeSerpentine, PathGeometry, type Serpentine } from './geometry';
import { TrafficLight } from './trafficLight';
import type { SimConfig, Vehicle } from './types';

let nextId = 1;

function makeVehicle(x: number, v: number): Vehicle {
  return {
    id: nextId++,
    x,
    v,
    len: 4.2 + Math.random() * 1.0,
    // разные водители: ±8% к желаемой скорости — естественно ломает симметрию
    v0f: 0.92 + Math.random() * 0.16,
    perturb: 0,
    wait: 0,
  };
}

export interface SimStats {
  n: number;
  /** средняя скорость, м/с */
  avgV: number;
  /** поток через детектор, машин/час */
  flowPerH: number;
  /** доля стоящих машин (v < 1 м/с) */
  stoppedFrac: number;
  /** суммарное время простоя всех машин, с */
  totalWait: number;
}

const FLOW_WINDOW = 30; // с

export class Simulation {
  cfg: SimConfig;
  geom!: PathGeometry;
  serp: Serpentine | null = null;
  lights: TrafficLight[] = [];
  vehicles: Vehicle[] = [];
  time = 0;
  totalWait = 0;

  private spawnAcc = 0;
  private flowEvents: number[] = [];
  private accs = new Float64Array(0);

  constructor(cfg: SimConfig) {
    this.cfg = cfg;
    this.rebuild();
  }

  get roadLen(): number {
    return this.geom.total;
  }

  /** Полная пересборка дороги, светофоров и машин под текущий конфиг. */
  rebuild(): void {
    const cfg = this.cfg;
    this.time = 0;
    this.totalWait = 0;
    this.spawnAcc = 0;
    this.flowEvents = [];
    this.vehicles = [];
    this.lights = [];

    if (cfg.mode === 'ring') {
      this.serp = null;
      this.geom = makeRing(cfg.ringLength);
      for (let k = 0; k < cfg.ringLights; k++) {
        this.lights.push(new TrafficLight(((k + 0.5) / cfg.ringLights) * this.roadLen, k));
      }
      this.seedRingVehicles(cfg.numVehicles);
    } else {
      const totalStraight = (cfg.numIntersections + 1) * cfg.spacing;
      this.serp = makeSerpentine(totalStraight);
      this.geom = this.serp.geom;
      const firstPos = this.serp.straightToPath(cfg.spacing);
      for (let k = 1; k <= cfg.numIntersections; k++) {
        const pos = this.serp.straightToPath(k * cfg.spacing);
        // смещение «зелёной волны» пропорционально реальной дистанции по пути
        // (развороты серпантина добавляют метры между перекрёстками)
        this.lights.push(new TrafficLight(pos, k - 1, (pos - firstPos) / cfg.spacing));
      }
    }
  }

  private seedRingVehicles(n: number): void {
    const L = this.roadLen;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * L) / n + (Math.random() - 0.5) * 3;
      this.vehicles.push(makeVehicle(((x % L) + L) % L, 3 + Math.random() * 2));
    }
    this.sortVehicles();
  }

  /** Живо добавить/убрать машины на кольце без сброса симуляции. */
  setVehicleCount(n: number): void {
    if (this.cfg.mode !== 'ring') return;
    const L = this.roadLen;
    while (this.vehicles.length > n) {
      this.vehicles.splice(Math.floor(Math.random() * this.vehicles.length), 1);
    }
    while (this.vehicles.length < n) {
      if (this.vehicles.length === 0) {
        this.vehicles.push(makeVehicle(0, 3));
        continue;
      }
      // вставляем в самый большой зазор
      let bestI = 0;
      let bestGap = -1;
      const vs = this.vehicles;
      for (let i = 0; i < vs.length; i++) {
        const lead = vs[(i + 1) % vs.length];
        let gap = lead.x - vs[i].x;
        if (i === vs.length - 1) gap += L;
        if (gap > bestGap) {
          bestGap = gap;
          bestI = i;
        }
      }
      const at = (this.vehicles[bestI].x + bestGap / 2) % L;
      const nv = makeVehicle(at, this.vehicles[bestI].v);
      this.vehicles.push(nv);
      this.sortVehicles();
    }
    this.cfg.numVehicles = n;
  }

  /** «Вызвать пробку»: одна машина резко тормозит ~2 секунды. */
  triggerJam(): void {
    const moving = this.vehicles.filter((v) => v.v > 2);
    const pick = moving.length
      ? moving[Math.floor(Math.random() * moving.length)]
      : this.vehicles[0];
    if (pick) pick.perturb = 2.0;
  }

  private sortVehicles(): void {
    this.vehicles.sort((a, b) => a.x - b.x);
  }

  step(dt: number): void {
    const cfg = this.cfg;
    const p = cfg.idm;
    const L = this.roadLen;
    const ring = this.geom.isRing;
    this.time += dt;

    this.sortVehicles();
    const vs = this.vehicles;
    const n = vs.length;

    // Спрос на светофорах (для адаптивного режима) + обновление фаз
    for (const light of this.lights) {
      let demand = false;
      for (const veh of vs) {
        let d = light.pos - veh.x;
        if (ring) d = ((d % L) + L) % L;
        if (d > 0 && d < 80) {
          demand = true;
          break;
        }
      }
      light.update(dt, this.time, cfg, demand);
    }

    // Ускорения из старого состояния
    if (this.accs.length < n) this.accs = new Float64Array(n);
    const accs = this.accs;
    for (let i = 0; i < n; i++) {
      const veh = vs[i];
      const v0 = p.v0 * veh.v0f;

      let s = Infinity;
      let dv = 0;
      if (ring && n >= 1) {
        const lead = vs[(i + 1) % n];
        let gap = lead.x - veh.x;
        if (i === n - 1) gap += L;
        s = gap - lead.len;
        dv = veh.v - lead.v;
      } else if (i < n - 1) {
        const lead = vs[i + 1];
        s = lead.x - lead.len - veh.x;
        dv = veh.v - lead.v;
      }
      if (s !== Infinity && s < 0.1) s = 0.1;

      let a = idmAccel(p, veh.v, s, dv, v0);

      // Красный/жёлтый = виртуальный неподвижный лидер на стоп-линии
      for (const light of this.lights) {
        let d = light.pos - veh.x;
        if (ring) d = ((d % L) + L) % L;
        if (d <= 0 || d > 400) continue;
        if (!light.wantsStop(veh.v, d, p)) continue;
        const aL = idmAccel(p, veh.v, Math.max(d, 0.1), veh.v, v0);
        if (aL < a) a = aL;
      }

      // Принудительное возмущение («фантомная пробка по кнопке»)
      if (veh.perturb > 0) {
        veh.perturb -= dt;
        if (veh.v > 0.5) a = Math.min(a, -2.5);
      }

      accs[i] = Math.max(-p.bMax, Math.min(a, p.a));
    }

    // Интегрирование (полуявный Эйлер, баллистическая позиция)
    for (let i = 0; i < n; i++) {
      const veh = vs[i];
      const a = accs[i];
      const vNew = Math.max(0, veh.v + a * dt);
      const dx = Math.max(0, veh.v * dt + 0.5 * a * dt * dt);
      veh.v = vNew;
      veh.x += dx;
      if (veh.v < 0.5) {
        veh.wait += dt;
        this.totalWait += dt;
      }
    }

    if (ring) {
      for (const veh of vs) {
        if (veh.x >= L) {
          veh.x -= L;
          this.flowEvents.push(this.time);
        }
      }
    } else {
      // деспавн доехавших
      for (let i = vs.length - 1; i >= 0; i--) {
        if (vs[i].x - vs[i].len > L) {
          vs.splice(i, 1);
          this.flowEvents.push(this.time);
        }
      }
      this.spawn(dt);
    }

    // подрезаем окно детектора потока
    const cutoff = this.time - FLOW_WINDOW;
    while (this.flowEvents.length && this.flowEvents[0] < cutoff) this.flowEvents.shift();
  }

  private spawn(dt: number): void {
    const cfg = this.cfg;
    this.spawnAcc += (cfg.spawnPerMin / 60) * dt;
    if (this.spawnAcc < 1) return;
    if (this.vehicles.length >= 300) {
      this.spawnAcc = 1; // очередь на въезде «за кадром»
      return;
    }
    this.sortVehicles();
    const first = this.vehicles[0];
    const clear = !first || first.x - first.len > 12;
    if (!clear) {
      this.spawnAcc = Math.min(this.spawnAcc, 3); // копим, но без взрыва
      return;
    }
    this.spawnAcc -= 1;
    const gap = first ? first.x - first.len - 6 : Infinity;
    const v = Math.min(cfg.idm.v0 * 0.7, gap === Infinity ? cfg.idm.v0 : Math.max(2, gap * 0.4));
    const veh = makeVehicle(6, v);
    this.vehicles.push(veh);
    this.sortVehicles();
  }

  stats(): SimStats {
    const n = this.vehicles.length;
    let sum = 0;
    let stopped = 0;
    for (const v of this.vehicles) {
      sum += v.v;
      if (v.v < 1) stopped++;
    }
    const windowS = Math.min(FLOW_WINDOW, Math.max(this.time, 1));
    return {
      n,
      avgV: n ? sum / n : 0,
      flowPerH: (this.flowEvents.length / windowS) * 3600,
      stoppedFrac: n ? stopped / n : 0,
      totalWait: this.totalWait,
    };
  }
}
