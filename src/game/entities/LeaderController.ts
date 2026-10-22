import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { CharacterRig } from './CharacterRig';
import { DIFFICULTIES, type LeaderSpec } from '../data/levels';
import { distance, type Difficulty, type LeaderState, type Point } from '../types';
import type { NavigationSystem } from '../systems/NavigationSystem';
import type { VisionSystem } from '../systems/VisionSystem';
import type { NoiseSystem } from '../systems/NoiseSystem';
import type { PlayerController } from './PlayerController';
import { SuspicionSystem } from '../systems/SuspicionSystem';
import type { ModelLibrary } from '../assets/ModelLibrary';

/** Finite-state patrol AI. Perception is separate from route planning and model animation. */
export class LeaderController {
  rig: CharacterRig;
  cone: Mesh;
  suspicion = 0;
  state: LeaderState = 'Patrol';
  lastKnown: Point;
  private path: Point[] = [];
  private waypoint = 0;
  private timer = 0;
  private routeTimer = 0;
  private heard: object | null = null;
  private rng = 1;
  readonly range: number;
  readonly fov: number;
  private coneMaterial: StandardMaterial;
  constructor(scene: Scene, public spec: LeaderSpec, private navigation: NavigationSystem, private vision: VisionSystem, private noise: NoiseSystem, models: ModelLibrary) {
    this.rig = new CharacterRig(scene, spec.id, spec.kind, models);
    this.rig.meshes.forEach((mesh) => { mesh.metadata = { ...mesh.metadata, area: spec.area }; });
    this.range = spec.kind === 'security' ? 13 : spec.kind === 'roaming' ? 10.5 : 9.5;
    this.fov = spec.kind === 'security' ? 1.62 : 1.25;
    this.lastKnown = { ...spec.route[0] };
    this.rng = spec.area * 31 + (spec.kind === 'roaming' ? 23 : 7);
    this.cone = new Mesh(`${spec.id}-cone`, scene);
    const data = new VertexData(), vertices = [0, 0, 0], indices: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const angle = -this.fov / 2 + i / 32 * this.fov;
      vertices.push(Math.sin(angle) * this.range, 0, Math.cos(angle) * this.range);
      if (i > 0) indices.push(0, i, i + 1);
    }
    data.positions = vertices; data.indices = indices; data.normals = []; VertexData.ComputeNormals(vertices, indices, data.normals); data.applyToMesh(this.cone);
    this.coneMaterial = new StandardMaterial(`${spec.id}-vision`, scene); this.coneMaterial.diffuseColor = Color3.FromHexString('#c1a56b'); this.coneMaterial.emissiveColor = this.coneMaterial.diffuseColor.scale(0.3); this.coneMaterial.alpha = 0.095; this.coneMaterial.backFaceCulling = false; this.coneMaterial.disableLighting = true;
    this.cone.material = this.coneMaterial; this.cone.position.y = 0.055; this.cone.isPickable = false;
    this.reset();
  }
  get position(): Point { return { x: this.rig.root.position.x, z: this.rig.root.position.z }; }
  reset(): void { this.rig.root.position.set(this.spec.route[0].x, 0, this.spec.route[0].z); this.rig.root.rotation.y = 0; this.suspicion = 0; this.state = 'Patrol'; this.path = []; this.waypoint = 1; this.timer = 1; this.routeTimer = 0; this.heard = null; }
  alert(position: Point): void { if (this.state === 'Chase') return; this.lastKnown = { ...position }; this.suspicion = Math.max(this.suspicion, 28); this.transition('Investigate'); }
  private transition(next: LeaderState): void { if (next === this.state) return; this.state = next; this.timer = 0; this.routeTimer = 0; this.path = []; }
  private random(): number { this.rng = (this.rng * 16807) % 2147483647; return this.rng / 2147483647; }
  update(dt: number, player: PlayerController, difficulty: Difficulty, afterHours: boolean, cones: boolean, illumination = 1): void {
    this.timer += dt; this.routeTimer -= dt;
    const profile = DIFFICULTIES[difficulty], previous = this.suspicion;
    const visible = player.state === 'Hiding' ? 0 : this.vision.visibility(this.position, this.rig.root.rotation.y, player.position, this.range, this.fov, player.state === 'Crouching');
    const disguise = player.disguised ? this.spec.kind === 'department' ? 0.08 : this.spec.kind === 'roaming' ? 0.45 : 0.9 : 1;
    this.suspicion = SuspicionSystem.step(this.suspicion, visible * disguise, dt, difficulty, player.state, this.spec.kind === 'roaming' ? 1.25 : this.spec.kind === 'security' ? 1.15 : 1, illumination);
    if (visible > 0 && disguise > 0.1) this.lastKnown = { ...player.position };
    const heard = this.noise.audibleAt(this.position, profile.hearing * (this.spec.kind === 'roaming' ? 1.25 : 1));
    if (heard && heard !== this.heard && this.suspicion < 70) { this.heard = heard; this.lastKnown = { x: heard.x, z: heard.z }; this.suspicion = Math.max(this.suspicion, 28); this.transition('Investigate'); }
    if (visible > 0 && this.suspicion >= 75) this.transition('Chase');
    else if (visible > 0 && this.suspicion >= 50) this.transition('Investigate');
    else if (visible > 0 && this.suspicion >= 25 && previous < 25) this.transition('Suspicious');
    if (this.state === 'Chase' && visible === 0 && this.timer > 2) this.transition('Search');
    if (this.state === 'Suspicious' && this.timer > 1.3) this.transition(visible > 0 ? 'Investigate' : 'Search');
    if (this.state === 'Search' && this.timer > profile.search) this.transition('Return');
    let target: Point | undefined;
    let speed = (this.spec.kind === 'security' ? 3.1 : 2.15) * profile.speed * (afterHours ? 1.2 : 1);
    if (this.state === 'Patrol' || this.state === 'Return') target = this.spec.route[this.waypoint % this.spec.route.length];
    if (this.state === 'Idle') { this.rig.root.rotation.y += dt * 0.2; if (this.timer > (afterHours ? 1.4 : 3.5)) this.transition('Patrol'); }
    if (this.state === 'Suspicious') { this.rig.root.rotation.y = Math.atan2(this.lastKnown.x - this.position.x, this.lastKnown.z - this.position.z); speed = 0; }
    if (this.state === 'Investigate' || this.state === 'Chase') { target = this.lastKnown; if (this.state === 'Chase') speed *= 1.3; }
    if (this.state === 'Search') {
      const angle = Math.floor(this.timer / 3) * 2.3;
      target = { x: Math.max(-13, Math.min(13, this.lastKnown.x + Math.cos(angle) * 3)), z: Math.max(this.spec.area * 64 + 3, Math.min(this.spec.area * 64 + 60, this.lastKnown.z + Math.sin(angle) * 3)) };
      this.rig.root.rotation.y += dt * 0.5;
    }
    let moving = 0;
    if (target && speed > 0) {
      if (distance(this.position, target) < 1.15) {
        if (this.state === 'Patrol' || this.state === 'Return') { this.waypoint = this.spec.kind === 'roaming' ? Math.floor(this.random() * this.spec.route.length) : this.waypoint + 1; this.transition('Idle'); }
        else if (this.state === 'Investigate') this.transition('Search');
      } else {
        if (this.routeTimer <= 0 || this.path.length === 0) { this.path = this.navigation.path(this.position, target, this.spec.area); this.routeTimer = this.state === 'Chase' ? 0.55 : 2; }
        const step = this.path[0];
        if (step) {
          const d = distance(this.position, step);
          if (d < 0.4) this.path.shift();
          else {
            const delta = { x: (step.x - this.position.x) / d * speed * dt, z: (step.z - this.position.z) / d * speed * dt };
            const before = this.position, next = this.navigation.move(before, delta, 0.38);
            this.rig.root.position.set(next.x, 0, next.z); this.rig.root.rotation.y = Math.atan2(delta.x, delta.z);
            moving = distance(before, next) / dt;
            if (moving < 0.01) this.routeTimer = 0;
          }
        }
      }
    }
    this.rig.animate(dt, moving, this.suspicion >= 100 ? 'Discovered' : this.state === 'Chase' ? 'Running' : 'leader');
    this.cone.setEnabled(cones); this.cone.position.x = this.position.x; this.cone.position.z = this.position.z; this.cone.rotation.y = this.rig.root.rotation.y;
    this.coneMaterial.emissiveColor = Color3.FromHexString(this.suspicion > 74 ? '#d36761' : this.suspicion > 24 ? '#dfb26e' : '#c1a56b');
    this.coneMaterial.alpha = this.suspicion > 24 ? 0.18 : 0.09;
  }
  setEnabled(enabled: boolean): void { this.rig.setEnabled(enabled); this.cone.setEnabled(enabled); }
}
