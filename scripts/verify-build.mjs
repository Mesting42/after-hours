import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Portable artifact checks. Browser evidence is separately recorded in QA_CHECKLIST.md. */
const html = await readFile('dist/index.html', 'utf8');
assert.match(html, /准点下班/); assert.match(html, /lang="zh-CN"/);
for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^\"]+)"/g)) {
  assert.ok((await stat(join('dist', match[1]))).size > 0, match[1]);
}
const directories = ['models', 'textures', 'config', 'audio', 'fonts'];
async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}
let assets = 0;
for (const directory of directories) {
  const files = await filesUnder(join('public/assets', directory)); assert.ok(files.length, directory);
  for (const source of files) {
    const destination = join('dist', source.substring('public/'.length));
    const [original, built] = await Promise.all([readFile(source), readFile(destination)]);
    assert.ok(built.length > 0, destination);
    assert.equal(createHash('sha256').update(original).digest('hex'), createHash('sha256').update(built).digest('hex'), destination);
    assets++;
  }
}
const bundleNames = (await readdir('dist/assets')).filter((name) => name.endsWith('.js'));
const bundles = await Promise.all(bundleNames.map((name) => readFile(join('dist/assets', name), 'utf8')));
assert.ok(bundles.every((code) => !code.includes('qa-panel') && !code.includes('开发验证面板')), 'Development fixtures leaked into production');
const layout = JSON.parse(await readFile('dist/assets/config/office-layout.json', 'utf8')); assert.equal(layout.unit, 'meter');
const timing = JSON.parse(await readFile('dist/assets/config/gameplay-timing.json', 'utf8')); assert.ok(timing.elevatorCloseSeconds > 0);
const licenses = await readFile('dist/licenses/MODEL-ATTRIBUTIONS.txt', 'utf8');
const selected = JSON.parse(await readFile('docs/model-replacement-selection.json', 'utf8'));
for (const asset of selected.assets) { assert.equal(asset.pageLicense, 'CC BY 4.0'); assert.ok(licenses.includes(asset.uid) && licenses.includes(asset.author)); }
assert.ok((await readFile('dist/licenses/CC-BY-4.0.txt', 'utf8')).includes('Attribution 4.0 International'));
assert.ok(!(await readdir('dist/assets/models')).includes('office-kit.json'), 'Superseded model parameters shipped');
for (const name of ['README.md', 'ASSET_SOURCES.md', 'QA_CHECKLIST.md']) assert.ok((await stat(name)).size > 0, name);
console.log(`PASS: HTML, local bundles, ${assets} byte-identical assets, open model licenses, layout/timing data, cleanup and production fixture exclusion.`);
