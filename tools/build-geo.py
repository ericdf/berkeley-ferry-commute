#!/usr/bin/env python3
"""Build js/geo.js: every map shape and route the cartoon uses.

Usage:
  python3 -I tools/build-geo.py CENTERLINES.geojson COAST.json

  CENTERLINES  City of Berkeley / Alameda County street centerlines (GeoJSON LineStrings)
               ~/prj/berkeley-public-records/L0/sources/streets/streets-2026-10-20-street-centerlines.geojson
  COAST        OpenStreetMap natural=coastline ways, Overpass JSON with `out geom`, bbox 37.70,-122.53,37.93,-122.20

Routes are real shortest-time paths over the centerline graph (one-way streets respected for the
car, ignored on foot). The proposed pier follows the old Berkeley Pier alignment taken from
gtpb/ferry (Field of Schemes), 1,080 ft from its foot. The ferry path and the San Francisco points
are drawn by hand (Alameda County centerlines stop at the county line).

Output units: metres, x east / y north, from ORIGIN.
"""
import heapq
import json
import math
import sys

ORIGIN = (-122.3300, 37.8400)
M_LAT = 110990.0
M_LON = 111320.0 * math.cos(math.radians(ORIGIN[1]))


def P(lon, lat):
    return ((lon - ORIGIN[0]) * M_LON, (lat - ORIGIN[1]) * M_LAT)


def r1(v):
    return round(v, 1)


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy) or 1e-9
    best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


# ---------------------------------------------------------------- streets + graph
SPEED = {'Principal Arterial': 13.4, 'Major Collector': 11.2, 'Local': 9.8}   # routing weights only (m/s)
NO_CAR = {'Ramp', 'Interstate'}

cl = json.load(open(sys.argv[1]))
nodes = {}      # key -> (x, y)
adj = {}        # key -> list of (to, metres, seconds_car or None, seg index, forward)
segs = []       # {name, cls, pts}


def key(lon, lat):
    return (round(lon, 5), round(lat, 5))


def pretty(p):
    n = p.get('STREET') or ''
    parts = n.split(' ')
    suf = {'WY': 'Way', 'AV': 'Ave', 'ST': 'St', 'DR': 'Dr', 'PL': 'Pl', 'CT': 'Ct', 'RD': 'Rd', 'BL': 'Blvd', 'LN': 'Ln', 'CI': 'Cir', 'PATH': 'Path'}
    if parts and parts[-1] in suf:
        parts[-1] = suf[parts[-1]]
    out = []
    for w in parts:
        out.append(w if w in suf.values() else w.capitalize())
    s = ' '.join(out)
    return s.replace('Martin Luther King Jr Way', 'MLK Jr Way').replace('Mc Gee', 'McGee').replace('Mcgee', 'McGee')


for f in cl['features']:
    p = f['properties']
    c = f['geometry']['coordinates']
    if len(c) < 2:
        continue
    pts = [P(*q) for q in c]
    L = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
    a, b = key(*c[0]), key(*c[-1])
    nodes.setdefault(a, pts[0])
    nodes.setdefault(b, pts[-1])
    i = len(segs)
    segs.append({'name': pretty(p), 'raw': p.get('STREET') or '', 'cls': p['CLASS'], 'pts': pts, 'len': L, 'a': a, 'b': b, 'p': p})
    tw = p.get('TRVLWAY') or 'B'
    car = p['CLASS'] not in NO_CAR and p.get('SFEATYP') not in ('WK', 'PA', 'LN')   # walks, paths and lanes are mostly Berkeley's stairs/footpaths
    t = L / SPEED.get(p['CLASS'], 9.8)
    fwd_car = car and tw in ('B', 'FT')
    back_car = car and tw in ('B', 'TF')
    adj.setdefault(a, []).append((b, L, t if fwd_car else None, i, True))
    adj.setdefault(b, []).append((a, L, t if back_car else None, i, False))


def nearest(x, y, pred=None):
    best, bk = 1e18, None
    for k, (nx, ny) in nodes.items():
        if pred and not pred(k):
            continue
        d = (nx - x) ** 2 + (ny - y) ** 2
        if d < best:
            best, bk = d, k
    return bk


def names_at(k):
    return {segs[e[3]]['raw'] for e in adj.get(k, [])}


def junction(a, b):
    """Node where streets a and b meet (raw names, e.g. 'GRIZZLY PEAK BL')."""
    hits = [k for k in nodes if a in names_at(k) and b in names_at(k)]
    if not hits:
        raise SystemExit(f'no junction {a} x {b}')
    return hits[0]


def dijkstra(src, dst, mode):
    dist = {src: 0.0}
    prev = {}
    pq = [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == dst:
            break
        if d > dist.get(u, 1e18):
            continue
        for v, L, tcar, si, fw in adj.get(u, []):
            w = tcar if mode == 'car' else L
            if w is None:
                continue
            nd = d + w
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                prev[v] = (u, si, fw)
                heapq.heappush(pq, (nd, v))
    if dst not in dist:
        raise SystemExit(f'no path {src} -> {dst} ({mode})')
    path = []
    v = dst
    while v != src:
        u, si, fw = prev[v]
        path.append((si, fw))
        v = u
    return path[::-1]


def walk_dists(src):
    dist = {src: 0.0}
    pq = [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u] or d > 4000:
            continue
        for v, L, _, _, _ in adj.get(u, []):
            nd = d + L
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                heapq.heappush(pq, (nd, v))
    return dist


def route(waypoints, mode):
    """Join shortest paths through waypoints -> polyline, cumulative d, street runs, crossings."""
    steps = []
    for a, b in zip(waypoints, waypoints[1:]):
        steps += dijkstra(a, b, mode)
    pts, runs, cross = [], [], []
    for si, fw in steps:
        s = segs[si]
        sp = s['pts'] if fw else s['pts'][::-1]
        if not pts:
            pts.append(list(sp[0]))
        for q in sp[1:]:
            pts.append(list(q))
        if runs and runs[-1]['name'] == s['name']:
            runs[-1]['d1'] += s['len']
        else:
            d0 = runs[-1]['d1'] if runs else 0.0
            runs.append({'name': s['name'], 'cls': s['cls'], 'd0': d0, 'd1': d0 + s['len']})
        end = s['b'] if fw else s['a']
        others = sorted({segs[e[3]]['name'] for e in adj[end]} - {s['name']})
        if others:
            cross.append({'d': r1(runs[-1]['d1']), 'with': others})
    pts = simplify([tuple(p) for p in pts], 2.0)
    for r in runs:
        r['d0'], r['d1'] = r1(r['d0']), r1(r['d1'])
    total = runs[-1]['d1']
    # per-class metres, so the config can turn distance into moving time
    by_cls = {}
    for r in runs:
        by_cls[r['cls']] = r1(by_cls.get(r['cls'], 0) + r['d1'] - r['d0'])
    return {'pts': [[r1(x), r1(y)] for x, y in pts], 'm': r1(total), 'runs': runs, 'cross': cross, 'byClass': by_cls}


# ---- named places on the street network
HOME = junction('GRIZZLY PEAK BL', 'SENIOR AV')
UNIV_SHATTUCK = junction('UNIVERSITY AV', 'SHATTUCK AV')
HOPKINS_SAC = junction('HOPKINS ST', 'SACRAMENTO ST')
HOPKINS_MCGEE = next((k for k in nodes if 'HOPKINS ST' in names_at(k) and names_at(k) & {'MC GEE AV', 'MCGEE AV'}), None) or junction('HOPKINS ST', 'MCGEE AV')
HOPKINS_CAL = junction('HOPKINS ST', 'CALIFORNIA ST')

# Gioia: 1586 Hopkins, geocoded on the Hopkins block between California and McGee (2/3 of the way east, like gtpb)
cx = nodes[HOPKINS_CAL]
mx = nodes[HOPKINS_MCGEE]
GIOIA = (cx[0] + (mx[0] - cx[0]) * 0.66, cx[1] + (mx[1] - cx[1]) * 0.66)

# The proposed pier: old Berkeley Pier alignment (gtpb ferry/js/marina-geo.js, metres from -122.317, 37.866)
def from_marina(x, y):
    lon = -122.317 + x / (111320.0 * math.cos(math.radians(37.866)))
    lat = 37.866 + y / 110990.0
    return P(lon, lat)


PIER_FOOT = from_marina(-55.0, -347.0)
_dir = (-829.0, -365.0)
_L = math.hypot(*_dir)
PIER_END = from_marina(-55.0 + _dir[0] / _L * 329.2, -347.0 + _dir[1] / _L * 329.2)   # 1,080 ft
TERMINAL_LOT = from_marina(40.0, -330.0)
TERMINAL_NODE = nearest(*TERMINAL_LOT, pred=lambda k: any(segs[e[3]]['cls'] not in NO_CAR for e in adj[k]))

am = route([HOME, UNIV_SHATTUCK, TERMINAL_NODE], 'car')
pm = route([TERMINAL_NODE, HOPKINS_SAC, HOPKINS_MCGEE], 'car')

# The parking search: circle the blocks around Gioia, then widen until a space turns up a mile's walk away.
g = nodes[HOPKINS_MCGEE]
loop = [junction('MCGEE AV', 'ADA ST'), junction('ADA ST', 'CALIFORNIA ST'), HOPKINS_CAL, junction('CARLOTTA AV', 'HOPKINS ST'),
        junction('CARLOTTA AV', 'POSEN AV'), junction('MONTEREY AV', 'POSEN AV'), HOPKINS_CAL]
gioia_node = nearest(*GIOIA)
wd = walk_dists(gioia_node)
home_xy = nodes[HOME]
cands = [k for k, d in wd.items() if 1590 <= d <= 1640 and any(segs[e[3]]['cls'] == 'Local' for e in adj[k])]
SPOT = min(cands, key=lambda k: math.hypot(nodes[k][0] - home_xy[0], nodes[k][1] - home_xy[1]))
search = route([HOPKINS_MCGEE] + loop + [SPOT], 'car')
walk = route([SPOT, gioia_node], 'walk')
home = route([SPOT, HOME], 'car')
direct = route([HOPKINS_MCGEE, HOME], 'car')     # the baseline: had he parked at Gioia's curb

# ---------------------------------------------------------------- San Francisco + ferry (hand-placed)
SF = {
    'ferryBuilding': P(-122.3934, 37.7955),
    'embarcaderoBart': P(-122.3969, 37.7929),
    'montgomeryBart': P(-122.4013, 37.7894),
    'powellBart': P(-122.4079, 37.7844),
    'civicCenterBart': P(-122.4141, 37.7797),
    'office': P(-122.4166, 37.7789),
    'vanNessMarket': P(-122.4193, 37.7752),
}
FERRY = [PIER_END, P(-122.3540, 37.8470), P(-122.3880, 37.8340), P(-122.3925, 37.8150), P(-122.3905, 37.8000), SF['ferryBuilding']]

# ---------------------------------------------------------------- coastline -> land polygons
coast = json.load(open(sys.argv[2]))
ways = [[P(q['lon'], q['lat']) for q in el['geometry']] for el in coast['elements'] if el.get('geometry')]
X0, Y0 = P(-122.53, 37.70)
X1, Y1 = P(-122.20, 37.93)


def merge(ws):
    ws = [list(w) for w in ws]
    done = False
    while not done:
        done = True
        for i in range(len(ws)):
            for j in range(len(ws)):
                if i != j and ws[i] and ws[j] and ws[i][0] != ws[i][-1] and ws[i][-1] == ws[j][0]:
                    ws[i] = ws[i] + ws[j][1:]
                    ws[j] = []
                    done = False
        ws = [w for w in ws if w]
    return ws


def inside(p):
    return X0 <= p[0] <= X1 and Y0 <= p[1] <= Y1


def clip_chain(w):
    """Cut an open chain into pieces inside the box, adding boundary crossing points."""
    out, cur = [], []
    for i in range(len(w)):
        p = w[i]
        if inside(p):
            if not cur and i > 0:
                cur.append(_hit(w[i - 1], p))
            cur.append(p)
        else:
            if cur:
                cur.append(_hit(cur[-1], p))
                out.append(cur)
                cur = []
    if cur:
        out.append(cur)
    return out


def _hit(a, b):
    """Point where segment a->b crosses the box boundary (one inside, one outside)."""
    ins, outs = (a, b) if inside(a) else (b, a)
    lo, hi = 0.0, 1.0
    for _ in range(40):
        m = (lo + hi) / 2
        q = (ins[0] + (outs[0] - ins[0]) * m, ins[1] + (outs[1] - ins[1]) * m)
        if inside(q):
            lo = m
        else:
            hi = m
    q = (ins[0] + (outs[0] - ins[0]) * lo, ins[1] + (outs[1] - ins[1]) * lo)
    # snap to the nearest edge
    d = [abs(q[0] - X0), abs(q[0] - X1), abs(q[1] - Y0), abs(q[1] - Y1)]
    k = d.index(min(d))
    return (X0, q[1]) if k == 0 else (X1, q[1]) if k == 1 else (q[0], Y0) if k == 2 else (q[0], Y1)


def perim(p):
    """Position along the box boundary, counter-clockwise from the SW corner (y up)."""
    W, H = X1 - X0, Y1 - Y0
    x, y = p
    if abs(y - Y0) < 1e-6:
        return x - X0
    if abs(x - X1) < 1e-6:
        return W + (y - Y0)
    if abs(y - Y1) < 1e-6:
        return W + H + (X1 - x)
    return 2 * W + H + (Y1 - y)


CORNERS = [(X1, Y0), (X1, Y1), (X0, Y1), (X0, Y0)]


def corners_between(s0, s1):
    """Box corners met walking counter-clockwise from perimeter position s0 to s1."""
    W, H = X1 - X0, Y1 - Y0
    per = 2 * (W + H)
    cs = [(W, CORNERS[0]), (W + H, CORNERS[1]), (2 * W + H, CORNERS[2]), (per, CORNERS[3])]
    span = (s1 - s0) % per
    out = []
    for cpos, c in sorted(cs, key=lambda t: (t[0] - s0) % per):
        if 0 < (cpos - s0) % per < span:
            out.append(c)
    return out


merged = merge(ways)
rings, chains = [], []
for w in merged:
    if w[0] == w[-1]:
        if any(inside(p) for p in w):
            rings.append(w)
    else:
        chains += clip_chain(w)
chains = [c for c in chains if len(c) >= 2]

# OSM: land is on the LEFT of the coastline direction. Walk each chain, then the box boundary
# counter-clockwise from its exit to the nearest next entry, until the ring closes.
open_chains = chains
used = [False] * len(open_chains)
for i, c in enumerate(open_chains):
    if used[i]:
        continue
    ring = []
    j = i
    while True:
        used[j] = True
        ring += open_chains[j]
        s_exit = perim(open_chains[j][-1])
        per = 2 * ((X1 - X0) + (Y1 - Y0))
        best, bk = None, None
        for k, c2 in enumerate(open_chains):
            if used[k] and k != i:
                continue
            gap = (perim(c2[0]) - s_exit) % per
            if best is None or gap < best:
                best, bk = gap, k
        ring += corners_between(s_exit, perim(open_chains[bk][0]))
        if bk == i:
            break
        j = bk
    rings.append(ring)

def simplify_ring(rg, tol):
    if rg[0] == rg[-1]:
        rg = rg[:-1]
    if len(rg) < 4:
        return rg
    far = max(range(len(rg)), key=lambda i: (rg[i][0] - rg[0][0]) ** 2 + (rg[i][1] - rg[0][1]) ** 2)
    return simplify(rg[:far + 1], tol)[:-1] + simplify(rg[far:] + [rg[0]], tol)[:-1]


land = []
for rg in rings:
    s = simplify_ring(rg, 12.0)
    if len(s) >= 3:
        land.append([[round(x), round(y)] for x, y in s])

# ---------------------------------------------------------------- street backdrop (Berkeley + a margin)
BX0, BY0 = P(-122.330, 37.845)
BX1, BY1 = P(-122.225, 37.910)
streets = []
for s in segs:
    if any(BX0 <= x <= BX1 and BY0 <= y <= BY1 for x, y in s['pts']):
        pts = simplify(s['pts'], 3.0)
        c = 2 if s['cls'] in ('Principal Arterial', 'Interstate') else 1 if s['cls'] in ('Major Collector', 'Ramp') else 0
        streets.append([c] + [v for x, y in pts for v in (round(x), round(y))])

# street-name labels: the longest stretch of each street, labelled at its middle
labels = {}
for s in segs:
    if s['cls'] in NO_CAR or not s['name']:
        continue
    lab = labels.get(s['name'])
    if not lab or s['len'] > lab[0]:
        m = s['pts'][len(s['pts']) // 2]
        a, b = s['pts'][0], s['pts'][-1]
        labels[s['name']] = (s['len'], round(m[0]), round(m[1]), round(math.atan2(b[1] - a[1], b[0] - a[0]), 2))
labels = [[n, x, y, ang] for n, (L, x, y, ang) in labels.items() if L > 120]

xy = lambda k: [r1(nodes[k][0]), r1(nodes[k][1])]
out = {
    'origin': ORIGIN,
    'mPerDegLon': r1(M_LON), 'mPerDegLat': M_LAT,
    'box': [round(X0), round(Y0), round(X1), round(Y1)],
    'land': land,
    'streets': streets,
    'labels': labels,
    'routes': {'am': am, 'pm': pm, 'search': search, 'walk': walk, 'home': home, 'direct': direct},
    'ferry': [[r1(x), r1(y)] for x, y in FERRY],
    'places': {
        'home': xy(HOME), 'univShattuck': xy(UNIV_SHATTUCK), 'terminalLot': [r1(TERMINAL_LOT[0]), r1(TERMINAL_LOT[1])],
        'terminalNode': xy(TERMINAL_NODE), 'pierFoot': [r1(PIER_FOOT[0]), r1(PIER_FOOT[1])], 'pierEnd': [r1(PIER_END[0]), r1(PIER_END[1])],
        'gioia': [r1(GIOIA[0]), r1(GIOIA[1])], 'hopkinsMcgee': xy(HOPKINS_MCGEE), 'spot': xy(SPOT),
        **{k: [r1(x), r1(y)] for k, (x, y) in SF.items()},
    },
    'spotWalkM': r1(wd[SPOT]),
}
with open('js/geo.js', 'w') as fh:
    fh.write('// Generated by tools/build-geo.py. Do not edit by hand.\n')
    fh.write('// Streets: City of Berkeley / Alameda County centerlines. Shoreline: (c) OpenStreetMap contributors.\n')
    fh.write('window.GEO = ' + json.dumps(out, separators=(',', ':')) + ';\n')

for n in ('am', 'pm', 'search', 'walk', 'home', 'direct'):
    r = out['routes'][n]
    print(f"{n}: {r['m']/1609.34:.2f} mi  " + ' > '.join(f"{x['name']}({(x['d1']-x['d0'])/1609.34:.2f})" for x in r['runs']))
print('spot walk m', out['spotWalkM'], 'land rings', len(land), 'streets', len(streets))
