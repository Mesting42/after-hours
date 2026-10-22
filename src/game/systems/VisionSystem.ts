import { Ray } from '@babylonjs/core/Culling/ray';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { Point } from '../types';

/** Only meshes explicitly tagged occluder block sight. Glass remains transparent to AI. */
export class VisionSystem {
  constructor(private scene: Scene) {}
  visibility(eye: Point, heading: number, target: Point, range: number, fov: number, crouched: boolean): number {
    const dx = target.x - eye.x, dz = target.z - eye.z, length = Math.hypot(dx, dz);
    if (length > range || length < 0.01) return length < 0.01 ? 1 : 0;
    const alignment = (Math.sin(heading) * dx + Math.cos(heading) * dz) / length;
    if (alignment < Math.cos(fov / 2) && length > 1.5) return 0;
    const origin = new Vector3(eye.x, 1.45, eye.z);
    const direction = new Vector3(dx, (crouched ? 0.7 : 1.2) - origin.y, dz);
    const rayLength = direction.length(); direction.normalize();
    const hit = this.scene.pickWithRay(new Ray(origin, direction, rayLength), (mesh) => mesh.metadata?.occluder === true && mesh.isEnabled());
    if (hit?.hit && (hit.distance ?? Infinity) < rayLength - 0.2) return 0;
    return Math.max(0.2, 1 - length / range);
  }
}
