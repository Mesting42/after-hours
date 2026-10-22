import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/instancedMesh';
import { GuideRoutePlanner } from '../systems/GuideRoutePlanner';
import type { NavigationSystem } from '../systems/NavigationSystem';
import type { TutorialStep } from '../systems/TutorialSystem';
import { distance, type Point } from '../types';

/** Small pooled meshes make the guide independent of particles, lighting quality and mission logic. */
export class TutorialGuide {
  readonly planner: GuideRoutePlanner;
  route: Point[] = [];
  activeTarget: TutorialStep['target'] | null = null;
  arrowCount = 0;
  private readonly arrows: InstancedMesh[] = [];
  private readonly material: StandardMaterial;
  private readonly pointer: Mesh;
  private readonly ring: Mesh;
  private lastFrom: Point = { x: Infinity, z: Infinity };
  private refresh = 0;
  private time = 0;

  constructor(scene: Scene, navigation: NavigationSystem) {
    this.planner = new GuideRoutePlanner(navigation);
    this.material = new StandardMaterial('tutorial-gold', scene);
    this.material.diffuseColor = Color3.FromHexString('#efd38d');
    this.material.emissiveColor = this.material.diffuseColor;
    this.material.disableLighting = true; this.material.backFaceCulling = false; this.material.fogEnabled = false;
    const source = new Mesh('tutorial-arrow-source', scene), data = new VertexData();
    data.positions = [-0.45, 0, -0.28, 0, 0, 0.12, 0.45, 0, -0.28, 0.45, 0, 0.04, 0, 0, 0.48, -0.45, 0, 0.04];
    data.indices = [0, 1, 5, 5, 1, 4, 1, 2, 4, 2, 3, 4];
    data.normals = Array.from({ length: 6 }, () => [0, 1, 0]).flat(); data.applyToMesh(source);
    source.material = this.material; source.isVisible = false; source.isPickable = false;
    for (let i = 0; i < 56; i++) {
      const arrow = source.createInstance(`tutorial-arrow-${i}`);
      arrow.isPickable = false; arrow.isVisible = true; arrow.setEnabled(false); this.arrows.push(arrow);
    }
    // Wide top / narrow bottom forms a downward pointer above the real destination.
    this.pointer = MeshBuilder.CreateCylinder('tutorial-target-pointer', { height: 0.72, diameterTop: 0.6, diameterBottom: 0, tessellation: 4 }, scene);
    this.pointer.material = this.material; this.pointer.isPickable = false;
    this.ring = MeshBuilder.CreateTorus('tutorial-target-ring', { diameter: 1.5, thickness: 0.09, tessellation: 32 }, scene);
    this.ring.material = this.material; this.ring.isPickable = false; this.hide();
  }

  hide(): void {
    this.arrows.forEach((arrow) => arrow.setEnabled(false));
    this.pointer.setEnabled(false); this.ring.setEnabled(false);
    this.activeTarget = null; this.route = []; this.arrowCount = 0;
  }

  update(step: TutorialStep | null, player: Point, dt: number, reducedMotion: boolean): void {
    if (!step) { if (this.activeTarget) this.hide(); return; }
    this.time += dt; this.refresh -= dt;
    const target = step.target;
    if (target.id !== this.activeTarget?.id || (this.refresh <= 0 && distance(player, this.lastFrom) > 0.65)) {
      this.route = this.planner.plan(player, target); this.lastFrom = { ...player }; this.refresh = 0.3;
      this.placeArrows();
    }
    this.activeTarget = target;
    this.pointer.setEnabled(true); this.ring.setEnabled(true);
    this.pointer.position.set(target.x, 2.5 + (reducedMotion ? 0 : Math.sin(this.time * 2.5) * 0.12), target.z);
    this.ring.position.set(target.x, 0.09, target.z);
    this.material.alpha = reducedMotion ? 1 : 0.88 + Math.sin(this.time * 2.5) * 0.1;
    // Hide completed route sections while moving; never leave breadcrumbs pointing backwards.
    this.arrows.forEach((arrow, index) => { if (index < this.arrowCount) arrow.setEnabled(distance(player, { x: arrow.position.x, z: arrow.position.z }) > 0.6); });
  }

  private placeArrows(): void {
    this.arrows.forEach((arrow) => arrow.setEnabled(false)); this.arrowCount = 0;
    let nextArrow = 0.75;
    for (let i = 1; i < this.route.length; i++) {
      const from = this.route[i - 1], to = this.route[i], length = distance(from, to);
      while (nextArrow < length && this.arrowCount < this.arrows.length) {
        const arrow = this.arrows[this.arrowCount++], t = nextArrow / length;
        arrow.position.set(from.x + (to.x - from.x) * t, 0.085, from.z + (to.z - from.z) * t);
        arrow.rotation.y = Math.atan2(to.x - from.x, to.z - from.z); arrow.setEnabled(true);
        nextArrow += 1.4;
      }
      nextArrow -= length;
    }
  }
}
