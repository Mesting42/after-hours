import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { NavigationSystem } from '../src/game/systems/NavigationSystem';
import { SuspicionSystem } from '../src/game/systems/SuspicionSystem';
import { VisionSystem } from '../src/game/systems/VisionSystem';
import { NoiseSystem } from '../src/game/systems/NoiseSystem';
import { SaveManager, freshSave } from '../src/game/systems/SaveManager';
import { SettingsManager, DEFAULT_SETTINGS } from '../src/game/systems/SettingsManager';
import { GameClock } from '../src/game/systems/GameClock';
import { InputManager } from '../src/game/systems/InputManager';
import { AREAS, INTERACTABLES } from '../src/game/data/levels';
import { renderDensity } from '../src/game/data/quality';

afterEach(() => vi.unstubAllGlobals());

describe('progression safety', () => {
  it('all mission prerequisites can be satisfied in order, including lift arrival', () => {
    const flags = new Set<string>();
    for (const obj of INTERACTABLES.filter((o) => o.reward || o.kind === 'elevator')) {
      if (obj.id === 'elevator') flags.add('lift-ready');
      expect(obj.requires.filter((flag) => !flags.has(flag)), obj.id).toEqual([]);
      if (obj.reward) flags.add(obj.reward);
    }
  });
  it('every area has a checkpoint, three mission steps and a satisfiable exit', () => {
    for (const area of AREAS) {
      expect(area.checkpoint.z).toBeGreaterThan(area.start);
      expect(area.checkpoint.z).toBeLessThan(area.end);
      expect(INTERACTABLES.filter((o) => o.area === area.id && (o.reward || o.kind === 'elevator'))).toHaveLength(3);
      for (const requirement of area.exitRequires) expect(INTERACTABLES.some((o) => o.reward === requirement)).toBe(true);
    }
  });
  it('rejects malformed and out-of-floor saves', () => {
    expect(SaveManager.valid(freshSave())).toBe(true);
    for (const broken of [null, {}, { ...freshSave(), version: 2 }, { ...freshSave(), area: 99 }, { ...freshSave(), checkpoint: { x: 0, z: 300 } }, { ...freshSave(), inventory: [false] }, { ...freshSave(), elapsed: NaN }]) expect(SaveManager.valid(broken)).toBe(false);
  });
  it('clamps settings and protects a recoverable pause binding', () => {
    const settings = SettingsManager.validate({ masterVolume: 400, renderScale: -1, cameraDistance: NaN, bindings: { pause: 'KeyW', interact: '<script>' }, quality: 'extreme' });
    expect(settings.masterVolume).toBe(1); expect(settings.renderScale).toBe(0.5);
    expect(settings.cameraDistance).toBe(DEFAULT_SETTINGS.cameraDistance);
    expect(settings.bindings.pause).toBe('Escape'); expect(settings.bindings.interact).toBe('KeyE'); expect(settings.quality).toBe('medium');
  });
  it('retains an isolated checkpoint snapshot when storage quota is exhausted', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
    const saves = new SaveManager(), snapshot = freshSave('hard');
    snapshot.area = 2; snapshot.unlocks = 2; snapshot.checkpoint = { ...AREAS[2].checkpoint }; snapshot.inventory = ['badge'];
    saves.write(snapshot); expect(saves.storageAvailable).toBe(false);
    const recovered = saves.load()!; expect(recovered.area).toBe(2); expect(recovered.inventory).toEqual(['badge']);
    recovered.inventory.push('unexpected'); expect(saves.load()!.inventory).toEqual(['badge']);
  });
  it('low render scale reduces high-DPI resolution instead of being swallowed by the cap', () => {
    expect(renderDensity(3, 1)).toBe(1.5);
    expect(renderDensity(3, 0.7)).toBeCloseTo(1.05);
    expect(renderDensity(1, 0.5)).toBe(0.5);
    expect(renderDensity(3, 1.5)).toBe(1.5);
  });
});
describe('rebound key ownership', () => {
  afterEach(() => vi.unstubAllGlobals());
  function fixture() {
    const inputWindow = Object.assign(new EventTarget(), { matches: () => false });
    vi.stubGlobal('window', inputWindow); vi.stubGlobal('navigator', { getGamepads: () => [] });
    const canvas = Object.assign(new EventTarget(), { setPointerCapture: () => {} }) as unknown as HTMLCanvasElement;
    const settings = structuredClone(DEFAULT_SETTINGS); settings.gamepad = false;
    const input = new InputManager(canvas, settings);
    const press = (code: string) => inputWindow.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code, repeat: false }));
    return { input, settings, press };
  }
  it('does not move diagonally when an arrow is rebound to another direction', () => {
    const { input, settings, press } = fixture(); settings.bindings.up = 'ArrowRight'; press('ArrowRight');
    expect(input.movement()).toEqual({ x: 0, z: 1 });
  });
  it('does not sprint when the secondary Shift key is rebound to an interaction', () => {
    const { input, settings, press } = fixture(); settings.bindings.interact = 'ShiftRight'; press('ShiftRight');
    expect(input.consume('interact')).toBe(true); expect(input.running).toBe(false);
  });
});
describe('physical stealth rules', () => {
  it('blocks high-speed tunnelling and routes around a partition', () => {
    const navigation = new NavigationSystem([{ x: 0, z: 10, w: 20, d: 0.2, active: true, id: 'wall' }]);
    expect(navigation.move({ x: 0, z: 5 }, { x: 0, z: 15 }).z).toBeLessThan(10);
    const path = navigation.path({ x: 0, z: 5 }, { x: 0, z: 20 }, 0);
    expect(path.length).toBeGreaterThan(1); expect(path.some((p) => Math.abs(p.x) > 10)).toBe(true);
    expect(path.every((p) => navigation.canStand(p, 0.38))).toBe(true);
  });
  it('makes crouching quieter/safer, running riskier, and hard mode more sensitive', () => {
    const normal = SuspicionSystem.step(0, 1, 1, 'normal', 'Normal');
    expect(SuspicionSystem.step(0, 1, 1, 'normal', 'Crouching')).toBeLessThan(normal);
    expect(SuspicionSystem.step(0, 1, 1, 'normal', 'Running')).toBeGreaterThan(normal);
    expect(SuspicionSystem.step(0, 1, 1, 'hard', 'Normal')).toBeGreaterThan(normal);
    expect(SuspicionSystem.step(45, 1, 1, 'normal', 'Hiding')).toBeLessThan(45);
    expect(SuspicionSystem.step(99, 1, 1, 'hard', 'Running')).toBe(100);
  });
  it('raycasts through glass but cannot see through a solid wall or behind the observer', () => {
    const engine = new NullEngine(), scene = new Scene(engine), vision = new VisionSystem(scene);
    const wall = MeshBuilder.CreateBox('wall', { width: 6, height: 3, depth: 0.3 }, scene); wall.position.set(0, 1.5, 4); wall.metadata = { occluder: true }; wall.computeWorldMatrix(true);
    expect(vision.visibility({ x: 0, z: 0 }, 0, { x: 0, z: 8 }, 12, 1.3, false)).toBe(0);
    wall.metadata.occluder = false;
    expect(vision.visibility({ x: 0, z: 0 }, 0, { x: 0, z: 8 }, 12, 1.3, false)).toBeGreaterThan(0);
    expect(vision.visibility({ x: 0, z: 0 }, 0, { x: 0, z: -8 }, 12, 1.3, false)).toBe(0);
    scene.dispose(); engine.dispose();
  });
  it('attenuates sound across walls and expires pooled events', () => {
    const navigation = new NavigationSystem([{ id: 'wall', x: 0, z: 5, w: 12, d: 1, active: true }]), noise = new NoiseSystem(navigation);
    noise.emit({ x: 0, z: 0 }, 12); expect(noise.audibleAt({ x: 0, z: 10 }, 1)).toBeUndefined();
    navigation.blockers[0].active = false; expect(noise.audibleAt({ x: 0, z: 10 }, 1)).toBeDefined(); noise.update(3); expect(noise.events).toHaveLength(0);
    for (let i = 0; i < 20; i++) noise.emit({ x: 0, z: 0 }, 10); expect(noise.events.length).toBeLessThanOrEqual(12);
  });
  it('changes patrol phase after 18:00 without imposing a fatal timeout', () => {
    const clock = new GameClock(); expect(clock.label).toBe('17:55'); clock.update(100); expect(clock.label).toBe('18:00'); expect(clock.afterHours).toBe(true); clock.update(3600); expect(clock.elapsed).toBe(3700);
  });
});
