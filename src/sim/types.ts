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

export type Mode = 'ring' | 'arterial' | 'grid';

export type LightPhase = 'GREEN' | 'AMBER' | 'RED';

export interface CycleConfig {
  green: number;
  amber: number;
  red: number;
}

/** Настройки одного перекрёстка в сеточном режиме. */
export interface LightCfg {
  /** зелёный север-юг (вертикальные улицы), с */
  greenNS: number;
  /** зелёный запад-восток (горизонтальные улицы), с */
  greenEW: number;
  amber: number;
  /** сдвиг фазы, с */
  offset: number;
  /** адаптивный режим */
  adaptive: boolean;
  /** начинать с зелёного С-Ю */
  startNS: boolean;
}

export interface GridCfg {
  rows: number;
  cols: number;
  spacing: number;
  spawnPerMin: number;
  /** дефолт для всех перекрёстков */
  defLight: LightCfg;
  /** переопределения по перекрёсткам, ключ "r,c" */
  overrides: Record<string, Partial<LightCfg>>;
}

/** Метрики симуляции (общие для всех режимов). */
export interface SimStats {
  n: number;
  /** средняя скорость, м/с */
  avgV: number;
  /** поток через детектор, машин/час */
  flowPerH: number;
  /** доля стоящих машин (v < 1 м/с) */
  stoppedFrac: number;
  /** суммарное время простоя всех машин, с */
  totalWait: number;
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
  /** настройки сеточного режима */
  grid: GridCfg;
}

export function defaultLightCfg(): LightCfg {
  return { greenNS: 16, greenEW: 16, amber: 3, offset: 0, adaptive: false, startNS: true };
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
  grid: {
    rows: 4,
    cols: 4,
    spacing: 130,
    spawnPerMin: 90,
    defLight: { greenNS: 16, greenEW: 16, amber: 3, offset: 0, adaptive: false, startNS: true },
    overrides: {},
  },
};
