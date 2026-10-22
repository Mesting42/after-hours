import type { Settings } from '../types';

export interface QualityProfile { renderScale: number; maxPixels: number; postProcessing: boolean; shadows: boolean; shadowSize: number; lightCount: number; dynamicLights: boolean; antialias: boolean; particles: boolean }

/** Pure frame-budget policy. It never changes saved settings or simulation speed. */
export class AdaptiveQuality {
  level = 0;
  private elapsed = 0;
  private windowTime = 0;
  private frames = 0;

  reset(): void { this.level = 0; this.elapsed = 0; this.clearWindow(); }
  private clearWindow(): void { this.windowTime = 0; this.frames = 0; }

  /** Sustained slow frames lower one tier. Pauses and one-off stalls are excluded.
   * A session only moves down, avoiding repeated resolution jumps at a 60 Hz cap.
   * Explicitly applying settings starts a new assessment from the user's choices.
   */
  sample(frameMs: number, active: boolean): boolean {
    if (!active) { this.elapsed = 0; this.clearWindow(); return false; }
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return false;
    this.elapsed += frameMs;
    if (this.elapsed < 3000 || this.level >= 4) return false;
    this.windowTime += frameMs; this.frames++;
    if (this.windowTime < 2000) return false;
    const slow = this.windowTime / this.frames > 18.5;
    this.clearWindow();
    if (!slow) return false;
    this.level++; return true;
  }
}

/** User selections are ceilings. Adaptive tiers can only reduce their GPU cost. */
export function qualityProfile(settings: Settings, level: number): QualityProfile {
  const tier = settings.autoQuality ? Math.max(0, Math.min(4, level)) : 0;
  return {
    renderScale: Math.max(.5, settings.renderScale * [1, .9, .8, .7, .6][tier]),
    maxPixels: [Infinity, 1_800_000, 1_300_000, 950_000, 700_000][tier],
    postProcessing: settings.postProcessing && tier === 0,
    shadows: settings.shadows && tier < 3,
    shadowSize: Math.min(settings.quality === 'high' ? 2048 : settings.quality === 'low' ? 512 : 1024, tier ? 512 : 2048),
    lightCount: Math.min(settings.lightCount, [6, 2, 1, 1, 1][tier]),
    dynamicLights: settings.dynamicLights && tier < 4,
    antialias: settings.antialias && tier < 4,
    particles: settings.particles && tier < 3,
  };
}
