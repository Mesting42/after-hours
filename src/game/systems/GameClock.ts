/** The clock increases patrol pressure after 18:00; it never kills the player. */
export class GameClock {
  seconds = 0;
  elapsed = 0;
  update(dt: number): void { this.seconds += dt * 3; this.elapsed += dt; }
  get afterHours(): boolean { return this.seconds >= 300; }
  get label(): string {
    const minutes = 17 * 60 + 55 + Math.floor(this.seconds / 60);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
}
