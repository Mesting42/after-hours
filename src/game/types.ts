/** Shared domain contracts. Rendering and storage consume these, never each other. */
export type Difficulty = 'normal' | 'hard';
export type PlayerState = 'Normal' | 'Crouching' | 'Running' | 'Hiding' | 'Interacting' | 'Discovered' | 'Escaping';
export type LeaderState = 'Patrol' | 'Idle' | 'Suspicious' | 'Investigate' | 'Search' | 'Chase' | 'Return';
export type LeaderKind = 'department' | 'roaming' | 'security';
export type GamePhase = 'menu' | 'playing' | 'paused' | 'failed' | 'escaping' | 'victory';
export type Action = 'up' | 'down' | 'left' | 'right' | 'run' | 'crouch' | 'interact' | 'noise' | 'hide' | 'pause';
export interface Point { x: number; z: number }
export interface Rect extends Point { w: number; d: number; active: boolean; id: string }
export interface Interactable extends Point {
  id: string; area: number; label: string; description: string;
  kind: 'computer' | 'card' | 'panel' | 'door' | 'hide' | 'disguise' | 'printer' | 'elevator' | 'note';
  requires: string[]; duration: number; reward?: string; done?: boolean;
}
export interface Area {
  id: number; name: string; english: string; subtitle: string;
  start: number; end: number; color: string; checkpoint: Point;
  objectives: string[]; exitRequires: string[]; hint: string;
}
export interface Settings {
  quality: 'low' | 'medium' | 'high'; shadows: boolean; lightCount: number;
  antialias: boolean; dynamicLights: boolean; particles: boolean;
  textureQuality: number; renderScale: number; postProcessing: boolean; showFPS: boolean; autoQuality: boolean;
  sensitivity: number; invertCamera: boolean; cameraDistance: number; fov: number;
  bindings: Record<Action, string>; joystickSize: number; buttonOpacity: number;
  gamepad: boolean; masterVolume: number; musicVolume: number; effectsVolume: number;
  reducedMotion: boolean; highContrast: boolean; hints: boolean; visibleCones: boolean;
}
export interface SaveData {
  version: number; area: number; checkpoint: Point; inventory: string[];
  completed: string[]; tutorial: string[]; difficulty: Difficulty;
  clockSeconds: number; elapsed: number; ending: string | null;
  unlocks: number; updatedAt: string; distractionUsed: boolean;
}
export interface NoiseEvent extends Point { radius: number; age: number; distraction: boolean }
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
