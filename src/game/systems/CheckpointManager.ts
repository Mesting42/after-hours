import { AREAS } from '../data/levels';
import type { SaveData } from '../types';

export class CheckpointManager {
  /** Region boundaries are deliberately safe; retries never spawn inside a patrol cone. */
  enter(area: number, save: SaveData): void {
    save.area = area; save.checkpoint = { ...AREAS[area].checkpoint };
    save.unlocks = Math.max(save.unlocks, area);
  }
}
