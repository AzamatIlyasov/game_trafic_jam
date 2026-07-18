import type { IDMParams, LightPhase, SimConfig } from './types';

/**
 * Светофор на стоп-линии. Для машин красный/жёлтый — «виртуальный
 * неподвижный лидер» на позиции pos.
 */
export class TrafficLight {
  state: LightPhase = 'GREEN';
  private tIn = 0;
  private lastDemandAt = 0;

  constructor(
    /** позиция стоп-линии вдоль пути, м */
    readonly pos: number,
    /** порядковый номер (для смещения «зелёной волны») */
    readonly idx: number,
    /** множитель смещения волны (обычно = idx, но учитывает реальную дистанцию) */
    readonly waveUnits: number = idx,
  ) {}

  update(dt: number, time: number, cfg: SimConfig, queueApproaching: boolean): void {
    const c = cfg.cycle;
    if (!cfg.adaptive) {
      const total = c.green + c.amber + c.red;
      const phi = (((time - this.waveUnits * cfg.greenWave) % total) + total) % total;
      this.state = phi < c.green ? 'GREEN' : phi < c.green + c.amber ? 'AMBER' : 'RED';
      return;
    }

    // Адаптивный («умный») режим: держим зелёный, пока есть подъезжающие,
    // и укорачиваем красный, когда копится очередь.
    this.tIn += dt;
    if (queueApproaching) this.lastDemandAt = time;
    const noDemand = time - this.lastDemandAt > 1.5;
    switch (this.state) {
      case 'GREEN':
        if ((this.tIn >= Math.max(5, c.green * 0.4) && noDemand) || this.tIn >= c.green * 2) {
          this.set('AMBER');
        }
        break;
      case 'AMBER':
        if (this.tIn >= c.amber) this.set('RED');
        break;
      case 'RED':
        if (this.tIn >= c.red || (this.tIn >= Math.max(4, c.red * 0.4) && queueApproaching)) {
          this.set('GREEN');
        }
        break;
    }
  }

  private set(s: LightPhase): void {
    this.state = s;
    this.tIn = 0;
  }

  /**
   * Должна ли машина со скоростью v на дистанции d до стоп-линии тормозить.
   * Жёлтый: останавливаемся, только если успеваем комфортно («дилемма-зона»).
   * Красный впритык на скорости: проезд, если даже экстренно не остановиться.
   */
  wantsStop(v: number, d: number, p: IDMParams): boolean {
    if (d < 0.3) return false; // стоп-линия уже пройдена
    if (this.state === 'GREEN') return false;
    if (this.state === 'AMBER') {
      return d > (v * v) / (2 * p.b * 1.4);
    }
    // RED
    if (v > 3 && d < v * 0.5 && d < (v * v) / (2 * p.bMax * 0.9)) return false;
    return true;
  }
}
