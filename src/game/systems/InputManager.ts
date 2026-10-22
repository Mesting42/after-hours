import { clamp, type Action, type Point, type Settings } from '../types';

/** Pointer IDs belong to a single control, so multi-touch cannot steal joystick/camera input. */
export class InputManager {
  private keys = new Set<string>();
  private actions = new Set<Action>();
  private stick: Point = { x: 0, z: 0 };
  private touchRun = false;
  private cameraPointer: number | null = null;
  private cameraLast = { x: 0, y: 0 };
  cameraDelta = { x: 0, y: 0, zoom: 0 };
  gamepadName = '';
  enabled = false;
  constructor(private canvas: HTMLCanvasElement, public settings: Settings) {
    window.addEventListener('keydown', (event) => {
      if ((event.target as HTMLElement).matches('input,select,textarea')) return;
      const action = (Object.keys(this.settings.bindings) as Action[]).find((a) => this.settings.bindings[a] === event.code)
        ?? ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ControlLeft: 'crouch', ControlRight: 'crouch', ShiftRight: 'run' } as Record<string, Action>)[event.code];
      if (!action) return;
      if (this.enabled || action === 'pause') event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat) this.actions.add(action);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.enabled || this.cameraPointer !== null) return;
      if (event.pointerType === 'touch' && event.clientX < innerWidth * 0.42) return;
      this.cameraPointer = event.pointerId; this.cameraLast = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.cameraPointer) return;
      this.cameraDelta.x += event.clientX - this.cameraLast.x; this.cameraDelta.y += event.clientY - this.cameraLast.y;
      this.cameraLast = { x: event.clientX, y: event.clientY };
    });
    const release = (event: PointerEvent) => { if (event.pointerId === this.cameraPointer) this.cameraPointer = null; };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('wheel', (event) => { if (!this.enabled) return; event.preventDefault(); this.cameraDelta.zoom += event.deltaY * 0.014; }, { passive: false });
  }
  bindTouch(root: HTMLElement): void {
    const joystick = root.querySelector<HTMLElement>('#joystick')!, knob = joystick.querySelector<HTMLElement>('.joystick-knob')!;
    let owner: number | null = null;
    const move = (event: PointerEvent) => {
      const rect = joystick.getBoundingClientRect(), radius = rect.width * 0.36;
      const dx = event.clientX - rect.left - rect.width / 2, dy = event.clientY - rect.top - rect.height / 2;
      const length = Math.max(radius, Math.hypot(dx, dy));
      this.stick = { x: dx / length, z: -dy / length };
      knob.style.transform = `translate(${dx / length * radius}px, ${dy / length * radius}px)`;
    };
    joystick.addEventListener('pointerdown', (event) => { if (owner !== null) return; owner = event.pointerId; joystick.setPointerCapture(owner); move(event); });
    joystick.addEventListener('pointermove', (event) => { if (event.pointerId === owner) move(event); });
    const release = (event: PointerEvent) => { if (owner === event.pointerId) { owner = null; this.stick = { x: 0, z: 0 }; knob.style.transform = ''; } };
    joystick.addEventListener('pointerup', release); joystick.addEventListener('pointercancel', release); joystick.addEventListener('lostpointercapture', release);
    root.querySelectorAll<HTMLElement>('[data-touch]').forEach((button) => {
      const action = button.dataset.touch as Action;
      button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); if (action === 'run') this.touchRun = true; else this.actions.add(action); });
      const up = () => { if (action === 'run') this.touchRun = false; };
      button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('lostpointercapture', up);
    });
  }
  private gamepadPrev = new Set<number>();
  movement(): Point {
    const down = (action: Action) => this.keys.has(this.settings.bindings[action]);
    // Default arrow aliases remain available only while that key is not rebound elsewhere.
    const alias = (code: string) => this.keys.has(code) && !Object.values(this.settings.bindings).includes(code);
    let x = Number(down('right') || alias('ArrowRight')) - Number(down('left') || alias('ArrowLeft')) + this.stick.x;
    let z = Number(down('up') || alias('ArrowUp')) - Number(down('down') || alias('ArrowDown')) + this.stick.z;
    if (this.settings.gamepad) {
      const pad = navigator.getGamepads?.()[0];
      this.gamepadName = pad?.id ?? '';
      if (pad) {
        x += Math.abs(pad.axes[0]) > 0.16 ? pad.axes[0] : 0; z -= Math.abs(pad.axes[1]) > 0.16 ? pad.axes[1] : 0;
        this.cameraDelta.x += (Math.abs(pad.axes[2]) > 0.16 ? pad.axes[2] : 0) * 6;
        this.cameraDelta.y += (Math.abs(pad.axes[3]) > 0.16 ? pad.axes[3] : 0) * 4;
        const map: Record<number, Action> = { 0: 'interact', 1: 'crouch', 2: 'noise', 3: 'hide', 9: 'pause' };
        for (const [i, action] of Object.entries(map)) if (pad.buttons[+i]?.pressed && !this.gamepadPrev.has(+i)) this.actions.add(action);
        this.gamepadPrev = new Set(pad.buttons.map((b, i) => b.pressed ? i : -1).filter((i) => i >= 0));
      }
    }
    const length = Math.max(1, Math.hypot(x, z));
    return { x: x / length, z: z / length };
  }
  get running(): boolean { return this.keys.has(this.settings.bindings.run) || (this.keys.has('ShiftRight') && !Object.values(this.settings.bindings).includes('ShiftRight')) || this.touchRun || !!(this.settings.gamepad && navigator.getGamepads?.()[0]?.buttons[4]?.pressed); }
  consume(action: Action): boolean { const result = this.actions.has(action); this.actions.delete(action); return result; }
  consumeCamera(): typeof this.cameraDelta { const delta = { ...this.cameraDelta }; this.cameraDelta = { x: 0, y: 0, zoom: 0 }; return delta; }
  clear(): void { this.keys.clear(); this.actions.clear(); this.stick = { x: 0, z: 0 }; this.touchRun = false; this.cameraPointer = null; }
}
