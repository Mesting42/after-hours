import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayerState } from '../types';
import { ModelLibrary, type CharacterModel } from '../assets/ModelLibrary';

/** Owns only appearance. Controllers retain position, navigation and AI behavior. */
export class CharacterRig {
  readonly root: TransformNode;
  readonly body: TransformNode;
  readonly meshes: AbstractMesh[];
  private readonly groups: AnimationGroup[];
  private active: AnimationGroup | undefined;
  private state: PlayerState | 'leader' = 'Normal';
  private crouch = 0;
  private readonly joints = new Map<string, TransformNode>();
  private readonly poseBase = new Map<TransformNode, Quaternion>();
  private readonly clips = new Map<string, AnimationGroup>();
  private enabled = true;
  private speed = 0;

  constructor(scene: Scene, id: string, model: CharacterModel, library: ModelLibrary) {
    this.root = new TransformNode(id, scene);
    const appearance = library.instantiate(model, id);
    this.body = appearance.root; this.body.parent = this.root;
    this.meshes = appearance.meshes; this.groups = appearance.animations;
    for (const name of ['idle', 'walk', 'run']) {
      const clip = this.groups.find((group) => new RegExp(`[|/]${name}$`, 'i').test(group.name));
      if (clip) this.clips.set(name, clip);
    }
    for (const skeleton of appearance.skeletons) {
      for (const bone of skeleton.bones) {
        const node = bone.getTransformNode();
        if (node) this.joints.set(bone.name.split('/').at(-1)!, node);
      }
    }
    // Pose overlays run after clip evaluation, so animation cannot overwrite a crouch.
    const before = scene.onBeforeAnimationsObservable.add(() => {
      for (const [node, rotation] of this.poseBase) node.rotationQuaternion?.copyFrom(rotation);
      this.poseBase.clear();
    });
    const observer = scene.onAfterAnimationsObservable.add(() => { if (this.enabled) this.applyPose(); });
    this.root.onDisposeObservable.add(() => { scene.onAfterAnimationsObservable.remove(observer); scene.onBeforeAnimationsObservable.remove(before); });
    this.animate(0, 0, 'Normal');
  }

  /** Visibility and animation share a lifecycle: an unseen actor has no animatables. */
  setEnabled(enabled: boolean): void {
    this.root.setEnabled(enabled);
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) { this.active?.stop(); this.active = undefined; }
    else this.animate(0, this.speed, this.state);
  }

  animate(dt: number, speed: number, state: PlayerState | 'leader'): void {
    this.state = state;
    this.speed = speed;
    if (!this.enabled) return;
    this.crouch += ((state === 'Crouching' ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
    const running = state === 'Running' || (state === 'leader' && speed > 3.3);
    const clip = this.clips.get(speed > .05 ? running ? 'run' : 'walk' : 'idle');
    if (clip && clip !== this.active) {
      this.active?.stop(); this.active = clip; clip.start(true);
    }
    if (this.active) this.active.speedRatio = speed > .05 ? Math.max(.4, Math.min(1.7, speed / (running ? 5.8 : 3.35))) : 1;
  }

  private rotateJoint(pattern: RegExp, radians: number): void {
    for (const [name, node] of this.joints) {
      if (!pattern.test(name)) continue;
      const rotation = node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
      if (!this.poseBase.has(node)) this.poseBase.set(node, rotation.clone());
      // Imported joints have different local axes. Convert the actor's right axis
      // into each joint frame, including the glTF handedness reflection.
      const world = node.computeWorldMatrix(true);
      const actorRight = Vector3.TransformNormal(Vector3.Right(), this.root.computeWorldMatrix(true)).normalize();
      const localAxis = Vector3.TransformNormal(actorRight, Matrix.Invert(world)).normalize();
      node.rotationQuaternion = rotation.multiply(Quaternion.RotationAxis(localAxis, radians * (world.determinant() < 0 ? -1 : 1)));
    }
  }

  private applyPose(): void {
    // The figure bends at hips and knees; its body proportions remain unchanged.
    this.body.position.y = -this.crouch * .4;
    if (this.crouch > .001) {
      this.rotateJoint(/Upper_Leg_[LR]/, -1.1 * this.crouch);
      this.rotateJoint(/Lower_Leg_[LR]/, 2 * this.crouch);
      this.rotateJoint(/^Foot_[LR]/, -.9 * this.crouch);
      this.rotateJoint(/Spine_02/, .28 * this.crouch);
    }
    if (this.state === 'Interacting') this.rotateJoint(/Upper_Arm_R/, -.75);
    if (this.state === 'Discovered') this.rotateJoint(/Upper_Arm_[LR]/, -1.05);
  }
}
