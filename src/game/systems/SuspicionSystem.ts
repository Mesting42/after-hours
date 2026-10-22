import { clamp, type Difficulty, type PlayerState } from '../types';
import { DIFFICULTIES } from '../data/levels';

export class SuspicionSystem {
  static step(value: number, visible: number, dt: number, difficulty: Difficulty, state: PlayerState, sensitivity = 1, illumination = 1): number {
    if (state === 'Hiding') visible = 0;
    const posture = state === 'Crouching' ? 0.42 : state === 'Running' ? 1.8 : 1;
    const amount = visible > 0
      ? (16 + 24 * visible) * DIFFICULTIES[difficulty].detection * posture * sensitivity * illumination
      : -DIFFICULTIES[difficulty].decay;
    return clamp(value + amount * dt, 0, 100);
  }
}
