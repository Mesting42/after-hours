import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PlayerOcclusionSystem, bodyRayIntersectsBox } from '../src/game/systems/PlayerOcclusionSystem';
import { VisionSystem } from '../src/game/systems/VisionSystem';
import '@babylonjs/core/Meshes/instancedMesh';

/** Real Babylon instances catch the no-op visibility setter behind the original bug. */
describe('player visibility through foreground architecture', () => {
  const engines: NullEngine[] = [];
  afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));
  function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    const scene = new Scene(engine), system = new PlayerOcclusionSystem();
    const source = MeshBuilder.CreateBox('wall-source', { width: .25, height: 3.4, depth: 64 }, scene);
    source.isVisible = false; source.isPickable = false;
    source.material = new StandardMaterial('shared-wall', scene);
    const wall = source.createInstance('right-wall'); wall.position.set(15.9, 1.7, 32);
    wall.metadata = { occluder: true, area: 0, cameraFadeGroup: 'right' }; wall.computeWorldMatrix(true);
    const farWall = source.createInstance('left-wall'); farWall.position.set(-15.9, 1.7, 32); farWall.computeWorldMatrix(true);
    system.setCandidates([wall, farWall]);
    return { scene, system, source, wall, farWall };
  }
  const camera = new Vector3(24, 13, -8), player = { x: 14.8, z: 7 };

  it('detects the near end of a long wall rather than its distant center', () => {
    expect(bodyRayIntersectsBox(camera, new Vector3(14.8, 1.1, 7), new Vector3(15.775, 0, 0), new Vector3(16.025, 3.4, 64))).toBe(true);
    // The line segment stops at the body: objects behind it or above it stay opaque.
    expect(bodyRayIntersectsBox(camera, new Vector3(14.8, 1.1, 7), new Vector3(10, 0, 12), new Vector3(12, 3.4, 18))).toBe(false);
    expect(bodyRayIntersectsBox(new Vector3(10, 8, 0), new Vector3(0, 1, 0), new Vector3(5, 0, -2), new Vector3(6, 1, 2))).toBe(false);
  });

  it('fades a real instance independently using shared geometry without changing shared material', () => {
    const { scene, system, source, wall, farWall } = fixture();
    system.update(camera, player, false, 1 / 60, false);
    const proxy = scene.getMeshByName('camera-fade/right-wall')!;
    expect(wall.isVisible).toBe(false); expect(proxy.isVisible).toBe(true);
    expect(proxy.visibility).toBe(.12); expect(proxy.material).toBe(source.material);
    expect((proxy as typeof source).geometry).toBe(source.geometry);
    expect(source.material!.alpha).toBe(1); expect(farWall.visibility).toBe(1); expect(farWall.isVisible).toBe(true);
    expect(proxy.material!.needAlphaBlendingForMesh(proxy)).toBe(true);
  });

  it('restores the original batch and reuses proxies without accumulating meshes', () => {
    const { scene, system, wall } = fixture();
    system.update(camera, player, true, 1 / 60, false);
    const count = scene.meshes.length;
    for (let i = 0; i < 60; i++) system.update(new Vector3(0, 15, -10), { x: 0, z: 7 }, false, 1 / 60, false);
    expect(wall.isVisible).toBe(true); expect(scene.getMeshByName('camera-fade/right-wall')!.isVisible).toBe(false);
    system.update(camera, player, false, 1 / 60, true); system.reset();
    expect(scene.meshes).toHaveLength(count); expect(wall.isVisible).toBe(true);
  });

  it('reveals roof/trim in the same wall group and restores all on region change', () => {
    const { scene, system, wall } = fixture();
    const trim = MeshBuilder.CreateBox('trim', { size: .1 }, scene);
    trim.position.set(15.9, 3.6, 55); trim.metadata = { cameraFadeGroup: 'right' }; trim.computeWorldMatrix(true);
    system.setCandidates([wall, trim]); system.update(camera, player, false, .016, true);
    expect(trim.visibility).toBe(.12); system.setCandidates([]);
    expect(wall.isVisible).toBe(true); expect(trim.visibility).toBe(1);
  });

  it('keeps original walls blocking leader raycasts even while their visual instances are hidden', () => {
    const { scene, system, wall } = fixture();
    const vision = new VisionSystem(scene);
    const eye = { x: 18, z: 7 }, target = { x: 14.8, z: 7 };
    expect(vision.visibility(eye, -Math.PI / 2, target, 20, 1.2, false)).toBe(0);
    system.update(camera, player, false, .016, true);
    expect(wall.metadata.occluder).toBe(true); expect(wall.isEnabled()).toBe(true);
    expect(vision.visibility(eye, -Math.PI / 2, target, 20, 1.2, false)).toBe(0);
  });

  it('handles the opposite camera angle and only fades enabled architecture', () => {
    const { scene, system, wall, farWall } = fixture();
    system.update(new Vector3(-24, 13, -8), { x: -14.8, z: 7 }, true, .016, true);
    expect(farWall.isVisible).toBe(false); expect(wall.isVisible).toBe(true);
    farWall.setEnabled(false); system.update(camera, player, false, .016, true);
    expect(scene.getMeshByName('camera-fade/left-wall')!.isVisible).toBe(false);
  });

  it('keeps a moving door proxy aligned and recovers immediately in reduced-motion mode', () => {
    const { scene, system, wall } = fixture();
    system.update(camera, player, false, .016, true);
    const proxy = scene.getMeshByName('camera-fade/right-wall')!;
    wall.position.z += .25; wall.computeWorldMatrix(true);
    system.update(camera, player, false, .016, true);
    expect(proxy.position.z).toBe(wall.position.z);
    system.update(new Vector3(0, 15, -10), { x: 0, z: 7 }, false, .016, true);
    expect(wall.isVisible).toBe(true); expect(proxy.isVisible).toBe(false);
  });
});
