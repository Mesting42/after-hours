"""Package the current playable build, editable source, original assets and evidence.

node_modules, recovery backups and historical ZIPs deliberately stay outside the
delivery. Each archived file is hashed and the ZIP is reopened for integrity QA.
"""
from pathlib import Path
import argparse, hashlib, json, zipfile

base = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', default='准点下班-开放许可模型-20261017.zip', help='A new ZIP filename in the project root')
args = parser.parse_args()
output = base / args.output
if output.parent != base or output.suffix != '.zip':
    raise ValueError('Choose a ZIP filename in the project root.')
if output.exists():
    raise RuntimeError('Delivery already exists; choose a new name rather than overwrite it.')
folders = ['src', 'public', 'dist', 'scripts', 'tests', 'art-preview', 'design-system']
roots = ['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html',
         'README.md','ASSET_SOURCES.md','QA_CHECKLIST.md','THIRD_PARTY_NOTICES.txt','.gitignore',
         'docs/MODEL_REPLACEMENT_2026-10-17.md','docs/model-replacement-selection.json','source-assets/README.md']
if (base/'docs/PERFORMANCE_2026-10-17.md').exists():
    roots.append('docs/PERFORMANCE_2026-10-17.md')
if (base/'docs/UI_REDESIGN_2026-10-18.md').exists():
    roots.append('docs/UI_REDESIGN_2026-10-18.md')
files = [base / name for name in roots]
for folder in folders:
    files.extend(path for path in (base / folder).rglob('*') if path.is_file() and '__pycache__' not in path.parts and path.suffix != '.log')
for role in ['player','department','roaming','security','office']:
    files.extend(path for path in (base/'source-assets'/role).rglob('*') if path.is_file())
files.extend(path for path in (base/'qa').glob('*model*20261017.json') if path.is_file())
files.extend([base/'qa/runtime-model-intake.json',base/'qa/model-intake-characters.json'])
files.extend((base/'qa/screenshots').glob('models-*-20261017.jpg'))
# Delivery receipts describe an archive after it exists; do not embed an older
# receipt when rebuilding, or the package would claim another ZIP's checksum.
files.extend(path for path in (base/'qa').glob('performance-*.json') if 'delivery' not in path.name)
files.extend((base/'qa/screenshots').glob('performance-*-20261017.jpg'))
files.extend(path for path in (base/'qa').glob('ui-redesign-*.json') if 'delivery' not in path.name)
files.extend((base/'qa/screenshots').glob('ui-redesign-*-20261018.jpg'))
files = sorted(set(files))
entries = []
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as archive:
    for path in files:
        relative = path.relative_to(base).as_posix()
        archive.write(path, '准点下班/'+relative)
        entries.append({'path':relative,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    archive.writestr('准点下班/DELIVERY-MANIFEST.json',json.dumps(entries,ensure_ascii=False,indent=2))
with zipfile.ZipFile(output) as archive:
    bad = archive.testzip()
    if bad: raise RuntimeError('Corrupt ZIP entry: '+bad)
checksum = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(checksum+'  '+output.name+'\n',encoding='utf-8')
report_name = ('ui-redesign-delivery-20261018.json' if '视觉' in output.name else
               'performance-delivery-20261017.json' if '性能' in output.name else 'model-delivery-20261017.json')
(base/'qa'/report_name).write_text(json.dumps({
    'archive':str(output),'bytes':output.stat().st_size,'sha256':checksum,
    'files':len(entries),'zipIntegrity':'passed','excluded':['node_modules','backups','historical ZIPs']
},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'archive':str(output),'bytes':output.stat().st_size,'files':len(entries),'integrity':'passed'},ensure_ascii=False))
