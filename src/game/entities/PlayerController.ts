import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { CharacterRig } from './CharacterRig';
import type { NavigationSystem } from '../systems/NavigationSystem';
import type { InputManager } from '../systems/InputManager';
import type { PlayerState, Point } from '../types';
import type { ModelLibrary } from '../assets/ModelLibrary';

export class PlayerController {
  rig: CharacterRig;
  state: PlayerState = 'Normal';
  crouched = false;
  disguised = false;
  hiddenAt: string | null = null;
  speed = 0;
  constructor(scene: Scene, private navigation: NavigationSystem, models: ModelLibrary) { this.rig = new CharacterRig(scene, 'player', 'player', models); }
  get position(): Point { return { x: this.rig.root.position.x, z: this.rig.root.position.z }; }
  teleport(point: Point): void { this.rig.root.position.set(point.x, 0, point.z); this.state = 'Normal'; this.hiddenAt = null; this.disguised = false; this.speed = 0; this.rig.setEnabled(true); }
  update(dt: number, input: InputManager, alpha: number): void {
    const movement = input.movement(), moving = Math.hypot(movement.x, movement.z) > 0.1;
    if (this.state === 'Discovered' || this.state === 'Escaping' || this.state === 'Interacting') { this.speed = 0; this.rig.animate(dt, 0, this.state); return; }
    if (moving && this.state === 'Hiding') { this.hiddenAt = null; this.state = 'Normal'; this.rig.setEnabled(true); }
    if (moving) this.disguised = false;
    if (this.state === 'Hiding') { this.speed = 0; return; }
    this.state = this.crouched ? 'Crouching' : moving && input.running ? 'Running' : 'Normal';
    const velocity = this.state === 'Running' ? 5.8 : this.state === 'Crouching' ? 1.8 : 3.35;
    const dx = (-Math.sin(alpha) * movement.x - Math.cos(alpha) * movement.z) * velocity * dt;
    const dz = (Math.cos(alpha) * movement.x - Math.sin(alpha) * movement.z) * velocity * dt;
    const before = this.position, after = this.navigation.move(before, { x: dx, z: dz });
    this.speed = Math.hypot(after.x - before.x, after.z - before.z) / Math.max(0.001, dt);
    this.rig.root.position.set(after.x, 0, after.z);
    if (moving && this.speed > 0.05) {
      const target = Math.atan2(dx, dz), delta = Math.atan2(Math.sin(target - this.rig.root.rotation.y), Math.cos(target - this.rig.root.rotation.y));
      this.rig.root.rotation.y += delta * Math.min(1, dt * 12);
    }
    this.rig.animate(dt, this.speed, this.state);
  }
  get cameraTarget(): Vector3 { const p = this.rig.root.position; return new Vector3(p.x, 0.75, p.z); }
}
