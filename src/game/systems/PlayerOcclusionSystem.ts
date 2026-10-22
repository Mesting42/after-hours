import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Point } from '../types';

/** A finite segment/AABB test. Unlike a center-distance test, it handles long walls,
 * objects touching the player and cameras on either side of the building. */
export function bodyRayIntersectsBox(from: Vector3, to: Vector3, min: Vector3, max: Vector3): boolean {
  let entry = 0, exit = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const direction = to[axis] - from[axis];
    // A small margin reveals the body before it disappears completely at an edge.
    const low = min[axis] - .08, high = max[axis] + .08;
    if (Math.abs(direction) < 1e-8) {
      if (from[axis] < low || from[axis] > high) return false;
      continue;
    }
    const a = (low - from[axis]) / direction, b = (high - from[axis]) / direction;
    entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return false;
  }
  return exit > .001 && entry < .999;
}

interface FadeState {
  original: AbstractMesh;
  visual: AbstractMesh;
  originalVisible: boolean;
  originalVisibility: number;
  hold: number;
}

/** Visual occlusion only. Original meshes keep their AI tags, picking and collision.
 * Shared materials are never changed. An instanced mesh cannot change visibility
 * independently in Babylon, so only a currently faded instance gets a cached,
 * geometry-sharing regular-mesh stand-in. All other instances remain batched. */
export class PlayerOcclusionSystem {
  private candidates: readonly AbstractMesh[] = [];
  private readonly faded = new Map<AbstractMesh, FadeState>();
  private readonly proxies = new Map<InstancedMesh, Mesh>();
  private readonly hits = new Set<string | AbstractMesh>();
  private readonly samples = Array.from({ length: 5 }, () => new Vector3());

  setCandidates(meshes: readonly AbstractMesh[]): void {
    this.reset(); this.candidates = meshes;
  }

  update(camera: Vector3, player: Point, crouched: boolean, dt: number, reducedMotion: boolean): void {
    const sideX = camera.z - player.z, sideZ = player.x - camera.x;
    const sideLength = Math.hypot(sideX, sideZ) || 1;
    const height = crouched ? 1.05 : 1.7;
    this.samples[0].set(player.x, .3, player.z);
    this.samples[1].set(player.x, height * .57, player.z);
    this.samples[2].set(player.x, height, player.z);
    this.samples[3].set(player.x + sideX / sideLength * .3, height * .6, player.z + sideZ / sideLength * .3);
    this.samples[4].set(player.x - sideX / sideLength * .3, height * .6, player.z - sideZ / sideLength * .3);
    this.hits.clear();
    for (const mesh of this.candidates) {
      if (!mesh.isEnabled() || (!mesh.isVisible && !this.faded.has(mesh))) continue;
      // Frozen architecture already has valid world bounds; moving doors refresh here.
      mesh.computeWorldMatrix();
      const bounds = mesh.getBoundingInfo().boundingBox;
      if (this.samples.some((sample) => bodyRayIntersectsBox(camera, sample, bounds.minimumWorld, bounds.maximumWorld))) {
        this.hits.add(mesh.metadata?.cameraFadeGroup ?? mesh);
      }
    }
    for (const mesh of this.candidates) {
      if (!mesh.isEnabled()) continue;
      if (this.hits.has(mesh.metadata?.cameraFadeGroup ?? mesh)) {
        const state = this.faded.get(mesh) ?? this.beginFade(mesh);
        state.hold = .14;
        // Reveal immediately; only recovery is eased, so a fast step cannot hide the player.
        state.visual.visibility = state.originalVisibility * .12;
        if (state.visual !== mesh && !mesh.isWorldMatrixFrozen) this.syncProxy(mesh, state.visual);
      }
    }
    for (const [mesh, state] of this.faded) {
      if (this.hits.has(mesh.metadata?.cameraFadeGroup ?? mesh)) continue;
      state.hold -= Math.max(0, dt);
      if (!reducedMotion && state.hold > 0 && mesh.isEnabled()) continue;
      state.visual.visibility += (state.originalVisibility - state.visual.visibility) * (reducedMotion ? 1 : 1 - Math.exp(-18 * Math.max(0, dt)));
      if (!mesh.isEnabled() || Math.abs(state.visual.visibility - state.originalVisibility) < .005) this.restore(mesh, state);
      else if (state.visual !== mesh && !mesh.isWorldMatrixFrozen) this.syncProxy(mesh, state.visual);
    }
  }

  private beginFade(mesh: AbstractMesh): FadeState {
    let visual: AbstractMesh = mesh;
    if (mesh instanceof InstancedMesh) {
      let proxy = this.proxies.get(mesh);
      if (!proxy) {
        proxy = mesh.sourceMesh.clone(`camera-fade/${mesh.name}`, mesh.parent, true, false);
        proxy.metadata = { cameraFadeProxy: true }; proxy.isPickable = false;
        proxy.setEnabled(true); proxy.doNotSyncBoundingInfo = false;
        this.proxies.set(mesh, proxy);
      }
      visual = proxy; this.syncProxy(mesh, visual);
      visual.isVisible = true;
    }
    const state = { original: mesh, visual, originalVisible: mesh.isVisible, originalVisibility: mesh.visibility, hold: .14 };
    if (visual !== mesh) mesh.isVisible = false;
    this.faded.set(mesh, state); return state;
  }

  private syncProxy(original: AbstractMesh, visual: AbstractMesh): void {
    visual.unfreezeWorldMatrix(); visual.parent = original.parent;
    visual.position.copyFrom(original.position); visual.scaling.copyFrom(original.scaling);
    visual.rotation.copyFrom(original.rotation);
    if (original.rotationQuaternion) {
      if (visual.rotationQuaternion) visual.rotationQuaternion.copyFrom(original.rotationQuaternion);
      else visual.rotationQuaternion = original.rotationQuaternion.clone();
    } else visual.rotationQuaternion = null;
    visual.computeWorldMatrix(true); visual.freezeWorldMatrix();
  }

  private restore(mesh: AbstractMesh, state: FadeState): void {
    state.visual.visibility = state.originalVisibility;
    if (state.visual !== mesh) state.visual.isVisible = false;
    mesh.isVisible = state.originalVisible; this.faded.delete(mesh);
  }

  /** Menus, checkpoints, region changes and the ending must not inherit a faded wall. */
  reset(): void { for (const [mesh, state] of this.faded) this.restore(mesh, state); }
}
