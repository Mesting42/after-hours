import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Shaders/particles.vertex';
import '@babylonjs/core/Shaders/particles.fragment';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { Point } from '../types';

/** Babylon recycles the bounded particle pool; low quality/reduced motion can turn it off. */
export class AtmosphereSystem {
  private dust: ParticleSystem;
  private running = false;
  constructor(scene: Scene) {
    this.dust = new ParticleSystem('quiet-office-dust', 100, scene);
    this.dust.particleTexture = new Texture(`${import.meta.env.BASE_URL}assets/textures/dust.svg`, scene);
    this.dust.emitter = new Vector3(0, 1.5, 10); this.dust.minEmitBox = new Vector3(-10, -1, -10); this.dust.maxEmitBox = new Vector3(10, 1.3, 10);
    this.dust.color1 = new Color4(0.65, 0.8, 0.8, 0.12); this.dust.color2 = new Color4(0.9, 0.8, 0.6, 0.12); this.dust.colorDead = new Color4(0.6, 0.7, 0.7, 0);
    this.dust.minSize = 0.025; this.dust.maxSize = 0.065; this.dust.minLifeTime = 5; this.dust.maxLifeTime = 8; this.dust.emitRate = 12;
    this.dust.direction1 = new Vector3(-0.03, 0.018, -0.03); this.dust.direction2 = new Vector3(0.03, 0.025, 0.03); this.dust.gravity = Vector3.Zero();
    this.dust.minEmitPower = 0.4; this.dust.maxEmitPower = 0.7; this.dust.updateSpeed = 0.009;
  }
  update(position: Point, enabled: boolean): void {
    (this.dust.emitter as Vector3).set(position.x, 1.5, position.z);
    if (enabled && !this.running) { this.dust.start(); this.running = true; }
    else if (!enabled && this.running) { this.dust.stop(); this.dust.reset(); this.running = false; }
  }
}
