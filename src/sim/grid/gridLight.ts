import type { LightCfg, LightPhase } from '../types';

export { defaultLightCfg } from '../types';
export type { LightCfg } from '../types';

type Phase = 'NS' | 'NS_A' | 'EW' | 'EW_A';

/** Контроллер сигналов перекрёстка: две неконфликтующие фазы NS ⟂ EW. */
export class GridLight {
  cfg: LightCfg;
  phase: Phase = 'NS';
  private tIn = 0;
  private demandV = 0;
  private demandH = 0;

  constructor(cfg: LightCfg) {
    this.cfg = cfg;
  }

  /** Состояние движения для ориентации ребра ('V'→NS, 'H'→EW). */
  movementState(ori: 'H' | 'V'): LightPhase {
    const ns = ori === 'V';
    switch (this.phase) {
      case 'NS':
        return ns ? 'GREEN' : 'RED';
      case 'NS_A':
        return ns ? 'AMBER' : 'RED';
      case 'EW':
        return ns ? 'RED' : 'GREEN';
      case 'EW_A':
        return ns ? 'RED' : 'AMBER';
    }
  }

  setDemand(v: number, h: number): void {
    this.demandV = v;
    this.demandH = h;
  }

  update(dt: number, time: number): void {
    const c = this.cfg;
    this.tIn += dt;

    if (!c.adaptive) {
      const T = c.greenNS + c.amber + c.greenEW + c.amber;
      let phi = (((time - c.offset) % T) + T) % T;
      if (!c.startNS) phi = (phi + c.greenNS + c.amber) % T;
      if (phi < c.greenNS) this.phase = 'NS';
      else if (phi < c.greenNS + c.amber) this.phase = 'NS_A';
      else if (phi < c.greenNS + c.amber + c.greenEW) this.phase = 'EW';
      else this.phase = 'EW_A';
      return;
    }

    // адаптивно: продлеваем зелёный, пока есть спрос по текущей оси и мало по другой
    const minG = 5;
    switch (this.phase) {
      case 'NS':
        if (
          (this.tIn >= minG && this.demandV <= this.demandH && this.demandH > 0) ||
          this.tIn >= c.greenNS * 1.8
        )
          this.to('NS_A');
        break;
      case 'NS_A':
        if (this.tIn >= c.amber) this.to('EW');
        break;
      case 'EW':
        if (
          (this.tIn >= minG && this.demandH <= this.demandV && this.demandV > 0) ||
          this.tIn >= c.greenEW * 1.8
        )
          this.to('EW_A');
        break;
      case 'EW_A':
        if (this.tIn >= c.amber) this.to('NS');
        break;
    }
  }

  private to(p: Phase): void {
    this.phase = p;
    this.tIn = 0;
  }
}
