import type { IDMParams } from './types';

/**
 * Ускорение по Intelligent Driver Model.
 * @param p    параметры модели
 * @param v    собственная скорость, м/с
 * @param s    чистый зазор до лидера, м (Infinity = свободная дорога)
 * @param dv   скорость сближения v - vLead, м/с
 * @param v0   желаемая скорость этого водителя, м/с
 */
export function idmAccel(p: IDMParams, v: number, s: number, dv: number, v0: number): number {
  const free = 1 - Math.pow(v / v0, p.delta);
  if (!isFinite(s)) return p.a * free;
  const sSafe = Math.max(s, 0.1);
  const sStar = p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.a * p.b)));
  return p.a * (free - (sStar / sSafe) ** 2);
}
