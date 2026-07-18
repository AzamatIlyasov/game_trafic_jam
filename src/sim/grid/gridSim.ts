import { idmAccel } from '../idm';
import type { IDMParams, LightPhase, SimStats } from '../types';
import { GridLight, type LightCfg } from './gridLight';
import { buildGrid, type GridNetwork } from './network';

export interface GVehicle {
  id: number;
  edge: number;
  x: number;
  v: number;
  len: number;
  v0f: number;
  next: number;
  wait: number;
  perturb: number;
}

export interface GridSimConfig {
  rows: number;
  cols: number;
  spacing: number;
  spawnPerMin: number;
  idm: IDMParams;
  /** дефолт для новых перекрёстков */
  defLight: LightCfg;
}

let gid = 1;
const FLOW_WINDOW = 30;

/** Останавливаться ли перед узлом при красном/жёлтом. */
function wantsStop(state: LightPhase, v: number, d: number, p: IDMParams): boolean {
  if (state === 'GREEN') return false;
  if (d < 0.3) return false;
  if (state === 'AMBER') return d > (v * v) / (2 * p.b * 1.4);
  // RED
  if (v > 3 && d < v * 0.5 && d < (v * v) / (2 * p.bMax * 0.9)) return false;
  return true;
}

export class GridSim {
  cfg: GridSimConfig;
  net!: GridNetwork;
  vehicles: GVehicle[] = [];
  /** светофор по id узла (null для ворот) */
  lightOf: (GridLight | null)[] = [];
  time = 0;
  totalWait = 0;

  /** пер-узловые переопределения настроек (ключ "r,c") */
  overrides: Record<string, Partial<LightCfg>> = {};

  private spawnAcc = 0;
  private flowEvents: number[] = [];
  private cross: number;

  constructor(cfg: GridSimConfig, overrides: Record<string, Partial<LightCfg>> = {}) {
    this.cfg = cfg;
    this.overrides = overrides;
    this.cross = 0;
    this.rebuild();
  }

  key(node: number): string {
    const n = this.net.nodes[node];
    return `${n.r},${n.c}`;
  }

  rebuild(): void {
    this.net = buildGrid(this.cfg.rows, this.cfg.cols, this.cfg.spacing);
    this.cross = this.net.ib * 2;
    this.time = 0;
    this.totalWait = 0;
    this.spawnAcc = 0;
    this.flowEvents = [];
    this.vehicles = [];
    this.lightOf = this.net.nodes.map((n) => {
      if (n.gate) return null;
      return new GridLight(this.lightCfgFor(n.id));
    });
  }

  lightCfgFor(node: number): LightCfg {
    return { ...this.cfg.defLight, ...(this.overrides[this.key(node)] ?? {}) };
  }

  /** Применить настройки к одному перекрёстку. */
  setLight(node: number, patch: Partial<LightCfg>): void {
    const k = this.key(node);
    this.overrides[k] = { ...(this.overrides[k] ?? {}), ...patch };
    const light = this.lightOf[node];
    if (light) light.cfg = this.lightCfgFor(node);
  }

  /** Применить настройки ко всем перекрёсткам. */
  setAllLights(patch: Partial<LightCfg>): void {
    for (const node of this.net.intersections) this.setLight(node, patch);
  }

  private chooseNext(edgeId: number): number {
    const e = this.net.edges[edgeId];
    const B = this.net.nodes[e.to];
    if (B.gate) return -1;
    const opts = B.out.filter((oid) => oid !== e.rev);
    if (opts.length === 0) return e.rev; // тупик — разворот
    const weights = opts.map((oid) => {
      const o = this.net.edges[oid];
      const straight = o.ori === e.ori && Math.sign(o.ux) === Math.sign(e.ux) && Math.sign(o.uy) === Math.sign(e.uy);
      return straight ? 0.62 : 0.19;
    });
    let sum = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < opts.length; i++) {
      r -= weights[i];
      if (r <= 0) return opts[i];
    }
    return opts[opts.length - 1];
  }

  triggerJam(): void {
    const moving = this.vehicles.filter((v) => v.v > 2);
    const pick = moving.length ? moving[Math.floor(Math.random() * moving.length)] : this.vehicles[0];
    if (pick) pick.perturb = 2.0;
  }

  step(dt: number): void {
    const p = this.cfg.idm;
    const edges = this.net.edges;
    this.time += dt;

    // группировка по рёбрам + сортировка по x
    const byEdge = new Map<number, GVehicle[]>();
    for (const v of this.vehicles) {
      let arr = byEdge.get(v.edge);
      if (!arr) byEdge.set(v.edge, (arr = []));
      arr.push(v);
    }
    for (const arr of byEdge.values()) arr.sort((a, b) => a.x - b.x);

    // спрос на перекрёстках (для адаптивных) + обновление фаз
    const demandV = new Float64Array(this.net.nodes.length);
    const demandH = new Float64Array(this.net.nodes.length);
    for (const v of this.vehicles) {
      const e = edges[v.edge];
      if (this.net.nodes[e.to].gate) continue;
      if (e.len - v.x > 50) continue;
      if (e.ori === 'V') demandV[e.to] += 1;
      else demandH[e.to] += 1;
    }
    for (const node of this.net.intersections) {
      const light = this.lightOf[node]!;
      light.setDemand(demandV[node], demandH[node]);
      light.update(dt, this.time);
    }

    // ускорения
    const accById = new Map<number, number>();
    for (const [edgeId, arr] of byEdge) {
      const e = edges[edgeId];
      for (let j = 0; j < arr.length; j++) {
        const veh = arr[j];
        const v0 = p.v0 * veh.v0f;
        let s = Infinity;
        let dv = 0;

        if (j < arr.length - 1) {
          const ahead = arr[j + 1];
          s = ahead.x - ahead.len - veh.x;
          dv = veh.v - ahead.v;
        } else {
          // передняя машина — взаимодействие с узлом
          const dEnd = e.len - veh.x;
          const B = this.net.nodes[e.to];
          if (!B.gate) {
            const light = this.lightOf[e.to]!;
            const state = light.movementState(e.ori);
            if (state === 'GREEN') {
              const n = veh.next;
              const tail = n >= 0 ? byEdge.get(n)?.[0] : undefined;
              if (tail) {
                s = dEnd + this.cross + (tail.x - tail.len);
                dv = veh.v - tail.v;
              }
            } else if (wantsStop(state, veh.v, dEnd, p)) {
              s = dEnd;
              dv = veh.v;
            }
          }
        }

        if (s !== Infinity && s < 0.1) s = 0.1;
        let a = idmAccel(p, veh.v, s, dv, v0);
        if (veh.perturb > 0) {
          veh.perturb -= dt;
          if (veh.v > 0.5) a = Math.min(a, -2.5);
        }
        accById.set(veh.id, Math.max(-p.bMax, Math.min(a, p.a)));
      }
    }

    // интегрирование + переходы через узлы
    const despawn: GVehicle[] = [];
    for (const veh of this.vehicles) {
      const a = accById.get(veh.id) ?? 0;
      const vNew = Math.max(0, veh.v + a * dt);
      const dx = Math.max(0, veh.v * dt + 0.5 * a * dt * dt);
      veh.v = vNew;
      veh.x += dx;
      if (veh.v < 0.5) {
        veh.wait += dt;
        this.totalWait += dt;
      }
      let e = edges[veh.edge];
      // возможен переход через несколько коротких рёбер за шаг
      let guard = 0;
      while (veh.x >= e.len && guard++ < 4) {
        const over = veh.x - e.len;
        if (this.net.nodes[e.to].gate) {
          despawn.push(veh);
          this.flowEvents.push(this.time);
          break;
        }
        veh.edge = veh.next;
        veh.x = over;
        veh.next = this.chooseNext(veh.edge);
        e = edges[veh.edge];
      }
    }
    if (despawn.length) {
      const dead = new Set(despawn.map((v) => v.id));
      this.vehicles = this.vehicles.filter((v) => !dead.has(v.id));
    }

    this.spawn(dt);

    const cutoff = this.time - FLOW_WINDOW;
    while (this.flowEvents.length && this.flowEvents[0] < cutoff) this.flowEvents.shift();
  }

  private spawn(dt: number): void {
    this.spawnAcc += (this.cfg.spawnPerMin / 60) * dt;
    if (this.spawnAcc < 1) return;
    if (this.vehicles.length >= 400) {
      this.spawnAcc = 1;
      return;
    }
    // случайный вход со свободным началом
    const srcs = this.net.sources;
    const tail = new Map<number, number>();
    for (const v of this.vehicles) {
      const cur = tail.get(v.edge);
      if (cur === undefined || v.x < cur) tail.set(v.edge, v.x);
    }
    const order = [...srcs].sort(() => Math.random() - 0.5);
    for (const s of order) {
      const t = tail.get(s);
      if (t === undefined || t > 10) {
        this.spawnAcc -= 1;
        const veh: GVehicle = {
          id: gid++,
          edge: s,
          x: 1,
          v: Math.min(this.cfg.idm.v0 * 0.6, 6),
          len: 4.2 + Math.random(),
          v0f: 0.92 + Math.random() * 0.16,
          next: this.chooseNext(s),
          wait: 0,
          perturb: 0,
        };
        this.vehicles.push(veh);
        return;
      }
    }
    this.spawnAcc = Math.min(this.spawnAcc, 3);
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
