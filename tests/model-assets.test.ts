import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MODEL_CREDITS } from '../src/game/data/modelCredits';

/** These checks cover the actual shipped binary art, rather than mocked loaders. */
function gltf(name: string): any {
  const buffer = readFileSync(`public/assets/models/${name}.glb`);
  expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
  expect(buffer.readUInt32LE(8)).toBe(buffer.length);
  return JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)));
}
describe('approved local model derivatives', () => {
  it('ships four different skinned actors with useful motion clips', () => {
    const signatures = new Set<string>();
    for (const role of ['player', 'department', 'roaming', 'security']) {
      const model = gltf(role);
      expect(model.skins.length).toBe(1);
      expect(model.skins[0].joints.length).toBeGreaterThan(15);
      const clips = model.animations.map((clip: any) => clip.name.toLowerCase());
      for (const name of ['idle', 'walk', 'run']) expect(clips.some((clip: string) => clip.endsWith(name))).toBe(true);
      signatures.add(JSON.stringify(model.meshes));
      expect(model.extensionsRequired ?? []).toEqual([]);
      for (const texture of model.images ?? []) expect(texture.uri ?? '').not.toMatch(/^https?:/);
    }
    expect(signatures.size).toBe(4);
  });
  it('ships the extracted office furniture without remote texture/codec dependencies', () => {
    for (const name of ['desk', 'chair', 'cabinet', 'plant', 'shelf', 'table']) {
      const model = gltf(`office-${name}`);
      expect(model.meshes.length).toBeGreaterThan(0);
      expect(model.skins ?? []).toHaveLength(0);
      expect(model.extensionsRequired ?? []).toEqual([]);
      for (const image of model.images) expect(Number.isInteger(image.bufferView)).toBe(true);
      const positions = model.meshes.flatMap((mesh: any) => mesh.primitives.map((primitive: any) => model.accessors[primitive.attributes.POSITION]));
      const low = [0,1,2].map((axis) => Math.min(...positions.map((a: any) => a.min[axis])));
      const high = [0,1,2].map((axis) => Math.max(...positions.map((a: any) => a.max[axis])));
      expect(Math.abs(low[1])).toBeLessThan(.0001);
      expect(Math.abs(low[0]+high[0])).toBeLessThan(.0001);
      expect(Math.abs(low[2]+high[2])).toBeLessThan(.0001);
    }
  });
  it('retains the five approved sources, a real license and modification notices', () => {
    const record = JSON.parse(readFileSync('docs/model-replacement-selection.json', 'utf8'));
    expect(record.budget).toBe(0);
    expect(record.assets.map((asset: any) => asset.uid).sort()).toEqual(MODEL_CREDITS.map((asset) => asset.uid).sort());
    for (const asset of record.assets) {
      expect(asset.pageLicense).toBe('CC BY 4.0');
      expect(asset.modifications.length).toBeGreaterThan(20);
      expect(asset.sourceFileValidated).toBe(true);
    }
    const credits = readFileSync('public/licenses/MODEL-ATTRIBUTIONS.txt', 'utf8');
    for (const asset of MODEL_CREDITS) expect(credits).toContain(asset.author);
    expect(readFileSync('public/licenses/CC-BY-4.0.txt', 'utf8')).toContain('Attribution 4.0 International');
  });
});
