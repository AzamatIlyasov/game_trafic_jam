import type { GridSim } from '../sim/grid/gridSim';
import { edgeXY } from '../sim/grid/network';

const ROAD_W = 7;

/** Рендер сеточной сети + машин + сигналов, с выбором перекрёстка по тапу. */
export class GridRenderer {
  private scale = 1;
  private offX = 0;
  private offY = 0;
  private dpr = 1;
  selected = -1;

  constructor(
    private readonly bg: HTMLCanvasElement,
    private readonly fg: HTMLCanvasElement,
  ) {}

  fit(sim: GridSim): void {
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
    const sp = sim.net.spacing;
    const w = (sim.net.cols - 1) * sp;
    const h = (sim.net.rows - 1) * sp;
    const margin = sp * 0.9;
    this.scale = Math.min(cssW / (w + margin * 2), cssH / (h + margin * 2));
    this.offX = (cssW - w * this.scale) / 2;
    this.offY = (cssH - h * this.scale) / 2;
    this.drawRoad(sim);
  }

  private setTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, this.offX * this.dpr, this.offY * this.dpr);
  }

  private curNodes: { id: number; x: number; y: number }[] = [];
  private curSpacing = 120;

  /** Экран → индекс ближайшего перекрёстка (или -1). */
  pick(clientX: number, clientY: number): number {
    const rect = this.fg.getBoundingClientRect();
    const wx = (clientX - rect.left - this.offX) / this.scale;
    const wy = (clientY - rect.top - this.offY) / this.scale;
    let best = -1;
    let bestD = (this.curSpacing * 0.45) ** 2;
    for (const n of this.curNodes) {
      const dx = n.x - wx;
      const dy = n.y - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  }

  private drawRoad(sim: GridSim): void {
    this.curSpacing = sim.net.spacing;
    this.curNodes = sim.net.intersections.map((id) => {
      const n = sim.net.nodes[id];
      return { id, x: n.x, y: n.y };
    });

    const ctx = this.bg.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.bg.width, this.bg.height);
    this.setTransform(ctx);
    ctx.lineCap = 'round';

    // полотно: все рёбра
    for (const pass of [
      { color: '#171b21', w: ROAD_W + 2 },
      { color: '#2b3038', w: ROAD_W },
    ]) {
      ctx.strokeStyle = pass.color;
      ctx.lineWidth = pass.w;
      ctx.beginPath();
      for (const e of sim.net.edges) {
        if (e.rev >= 0 && e.rev < e.id) continue; // рисуем пару один раз
        const A = edgeXY(e, 0);
        const B = edgeXY(e, e.len);
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
      }
      ctx.stroke();
    }

    // коробки перекрёстков
    ctx.fillStyle = '#20262f';
    for (const id of sim.net.intersections) {
      const n = sim.net.nodes[id];
      ctx.fillRect(n.x - sim.net.ib, n.y - sim.net.ib, sim.net.ib * 2, sim.net.ib * 2);
    }
  }

  draw(sim: GridSim): void {
    const ctx = this.fg.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.fg.width, this.fg.height);
    this.setTransform(ctx);
    const ib = sim.net.ib;

    // выделение выбранного перекрёстка
    if (this.selected >= 0 && !sim.net.nodes[this.selected]?.gate) {
      const n = sim.net.nodes[this.selected];
      ctx.strokeStyle = '#1f6feb';
      ctx.lineWidth = Math.max(1.2, 2 / this.scale);
      ctx.beginPath();
      ctx.arc(n.x, n.y, ib * 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    // сигналы: короткие цветные штрихи на подходах (NS сверху/снизу, EW слева/справа)
    for (const id of sim.net.intersections) {
      const n = sim.net.nodes[id];
      const light = sim.lightOf[id]!;
      const ns = light.movementState('V');
      const ew = light.movementState('H');
      const col = (s: string) => (s === 'GREEN' ? '#38d05f' : s === 'AMBER' ? '#ffbe2e' : '#ff453a');
      const bar = ib * 0.9;
      ctx.fillStyle = col(ns);
      ctx.fillRect(n.x - bar, n.y - ib - 2, bar * 2, 2); // верх (NS)
      ctx.fillRect(n.x - bar, n.y + ib, bar * 2, 2); // низ (NS)
      ctx.fillStyle = col(ew);
      ctx.fillRect(n.x - ib - 2, n.y - bar, 2, bar * 2); // лево (EW)
      ctx.fillRect(n.x + ib, n.y - bar, 2, bar * 2); // право (EW)
    }

    // машины
    const v0 = sim.cfg.idm.v0;
    const carW = Math.max(2, 2.4 / this.scale);
    for (const veh of sim.vehicles) {
      const e = sim.net.edges[veh.edge];
      const c = edgeXY(e, Math.max(0, veh.x - veh.len / 2));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(Math.atan2(e.uy, e.ux));
      if (veh.perturb > 0) {
        ctx.fillStyle = '#ff2d55';
        ctx.shadowColor = '#ff2d55';
        ctx.shadowBlur = 10;
      } else {
        const t = Math.max(0, Math.min(1, veh.v / (v0 * veh.v0f)));
        ctx.fillStyle = `hsl(${(t * 120).toFixed(0)} 85% 55%)`;
      }
      ctx.beginPath();
      ctx.roundRect(-veh.len / 2, -carW / 2, veh.len, carW, carW * 0.35);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
}
