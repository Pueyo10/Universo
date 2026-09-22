"""
Blender headless pre-processing for spacecraft / small-body models.

  blender -b -P tools/blender/prep_model.py -- <in> <out.glb> <size_m> [--tris N] [--drop REGEX]
          [--min-size FRAC] [--rules rules.json]

- imports GLB/GLTF, OBJ, FBX, STL, PLY
- drops objects whose name matches --drop (e.g. handrails, bolts) and objects smaller than
  --min-size × the model's extent (details invisible at the app's viewing distances)
- applies all transforms, centres the model on its bounding-box centre and scales its longest
  dimension to <size_m> metres (0 keeps the source scale); the app renders spacecraft in metres
- normalises materials to physically plausible PBR by name (MLI foil, solar arrays, radiators,
  optics...). NASA models ship with legacy Phong/Lambert settings (grey, non-metallic foil).
  Rules are [substring, [r,g,b] | null, metallic, roughness]; the first match wins; per-model
  rules (--rules) are tried before the defaults
- decimates to --tris triangles (collapse) if the source is heavier
- exports a Y-up GLB; web compression is done afterwards with glTF-Transform (tools/models.mjs)
"""
import bpy, sys, math, os, re, json
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, dst, size_m = argv[0], argv[1], float(argv[2])
opt = {'tris': 250000, 'drop': None, 'min_size': 0.0, 'rules': None}
i = 3
while i < len(argv):
    k = argv[i].lstrip('-').replace('-', '_'); v = argv[i + 1]; i += 2
    opt[k] = int(v) if k == 'tris' else float(v) if k == 'min_size' else v

DEFAULT_RULES = [
    ['black', [0.03, 0.03, 0.035], 0.2, 0.55], ['blk', [0.03, 0.03, 0.035], 0.2, 0.55], ['carbon', [0.05, 0.05, 0.055], 0.2, 0.35],
    ['graphite', [0.05, 0.05, 0.055], 0.2, 0.35],
    ['mirror', None, 1.0, 0.06], ['optic', None, 1.0, 0.06],
    ['gold', [0.95, 0.72, 0.32], 1.0, 0.3], ['brass', [0.95, 0.75, 0.35], 1.0, 0.32], ['kapton', [0.9, 0.62, 0.25], 1.0, 0.32],
    ['silver', [0.86, 0.86, 0.88], 1.0, 0.28], ['foil', [0.86, 0.86, 0.88], 1.0, 0.3], ['mli', [0.86, 0.86, 0.88], 1.0, 0.3],
    ['solar', [0.02, 0.035, 0.09], 0.4, 0.2], ['panel', None, 0.6, 0.25], ['cell', [0.02, 0.035, 0.09], 0.4, 0.2],
    ['alu', [0.8, 0.82, 0.85], 1.0, 0.35], ['metal', [0.8, 0.8, 0.82], 1.0, 0.3], ['steel', [0.7, 0.7, 0.72], 1.0, 0.35],
    ['white', [0.85, 0.85, 0.83], 0.0, 0.55], ['radiator', [0.88, 0.88, 0.86], 0.0, 0.5], ['paint', None, 0.0, 0.55],
]
rules = (json.load(open(opt['rules'])) if opt['rules'] else []) + DEFAULT_RULES

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(src)[1].lower()
if ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=src)
elif ext == '.obj': bpy.ops.wm.obj_import(filepath=src)
elif ext == '.fbx': bpy.ops.import_scene.fbx(filepath=src)
elif ext == '.stl': bpy.ops.wm.stl_import(filepath=src)
elif ext == '.ply': bpy.ops.wm.ply_import(filepath=src)
else: raise SystemExit('unsupported format ' + ext)

def bbox(objs):
    lo = Vector((1e30,) * 3); hi = Vector((-1e30,) * 3)
    for o in objs:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c); lo = Vector(map(min, lo, p)); hi = Vector(map(max, hi, p))
    return lo, hi

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo, hi = bbox(meshes); extent = max(hi - lo)
dropped = 0
drop_re = re.compile(opt['drop'], re.I) if opt['drop'] else None
for o in list(meshes):
    lo_o, hi_o = bbox([o])
    if (drop_re and drop_re.search(o.name)) or (opt['min_size'] > 0 and (hi_o - lo_o).length < opt['min_size'] * extent):
        bpy.data.objects.remove(o, do_unlink=True); dropped += 1
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

# bake world transforms into the vertex data directly (parent_clear + transform_apply mishandle hierarchies with
# negative scale, e.g. Maya exports with a mirrored root), flip winding where the transform mirrors, drop helpers
from mathutils import Matrix
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
world = {o.name: o.matrix_world.copy() for o in meshes}
for o in meshes:
    if o.data.users > 1: o.data = o.data.copy()   # instanced meshes: bake each instance separately
for o in meshes:
    mw = world[o.name]
    o.data.transform(mw)
    if mw.determinant() < 0: o.data.flip_normals()
    o.parent = None
    o.matrix_world = Matrix.Identity(4)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)

# stray parts parked far from the assembly (stowage placeholders, envelopes): drop objects whose centre lies beyond
# --outliers x the 90th-percentile distance of all part centres from the median centre
if opt.get('outliers'):
    cen = {}
    for o in meshes:
        l = Vector((1e30,) * 3); h = Vector((-1e30,) * 3)
        for v in o.data.vertices: l = Vector(map(min, l, v.co)); h = Vector(map(max, h, v.co))
        cen[o.name] = (l + h) / 2
    xs = sorted(c.x for c in cen.values()); ys = sorted(c.y for c in cen.values()); zs = sorted(c.z for c in cen.values())
    med = Vector((xs[len(xs) // 2], ys[len(ys) // 2], zs[len(zs) // 2]))
    ds = sorted((c - med).length for c in cen.values()); p90 = ds[int(len(ds) * 0.9)]
    for o in list(meshes):
        if (cen[o.name] - med).length > float(opt['outliers']) * p90:
            print('OUTLIER', o.name); bpy.data.objects.remove(o, do_unlink=True); dropped += 1
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

bpy.context.view_layer.update()
# measure on the baked vertices (bound_box can be stale right after transform_apply)
lo = Vector((1e30,) * 3); hi = Vector((-1e30,) * 3)
for o in meshes:
    for v in o.data.vertices: lo = Vector(map(min, lo, v.co)); hi = Vector(map(max, hi, v.co))
centre = (lo + hi) / 2; extent = max(hi - lo)
if os.environ.get('PREP_DEBUG'):
    rows = []
    for o in meshes:
        l = Vector((1e30,) * 3); h = Vector((-1e30,) * 3)
        for v in o.data.vertices: l = Vector(map(min, l, v.co)); h = Vector(map(max, h, v.co))
        rows.append((max(h - l), o.name, tuple(round(x, 1) for x in l), tuple(round(x, 1) for x in h)))
    for r in sorted(rows, reverse=True)[:8]: print('DBG', round(r[0], 2), r[1][:40], r[2], r[3])
k = size_m / extent if size_m > 0 else 1.0
for o in meshes:
    for v in o.data.vertices: v.co = (v.co - centre) * k
    o.data.update()

def pbr(mat):
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None: return None
    name = mat.name.lower()
    for sub, col, metal, rough in rules:
        if sub in name:
            if col is not None and not bsdf.inputs['Base Color'].is_linked: bsdf.inputs['Base Color'].default_value = (*col, 1.0)
            if metal is not None: bsdf.inputs['Metallic'].default_value = metal
            if rough is not None: bsdf.inputs['Roughness'].default_value = rough
            return sub
    return None
matched = {m.name: pbr(m) for m in bpy.data.materials}

tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
if tris > opt['tris']:
    ratio = opt['tris'] / tris
    for o in meshes:
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if n < 64: continue
        mod = o.modifiers.new('dec', 'DECIMATE'); mod.ratio = ratio; mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
tris2 = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)

os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True, export_apply=True, export_image_format='AUTO', export_materials='EXPORT')
print(f'PREP OK {os.path.basename(src)} -> {os.path.basename(dst)}  extent {extent:.3f} -> {size_m or extent:.2f} m  dropped {dropped}  tris {tris} -> {tris2}  materials {len(bpy.data.materials)} ({sum(1 for v in matched.values() if v)} matched)')
