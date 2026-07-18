import type { Simulation } from './sim/simulation';

const ROAD_W = 9; // ширина дороги, м

/** Рисует дорогу (статичный слой) и машины/светофоры (каждый кадр). */
export class Renderer {
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private dpr = 1;

  constructor(
    private readonly bg: HTMLCanvasElement,
    private readonly fg: HTMLCanvasElement,
  ) {}

  /** Подгон под размер контейнера и мировые границы дороги; перерисовка фона. */
  fit(sim: Simulation): void {
    const parent = this.bg.parentElement!;
    const cssW = parent.clientWidth;
    const cssH = parent.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.bg, this.fg]) {
      c.width = Math.max(1, Math.round(cssW * this.dpr));
      c.height = Math.max(1, Math.round(cssH * this.dpr));
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }

    const b = sim.geom.bounds();
    const margin = ROAD_W * 1.6;
    const worldW = b.maxX - b.minX + margin * 2;
    const worldH = b.maxY - b.minY + margin * 2;
    this.scale = Math.min(cssW / worldW, cssH / worldH);
    this.offX = (cssW - (b.maxX - b.minX) * this.scale) / 2 - b.minX * this.scale;
    this.offY = (cssH - (b.maxY - b.minY) * this.scale) / 2 - b.minY * this.scale;

    this.drawRoad(sim);
  }

  private setTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(
      this.scale * this.dpr, 0, 0,
      this.scale * this.dpr,
      this.offX * this.dpr, this.offY * this.dpr,
    );
  }

  private roadPath(sim: Simulation): Path2D {
    const path = new Path2D();
    const step = 4;
    const p0 = sim.geom.toXY(0);
    path.moveTo(p0.x, p0.y);
    for (let d = step; d <= sim.roadLen; d += step) {
      const p = sim.geom.toXY(d);
      path.lineTo(p.x, p.y);
    }
    if (sim.geom.isRing) path.closePath();
    return path;
  }

  private drawRoad(sim: Simulation): void {
    const ctx = this.bg.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.bg.width, this.bg.height);
    this.setTransform(ctx);

    const path = this.roadPath(sim);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // обочина + полотно
    ctx.strokeStyle = '#171b21';
    ctx.lineWidth = ROAD_W + 2.4;
    ctx.stroke(path);
    ctx.strokeStyle = '#2b3038';
    ctx.lineWidth = ROAD_W;
    ctx.stroke(path);

    // осевая пунктирная
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 0.4;
    ctx.setLineDash([3, 5]);
    ctx.stroke(path);
    ctx.setLineDash([]);

    // стоп-линии
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.0;
    for (const light of sim.lights) {
      const p = sim.geom.toXY(light.pos);
      const nx = Math.cos(p.angle + Math.PI / 2);
      const ny = Math.sin(p.angle + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(p.x - (nx * ROAD_W) / 2, p.y - (ny * ROAD_W) / 2);
      ctx.lineTo(p.x + (nx * ROAD_W) / 2, p.y + (ny * ROAD_W) / 2);
      ctx.stroke();
    }

    // стрелка направления в начале
    const pa = sim.geom.toXY(sim.roadLen * 0.02);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.save();
    ctx.translate(pa.x, pa.y);
    ctx.rotate(pa.angle);
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(-2, -2.2);
    ctx.lineTo(-2, 2.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Динамический слой: машины + сигналы светофоров. */
  draw(sim: Simulation): void {
    const ctx = this.fg.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.fg.width, this.fg.height);
    this.setTransform(ctx);

    // светофоры: сигнал сбоку от стоп-линии
    for (const light of sim.lights) {
      const p = sim.geom.toXY(light.pos);
      const nx = Math.cos(p.angle + Math.PI / 2);
      const ny = Math.sin(p.angle + Math.PI / 2);
      const lx = p.x + nx * (ROAD_W / 2 + 4);
      const ly = p.y + ny * (ROAD_W / 2 + 4);
      const r = Math.max(2.2, 5 / this.scale);
      const color =
        light.state === 'GREEN' ? '#38d05f' : light.state === 'AMBER' ? '#ffbe2e' : '#ff453a';
      ctx.beginPath();
      ctx.arc(lx, ly, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#0d0f12';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // машины
    const v0 = sim.cfg.idm.v0;
    const minLen = 4.5 / this.scale; // не меньше ~4.5px на экране
    const carW = Math.max(2.3, 2.6 / this.scale);
    for (const veh of sim.vehicles) {
      const len = Math.max(veh.len, minLen);
      const center = sim.geom.toXY(veh.x - veh.len / 2);
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(center.angle);
      if (veh.perturb > 0) {
        ctx.fillStyle = '#ff2d55';
        ctx.shadowColor = '#ff2d55';
        ctx.shadowBlur = 12;
      } else {
        const t = Math.max(0, Math.min(1, veh.v / (v0 * veh.v0f)));
        ctx.fillStyle = `hsl(${(t * 120).toFixed(0)} 85% 55%)`;
      }
      ctx.beginPath();
      ctx.roundRect(-len / 2, -carW / 2, len, carW, carW * 0.35);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
}
