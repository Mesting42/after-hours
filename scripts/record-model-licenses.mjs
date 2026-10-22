import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** Persist acquisition evidence and attribution; this script never downloads assets. */
const manifestPath = 'docs/model-replacement-selection.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const oldOffice = manifest.assets.find((asset) => asset.role === 'office');
if (oldOffice.uid !== '64144940384d426884f70a9c941bf124') {
  manifest.excluded.push({ ...oldOffice, reason: 'Free Standard is not the open content license required by the user on 2026-10-17; never integrated' });
  Object.assign(oldOffice, {
    name: 'Modern Office Environment', author: 'Bl4ckGh0st', uid: '64144940384d426884f70a9c941bf124',
    source: 'https://sketchfab.com/3d-models/modern-office-environment-64144940384d426884f70a9c941bf124',
    pageLicense: 'CC BY 4.0', confirmedDate: '2026-10-17',
  });
  delete oldOffice.pageDisclosure;
}
const sources = {
  player: 'source-assets/player/business_man_-_low_polygon_game_character.glb',
  department: 'source-assets/department/eric_rigged_001_-_rigged_3d_business_man.glb',
  roaming: 'source-assets/roaming/businessman_rigged.glb',
  security: 'source-assets/security/police_3d_model.glb',
  office: 'source-assets/office/modern_office_environment.glb',
};
const changes = {
  player: 'Normalized to meters; optimized textures; locomotion clips adapted and crouch/interaction overlays added.',
  department: 'Preserved source surface and skin weights; mapped to anatomical skeleton; added Idle/Walk/Run; optimized textures. Original NoAI notice retained.',
  roaming: 'Mapped skin to anatomical skeleton; added Idle/Walk/Run; reduced surface complexity and texture size.',
  security: 'Added anatomical skeleton and smooth weights; added Idle/Walk/Run; replaced police insignia areas with plain security cloth; optimized textures.',
  office: 'Extracted and centered desk, chair, cabinet, shelf, table and plant components; optimized textures and neutral furniture finishes for game lighting; adapted to existing five game regions.',
};
manifest.licensePolicy = { budget: 0, accepted: ['CC BY 4.0', 'CC0-1.0'], rejected: ['Paid', 'Free Standard', 'No documented license', 'NonCommercial', 'NoDerivatives'], verifiedDate: '2026-10-17' };
const lines = ['AFTER HOURS — Third-party model attribution', '', 'License for all five models: Creative Commons Attribution 4.0 International', 'https://creativecommons.org/licenses/by/4.0/', 'Full legal text: CC-BY-4.0.txt', ''];
for (const asset of manifest.assets) {
  const file = sources[asset.role];
  const content = await readFile(file);
  Object.assign(asset, { licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', pageVerifiedDate: '2026-10-17',
    downloadMethod: 'Sketchfab official Download control in authenticated browser', downloadedDate: asset.role === 'office' ? '2026-10-17' : '2026-10-15', sourceFile: file,
    sha256: createHash('sha256').update(content).digest('hex'), bytes: content.length,
    sourceFileValidated: true, validationScope: 'Static GLB structure; integration and visual QA recorded separately', modifications: changes[asset.role] });
  const entry = [`${asset.role}: ${asset.name}`, `Author: ${asset.author}`, `Source: ${asset.source}`, `License: CC BY 4.0 — ${asset.licenseUrl}`, `Modifications: ${changes[asset.role]}`];
  if (asset.additionalPageNotice) entry.push('Additional source-page notice: NoAI. This model may not be used in datasets for, in the development of, or as inputs to generative AI programs.');
  entry.push(`Original source SHA256: ${asset.sha256}`, '');
  lines.push(...entry);
  await mkdir(`source-assets/${asset.role}`, { recursive: true });
  await writeFile(`source-assets/${asset.role}/LICENSE-SOURCE.txt`, entry.join('\n') + '\n');
}
lines.push('No endorsement by the original authors is implied.', 'Original downloads are retained outside public/; runtime derivatives include attribution and license files.');
await mkdir('public/licenses', { recursive: true });
await writeFile('public/licenses/MODEL-ATTRIBUTIONS.txt', lines.join('\n') + '\n');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Recorded five verified free/open content licenses and original source hashes.');
