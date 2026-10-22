"""Build local runtime derivatives from the five approved CC BY 4.0 sources.

Run with official Blender 4.5 LTS: blender --background --python this-file.
Source files are immutable. NPC weights are mapped to a small anatomical rig;
the unrigged security mesh receives explicit smooth weights. No remote codecs.
"""
import bpy, math, re, json, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'public/assets/models'
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = {
    'player':'source-assets/player/business_man_-_low_polygon_game_character.glb',
    'department':'source-assets/department/eric_rigged_001_-_rigged_3d_business_man.glb',
    'roaming':'source-assets/roaming/businessman_rigged.glb',
    'security':'source-assets/security/police_3d_model.glb',
    'office':'source-assets/office/modern_office_environment.glb',
}

def load(role):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(BASE/SOURCES[role]))
    # glTF importer creates a hidden bone display mesh; it is never game art.
    for obj in list(bpy.data.objects):
        if obj.name.startswith('Icosphere'):
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.scene.render.fps = 30
    for image in bpy.data.images:
        if image.size[0] > 512 or image.size[1] > 512:
            factor = 512 / max(image.size)
            image.scale(max(1,int(image.size[0]*factor)),max(1,int(image.size[1]*factor)))
    for mat in bpy.data.materials:
        if not mat.use_nodes: continue
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                # Ambient-only office lighting must still show cloth and wood.
                node.inputs['Metallic'].default_value = 0.03
                node.inputs['Roughness'].default_value = 0.68

def bounds(objects):
    # Blender's bound_box cache may remain stale immediately after data.transform.
    # Use the actual vertices so extracted furniture is centered exactly once.
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    return Vector([min(p[i] for p in points) for i in range(3)]), Vector([max(p[i] for p in points) for i in range(3)])

def export(name, objects=None, animations=True):
    bpy.ops.object.select_all(action='DESELECT')
    selected = objects if objects is not None else list(bpy.context.scene.objects)
    for obj in selected: obj.select_set(True)
    bpy.context.scene.frame_set(0)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{name}.glb'),export_format='GLB',
        use_selection=True,export_animations=animations,export_animation_mode='ACTIONS',
        export_force_sampling=True,export_anim_slide_to_zero=True,
        export_extras=True,export_yup=True,export_cameras=False,export_lights=False)

def apply_mesh_world(obj, transform):
    world = transform @ obj.matrix_world
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
    obj.data.transform(world)
    obj.data.update()

def side_of(name):
    if re.search(r'(^left|_l(?:_|$))',name): return 'L'
    if re.search(r'(^right|_r(?:_|$))',name): return 'R'
    return None

def semantic(name):
    """Map existing source weights, including twist/finger bones, to our small rig."""
    n = name.lower().replace(' ',''); side = side_of(n)
    if side:
        if any(v in n for v in ['upperleg','upleg']): return 'thigh.'+side
        if any(v in n for v in ['lowerleg','leftleg','rightleg']): return 'shin.'+side
        if any(v in n for v in ['foot','ball','toe']): return 'foot.'+side
        if any(v in n for v in ['lowerarm','forearm']): return 'forearm.'+side
        if any(v in n for v in ['upperarm','leftarm','rightarm']): return 'upperarm.'+side
        if any(v in n for v in ['hand','thumb','index','middle','ring','pinky','finger']): return 'hand.'+side
        if 'shoulder' in n: return 'chest'
    if 'neck' in n: return 'neck'
    if any(v in n for v in ['head','eye','jaw','brow','lid','nose','lip','mouth']): return 'head'
    if 'spine2' in n or 'spine_03' in n or 'chest' in n: return 'chest'
    if 'spine' in n: return 'spine'
    if 'hip' in n or 'root' in n: return 'hips'
    return None

def anatomical_rig(joints):
    arm = bpy.data.objects.new('AfterHoursRig',bpy.data.armatures.new('AfterHoursRig'))
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active=arm; arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    definitions = [
        ('hips','hips','spine',None),('spine','spine','chest','hips'),
        ('chest','chest','neck','spine'),('neck','neck','head','chest'),
        ('head','head','headtop','neck')]
    for side in ['L','R']:
        definitions += [(f'upperarm.{side}',f'upperarm.{side}',f'forearm.{side}','chest'),
            (f'forearm.{side}',f'forearm.{side}',f'hand.{side}',f'upperarm.{side}'),
            (f'hand.{side}',f'hand.{side}',f'handtip.{side}',f'forearm.{side}'),
            (f'thigh.{side}',f'thigh.{side}',f'shin.{side}','hips'),
            (f'shin.{side}',f'shin.{side}',f'foot.{side}',f'thigh.{side}'),
            (f'foot.{side}',f'foot.{side}',f'toe.{side}',f'shin.{side}')]
    for name,start,end,parent in definitions:
        bone=arm.data.edit_bones.new(name); bone.head=joints[start]; bone.tail=joints[end]
        if parent: bone.parent=arm.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm

def closest_weights(point, joints):
    """Security source has no skin. Blend neighboring anatomical segments at joints."""
    side='L' if point.x>=0 else 'R'; z=point.z
    if abs(point.x)>.24 and z>1.02:
        names=['upperarm.'+side,'forearm.'+side,'hand.'+side]
    elif z<.94:
        names=['thigh.'+side,'shin.'+side,'foot.'+side]
    else:
        names=['hips','spine','chest','neck','head']
    ends={'hips':'spine','spine':'chest','chest':'neck','neck':'head','head':'headtop',
        f'upperarm.{side}':f'forearm.{side}',f'forearm.{side}':f'hand.{side}',f'hand.{side}':f'handtip.{side}',
        f'thigh.{side}':f'shin.{side}',f'shin.{side}':f'foot.{side}',f'foot.{side}':f'toe.{side}'}
    weights=[]
    for name in names:
        a=Vector(joints[name]); direction=Vector(joints[ends[name]])-a
        t=max(0,min(1,(point-a).dot(direction)/max(direction.length_squared,1e-8)))
        distance=(point-a-direction*t).length
        weights.append((name,1/max(.015,distance)**4))
    weights=sorted(weights,key=lambda row:-row[1])[:2]
    total=sum(w for _,w in weights)
    return [(name,w/total) for name,w in weights]

def animate_npc(arm):
    """In-place skeletal cycles keep movement owned by the navigation controller."""
    for clip, amplitude, frames in [('Idle',0,60),('Walk',.43,32),('Run',.72,22)]:
        action=bpy.data.actions.new(clip); action.use_fake_user=True
        arm.animation_data_create(); arm.animation_data.action=action
        for frame in range(frames+1):
            phase=frame/frames*math.tau
            for bone in arm.pose.bones:
                bone.rotation_mode='QUATERNION'; bone.rotation_quaternion=Quaternion(); bone.location=(0,0,0)
            for side,offset in [('L',0),('R',math.pi)]:
                wave=math.sin(phase+offset); hip=wave*amplitude
                knee=max(0,-wave)*amplitude*1.6
                rotations={f'thigh.{side}':hip,f'shin.{side}':knee,f'foot.{side}':-hip*.35-knee*.6}
                for name,angle in rotations.items():
                    rest=arm.data.bones[name].matrix_local.to_quaternion()
                    arm.pose.bones[name].rotation_quaternion=rest.inverted()@Quaternion((1,0,0),angle)@rest
                name=f'upperarm.{side}'; restbone=arm.data.bones[name]; rest=restbone.matrix_local.to_quaternion()
                direction=(Vector(arm.data.bones[f'forearm.{side}'].head_local)-Vector(restbone.head_local)).normalized()
                down=Vector((.12 if side=='L' else -.12,0,-1)).normalized()
                lower=direction.rotation_difference(down)
                swing=Quaternion((1,0,0),-wave*amplitude*.65)
                arm.pose.bones[name].rotation_quaternion=rest.inverted()@swing@lower@rest
            # Small vertical motion is part of the skeleton, never root translation.
            hip=arm.pose.bones['hips']; rest=arm.data.bones['hips'].matrix_local.to_quaternion()
            hip.location=rest.inverted()@Vector((0,0,abs(math.sin(phase*2))*.018 if amplitude else math.sin(phase)*.003))
            for bone in arm.pose.bones:
                bone.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=bone.name)
                if bone.name=='hips': bone.keyframe_insert(data_path='location',frame=frame,group=bone.name)
        arm.animation_data.action=None

def prepare_npc(role):
    load(role)
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    lower,upper=bounds(meshes); scale=1.82/(upper.z-lower.z)
    center=Vector(((lower.x+upper.x)/2,(lower.y+upper.y)/2,lower.z))
    norm=Matrix.Scale(scale,4)@Matrix.Translation(-center)
    old=next((o for o in bpy.context.scene.objects if o.type=='ARMATURE'),None)
    joints={}
    if old:
        names=({'hips':'hip_02','spine':'spine_01_03','chest':'spine_03_05','neck':'neck_06','head':'head_07',
            'upperarm.L':'upperarm_l_024','forearm.L':'lowerarm_l_025','hand.L':'hand_l_026',
            'upperarm.R':'upperarm_r_049','forearm.R':'lowerarm_r_050','hand.R':'hand_r_051',
            'thigh.L':'upperleg_l_074','shin.L':'lowerleg_l_075','foot.L':'foot_l_076','toe.L':'ball_l_077',
            'thigh.R':'upperleg_r_081','shin.R':'lowerleg_r_082','foot.R':'foot_r_083','toe.R':'ball_r_084'}
            if role=='department' else {'hips':'Hips_66','spine':'Spine_55','chest':'Spine2_53','neck':'Neck_4','head':'Head_3',
            'upperarm.L':'LeftArm_27','forearm.L':'LeftForeArm_26','hand.L':'LeftHand_25',
            'upperarm.R':'RightArm_51','forearm.R':'RightForeArm_50','hand.R':'RightHand_49',
            'thigh.L':'LeftUpLeg_60','shin.L':'LeftLeg_59','foot.L':'LeftFoot_58','toe.L':'LeftToeBase_57',
            'thigh.R':'RightUpLeg_65','shin.R':'RightLeg_64','foot.R':'RightFoot_63','toe.R':'RightToeBase_62'})
        for name,source in names.items(): joints[name]=norm@old.matrix_world@old.data.bones[source].head_local
    else:
        joints={k:Vector(v) for k,v in {'hips':(0,0,.94),'spine':(0,0,1.09),'chest':(0,0,1.34),'neck':(0,0,1.53),'head':(0,0,1.61)}.items()}
        for side,sign in [('L',1),('R',-1)]:
            for name,v in {'upperarm':(.25,0,1.45),'forearm':(.54,0,1.43),'hand':(.78,0,1.42),
                'thigh':(.1,0,.94),'shin':(.1,0,.52),'foot':(.1,0,.13),'toe':(.1,-.16,.045)}.items():
                joints[name+'.'+side]=Vector((v[0]*sign,v[1],v[2]))
    joints['headtop']=joints['head']+Vector((0,0,.18))
    for side in ['L','R']:
        joints['handtip.'+side]=joints['hand.'+side]+(joints['hand.'+side]-joints['forearm.'+side]).normalized()*.1
    arm=anatomical_rig(joints)
    for obj in meshes:
        group_names={g.index:g.name for g in obj.vertex_groups}
        old_weights=[[(semantic(group_names[g.group]),g.weight) for g in vertex.groups] for vertex in obj.data.vertices]
        apply_mesh_world(obj,norm)
        for modifier in list(obj.modifiers):
            if modifier.type=='ARMATURE': obj.modifiers.remove(modifier)
        obj.vertex_groups.clear()
        groups={bone.name:obj.vertex_groups.new(name=bone.name) for bone in arm.data.bones}
        for vertex,weights in zip(obj.data.vertices,old_weights):
            weights=[(name,w) for name,w in weights if name in groups]
            if not weights: weights=closest_weights(vertex.co,joints) if role=='security' else [('head',1)]
            total=sum(w for _,w in weights)
            for name,w in weights: groups[name].add([vertex.index],w/total,'ADD')
        if role=='roaming' and len(obj.data.polygons)>3000:
            bpy.context.view_layer.objects.active=obj
            decimate=obj.modifiers.new('Mobile surface reduction','DECIMATE'); decimate.ratio=.38
            bpy.ops.object.modifier_apply(modifier=decimate.name)
        mod=obj.modifiers.new('Skeletal motion','ARMATURE'); mod.object=arm
        obj.parent=arm
    if role=='security':
        cloth=bpy.data.materials.new('Unmarked security cloth'); cloth.diffuse_color=(.035,.09,.16,1)
        for obj in meshes:
            obj.data.materials.append(cloth); index=len(obj.data.materials)-1
            # Replace chest/sleeve/cap imagery; no police emblems remain on these surfaces.
            for polygon in obj.data.polygons:
                p=polygon.center
                if (1.02<p.z<1.5) or (1.1<p.z<1.6 and abs(p.x)>.17) or p.z>1.74: polygon.material_index=index
    for obj in list(bpy.context.scene.objects):
        if obj not in meshes and obj!=arm: bpy.data.objects.remove(obj,do_unlink=True)
    animate_npc(arm)
    arm['source_role']=role; arm['license']='CC BY 4.0'
    export(role)

def prepare_player():
    load('player')
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    low,high=bounds(meshes); factor=1.78/(high.z-low.z)
    anchor=bpy.data.objects.new('PlayerMeters',None); bpy.context.collection.objects.link(anchor)
    for obj in list(bpy.context.scene.objects):
        if obj!=anchor and obj.parent is None: obj.parent=anchor
    anchor.scale=(factor,)*3; anchor.location=Vector((-(high.x+low.x)/2,-(high.y+low.y)/2,-low.z))*factor
    anchor['license']='CC BY 4.0'
    export('player')

def prepare_office():
    load('office')
    originals=[o for o in bpy.context.scene.objects if o.type=='MESH']
    groups={
        'desk':['Desk_','Computer_','Keyboard_','Flower_Pot_','Dirt_','Leaves2_'],
        'chair':['Chair_'],
        'cabinet':['Wardrobe_','Wardrobe_Door_','Cupboard_','Drawer_','Drawer2_','Drawer_Handle'],
        'plant':['Flower_Pot2_','Dirt2_','Leaves_'],
        'table':['Rectangular_Table_'],
        'shelf':['Box_Shelves','Tall_Shelf','Book'],
    }
    for name,prefixes in groups.items():
        clones=[]
        for source in originals:
            if not any(source.name.startswith(prefix) for prefix in prefixes): continue
            obj=source.copy(); obj.data=source.data.copy(); bpy.context.collection.objects.link(obj)
            apply_mesh_world(obj,Matrix.Identity(4)); clones.append(obj)
        if not clones: raise RuntimeError('Missing office component '+name)
        low,high=bounds(clones); center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
        for obj in clones: obj.data.transform(Matrix.Translation(-center))
        # Merge by material to keep repeated workstations inexpensive to draw.
        bpy.ops.object.select_all(action='DESELECT')
        for obj in clones: obj.select_set(True)
        bpy.context.view_layer.objects.active=clones[0]; bpy.ops.object.join()
        joined=bpy.context.view_layer.objects.active; joined.name='office-'+name
        joined['license']='CC BY 4.0'; joined['source']='Modern Office Environment / Bl4ckGh0st'
        export('office-'+name,[joined],False)
        bpy.data.objects.remove(joined,do_unlink=True)

roles=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['player','department','roaming','security','office']
for role in roles:
    if role=='player': prepare_player()
    elif role=='office': prepare_office()
    else: prepare_npc(role)
print('APPROVED MODELS PREPARED')
