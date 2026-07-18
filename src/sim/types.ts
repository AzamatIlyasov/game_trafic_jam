/** Параметры модели Intelligent Driver Model (метрические единицы). */
export interface IDMParams {
  /** желаемая скорость, м/с */
  v0: number;
  /** безопасный временной интервал, с */
  T: number;
  /** максимальное комфортное ускорение, м/с² */
  a: number;
  /** комфортное торможение, м/с² */
  b: number;
  /** экспонента ускорения */
  delta: number;
  /** минимальный зазор в заторе, м */
  s0: number;
  /** физический предел торможения, м/с² */
  bMax: number;
}

export type Mode = 'ring' | 'arterial';

export type LightPhase = 'GREEN' | 'AMBER' | 'RED';

export interface CycleConfig {
  green: number;
  amber: number;
  red: number;
}

export interface SimConfig {
  mode: Mode;
  /** длина кольца, м */
  ringLength: number;
  /** число машин на кольце */
  numVehicles: number;
  /** светофоры на кольце (0..4) */
  ringLights: number;
  /** число перекрёстков на магистрали */
  numIntersections: number;
  /** дистанция между перекрёстками, м */
  spacing: number;
  /** интенсивность въезда, машин/мин (магистраль) */
  spawnPerMin: number;
  idm: IDMParams;
  cycle: CycleConfig;
  /** смещение фаз «зелёной волны» между соседними светофорами, с */
  greenWave: number;
  /** адаптивные («умные») светофоры */
  adaptive: boolean;
}

export interface Vehicle {
  id: number;
  /** позиция переднего бампера вдоль пути, м */
  x: number;
  /** скорость, м/с */
  v: number;
  /** длина, м */
  len: number;
  /** индивидуальный множитель желаемой скорости (разные водители) */
  v0f: number;
  /** оставшееся время принудительного торможения («вызвать пробку»), с */
  perturb: number;
  /** накопленное время простоя (v < 0.5 м/с), с */
  wait: number;
}

export const DEFAULT_IDM: IDMParams = {
  v0: 50 / 3.6,
  T: 1.2,
  a: 0.7,
  b: 2.0,
  delta: 4,
  s0: 2.0,
  bMax: 9.0,
};

export const DEFAULT_CONFIG: SimConfig = {
  mode: 'ring',
  ringLength: 600,
  numVehicles: 42,
  ringLights: 0,
  numIntersections: 5,
  spacing: 250,
  spawnPerMin: 18,
  idm: { ...DEFAULT_IDM },
  cycle: { green: 18, amber: 3, red: 18 },
  greenWave: 0,
  adaptive: false,
};
