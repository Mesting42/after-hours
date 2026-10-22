import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
// Register the bundled glTF loader and PBR shaders. No remote decoder is needed.
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import '@babylonjs/loaders/glTF/2.0/glTFLoaderAnimation';
import '@babylonjs/core/Shaders/pbr.vertex';
import '@babylonjs/core/Shaders/pbr.fragment';
import '@babylonjs/core/Shaders/rgbdDecode.fragment';

export type CharacterModel = 'player' | 'department' | 'roaming' | 'security';
export type FurnitureModel = 'desk' | 'chair' | 'cabinet' | 'plant' | 'table' | 'shelf';
export interface ModelInstance {
  root: TransformNode;
  meshes: AbstractMesh[];
  animations: AnimationGroup[];
  skeletons: Skeleton[];
}

/** One local download per source; each actor owns its skeleton and animation groups. */
export class ModelLibrary {
  private readonly containers = new Map<string, AssetContainer>();
  private constructor(private scene: Scene) {}

  static async load(scene: Scene, progress: (label: string) => void): Promise<ModelLibrary> {
    const library = new ModelLibrary(scene);
    const names = ['player', 'department', 'roaming', 'security', 'office-desk', 'office-chair', 'office-cabinet', 'office-plant', 'office-table', 'office-shelf'];
    // A small queue limits peak texture decoding memory on mobile browsers.
    for (let i = 0; i < names.length; i += 2) {
      await Promise.all(names.slice(i, i + 2).map(async (name) => {
        progress(`正在载入办公室与人物 ${i + 1}/${names.length}…`);
        const container = await LoadAssetContainerAsync(`${import.meta.env.BASE_URL}assets/models/${name}.glb`, scene);
        // glTF starts its first clip by default, even for a detached container.
        // Templates supply shared resources only; CharacterRig owns every live clip.
        container.animationGroups.forEach((group) => group.stop());
        // Sources use packed metal/roughness shaders intended for studio HDR maps.
        // This game uses directional office lighting: retain their baked albedo and
        // normal maps in a shared, simpler material instead of one PBR shader per prop.
        for (const sourceMaterial of [...container.materials]) {
          // glTF imports its PBR class lazily. Class-name detection also works when
          // Vite development dependency chunks use a separate module instance.
          if (sourceMaterial.getClassName() !== 'PBRMaterial') continue;
          const original = sourceMaterial as PBRMaterial;
          const material = new StandardMaterial(`${name}/${original.name}/office-light`, scene);
          material.diffuseTexture = original.albedoTexture;
          material.diffuseColor = original.albedoColor.clone();
          material.bumpTexture = original.bumpTexture;
          material.specularColor = new Color3(.08, .09, .1);
          material.specularPower = 48;
          material.ambientColor = new Color3(.3, .3, .3);
          material.emissiveColor = new Color3(.035, .035, .035);
          material.alpha = original.alpha; material.backFaceCulling = original.backFaceCulling;
          material.useAlphaFromDiffuseTexture = original.useAlphaFromAlbedoTexture;
          material.maxSimultaneousLights = 4;
          if (name.startsWith('office-') && /M_Plastic|M_Metal/.test(original.name)) {
            // These source surfaces use near-black studio textures. A neutral office
            // finish keeps the actual furniture silhouette legible under game lighting.
            material.diffuseTexture = null; material.bumpTexture = null;
            material.diffuseColor = /M_Metal/.test(original.name) ? new Color3(.36,.43,.47) : new Color3(.2,.27,.31);
            material.emissiveColor = material.diffuseColor.scale(.15);
            material.alpha = 1; material.useAlphaFromDiffuseTexture = false;
          }
          for (const mesh of container.meshes) if (mesh.material === original) mesh.material = material;
          container.materials.splice(container.materials.indexOf(original), 1, material);
          scene.removeMaterial(material);
          original.dispose(false, false);
        }
        // InstancedMesh inherits its source's light list. Keep hidden templates in
        // the scene so later-created and toggled office lights update that list.
        // A detached AssetContainer loaded before the lights would stay unlit.
        for (const mesh of container.meshes) {
          scene.addMesh(mesh); mesh.isVisible = false; mesh.isPickable = false;
        }
        library.containers.set(name, container);
      }));
    }
    return library;
  }

  instantiate(name: CharacterModel | `office-${FurnitureModel}`, id: string): ModelInstance {
    const source = this.containers.get(name);
    if (!source) throw new Error(`模型未载入：${name}`);
    const character = !name.startsWith('office-');
    source.meshes.forEach((mesh) => { mesh.receiveShadows = true; });
    const instance = source.instantiateModelsToScene((node) => `${id}/${node}`, false, { doNotInstantiate: character });
    const root = new TransformNode(`${id}/appearance`, this.scene);
    instance.rootNodes.forEach((node) => { node.parent = root; });
    const meshes = root.getChildMeshes().filter((mesh) => mesh.getTotalVertices() > 0);
    meshes.forEach((mesh) => { mesh.isVisible = true; mesh.isPickable = false; });
    instance.animationGroups.forEach((group) => group.stop());
    // The prepared glTF and Babylon handedness conversion already face +Z.
    return { root, meshes, animations: instance.animationGroups, skeletons: instance.skeletons };
  }
}
