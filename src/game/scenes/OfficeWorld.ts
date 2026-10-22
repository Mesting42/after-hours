import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ModelLibrary, type FurnitureModel } from '../assets/ModelLibrary';
import { PlayerOcclusionSystem } from '../systems/PlayerOcclusionSystem';
import type { OfficeLayout } from '../data/gameConfig';
import { AREAS, INTERACTABLES } from '../data/levels';
import type { Interactable, Point, Rect } from '../types';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
// Babylon 9 registers the createInstance implementation through this side-effect import.
import '@babylonjs/core/Meshes/instancedMesh';

export class OfficeWorld {
  readonly blockers: Rect[] = [];
  readonly zones: TransformNode[] = [];
  readonly lights: PointLight[] = [];
  readonly doors = new Map<string, { rect: Rect; mesh: AbstractMesh; target: number }>();
  readonly markers = new Map<string, AbstractMesh>();
  readonly interactiveMeshes = new Map<string, AbstractMesh>();
  readonly securityCameras: { area: number; position: Point; heading: number; mesh: AbstractMesh; indicator: StandardMaterial }[] = [];
  readonly elevatorPanels: AbstractMesh[] = [];
  readonly materials: Record<string, StandardMaterial> = {};
  private templates = new Map<string, Mesh>();
  private markerTime = 0;
  private activeArea = -1;
  private readonly cameraOccluders = new Map<number, AbstractMesh[]>();
  readonly playerOcclusion = new PlayerOcclusionSystem();
  private readonly markerObjects = new Map(INTERACTABLES.map((object) => [object.id, object]));
  ceiling: AbstractMesh[] = [];
  constructor(public scene: Scene, private layout: OfficeLayout, private models: ModelLibrary) {
    this.createMaterials(); for (const area of AREAS) this.buildArea(area.id);
    const moving = new Set<AbstractMesh>([...this.elevatorPanels, ...[...this.doors.values()].map((door) => door.mesh)]);
    // Build area indexes once, after every parent transform has its final position.
    // Doors/elevator panels retain live matrices because gameplay moves them.
    for (const mesh of scene.meshes) {
      if (!mesh.metadata?.static) continue;
      if (!moving.has(mesh)) { mesh.computeWorldMatrix(true); mesh.freezeWorldMatrix(); mesh.doNotSyncBoundingInfo = true; }
      if (mesh.metadata.cameraFade) {
        const list = this.cameraOccluders.get(mesh.metadata.area) ?? [];
        list.push(mesh); this.cameraOccluders.set(mesh.metadata.area, list);
      }
    }
  }
  private createMaterials(): void {
    const palette: Record<string, string> = { floor: '#75868b', carpet: '#626f77', wall: '#9babac', trim: '#34434b', desk: '#aca28b', metal: '#53646b', black: '#26343d', screen: '#78b7ae', paper: '#c0c6b8', glass: '#88aaac', plant: '#4f7167', gold: '#cab68e', light: '#d2e4d8', storage: '#576b70', chair: '#39474f' };
    for (const [name, hex] of Object.entries(palette)) {
      const material = new StandardMaterial(name, this.scene); material.diffuseColor = Color3.FromHexString(hex);
      material.specularColor = new Color3(0.1, 0.13, 0.14); material.specularPower = 64;
      material.maxSimultaneousLights = 8;
      if (name === 'glass') { material.alpha = 0.15; material.backFaceCulling = false; }
      if (name === 'screen' || name === 'light') material.emissiveColor = Color3.FromHexString(hex).scale(name === 'light' ? 0.8 : 0.5);
      this.materials[name] = material;
    }
    const tile = new Texture(`${import.meta.env.BASE_URL}assets/textures/office-tile.svg`, this.scene); tile.uScale = 16; tile.vScale = 32;
    this.materials.floor.diffuseTexture = tile;
    // Textures already contain their base color; white tint avoids multiplying them into black.
    this.materials.floor.diffuseColor = new Color3(0.95, 0.95, 0.95);
    const carpet = new Texture(`${import.meta.env.BASE_URL}assets/textures/carpet.svg`, this.scene); carpet.uScale = 10; carpet.vScale = 20;
    this.materials.carpet.diffuseTexture = carpet;
    this.materials.carpet.diffuseColor = new Color3(0.95, 0.95, 0.95);
  }
  private box(name: string, area: number, dimensions: [number, number, number], position: [number, number, number], material: string, solid = false, occluder = solid): InstancedMesh {
    const key = `${material}/${dimensions.join('/')}`;
    let source = this.templates.get(key);
    if (!source) {
      source = MeshBuilder.CreateBox(`template-${key}`, { width: dimensions[0], height: dimensions[1], depth: dimensions[2] }, this.scene);
      source.material = this.materials[material]; source.isVisible = false; source.isPickable = false; source.receiveShadows = true; this.templates.set(key, source);
    }
    const mesh = source.createInstance(`${name}-${area}-${this.scene.meshes.length}`);
    mesh.parent = this.zones[area]; mesh.position.set(...position); mesh.isVisible = true;
    // Visual groups include trim/roof pieces, but do not change AI occlusion tags.
    const outer = ['outer-wall','baseboard','window-frame','window','ceiling-strip'].includes(name);
    const partition = ['partition','partition-cap','glass-top'].includes(name);
    const cameraFade = occluder || outer || partition || name === 'ceiling-beam';
    const cameraFadeGroup = outer ? `outer/${area}/${position[0] < 0 ? 'left' : 'right'}` : partition ? `partition/${area}/${position[2]}` : undefined;
    mesh.metadata = { occluder, area, static: true, cameraFade, cameraFadeGroup }; mesh.isPickable = occluder;
    if (solid) this.blockers.push({ id: mesh.name, x: position[0], z: position[2], w: dimensions[0], d: dimensions[2], active: true });
    return mesh;
  }
  /** Place imported furniture while keeping navigation footprints explicit and stable. */
  private furniture(kind: FurnitureModel, area: number, x: number, z: number, size: [number, number, number], solid = true, occluder = false): TransformNode {
    const id = `furniture-${kind}-${area}-${this.scene.transformNodes.length}`;
    const model = this.models.instantiate(`office-${kind}`, id);
    model.root.parent = this.zones[area];
    model.root.computeWorldMatrix(true);
    const extent = model.root.getHierarchyBoundingVectors(true);
    const actual = extent.max.subtract(extent.min);
    model.root.scaling.set(size[0] / Math.max(.001, actual.x), size[1] / Math.max(.001, actual.y), size[2] / Math.max(.001, actual.z));
    model.root.position.set(x, 0, z);
    model.meshes.forEach((mesh) => { mesh.metadata = { area, static: true, occluder, cameraFade: occluder, cameraFadeGroup: id }; mesh.isPickable = occluder; mesh.computeWorldMatrix(true); mesh.freezeWorldMatrix(); });
    if (solid) this.blockers.push({ id, x, z, w: size[0], d: size[2], active: true });
    return model.root;
  }
  private desk(area: number, x: number, z: number, workstation = true): void {
    const [width, height, depth] = this.layout.desk;
    this.furniture(workstation ? 'desk' : 'table', area, x, z, [width, workstation ? 1.36 : height, depth]);
    this.furniture('chair', area, x, z - 1.04, [.65, 1.05, .65], false);
  }
  private cabinet(area: number, x: number, z: number, width = 2.7): void {
    this.furniture(area === 3 ? 'shelf' : 'cabinet', area, x, z, [width, 1.95, .9], true, true);
  }
  private plant(area: number, x: number, z: number): void {
    this.furniture('plant', area, x, z, [.64, 1.5, .64], true, false);
  }
  private sign(area: number, text: string, x: number, z: number, width = 6): void {
    const texture = new DynamicTexture(`sign-${text}`, { width: 768, height: 160 }, this.scene, false);
    texture.drawText(text, null, 101, 'bold 48px sans-serif', '#c4d4cf', '#293b41', true);
    const material = new StandardMaterial(`sign-${text}`, this.scene); material.diffuseTexture = texture; material.emissiveColor = new Color3(0.2, 0.25, 0.24); material.backFaceCulling = false;
    const plane = MeshBuilder.CreatePlane('sign', { width, height: 1.25 }, this.scene); plane.position.set(x, 2.65, z); plane.material = material; plane.parent = this.zones[area]; plane.isPickable = false;
    const ground = plane.clone('floor-sign')!; ground.position.set(x, 0.045, z + 4); ground.rotation.x = Math.PI / 2; ground.scaling.set(0.7, 0.7, 0.7); ground.parent = this.zones[area];
  }
  private buildArea(area: number): void {
    const a = AREAS[area], start = a.start;
    const root = new TransformNode(`area-${area}`, this.scene); this.zones.push(root);
    this.box('floor', area, [32, 0.18, 64], [0, -0.11, start + 32], 'floor');
    this.box('carpet', area, [22, 0.025, 52], [0, 0.004, start + 31], area === 4 ? 'floor' : 'carpet');
    for (const x of [-15.9, 15.9]) {
      this.box('outer-wall', area, [0.25, 3.4, 64], [x, 1.7, start + 32], 'wall', true);
      this.box('baseboard', area, [0.32, 0.1, 64], [x, 0.1, start + 32], 'trim');
      for (let z = start + 7; z < start + 63; z += 8) {
        this.box('window-frame', area, [0.4, 2.3, 4.9], [x, 2.05, z], 'trim');
        this.box('window', area, [0.43, 2.12, 4.64], [x, 2.05, z], 'glass');
      }
    }
    // The roof uses perimeter strips: architecture is present without covering the isometric view.
    for (const x of [-14.7, 14.7]) this.ceiling.push(this.box('ceiling-strip', area, [2.4, 0.15, 64], [x, 3.5, start + 32], 'wall'));
    for (let z = start + 9; z < start + 63; z += 12) {
      this.box('ceiling-beam', area, [31, 0.12, 0.16], [0, 3.45, z], 'trim');
      for (const x of [-8, 0, 8]) this.box('strip-light', area, [3.2, 0.045, 0.16], [x, 3.38, z], 'light');
      const light = new PointLight(`local-${area}-${z}`, new Vector3(0, 3, z), this.scene); light.diffuse = area === 4 ? new Color3(1, 0.8, 0.48) : new Color3(0.62, 0.83, 0.88); light.intensity = 0.16; light.range = 13; this.lights.push(light);
    }
    this.sign(area, `${String(area + 1).padStart(2, '0')}   ${a.english}`, 0, start + 3);
    // Alternating partitions create two approaches: a broad aisle and a dim perimeter route.
    for (let i = 0; i < 3; i++) {
      const z = start + 16 + i * 14, x = i % 2 ? 5 : -5;
      this.box('partition', area, [17, 1.9, 0.24], [x, 0.95, z], 'storage', true);
      this.box('partition-cap', area, [17.05, 0.055, 0.3], [x, 1.93, z], 'trim');
      this.box('glass-top', area, [17, 0.8, 0.1], [x, 2.37, z], 'glass', false, false);
    }
    // Furnishing styles vary by region, while all layouts preserve both lateral passages.
    if (area === 0) {
      for (let i = 0; i < 4; i++) for (const x of [-8, -3.5, 5.2, 10]) this.desk(area, x, start + 10 + i * 14);
    } else if (area === 1) {
      for (const z of [start + 11, start + 34, start + 52]) for (const x of [-8, 8]) {
        this.furniture('table', area, x, z, [5, .92, 2.5]);
        for (const offset of [-1.6, 0, 1.6]) for (const side of [-1, 1]) this.furniture('chair', area, x + offset, z + side * 1.8, [.6, 1, .65], false);
        this.box('glass-wall', area, [0.12, 2.9, 8], [x < 0 ? -4 : 4, 1.45, z], 'glass', true, false);
        this.box('glass-mullion', area, [0.16, 2.9, 0.1], [x < 0 ? -4 : 4, 1.45, z], 'metal');
      }
    } else if (area === 2) {
      for (const z of [start + 10, start + 34, start + 52]) {
        this.furniture('cabinet', area, -9.5, z, [5.5, .96, 1.1]);
        this.box('kitchen-top', area, [5.7, 0.06, 1.2], [-9.5, 1, z], 'desk');
        this.box('coffee-machine', area, [0.8, 0.6, 0.5], [-10, 1.32, z], 'black');
        this.box('printer', area, [1.4, 1.1, 1], [9, 0.55, z], 'paper', true, false);
        this.box('printer-lid', area, [1.45, 0.12, 1.05], [9, 1.16, z], 'black');
      }
    } else if (area === 3) {
      for (const z of [start + 10, start + 32, start + 52]) { this.cabinet(area, -8, z, 5.5); this.desk(area, 8, z); }
      for (const offset of [25, 47]) {
        const camera = this.box('security-camera', area, [0.48, 0.28, 0.85], [14.8, 2.8, start + offset], 'black');
        const lens = MeshBuilder.CreateSphere('camera-status-light', { diameter: 0.17, segments: 6 }, this.scene);
        lens.position.set(14.51, 2.8, start + offset); lens.parent = root; lens.isPickable = false;
        const indicator = new StandardMaterial(`camera-led-${offset}`, this.scene); lens.material = indicator;
        this.securityCameras.push({ area, position: { x: 14, z: start + offset }, heading: -Math.PI / 2, mesh: camera, indicator });
      }
    } else {
      for (const z of [start + 13, start + 35, start + 53]) {
        this.box('lobby-sofa', area, [4.4, 0.65, 1.3], [-9, 0.33, z], 'chair', true, false);
        this.box('sofa-back', area, [4.4, 0.7, 0.22], [-9, 0.75, z + 0.55], 'storage', false, true);
        this.box('reception', area, [4.4, 1.1, 1.4], [9, 0.55, z], 'desk', true, false);
      }
      this.createElevator(area);
    }
    for (const z of [start + 21, start + 45]) { this.cabinet(area, -11.3, z, 1.8); this.cabinet(area, 11.3, z, 1.8); }
    for (const z of [start + 6, start + 28, start + 56]) { this.plant(area, -14.5, z); this.plant(area, 14.5, z); }
    this.box('storage-room-back', area, [3, 2.8, 0.18], [-13, 1.4, start + 23.5], 'storage', true);
    this.box('storage-room-side', area, [0.18, 2.8, 3], [-14.6, 1.4, start + 22], 'storage', true);
    if (area < 4) {
      for (const x of [-9.5, 9.5]) this.box('exit-wall', area, [13, 3.25, 0.3], [x, 1.625, a.end], 'wall', true);
      const door = this.box('security-door', area, [5.9, 2.8, 0.22], [0, 1.4, a.end], 'metal', true);
      const rect = this.blockers[this.blockers.length - 1]; this.doors.set(a.exitRequires[0], { mesh: door, rect, target: 0 });
      this.sign(area, 'EXIT   →   NEXT WING', 0, a.end - 0.3, 5.5);
    }
    for (const obj of INTERACTABLES.filter((o) => o.area === area)) this.createInteractive(obj);
  }
  private createInteractive(obj: Interactable): void {
    const area = obj.area;
    if (obj.kind !== 'hide' && obj.kind !== 'disguise' && obj.kind !== 'elevator') {
      const device = this.box(`device-${obj.id}`, area, [0.65, 0.95, 0.5], [obj.x, 0.48, obj.z + 0.85], obj.kind === 'note' ? 'paper' : 'black', true, false);
      this.box(`device-screen-${obj.id}`, area, [0.47, 0.27, 0.025], [obj.x, 0.74, obj.z + 0.585], 'screen');
      this.interactiveMeshes.set(obj.id, device);
    }
    const marker = MeshBuilder.CreateTorus(`marker-${obj.id}`, { diameter: obj.kind === 'hide' ? 1.5 : 1.1, thickness: 0.055, tessellation: 24 }, this.scene);
    const material = new StandardMaterial(`marker-material-${obj.id}`, this.scene); material.diffuseColor = Color3.FromHexString(obj.kind === 'hide' ? '#7199ac' : obj.kind === 'disguise' ? '#949b9c' : '#c9b17d'); material.emissiveColor = material.diffuseColor.scale(0.65); material.alpha = 0.7;
    marker.material = material; marker.position.set(obj.x, 0.075, obj.z); marker.parent = this.zones[area]; marker.isPickable = false; this.markers.set(obj.id, marker);
    if (obj.kind === 'hide') this.sign(area, 'STORAGE', obj.x, obj.z + 1.4, 2.2);
  }
  private createElevator(area: number): void {
    const z = 313;
    this.box('lift-rear', area, [6, 3.4, 0.22], [0, 1.7, 319.5], 'metal', true);
    for (const x of [-3, 3]) { this.box('lift-side', area, [0.18, 3.4, 7], [x, 1.7, 316], 'metal', true); this.box('lift-frame', area, [0.22, 3.5, 0.4], [x, 1.75, z], 'gold'); }
    this.box('lift-floor', area, [5.8, 0.04, 6.4], [0, 0.024, 316], 'gold');
    this.box('lift-top', area, [6, 0.25, 0.5], [0, 3.35, z], 'gold');
    for (const x of [-1.45, 1.45]) this.elevatorPanels.push(this.box('elevator-door', area, [2.87, 3.08, 0.12], [x, 1.54, z], 'metal', true));
    this.sign(area, '↓  HOME  /  1F', 0, z - 0.2, 5.6);
    const glow = new PointLight('elevator-warm', new Vector3(0, 2.7, 316), this.scene); glow.diffuse = new Color3(1, 0.78, 0.38); glow.intensity = 0.7; glow.range = 12; this.lights.push(glow);
  }
  setDoor(flag: string, open: boolean, instant = false): void {
    const door = this.doors.get(flag); if (!door) return;
    door.rect.active = !open; door.target = open ? 5.6 : 0;
    if (instant) door.mesh.position.x = door.target;
  }
  setElevator(amount: number): void {
    this.elevatorPanels.forEach((mesh, i) => { mesh.position.x = (i ? 1 : -1) * (1.45 + amount * 2.95); });
    for (const r of this.blockers.filter((r) => r.id.startsWith('elevator-door'))) r.active = amount < 0.94;
  }
  setArea(area: number, lightCount: number, dynamic: boolean): void {
    if (this.activeArea !== area) {
      // Neighboring architecture can cross the camera ray at a chapter boundary.
      this.playerOcclusion.setCandidates([...this.cameraOccluders].filter(([id]) => Math.abs(id - area) <= 1).flatMap(([, meshes]) => meshes));
    }
    this.activeArea = area;
    this.zones.forEach((zone, i) => zone.setEnabled(Math.abs(i - area) <= 1));
    this.lights.forEach((light) => light.setEnabled(false));
    if (dynamic) {
      this.lights.filter((l) => Math.abs(l.position.z - (area * 64 + 32)) < 48 && l.name !== 'elevator-warm').slice(0, Math.round(lightCount) - (area === 4 ? 1 : 0)).forEach((l) => l.setEnabled(true));
      if (area === 4) this.lights[this.lights.length - 1].setEnabled(true);
    }
  }
  update(dt: number, inventory: Set<string>, particles: boolean, reduced: boolean): void {
    this.markerTime += dt;
    for (const [id, marker] of this.markers) {
      const obj = this.markerObjects.get(id)!;
      if (obj.area !== this.activeArea) continue;
      marker.setEnabled(!inventory.has(obj.reward ?? obj.id));
      marker.scaling.setAll(!reduced && particles ? 1 + Math.sin(this.markerTime * 2.2) * 0.045 : 1);
    }
    for (const door of this.doors.values()) {
      const remaining = door.target - door.mesh.position.x;
      if (Math.abs(remaining) > .001) door.mesh.position.x += remaining * Math.min(1, dt * 4);
      else if (remaining) door.mesh.position.x = door.target;
    }
  }
  /** Visual-only body rays; game collision and leader visibility still use originals. */
  fadeNearCamera(camera: Vector3, player: Point, crouched: boolean, dt: number, reduced: boolean): void {
    this.playerOcclusion.update(camera, player, crouched, dt, reduced);
  }
}

