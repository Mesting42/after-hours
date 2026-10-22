import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Animation } from '@babylonjs/core/Animations/animation';
import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { AdaptiveQuality, qualityProfile } from '../src/game/systems/AdaptiveQuality';
import { SettingsManager, DEFAULT_SETTINGS } from '../src/game/systems/SettingsManager';
import { NavigationSystem } from '../src/game/systems/NavigationSystem';
import { CharacterRig } from '../src/game/entities/CharacterRig';
import type { ModelLibrary } from '../src/game/assets/ModelLibrary';

describe('adaptive frame budget', () => {
  it('keeps smooth scenes at their selected quality and excludes pauses and single stalls', () => {
    const quality = new AdaptiveQuality();
    for (let i = 0; i < 600; i++) quality.sample(1000 / 60, true);
    quality.sample(2000, true); quality.sample(100, false);
    expect(quality.level).toBe(0);
  });
  it('reduces sustained slow scenes in bounded steps without oscillating or changing saved choices', () => {
    const quality = new AdaptiveQuality(), settings = structuredClone(DEFAULT_SETTINGS);
    for (let i = 0; i < 360; i++) quality.sample(40, true);
    expect(quality.level).toBe(4);
    for (let i = 0; i < 600; i++) quality.sample(16, true);
    expect(quality.level).toBe(4);
    const profile = qualityProfile(settings, quality.level);
    expect(profile.renderScale).toBe(.6); expect(profile.shadows).toBe(false);
    expect(profile.antialias).toBe(false); expect(profile.particles).toBe(false); expect(profile.dynamicLights).toBe(false);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    quality.reset(); expect(quality.level).toBe(0);
  });
  it('honors manual opt-out and never enables an effect the player disabled', () => {
    const manual = qualityProfile({ ...DEFAULT_SETTINGS, autoQuality: false }, 3);
    expect(manual.renderScale).toBe(DEFAULT_SETTINGS.renderScale);
    const economical = qualityProfile({ ...DEFAULT_SETTINGS, renderScale: .5, shadows: false, dynamicLights: false, lightCount: 1, postProcessing: false }, 2);
    expect(economical.renderScale).toBe(.5); expect(economical.shadows).toBe(false);
    expect(economical.dynamicLights).toBe(false); expect(economical.lightCount).toBe(1); expect(economical.postProcessing).toBe(false);
  });
  it('migrates old settings while preserving an explicit automatic-quality preference', () => {
    expect(SettingsManager.validate({ renderScale: .8 }).autoQuality).toBe(true);
    expect(SettingsManager.validate({ autoQuality: false }).autoQuality).toBe(false);
  });
});

describe('exact guide collision segments', () => {
  it('blocks a thin diagonal crossing, permits boundary travel, and observes a door unlocking immediately', () => {
    const wall = { id: 'thin-wall', active: true, x: 0, z: 10, w: 20, d: .01 };
    const nav = new NavigationSystem([wall]);
    expect(nav.canTraverse({ x: -11, z: 9 }, { x: 11, z: 11 })).toBe(false);
    expect(nav.canTraverse({ x: 10.43, z: 8 }, { x: 10.43, z: 12 })).toBe(true);
    wall.active = false;
    expect(nav.canTraverse({ x: -11, z: 9 }, { x: 11, z: 11 })).toBe(true);
  });
  it('agrees with dense collision checks across a deterministic set of long segments', () => {
    const nav = new NavigationSystem([{ id: 'desk', active: true, x: 2, z: 12, w: 3, d: 1.4 }, { id: 'wall', active: true, x: -4, z: 20, w: 12, d: .24 }]);
    for (let i = 0; i < 60; i++) {
      const from = { x: -14 + i % 29, z: 3 + i % 7 }, to = { x: 14 - (i * 7) % 29, z: 25 + i % 5 };
      const sampled = Array.from({ length: 2001 }, (_, j) => j / 2000).every((t) => nav.canStand({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t }));
      expect(nav.canTraverse(from, to), `segment ${i}`).toBe(sampled);
    }
  });
});

it('removes hidden character animations and resumes exactly one clip when visible again', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const root = new TransformNode('appearance', scene);
    const animations = ['Idle', 'Walk', 'Run'].map((name) => {
      const clip = new AnimationGroup(`actor/${name}`, scene);
      const animation = new Animation(name, 'position.y', 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
      animation.setKeys([{ frame: 0, value: 0 }, { frame: 30, value: .02 }]);
      clip.addTargetedAnimation(animation, root); return clip;
    });
    const models = { instantiate: () => ({ root, meshes: [], skeletons: [], animations }) } as unknown as ModelLibrary;
    const rig = new CharacterRig(scene, 'actor', 'player', models);
    expect(scene.animatables).toHaveLength(1);
    rig.setEnabled(false); rig.animate(.016, 3, 'Normal');
    expect(scene.animatables).toHaveLength(0);
    rig.setEnabled(true); rig.setEnabled(true);
    expect(animations[1].isPlaying).toBe(true); expect(scene.animatables).toHaveLength(1);
  } finally { scene.dispose(); engine.dispose(); }
});
