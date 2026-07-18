/** Игровой цикл: фиксированный шаг физики + аккумулятор, рендер отвязан. */
export class GameLoop {
  running = true;
  speed = 1;

  private static readonly DT = 1 / 60;
  private static readonly MAX_STEPS = 240;
  private acc = 0;
  private last = performance.now();

  constructor(
    private readonly onStep: (dt: number) => void,
    private readonly onRender: () => void,
  ) {}

  start(): void {
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    const ft = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    if (this.running) {
      this.acc += ft * this.speed;
      let steps = 0;
      while (this.acc >= GameLoop.DT && steps < GameLoop.MAX_STEPS) {
        this.onStep(GameLoop.DT);
        this.acc -= GameLoop.DT;
        steps++;
      }
      if (steps >= GameLoop.MAX_STEPS) this.acc = 0; // защита от «спирали смерти»
    }
    this.onRender();
    requestAnimationFrame(this.frame);
  };
}
