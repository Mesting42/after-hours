import { distance, type NoiseEvent, type Point } from '../types';
import type { NavigationSystem } from './NavigationSystem';

/** A small fixed event pool: events expire, wall crossings attenuate hearing. */
export class NoiseSystem {
  events: NoiseEvent[] = [];
  constructor(private navigation: NavigationSystem) {}
  emit(position: Point, radius: number, distraction = false): void {
    if (this.events.length >= 12) this.events.shift();
    this.events.push({ ...position, radius, age: 0, distraction });
  }
  update(dt: number): void { for (const n of this.events) n.age += dt; this.events = this.events.filter((n) => n.age < (n.distraction ? 8 : 1.8)); }
  audibleAt(position: Point, sensitivity: number): NoiseEvent | undefined {
    return this.events.find((n) => {
      const length = distance(position, n);
      let attenuation = 1;
      for (const r of this.navigation.blockers) {
        if (!r.active) continue;
        for (let t = 0.1; t < 1; t += 0.1) {
          const x = position.x + (n.x - position.x) * t, z = position.z + (n.z - position.z) * t;
          if (Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2) { attenuation *= 0.72; break; }
        }
      }
      return length <= n.radius * sensitivity * attenuation;
    });
  }
}
