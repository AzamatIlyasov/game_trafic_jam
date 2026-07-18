/** Точка на пути: мировые координаты (метры) + направление движения. */
export interface PathPoint {
  x: number;
  y: number;
  angle: number;
}

interface Piece {
  len: number;
  toXY(u: number): PathPoint;
}

function linePiece(x0: number, y0: number, dx: number, dy: number, len: number): Piece {
  const angle = Math.atan2(dy, dx);
  return {
    len,
    toXY: (u) => ({ x: x0 + dx * u, y: y0 + dy * u, angle }),
  };
}

function arcPiece(cx: number, cy: number, r: number, a0: number, sweep: number): Piece {
  const len = Math.abs(sweep) * r;
  const dir = Math.sign(sweep);
  return {
    len,
    toXY: (u) => {
      const th = a0 + sweep * (u / len);
      return {
        x: cx + r * Math.cos(th),
        y: cy + r * Math.sin(th),
        angle: th + (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      };
    },
  };
}

/** 1D-путь из отрезков и дуг; вся симуляция живёт в координате «дистанция вдоль пути». */
export class PathGeometry {
  readonly total: number;
  private readonly cum: number[] = [];

  constructor(
    private readonly pieces: Piece[],
    readonly isRing: boolean,
  ) {
    let acc = 0;
    for (const p of pieces) {
      this.cum.push(acc);
      acc += p.len;
    }
    this.total = acc;
  }

  toXY(d: number): PathPoint {
    let dd = d;
    if (this.isRing) {
      dd = ((d % this.total) + this.total) % this.total;
    } else {
      dd = Math.min(Math.max(dd, 0), this.total - 1e-6);
    }
    // линейный поиск: кусков мало (< 30)
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      if (dd >= this.cum[i] - 1e-9) {
        return this.pieces[i].toXY(Math.min(dd - this.cum[i], this.pieces[i].len));
      }
    }
    return this.pieces[0].toXY(0);
  }

  /** Габариты в мировых координатах (для вписывания в canvas). */
  bounds(step = 4): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let d = 0; d <= this.total; d += step) {
      const p = this.toXY(d);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  }
}

/** Кольцевая дорога заданной длины. */
export function makeRing(length: number): PathGeometry {
  const r = length / (2 * Math.PI);
  return new PathGeometry([arcPiece(0, 0, r, -Math.PI / 2, 2 * Math.PI)], true);
}

export interface Serpentine {
  geom: PathGeometry;
  /** перевод «дистанции по прямой» (без дуг) в дистанцию вдоль пути */
  straightToPath(sd: number): number;
}

/**
 * Магистраль-«серпантин»: длинная дорога складывается в несколько рядов
 * с разворотами, чтобы влезать в экран телефона.
 */
export function makeSerpentine(totalStraight: number, rowGap = 42): Serpentine {
  const rows = Math.min(8, Math.max(1, Math.ceil(totalStraight / 620)));
  const rowLen = totalStraight / rows;
  const r = rowGap / 2;
  const arcLen = Math.PI * r;

  const pieces: Piece[] = [];
  for (let row = 0; row < rows; row++) {
    const y = row * rowGap;
    const even = row % 2 === 0;
    if (even) {
      pieces.push(linePiece(0, y, 1, 0, rowLen));
      if (row < rows - 1) pieces.push(arcPiece(rowLen, y + r, r, -Math.PI / 2, Math.PI));
    } else {
      pieces.push(linePiece(rowLen, y, -1, 0, rowLen));
      if (row < rows - 1) pieces.push(arcPiece(0, y + r, r, -Math.PI / 2, -Math.PI));
    }
  }

  const geom = new PathGeometry(pieces, false);
  const straightToPath = (sd: number) => {
    const row = Math.min(rows - 1, Math.floor(sd / rowLen));
    return sd + row * arcLen;
  };
  return { geom, straightToPath };
}
