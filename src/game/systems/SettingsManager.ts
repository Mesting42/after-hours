import { clamp, type Action, type Settings } from '../types';

export const SETTINGS_KEY = 'after-hours.settings.v1';
export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium', shadows: true, lightCount: 4, antialias: true, dynamicLights: true,
  particles: true, textureQuality: 1, renderScale: 1, postProcessing: true, showFPS: false, autoQuality: true,
  sensitivity: 1, invertCamera: false, cameraDistance: 23, fov: 55,
  bindings: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', run: 'ShiftLeft', crouch: 'KeyC', interact: 'KeyE', noise: 'KeyQ', hide: 'KeyH', pause: 'Escape' },
  joystickSize: 120, buttonOpacity: 0.8, gamepad: true,
  masterVolume: 0.65, musicVolume: 0.25, effectsVolume: 0.7,
  reducedMotion: false, highContrast: false, hints: true, visibleCones: true,
};

/** Storage is best-effort: private browsing / full quota must never stop play. */
export class SettingsManager {
  value: Settings;
  storageAvailable = true;
  constructor(private key = SETTINGS_KEY) {
    this.value = structuredClone(DEFAULT_SETTINGS);
    if (typeof matchMedia !== 'undefined') this.value.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { const raw = localStorage.getItem(this.key); if (raw) this.value = SettingsManager.validate(JSON.parse(raw)); }
    catch { this.storageAvailable = false; }
  }
  static validate(raw: unknown): Settings {
    const output = structuredClone(DEFAULT_SETTINGS);
    if (!raw || typeof raw !== 'object') return output;
    const candidate = raw as Record<string, unknown>;
    for (const key of Object.keys(output) as (keyof Settings)[]) {
      const value = candidate[key];
      if (typeof output[key] === 'boolean' && typeof value === 'boolean') (output as unknown as Record<string, unknown>)[key] = value;
    }
    const ranges: Partial<Record<keyof Settings, [number, number]>> = {
      lightCount: [1, 6], textureQuality: [0.5, 2], renderScale: [0.5, 1.5], sensitivity: [0.2, 2.5],
      cameraDistance: [15, 34], fov: [40, 80], joystickSize: [90, 160], buttonOpacity: [0.3, 1],
      masterVolume: [0, 1], musicVolume: [0, 1], effectsVolume: [0, 1],
    };
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = candidate[key];
      if (typeof value === 'number' && Number.isFinite(value)) (output as unknown as Record<string, unknown>)[key] = clamp(value, min, max);
    }
    if (['low', 'medium', 'high'].includes(String(candidate.quality))) output.quality = candidate.quality as Settings['quality'];
    if (candidate.bindings && typeof candidate.bindings === 'object') {
      for (const action of Object.keys(output.bindings) as Action[]) {
        const code = (candidate.bindings as Record<string, unknown>)[action];
        if (typeof code === 'string' && /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Space|Escape|Enter|Tab)$/.test(code)) output.bindings[action] = code;
      }
      // Pause is always recoverable through Escape, regardless of custom bindings.
      output.bindings.pause = 'Escape';
    }
    return output;
  }
  update(next: Partial<Settings>): void {
    this.value = SettingsManager.validate({ ...this.value, ...next });
    try { localStorage.setItem(this.key, JSON.stringify(this.value)); }
    catch { this.storageAvailable = false; }
  }
  preset(quality: Settings['quality']): void {
    this.update({ quality, shadows: quality !== 'low', lightCount: quality === 'high' ? 6 : quality === 'medium' ? 4 : 1,
      antialias: quality !== 'low', particles: quality !== 'low', dynamicLights: quality !== 'low',
      postProcessing: quality !== 'low', renderScale: quality === 'low' ? 0.7 : 1, textureQuality: quality === 'high' ? 2 : quality === 'medium' ? 1 : 0.5 });
  }
}
