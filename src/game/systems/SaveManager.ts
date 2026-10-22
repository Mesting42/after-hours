import { AREAS } from '../data/levels';
import type { SaveData } from '../types';

export const SAVE_KEY = 'after-hours.save.v1';
export const freshSave = (difficulty: SaveData['difficulty'] = 'normal'): SaveData => ({
  version: 1, area: 0, checkpoint: { ...AREAS[0].checkpoint }, inventory: [], completed: [], tutorial: [],
  difficulty, clockSeconds: 0, elapsed: 0, ending: null, unlocks: 0, updatedAt: new Date().toISOString(), distractionUsed: false,
});

/** Strict validation prevents invalid coordinates/flags from soft-locking a run. */
export class SaveManager {
  constructor(readonly key = SAVE_KEY) {}
  recovered = false;
  storageAvailable = true;
  private sessionSnapshot: SaveData | null = null;
  load(): SaveData | null {
    // Checkpoint retries keep working when persistence is denied or the quota is exhausted.
    if (this.sessionSnapshot) return structuredClone(this.sessionSnapshot);
    try {
      const text = localStorage.getItem(this.key);
      if (!text) return null;
      const data: unknown = JSON.parse(text);
      if (!SaveManager.valid(data)) { this.recovered = true; return null; }
      this.sessionSnapshot = structuredClone(data);
      return structuredClone(data);
    } catch { this.recovered = true; return null; }
  }
  static valid(raw: unknown): raw is SaveData {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as SaveData;
    return s.version === 1 && Number.isInteger(s.area) && s.area >= 0 && s.area < 5
      && (s.difficulty === 'normal' || s.difficulty === 'hard')
      && s.checkpoint && Number.isFinite(s.checkpoint.x) && Math.abs(s.checkpoint.x) <= 16
      && Number.isFinite(s.checkpoint.z) && s.checkpoint.z >= AREAS[s.area].start && s.checkpoint.z <= AREAS[s.area].end
      && [s.inventory, s.completed, s.tutorial].every((list) => Array.isArray(list) && list.every((x) => typeof x === 'string' && x.length < 100))
      && Number.isFinite(s.clockSeconds) && s.clockSeconds >= 0 && Number.isFinite(s.elapsed) && s.elapsed >= 0
      && Number.isInteger(s.unlocks) && s.unlocks >= s.area && s.unlocks <= 4
      && (s.ending === null || typeof s.ending === 'string') && typeof s.distractionUsed === 'boolean';
  }
  write(data: SaveData): void {
    data.updatedAt = new Date().toISOString();
    this.sessionSnapshot = structuredClone(data);
    try { localStorage.setItem(this.key, JSON.stringify(data)); this.storageAvailable = true; }
    catch { this.storageAvailable = false; }
  }
}
