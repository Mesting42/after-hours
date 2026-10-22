import type { Settings } from '../types';

/** A bounded local-file voice pool avoids allocating a sound source every footstep. */
export class AudioManager {
  private pools = new Map<string, HTMLAudioElement[]>();
  private ambient: HTMLAudioElement;
  private unlocked = false;
  constructor(private settings: Settings) {
    for (const name of ['footstep', 'alert', 'lift-bell', 'interact', 'printer']) {
      const voices = Array.from({ length: name === 'footstep' ? 4 : 2 }, () => { const audio = new Audio(`${import.meta.env.BASE_URL}assets/audio/${name}.wav`); audio.preload = 'auto'; return audio; });
      this.pools.set(name, voices);
    }
    this.ambient = new Audio(`${import.meta.env.BASE_URL}assets/audio/ambient.wav`); this.ambient.loop = true; this.ambient.preload = 'auto'; this.update(settings);
  }
  unlock(): void { this.unlocked = true; this.resume(); }
  update(settings: Settings): void {
    this.settings = settings; this.ambient.volume = settings.masterVolume * settings.musicVolume;
    for (const voices of this.pools.values()) for (const audio of voices) audio.volume = settings.masterVolume * settings.effectsVolume;
  }
  play(name: string, scale = 1): void {
    if (!this.unlocked) return;
    const audio = this.pools.get(name)?.find((a) => a.paused || a.ended); if (!audio) return;
    audio.currentTime = 0; audio.volume = this.settings.masterVolume * this.settings.effectsVolume * scale;
    void audio.play().catch(() => {});
  }
  pause(): void { this.ambient.pause(); for (const pool of this.pools.values()) for (const voice of pool) voice.pause(); }
  resume(): void { if (this.unlocked && this.ambient.volume > 0) void this.ambient.play().catch(() => {}); }
}
