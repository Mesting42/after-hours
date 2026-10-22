import { afterEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CameraFollowSystem } from '../src/game/systems/CameraFollowSystem';

// Use Babylon's real view matrices: checking the target alone misses the original bug,
// where its setter changed the target but kept the rendered camera at the old position.
describe('rendered camera tracking', () => {
  const engines: NullEngine[] = [];
  afterEach(() => engines.splice(0).forEach((engine) => engine.dispose()));

  function fixture() {
    const engine = new NullEngine(); engines.push(engine);
    const scene = new Scene(engine);
    const camera = new ArcRotateCamera('follow-test', -1.12, 0.89, 23, new Vector3(0, 0.75, 5), scene);
    const follow = new CameraFollowSystem(camera);
    camera.getViewMatrix(true);
    return { camera, follow };
  }

  it('translates the rendered camera on the very first moving frame without changing the orbit', () => {
    const { camera, follow } = fixture();
    const before = camera.position.clone(), targetBefore = camera.target.clone();
    const orbit = [camera.alpha, camera.beta, camera.radius];
    follow.update(new Vector3(1, 0.75, 5), 1 / 60, false);
    camera.getViewMatrix(true);
    const translation = camera.position.subtract(before);
    expect(translation.x).toBeGreaterThan(0.1);
    expect(Vector3.Distance(translation, camera.target.subtract(targetBefore))).toBeLessThan(1e-6);
    expect([camera.alpha, camera.beta, camera.radius]).toEqual(orbit);
  });

  it('keeps walk/sprint tracking close throughout movement at 30, 60 and 144 FPS', () => {
    for (const fps of [30, 60, 144]) {
      for (const speed of [3.35, 5.8]) {
        const { camera, follow } = fixture(), player = camera.target.clone();
        const start = camera.position.clone();
        for (let frame = 0; frame < fps * 2; frame++) {
          player.x += speed * 0.6 / fps; player.z += speed * 0.8 / fps;
          follow.update(player, 1 / fps, false); camera.getViewMatrix(true);
          expect(Vector3.Distance(camera.target, player)).toBeLessThan(0.4);
        }
        expect(Vector3.Distance(start, camera.position)).toBeGreaterThan(speed * 2 - 0.4);
      }
    }
  });

  it('preserves manual rotation and zoom when following resumes after a pause', () => {
    const { camera, follow } = fixture();
    camera.alpha = -0.65; camera.beta = 0.7; camera.radius = 17;
    camera.getViewMatrix(true);
    const paused = camera.position.clone();
    // Pause does not call the follow system; resuming uses the normal frame delta.
    camera.getViewMatrix(true); expect(camera.position.equals(paused)).toBe(true);
    follow.update(new Vector3(-1, 0.75, 6), 1 / 60, false); camera.getViewMatrix(true);
    expect(camera.position.equals(paused)).toBe(false);
    expect([camera.alpha, camera.beta, camera.radius]).toEqual([-0.65, 0.7, 17]);
  });

  it('snaps checkpoints and reduced-motion tracking without changing distance or rotation', () => {
    const { camera, follow } = fixture();
    const before = camera.position.clone(), oldTarget = camera.target.clone();
    const checkpoint = new Vector3(0, 0.75, 261);
    follow.snapTo(checkpoint); camera.getViewMatrix(true);
    expect(Vector3.Distance(camera.position.subtract(before), checkpoint.subtract(oldTarget))).toBeLessThan(1e-6);
    const next = new Vector3(1, 0.75, 262);
    follow.update(next, 1 / 60, true); camera.getViewMatrix(true);
    expect(camera.target.equals(next)).toBe(true);
    expect([camera.alpha, camera.beta, camera.radius]).toEqual([-1.12, 0.89, 23]);
  });
});
