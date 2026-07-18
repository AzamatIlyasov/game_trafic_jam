import type { Simulation } from './sim/simulation';

/**
 * Диаграмма пространство-время: X = позиция на дороге, вниз = прошлое.
 * Цвет точки = скорость машины. «Фантомная» пробка видна как красные
 * диагональные полосы, бегущие назад по потоку.
 */
export class SpaceTime {
  private readonly ctx: CanvasRenderingContext2D;
  private accT = 0;
  private static readonly INTERVAL = 0.12; // сим-секунд на строку

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const parent = this.canvas.parentElement!;
    this.canvas.width = Math.max(1, parent.clientWidth);
    this.canvas.height = Math.max(1, parent.clientHeight);
    this.clear();
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = '#10141a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.accT = 0;
  }

  /** Вызывается на каждый шаг физики; сам решает, когда рисовать строку. */
  sample(sim: Simulation, dtSim: number): void {
    this.accT += dtSim;
    while (this.accT >= SpaceTime.INTERVAL) {
      this.accT -= SpaceTime.INTERVAL;
      this.pushRow(sim);
    }
  }

  private pushRow(sim: Simulation): void {
    const { width: w, height: h } = this.canvas;
    const ctx = this.ctx;
    // сдвигаем историю на 1px вниз, новая строка сверху
    ctx.drawImage(this.canvas, 0, 0, w, h - 1, 0, 1, w, h - 1);
    ctx.fillStyle = '#10141a';
    ctx.fillRect(0, 0, w, 1);

    // маркеры красных светофоров
    for (const light of sim.lights) {
      if (light.state !== 'RED') continue;
      const px = (light.pos / sim.roadLen) * w;
      ctx.fillStyle = 'rgba(255,69,58,0.35)';
      ctx.fillRect(px - 1, 0, 3, 1);
    }

    const v0 = sim.cfg.idm.v0;
    for (const veh of sim.vehicles) {
      const px = (veh.x / sim.roadLen) * w;
      const t = Math.max(0, Math.min(1, veh.v / v0));
      ctx.fillStyle = `hsl(${(t * 120).toFixed(0)} 90% 55%)`;
      ctx.fillRect(px - 1, 0, 2, 1);
    }
  }
}
