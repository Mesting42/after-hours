import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, extname, relative } from 'node:path';

/**
 * Inspect downloaded glTF/GLB data without executing it or fetching dependencies.
 * This is an intake report, not proof that a model renders or animates correctly.
 *
 * Usage:
 *   node scripts/inspect-model-assets.mjs path/to/model.glb
 *   node scripts/inspect-model-assets.mjs source-assets --out qa/model-intake.json
 *
 * Original downloads belong outside public/. Only reviewed runtime derivatives
 * should enter the game build. Missing skins/animations are always counted as 0.
 */
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
let outputPath;
if (outIndex !== -1) {
  if (!args[outIndex + 1]) throw new Error('--out requires a report path');
  outputPath = resolve(args[outIndex + 1]);
  args.splice(outIndex, 2);
}
if (!args.length) throw new Error('Provide one or more local GLB/glTF files or directories.');

async function discover(path) {
  const absolute = resolve(path);
  const info = await stat(absolute);
  if (!info.isDirectory()) return /\.(glb|gltf)$/i.test(absolute) ? [absolute] : [];
  const entries = await readdir(absolute, { withFileTypes: true });
  // Ignore symlinks: inspection must not unexpectedly leave an intake directory.
  const groups = await Promise.all(entries.filter((entry) => !entry.isSymbolicLink()).map((entry) => discover(resolve(absolute, entry.name))));
  return groups.flat();
}

/** Validate GLB framing before reading its JSON; no loader or codec is invoked. */
function decodeDocument(bytes, path) {
  if (extname(path).toLowerCase() === '.gltf') return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Invalid GLB header');
  if (bytes.readUInt32LE(4) !== 2) throw new Error('Only glTF 2.0 GLB is supported');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB declared length differs from the file length');
  let offset = 12;
  let document;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error('Truncated GLB chunk header');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + length > bytes.length) throw new Error('Truncated GLB chunk payload');
    if (type === 0x4e4f534a) {
      if (document) throw new Error('Multiple GLB JSON chunks');
      document = JSON.parse(bytes.toString('utf8', offset, offset + length).replace(/[\u0000\u0020]+$/, ''));
    }
    offset += length;
  }
  if (!document) throw new Error('No GLB JSON chunk');
  return document;
}

function inspectGeometry(document) {
  const result = { vertices: 0, triangles: 0, primitives: 0, skinnedPrimitives: 0, morphTargets: 0 };
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const attributes = primitive.attributes ?? {};
      const vertexCount = document.accessors?.[attributes.POSITION]?.count ?? 0;
      const indexCount = document.accessors?.[primitive.indices]?.count ?? vertexCount;
      const mode = primitive.mode ?? 4;
      result.vertices += vertexCount;
      result.triangles += mode === 4 ? Math.floor(indexCount / 3) : mode === 5 || mode === 6 ? Math.max(0, indexCount - 2) : 0;
      result.primitives++;
      if (attributes.JOINTS_0 !== undefined && attributes.WEIGHTS_0 !== undefined) result.skinnedPrimitives++;
      result.morphTargets += primitive.targets?.length ?? 0;
    }
  }
  return result;
}

function inspectAnimations(document) {
  return (document.animations ?? []).map((animation, index) => {
    let start = Infinity, end = -Infinity;
    for (const sampler of animation.samplers ?? []) {
      const accessor = document.accessors?.[sampler.input];
      if (Number.isFinite(accessor?.min?.[0])) start = Math.min(start, accessor.min[0]);
      if (Number.isFinite(accessor?.max?.[0])) end = Math.max(end, accessor.max[0]);
    }
    return {
      name: animation.name ?? 'animation-' + index,
      channelCount: animation.channels?.length ?? 0,
      durationSeconds: Number.isFinite(start) && Number.isFinite(end) ? end - start : null,
      targetPaths: [...new Set((animation.channels ?? []).map((channel) => channel.target?.path).filter(Boolean))],
    };
  });
}

async function inspectFile(path) {
  const bytes = await readFile(path);
  const document = decodeDocument(bytes, path);
  if (document.asset?.version !== '2.0') throw new Error('Expected glTF 2.0');
  const externalResources = [...(document.buffers ?? []), ...(document.images ?? [])]
    .map((item) => item.uri).filter((uri) => typeof uri === 'string' && !uri.startsWith('data:'));
  const skins = (document.skins ?? []).map((skin, index) => ({
    name: skin.name ?? 'skin-' + index,
    jointCount: skin.joints?.length ?? 0,
    jointNames: (skin.joints ?? []).map((joint) => document.nodes?.[joint]?.name ?? 'node-' + joint),
  }));
  return {
    path: relative(process.cwd(), path),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    generator: document.asset?.generator ?? null,
    copyright: document.asset?.copyright ?? null,
    geometry: inspectGeometry(document),
    meshCount: document.meshes?.length ?? 0,
    materialCount: document.materials?.length ?? 0,
    textureCount: document.textures?.length ?? 0,
    skinCount: skins.length,
    skins,
    animationCount: document.animations?.length ?? 0,
    animations: inspectAnimations(document),
    requiredExtensions: document.extensionsRequired ?? [],
    usedExtensions: document.extensionsUsed ?? [],
    externalResources,
    networkResources: externalResources.filter((uri) => /^(?:https?:)?\/\//i.test(uri)),
    // Object names and local bounds help identify reusable office furniture.
    meshes: (document.meshes ?? []).map((mesh, index) => ({
      name: mesh.name ?? 'mesh-' + index,
      primitiveCount: mesh.primitives?.length ?? 0,
      bounds: (mesh.primitives ?? []).map((primitive) => {
        const accessor = document.accessors?.[primitive.attributes?.POSITION];
        return accessor?.min && accessor?.max ? { min: accessor.min, max: accessor.max } : null;
      }),
    })),
    nodes: (document.nodes ?? []).map((node, index) => ({
      index, name: node.name ?? 'node-' + index,
      mesh: node.mesh ?? null, skin: node.skin ?? null, children: node.children ?? [],
    })),
  };
}

const paths = [...new Set((await Promise.all(args.map(discover))).flat())].sort();
if (!paths.length) throw new Error('No local GLB/glTF files found; download and unpack the selected assets first.');
const models = await Promise.all(paths.map(inspectFile));
const report = { inspectedAtUtc: new Date().toISOString(), evidence: 'Static file inspection only; rendering, movement and device acceptance remain separate.', models };
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({
  report: outputPath ?? null,
  models: models.map((model) => ({
    path: model.path, bytes: model.bytes, triangles: model.geometry.triangles,
    skins: model.skinCount, animations: model.animationCount,
    requiredExtensions: model.requiredExtensions, networkResources: model.networkResources.length,
  })),
}, null, 2));
