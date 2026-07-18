/** Узел сети: перекрёсток или «ворота» на краю (въезд/выезд за карту). */
export interface GNode {
  id: number;
  x: number;
  y: number;
  gate: boolean;
  r: number;
  c: number;
  /** исходящие рёбра */
  out: number[];
}

/** Направленное ребро (полоса) между двумя узлами. */
export interface GEdge {
  id: number;
  from: number;
  to: number;
  /** ориентация улицы: 'H' — запад-восток, 'V' — север-юг */
  ori: 'H' | 'V';
  ux: number;
  uy: number;
  /** точка x=0 (мировые координаты) */
  sx: number;
  sy: number;
  len: number;
  /** обратное ребро (та же пара узлов, встречное направление) */
  rev: number;
}

export interface GridNetwork {
  nodes: GNode[];
  edges: GEdge[];
  /** индексы внутренних перекрёстков (r*cols+c) */
  intersections: number[];
  /** входные рёбра-стабы от ворот внутрь */
  sources: number[];
  rows: number;
  cols: number;
  spacing: number;
  /** половина «коробки» перекрёстка, м */
  ib: number;
}

const IB = 6; // half-size коробки перекрёстка, м

export function buildGrid(rows: number, cols: number, spacing: number): GridNetwork {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];

  const idx = (r: number, c: number) => r * cols + c;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({ id: idx(r, c), x: c * spacing, y: r * spacing, gate: false, r, c, out: [] });
    }
  }

  function mkEdge(from: number, to: number): number {
    const F = nodes[from];
    const T = nodes[to];
    const dx = T.x - F.x;
    const dy = T.y - F.y;
    const d = Math.hypot(dx, dy);
    const ux = dx / d;
    const uy = dy / d;
    // старт: за коробкой узла-источника (если это перекрёсток), иначе от ворот
    const sOff = F.gate ? 0 : IB;
    const eOff = T.gate ? 0 : IB;
    const sx = F.x + ux * sOff;
    const sy = F.y + uy * sOff;
    const len = d - sOff - eOff;
    const id = edges.length;
    edges.push({
      id,
      from,
      to,
      ori: Math.abs(dx) > Math.abs(dy) ? 'H' : 'V',
      ux,
      uy,
      sx,
      sy,
      len,
      rev: -1,
    });
    nodes[from].out.push(id);
    return id;
  }

  function pair(a: number, b: number): void {
    const e1 = mkEdge(a, b);
    const e2 = mkEdge(b, a);
    edges[e1].rev = e2;
    edges[e2].rev = e1;
  }

  // внутренние связи: вправо и вниз (каждая пара один раз)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols) pair(idx(r, c), idx(r, c + 1));
      if (r + 1 < rows) pair(idx(r, c), idx(r + 1, c));
    }
  }

  // ворота на краях: для каждого недостающего соседа
  const sources: number[] = [];
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) continue;
        const gate: GNode = {
          id: nodes.length,
          x: (c + dc * 0.7) * spacing,
          y: (r + dr * 0.7) * spacing,
          gate: true,
          r: nr,
          c: nc,
          out: [],
        };
        nodes.push(gate);
        const inb = mkEdge(gate.id, idx(r, c)); // въезд внутрь
        const outb = mkEdge(idx(r, c), gate.id); // выезд наружу
        edges[inb].rev = outb;
        edges[outb].rev = inb;
        sources.push(inb);
      }
    }
  }

  const intersections: number[] = [];
  for (let i = 0; i < rows * cols; i++) intersections.push(i);

  return { nodes, edges, intersections, sources, rows, cols, spacing, ib: IB };
}

/** Мировые координаты переднего бампера на ребре при позиции x. */
export function edgeXY(e: GEdge, x: number): { x: number; y: number } {
  return { x: e.sx + e.ux * x, y: e.sy + e.uy * x };
}
