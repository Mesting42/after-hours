import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/** Owns tracking only; rotation and zoom remain under the input/settings systems. */
export class CameraFollowSystem {
  // A short response keeps sprinting lag below 0.4 world units, without a hard camera snap.
  private readonly response = 16;

  constructor(private readonly camera: ArcRotateCamera) {}

  /** Checkpoints/new games must not interpolate across the previous scene or floor. */
  snapTo(target: Vector3): void {
    this.camera.target.copyFrom(target);
  }

  update(target: Vector3, dt: number, reducedMotion: boolean): void {
    if (reducedMotion) {
      this.snapTo(target);
      return;
    }
    // Mutate the existing target: assigning camera.target invokes setTarget(), which
    // rebuilds alpha/beta/radius around the OLD camera position instead of translating it.
    // Exponential damping responds on the first frame and behaves consistently at any FPS.
    const blend = 1 - Math.exp(-this.response * Math.max(0, dt));
    Vector3.LerpToRef(this.camera.target, target, blend, this.camera.target);
  }
}
