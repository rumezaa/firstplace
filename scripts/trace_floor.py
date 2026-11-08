#!/usr/bin/env python3
"""Trace a UCalgary floor-plan PDF page into src/lib/floorPlans/<name>.ts.

    pip install pymupdf
    python3 scripts/trace_floor.py <plan.pdf> <page 1-based> <out.ts> [EXPORT_NAME]

Reads the page's vector shapes by fill colour (building outline, rooms,
corridors, elevators, stairs, washrooms), rotates the building so its longest
wall is vertical with north at the top, stretches it 1.35x sideways so it reads
on a phone, and writes SVG paths in a W x 1000 viewBox. The PDF itself is not
redistributed; only our simplified, restyled geometry is.
"""
import json, math, sys
import fitz

pdf, page_no, out_path = sys.argv[1], int(sys.argv[2]), sys.argv[3]
name = sys.argv[4] if len(sys.argv) > 4 else 'FLOOR_PLAN'
XS = 1.35
KINDS = {(0.7, 0.7, 0.7): 'outline', (0.96, 0.96, 0.96): 'room', (1.0, 0.99, 0.94): 'corridor',
         (0.25, 0.56, 0.87): 'elevator', (0.84, 0.0, 0.11): 'washroom', (1.0, 0.64, 0.0): 'stairs'}

def polys(d):
    out, cur = [], []
    def flush():
        nonlocal cur
        if len(cur) >= 3: out.append(cur)
        cur = []
    for it in d['items']:
        k = it[0]
        if k in ('l', 'c'):
            a = it[1]
            if cur and (abs(cur[-1][0] - a.x) > .01 or abs(cur[-1][1] - a.y) > .01): flush()
            if not cur: cur = [(a.x, a.y)]
            if k == 'l':
                cur.append((it[2].x, it[2].y))
            else:
                c1, c2, b = it[2], it[3], it[4]
                for t in (.33, .66, 1):
                    cur.append(((1-t)**3*a.x + 3*(1-t)**2*t*c1.x + 3*(1-t)*t*t*c2.x + t**3*b.x,
                                (1-t)**3*a.y + 3*(1-t)**2*t*c1.y + 3*(1-t)*t*t*c2.y + t**3*b.y))
        elif k == 're':
            r = it[1]; flush(); out.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
        elif k == 'qu':
            q = it[1]; flush(); out.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)])
    flush()
    return out

page = fitz.open(pdf)[page_no - 1]
drawings = page.get_drawings()
kind_of = lambda d: KINDS.get(tuple(round(c, 2) for c in (d.get('fill') or ())))
# Only shapes inside the building (skips the north arrow, scale bar, legend).
box = max((d for d in drawings if kind_of(d) == 'outline'), key=lambda d: d['rect'].width * d['rect'].height)['rect']
shapes = []
for d in drawings:
    kind = kind_of(d)
    if kind and box.contains(d['rect']): shapes += [(kind, p) for p in polys(d)]
outline = max((p for k, p in shapes if k == 'outline'), key=len)
edge = max(((outline[i], outline[(i + 1) % len(outline)]) for i in range(len(outline))), key=lambda e: math.dist(*e))
rot = math.pi / 2 - math.atan2(edge[1][1] - edge[0][1], edge[1][0] - edge[0][0])
cx = sum(x for x, _ in outline) / len(outline); cy = sum(y for _, y in outline) / len(outline)
R = lambda p: (XS * ((p[0]-cx)*math.cos(rot) - (p[1]-cy)*math.sin(rot)), (p[0]-cx)*math.sin(rot) + (p[1]-cy)*math.cos(rot))
ro = [R(p) for p in outline]
if R(min(outline, key=lambda p: p[1]))[1] > 0:  # keep north at the top
    rot += math.pi; ro = [R(p) for p in outline]
xs, ys = [x for x, _ in ro], [y for _, y in ro]
x0, y0 = min(xs) - 6, min(ys) - 6
k = 1000 / (max(ys) - min(ys) + 12)
W = round((max(xs) - min(xs) + 12) * k, 1)
N = lambda p: (round((R(p)[0] - x0) * k, 1), round((R(p)[1] - y0) * k, 1))
path = lambda pl: 'M' + ' L'.join(f'{x} {y}' for x, y in map(N, pl)) + ' Z'
group = lambda kind: json.dumps([path(p) for kk, p in shapes if kk == kind])
with open(out_path, 'w') as f:
    f.write(f"""/**
 * Traced from a University of Calgary floor plan and redrawn in FirstPlace's own
 * style by scripts/trace_floor.py — don't hand-edit. Upright: north at the top.
 */
export const {name} = {{
  w: {W},
  h: 1000,
  outline: {json.dumps(path(outline))},
  rooms: {group('room')},
  corridors: {group('corridor')},
  elevators: {group('elevator')},
  stairs: {group('stairs')},
  washrooms: {group('washroom')},
}} as const;
""")
labels = {w[4]: N(((w[0]+w[2])/2, (w[1]+w[3])/2)) for w in page.get_text('words')}
print(f'wrote {out_path}: viewBox {W}x1000; room label positions (0..1):')
for w, (x, y) in sorted(labels.items()):
    if w[:1].isdigit(): print(f'  {w:6} {x/W:.3f} {y/1000:.3f}')
