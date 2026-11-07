'use strict';
// Turns CFG.events + GEO into a timed event list, the master clock, and every total shown.
// Nothing here is typed in by hand: change js/config.js and the numbers follow.
(function () {
  const C = window.CFG, G = window.GEO;
  const T = (window.TL = {});
  const MI = 1609.344;

  T.parseTime = (s) => {
    const m = String(s).match(/(\d+):(\d+)\s*(AM|PM)/i);
    let h = +m[1] % 12;
    if (/pm/i.test(m[3])) h += 12;
    return h * 60 + +m[2];
  };
  T.fmt = (min) => {
    const t = Math.floor(min + 1e-6);
    let h = Math.floor(t / 60) % 24;
    const mm = t % 60;
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(mm).padStart(2, '0')} ${ap}`;
  };
  T.dur = (min) => {
    const m = Math.round(min);
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} hr ${String(m % 60).padStart(2, '0')} min`;
  };
  T.mi = (m) => `${(m / MI).toFixed(m < 800 ? 2 : 1)} mi`;
  T.money = (v) => `$${v.toFixed(2)}`;

  // ---------------------------------------------------------------- routes
  function poly(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  const P = G.places;
  T.routes = {};
  for (const k in G.routes) {
    const r = G.routes[k];
    T.routes[k] = Object.assign(poly(r.pts), { m: r.m, runs: r.runs, cross: r.cross });
  }
  const sfPoly = (pts) => { const p = poly(pts); return Object.assign(p, { m: p.len, runs: [], cross: [] }); };
  T.routes.ferry = sfPoly(G.ferry);
  T.routes.bart = sfPoly([P.embarcaderoBart, P.montgomeryBart, P.powellBart, P.civicCenterBart]);

  // point at distance d (route metres, as in runs/cross) along a route
  T.at = (name, d) => {
    const r = T.routes[name];
    const s = Math.max(0, Math.min(r.len, (d / r.m) * r.len));
    let i = 1;
    while (i < r.cum.length - 1 && r.cum[i] < s) i++;
    const a = r.pts[i - 1], b = r.pts[i];
    const f = (s - r.cum[i - 1]) / ((r.cum[i] - r.cum[i - 1]) || 1);
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };
  T.streetAt = (name, d) => {
    const r = T.routes[name];
    const run = r.runs.find((x) => d >= x.d0 - 0.5 && d <= x.d1 + 0.5);
    return run ? run.name : '';
  };

  // minutes to drive d0..d1 on a route at the configured class speeds
  T.carMin = (name, d0, d1) => {
    const r = T.routes[name];
    let min = 0;
    for (const run of r.runs) {
      const o = Math.min(d1, run.d1) - Math.max(d0, run.d0);
      if (o > 0) min += o / ((C.carMph[run.cls] || 16) * 0.44704) / 60;
    }
    return min;
  };
  const walkMin = (m) => m / (C.walkMph * 0.44704) / 60;

  function resolveTo(name, from, to) {
    const r = T.routes[name];
    if (to === 'end' || to == null) return r.m;
    if (typeof to === 'number') return to;
    const c = r.cross.find((x) => x.d > from + 1 && x.with.includes(to));
    if (!c) throw new Error(`route ${name}: no crossing with ${to} after ${from}`);
    return c.d;
  }

  // ---------------------------------------------------------------- the event list
  const fill = (s, e) => String(s || '')
    .replace('{d}', e.dist != null ? T.mi(e.dist) : '')
    .replace('{min}', Math.round(e.dur))
    .replace('${parking}', '$' + C.parkingFee);

  const pos = {};                          // where each route has got to
  let clock = T.parseTime(C.startTime);
  let screen = 0;
  T.events = C.events.map((src, i) => {
    const e = Object.assign({ i }, src);
    e.t0 = clock;
    e.s0 = screen;
    if (e.route) {
      const r = T.routes[e.route];
      if (e.rev) {
        e.d0 = r.m; e.d1 = 0;
      } else {
        const from = pos[e.route] || 0;
        e.d0 = from;
        e.d1 = e.mode === 'ferry' || e.mode === 'bart' ? r.m : resolveTo(e.route, from, e.to);
        pos[e.route] = e.d1;
      }
      e.dist = Math.abs(e.d1 - e.d0);
    } else if (e.m) {
      e.dist = e.m;
    }
    if (e.kind === 'work') e.dur = T.parseTime(C[e.until]) - clock;
    else if (e.kind === 'card') e.dur = 0;
    else if (typeof e.min === 'string') e.dur = C[e.min];
    else if (e.min != null) e.dur = e.min;
    else if (e.mode === 'car') e.dur = T.carMin(e.route, Math.min(e.d0, e.d1), Math.max(e.d0, e.d1));
    else if (e.mode === 'walk') e.dur = walkMin(e.dist);
    else if (e.mode === 'ferry') e.dur = C.sailMin;
    else e.dur = 0;
    e.t1 = e.t0 + e.dur;
    e.s1 = e.s0 + e.ss;
    e.caption = fill(e.cap, e);
    clock = e.t1;
    screen = e.s1;
    return e;
  });
  T.length = screen;

  // map waits: park the car where the previous drive ended
  for (let i = 0; i < T.events.length; i++) {
    const e = T.events[i];
    if (!e.route) {
      for (let j = i - 1; j >= 0; j--) {
        const p = T.events[j];
        if (p.route && p.mode !== 'ferry' && p.mode !== 'bart') { e.hold = { route: p.route, d: p.d1 }; break; }
      }
    }
  }

  // chapters
  T.chapters = [];
  for (const e of T.events) if (e.ch && !T.chapters.find((c) => c.name === e.ch)) T.chapters.push({ name: e.ch, s: e.s0, i: e.i });
  const workEv = T.events.find((e) => e.kind === 'work');
  T.eveningStart = workEv.s0;

  T.eventAt = (s) => {
    const E = T.events;
    if (s >= T.length) return E[E.length - 1];
    let lo = 0, hi = E.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (E[mid].s0 <= s) lo = mid; else hi = mid - 1;
    }
    return E[lo];
  };
  T.clockAt = (s) => {
    const e = T.eventAt(s);
    const p = Math.max(0, Math.min(1, (s - e.s0) / e.ss));
    return e.t0 + e.dur * p;
  };

  // pizza temperature (°F) at a clock time; null before it exists
  const pz = T.events.find((e) => e.pizzaStart);
  T.pizzaReady = pz.t1;
  T.pizzaF = (t) => {
    if (t < pz.t0) return null;
    if (t <= T.pizzaReady) return C.pizza.hotF;
    return C.pizza.roomF + (C.pizza.hotF - C.pizza.roomF) * Math.exp(-C.pizza.perMin * (t - T.pizzaReady));
  };

  // ---------------------------------------------------------------- totals
  function summarize(list) {
    const s = { car: 0, ferry: 0, bart: 0, walk: 0, move: 0, wait: 0, errand: 0, carM: 0, errandCarM: 0 };
    for (const e of list) {
      if (e.kind === 'move') { s[e.mode] += e.dur; s.move += e.dur; }
      if (e.kind === 'wait') s.wait += e.dur;
      if (e.kind === 'errand') s.errand += e.dur;
      if (e.mode === 'car') { s.carM += e.dist; if (e.kind === 'errand') s.errandCarM += e.dist; }
    }
    s.t0 = list[0].t0;
    s.t1 = list[list.length - 1].t1;
    s.elapsed = s.t1 - s.t0;
    return s;
  }
  const iAm = T.events.findIndex((e) => e.card === 'am');
  const iWork = workEv.i;
  const iPm = T.events.findIndex((e) => e.card === 'pm');
  const am = summarize(T.events.slice(1, iAm));            // from leaving home to the office door
  const pm = summarize(T.events.slice(iWork + 1, iPm));    // from the office door to home

  // the pizza detour vs. parking at Gioia's curb and driving straight home
  const homeDrive = T.events.filter((e) => e.route === 'home' && e.kind === 'move').reduce((a, e) => a + e.dur, 0);
  const pickup = pz.dur;
  const directMin = T.carMin('direct', 0, T.routes.direct.m);
  const detourMin = pm.errand - pickup + homeDrive - directMin;
  const detourM = T.routes.search.m + T.routes.home.m - T.routes.direct.m;

  const carM = am.carM + pm.carM;
  const gal = carM / MI / C.vehicle.mpg;
  const galRange = C.vehicle.mpgRange.map((m) => carM / MI / m).reverse();
  const fuel = gal * C.gasPrice;
  const fares = 2 * C.ferryFare + 2 * C.bartFare;
  const detourGal = detourM / MI / C.vehicle.mpg;

  T.sum = {
    am, pm, carM, gal, galRange, fuel,
    parking: C.parkingFee, ferryFares: 2 * C.ferryFare, bartFares: 2 * C.bartFare,
    outOfPocket: fuel + C.parkingFee + fares,
    subsidy: 2 * C.ferrySubsidy,
    co2: gal * C.co2KgPerGallon, co2Range: galRange.map((g) => g * C.co2KgPerGallon),
    detourMin, detourM, detourGal, detourFuel: detourGal * C.gasPrice, directMin, pickup,
    roundTrip: pm.t1 - am.t0,
    motionBoth: am.move + pm.move,
    waitBoth: am.wait + pm.wait,
    pizzaHomeF: T.pizzaF(pm.t1),
    sailM: T.routes.ferry.len,
  };
})();
