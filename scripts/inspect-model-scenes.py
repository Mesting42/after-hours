"""Read selected glTF scenes through Blender; output world bounds without modifying sources."""
import bpy, json, sys
from pathlib import Path
from mathutils import Vector

base = Path(__file__).resolve().parents[1]
rows = {}
for role, relative in {
    'department': 'source-assets/department/eric_rigged_001_-_rigged_3d_business_man.glb',
    'roaming': 'source-assets/roaming/businessman_rigged.glb',
    'security': 'source-assets/security/police_3d_model.glb',
    'office': 'source-assets/office/modern_office_environment.glb',
}.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(base / relative))
    objects = []
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            points = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
            objects.append({'name':obj.name,'parent':obj.parent.name if obj.parent else None,
                'min':[round(min(p[i] for p in points),4) for i in range(3)],
                'max':[round(max(p[i] for p in points),4) for i in range(3)]})
        elif obj.type == 'ARMATURE':
            objects.append({'armature':obj.name,'bones':{b.name:[list(obj.matrix_world@b.head_local),list(obj.matrix_world@b.tail_local)] for b in obj.data.bones}})
    rows[role] = objects
(base / 'qa/model-scene-bounds.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
