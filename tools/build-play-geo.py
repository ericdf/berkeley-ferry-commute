#!/usr/bin/env python3
"""Build js/play-geo.js: the map lines for Commuter Reality Check.

  python3 -I tools/build-play-geo.py STREET_CENTERLINES.geojson HOMES.json js/geo.js

HOMES.json is PLAY.homes from js/play-config.js:
  node -e 'global.window={};require("./js/play-config.js");console.log(JSON.stringify(window.PLAY.homes))' > homes.json

Street legs (home <-> BART station, home <-> Marina, home <-> I-80) are shortest paths on the
City of Berkeley centerlines: cars by time on one-way-aware streets, bikes and walkers by distance
on any street or path. Albany is outside that data, so its few blocks are traced by hand, as are
the BART tracks, I-80 south of Berkeley, the Bay Bridge and the San Francisco ends.
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


def LL(lat, lon):
    return P(lon, lat)


def r1(v):
    return round(v, 1)


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1e-9
    best, bi = -1, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * (pts[i][0] - a[0]) - dx * (pts[i][1] - a[1])) / L
        if d > best:
            best, bi = d, i
    if best <= tol:
        return [a, b]
    return simplify(pts[:bi + 1], tol)[:-1] + simplify(pts[bi:], tol)


SPEED = {'Principal Arterial': 13.4, 'Major Collector': 11.2, 'Local': 9.8}
NO_CAR = {'Ramp', 'Interstate'}

cl = json.load(open(sys.argv[1]))
HOMES = json.load(open(sys.argv[2]))
nodes, adj, segs = {}, {}, []


def key(lon, lat):
    return (round(lon, 5), round(lat, 5))


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
    segs.append({'raw': p.get('STREET') or '', 'cls': p['CLASS'], 'pts': pts, 'a': a, 'b': b})
    tw = p.get('TRVLWAY') or 'B'
    car = p['CLASS'] not in NO_CAR and p.get('SFEATYP') not in ('WK', 'PA', 'LN')
    bike = p['CLASS'] not in NO_CAR
    t = L / SPEED.get(p['CLASS'], 9.8)
    adj.setdefault(a, []).append((b, L if bike else None, t if car and tw in ('B', 'FT') else None, i, True))
    adj.setdefault(b, []).append((a, L if bike else None, t if car and tw in ('B', 'TF') else None, i, False))


def names_at(k):
    return {segs[e[3]]['raw'] for e in adj.get(k, [])}


def junction(a, b):
    hits = [k for k in nodes if a in names_at(k) and b in names_at(k)]
    if not hits:
        raise SystemExit(f'no junction {a} x {b}')
    return hits[0]


def nearest(xy, mode):
    col = 2 if mode == 'car' else 1
    best, bk = 1e18, None
    for k, (nx, ny) in nodes.items():
        if not any(e[col] is not None for e in adj[k]):
            continue
        d = (nx - xy[0]) ** 2 + (ny - xy[1]) ** 2
        if d < best:
            best, bk = d, k
    return bk


def dijkstra(src, dst, mode):
    col = 2 if mode == 'car' else 1
    dist, prev, pq = {src: 0.0}, {}, [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == dst:
            break
        if d > dist.get(u, 1e18):
            continue
        for e in adj.get(u, []):
            w = e[col]
            if w is None:
                continue
            nd = d + w
            if nd < dist.get(e[0], 1e18):
                dist[e[0]] = nd
                prev[e[0]] = (u, e[3], e[4])
                heapq.heappush(pq, (nd, e[0]))
    if dst not in dist:
        raise SystemExit(f'no path {src} -> {dst} ({mode})')
    out, v = [], dst
    while v != src:
        u, si, fw = prev[v]
        s = segs[si]['pts']
        out = list(s if fw else s[::-1])[1:] + out
        v = u
    return [nodes[src]] + out


def pl(pts):
    return [[r1(x), r1(y)] for x, y in simplify([tuple(q) for q in pts], 2.0)]


# ---------------------------------------------------------------- places
geo_src = open(sys.argv[3]).read()
G = json.loads(geo_src[geo_src.index('{'):geo_src.rindex('}') + 1])
MARINA_XY = nodes[nearest(tuple(G['places']['terminalNode']), 'car')]   # the cartoon's terminal lot

# El Cerrito Plaza is past the Berkeley data: Thousand Oaks Blvd to the city line, then up beside BART.
ECP = LL(37.90300, -122.29900)
STC = LL(37.78960, -122.39650)                        # Salesforce Transit Center
ECP_APPROACH = [ECP, LL(37.89900, -122.29550)]
ECP_NODE_XY = LL(37.89658, -122.28679)              # Thousand Oaks Blvd at the Berkeley line


def endpoint(xy, mode):
    """(street node, hand-traced approach from the real point to that node)."""
    if math.dist(xy, ECP) < 50:
        k = nearest(ECP_NODE_XY, mode)
        return k, ECP_APPROACH + [nodes[k]]
    return nearest(xy, mode), [xy]


def street(a_xy, b_xy, mode):
    ka, appr_a = endpoint(a_xy, mode)
    kb, appr_b = endpoint(b_xy, mode)
    return pl(appr_a + dijkstra(ka, kb, mode) + appr_b[::-1])


def length(p):
    return sum(math.dist(p[i], p[i + 1]) for i in range(len(p) - 1))


# ---------------------------------------------------------------- hand-traced lines (lat, lon)
def trace(*ll):
    return [LL(a, b) for a, b in ll]


BART_NORTH = trace(  # El Cerrito Plaza -> North Berkeley -> Downtown Berkeley (Ohlone Greenway, under Hearst and Shattuck)
    (37.90300, -122.29900), (37.88305, -122.29120), (37.87870, -122.28780), (37.87400, -122.28340),
    (37.87330, -122.27900), (37.87310, -122.27150), (37.87300, -122.26840), (37.87010, -122.26810))
BART_SOUTH = trace(  # Downtown Berkeley -> Ashby -> MacArthur -> 19th St -> 12th St -> West Oakland
    (37.87010, -122.26810), (37.86400, -122.26770), (37.85880, -122.26830), (37.85290, -122.27000),
    (37.84640, -122.27180), (37.83900, -122.27140), (37.82910, -122.26710), (37.81900, -122.26830),
    (37.80850, -122.26900), (37.80380, -122.27160), (37.80180, -122.27650), (37.80320, -122.28550),
    (37.80480, -122.29510))
TRANSBAY = trace(  # West Oakland -> tube -> Embarcadero
    (37.80480, -122.29510), (37.80340, -122.30400), (37.80060, -122.31800), (37.79640, -122.36000),
    (37.79400, -122.38900))

FREEWAY_SOUTH = trace(  # I-80 from Ashby south past Emeryville to the Maze and the toll plaza
    (37.85344, -122.30007), (37.84394, -122.29763), (37.83500, -122.29560), (37.82900, -122.29400),
    (37.82560, -122.30000), (37.82480, -122.30900))
BAY_BRIDGE = trace(  # toll plaza -> east span -> Yerba Buena tunnel -> west span -> Rincon Hill
    (37.82480, -122.30900), (37.82050, -122.33000), (37.81580, -122.35400), (37.81100, -122.36600),
    (37.80850, -122.37150), (37.79900, -122.38000), (37.78850, -122.39050))
SF_OFF = {
    'civic': trace((37.78850, -122.39050), (37.78300, -122.39700), (37.77700, -122.40500), (37.77320, -122.41000),
                   (37.77650, -122.41520), (37.77970, -122.41400)),
    'fidi': trace((37.78850, -122.39050), (37.78960, -122.39470), (37.78650, -122.39820), (37.78940, -122.40130)),
    'mbay': trace((37.78850, -122.39050), (37.78500, -122.39250), (37.78100, -122.39750), (37.77750, -122.39650),
                  (37.77620, -122.39450), (37.77050, -122.39050), (37.76800, -122.38930)),
    'soma': trace((37.78850, -122.39050), (37.78680, -122.39260), (37.78530, -122.39550)),
}


def i80_wb():
    """Berkeley's own I-80 westbound centerline, Albany line to Ashby."""
    wb = [s for s in segs if s['raw'] == 'I80 WB']
    ends = {s['b'] for s in wb}
    cur = next(s for s in wb if s['a'] not in ends)
    out = list(cur['pts'])
    while True:
        nxt = [s for s in wb if s['a'] == cur['b']]
        if not nxt:
            break
        cur = max(nxt, key=lambda s: len(s['pts']))   # the through lanes, not the short ramp merge
        out += cur['pts'][1:]
    return out


FREEWAY = i80_wb() + FREEWAY_SOUTH[1:] + BAY_BRIDGE[1:]   # Albany line -> Rincon Hill


def fwy_from(lat):
    y0 = P(0, lat)[1]
    return [q for q in FREEWAY if q[1] <= y0]


# Freeway entries: University Ave (north and central Berkeley), Ashby Ave (south), Buchanan St (El Cerrito Plaza)
ENTRIES = {
    'university': (nodes[junction('UNIVERSITY AV', '6TH ST')], fwy_from(37.8695)),
    'ashby': (nodes[junction('ASHBY AV', '7TH ST')], fwy_from(37.8536)),
}


def to_bridge(xy):
    """Street route to the best freeway entry, then I-80 and the Bay Bridge to Rincon Hill."""
    if math.dist(xy, ECP) < 50:
        return pl([ECP, LL(37.89600, -122.30100), LL(37.88900, -122.30450)] + fwy_from(37.8817))
    best = None
    for entry, fwy in ENTRIES.values():
        p = street(xy, entry, 'car') + [[r1(x), r1(y)] for x, y in fwy]
        L = length(street(xy, entry, 'car'))
        if best is None or L < best[0]:
            best = (L, p)
    return pl(best[1])


def track_to_west_oakland(name, ll):
    q = LL(*ll)
    if q in BART_NORTH:
        return pl(BART_NORTH[BART_NORTH.index(q):] + BART_SOUTH[1:])
    return pl(BART_SOUTH[BART_SOUTH.index(q):])


# ---------------------------------------------------------------- per home
MI = 1609.344
out = {'homes': {}, 'stations': {}}
stations = {}
for hid, h in HOMES.items():
    home = LL(*h['ll'])
    stations[h['station']['name']] = h['station']['ll']
    if h.get('parkRide'):
        stations[h['parkRide']['station']['name']] = h['parkRide']['station']['ll']
    st = LL(*h['station']['ll'])
    r = {m: {'station': street(home, st, m), 'marina': street(home, MARINA_XY, m)} for m in ('car', 'bike')}
    r['car']['bridge'] = to_bridge(home)
    if h.get('parkRide'):
        r['car']['parkRide'] = street(home, LL(*h['parkRide']['station']['ll']), 'car')
    if h.get('transbay'):   # walk to the Transbay stop; the bus to the bridge and Salesforce Transit Center
        stop = LL(*h['transbay']['ll'])
        r['bike']['tstop'] = street(home, stop, 'bike')
        r['car']['tbus'] = to_bridge(stop) + [[r1(v) for v in STC]]
    out['homes'][hid] = r
    ln = {f'{m}.{k}': round(length(v) / MI, 2) for m in r for k, v in r[m].items()}
    print(hid, ln)
for name, ll in stations.items():
    xy = LL(*ll)
    out['stations'][name] = {'marina': street(xy, MARINA_XY, 'car'), 'bridge': to_bridge(xy),
                             'bart': track_to_west_oakland(name, ll)}
    print(name, 'to marina', round(length(out['stations'][name]['marina']) / MI, 2), 'mi;',
          'to bridge', round(length(out['stations'][name]['bridge']) / MI, 2), 'mi')

out['marinaBridge'] = to_bridge(MARINA_XY)
out['bridge'] = pl(BAY_BRIDGE)
out['sfOff'] = {k: pl(v) for k, v in SF_OFF.items()}
out['transbay'] = pl(TRANSBAY)
out['bartLine'] = pl(BART_NORTH + BART_SOUTH[1:])

with open('js/play-geo.js', 'w') as f:
    f.write('// Generated by tools/build-play-geo.py. Do not edit.\n')
    f.write('window.PLAYGEO = ' + json.dumps(out, separators=(',', ':')) + ';\n')
print('written js/play-geo.js')
