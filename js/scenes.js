'use strict';
// One renderer per scene name in CFG.events. Each is a pure function of
// (event, progress through it, clock minutes), so seeking and speed changes never drift.
(function () {
  const A = window.ART, G = window.GEO, T = window.TL, C = window.CFG;
  const INK = A.INK, W = A.W, H = A.H;
  const S = (window.SCENES = {});
  const OSM = '© OpenStreetMap contributors · streets: City of Berkeley';

  // ============================================================ MAP
  const COL = { water: '#7cc0e3', land: '#f3ead2', park: '#d6e8b9', street: '#d8c9a3', art: '#c7a25a', route: '#e8562a', todo: '#8a7f6a' };
  // precompute street bounding boxes for culling
  const streets = G.streets.map((s) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 1; i < s.length; i += 2) { x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); y0 = Math.min(y0, s[i + 1]); y1 = Math.max(y1, s[i + 1]); }
    return { c: s[0], p: s, x0, y0, x1, y1 };
  });

  function cam(cx, cy, z) {
    return { cx, cy, z, sx: (x) => W / 2 + (x - cx) * z, sy: (y) => H / 2 - (y - cy) * z };
  }
  function drawBase(ctx, v, o = {}) {
    ctx.fillStyle = COL.water;
    ctx.fillRect(0, 0, W, H);
    // gentle water texture
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const yy = (i * 61 + 13) % H, xx = (i * 211) % W;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 15, yy - 6, xx + 30, yy); ctx.stroke();
    }
    ctx.fillStyle = COL.land;
    // beyond the shoreline data: the East Bay hills to the east, Richmond to the north-east
    const [, , bx1, by1] = G.box;
    if (v.sx(bx1) < W) ctx.fillRect(v.sx(bx1) - 2, 0, W, H);
    const rx = (-122.40 - G.origin[0]) * G.mPerDegLon;
    if (v.sy(by1) > 0) ctx.fillRect(Math.max(0, v.sx(rx)), 0, W, v.sy(by1) + 2);
    ctx.strokeStyle = '#5c8fb0';
    ctx.lineWidth = 3;
    for (const ring of G.land) {
      ctx.beginPath();
      ring.forEach(([x, y], i) => (i ? ctx.lineTo(v.sx(x), v.sy(y)) : ctx.moveTo(v.sx(x), v.sy(y))));
      ctx.closePath();
      ctx.fill();
    }
    // streets
    const vx0 = v.cx - W / 2 / v.z, vx1 = v.cx + W / 2 / v.z, vy0 = v.cy - H / 2 / v.z, vy1 = v.cy + H / 2 / v.z;
    const show = o.streets !== false && v.z > 0.035;
    if (show) {
      for (const pass of [0, 1, 2]) {
        ctx.strokeStyle = pass === 2 ? COL.art : COL.street;
        ctx.lineWidth = pass === 2 ? Math.max(2, 22 * v.z) : pass === 1 ? Math.max(1.5, 16 * v.z) : Math.max(1, 12 * v.z);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const s of streets) {
          if (s.c !== pass || s.x1 < vx0 || s.x0 > vx1 || s.y1 < vy0 || s.y0 > vy1) continue;
          const p = s.p;
          ctx.moveTo(v.sx(p[1]), v.sy(p[2]));
          for (let i = 3; i < p.length; i += 2) ctx.lineTo(v.sx(p[i]), v.sy(p[i + 1]));
        }
        ctx.stroke();
      }
      if (v.z > 0.3) {
        for (const [n, x, y, ang] of G.labels) {
          const X = v.sx(x), Y = v.sy(y);
          if (X < -50 || X > W + 50 || Y < -50 || Y > H + 50) continue;
          ctx.save();
          ctx.translate(X, Y);
          let a = -ang;
          if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
          ctx.rotate(a);
          A.text(ctx, n, 0, 5, 14, { align: 'center', color: '#6d6046', weight: 600, halo: COL.land, haloW: 4 });
          ctx.restore();
        }
      }
    }
  }
  function drawRoute(ctx, v, name, dDone, o = {}) {
    const r = T.routes[name];
    const sDone = (dDone / r.m) * r.len;
    const path = (from, to) => {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < r.pts.length; i++) {
        const c = r.cum[i];
        if (c < from && i < r.pts.length - 1 && r.cum[i + 1] < from) continue;
        if (c > to) {
          const pt = T.at(name, (to / r.len) * r.m);
          ctx.lineTo(v.sx(pt.x), v.sy(pt.y));
          break;
        }
        const X = v.sx(r.pts[i][0]), Y = v.sy(r.pts[i][1]);
        if (!started) {
          const pt = c < from ? T.at(name, (from / r.len) * r.m) : { x: r.pts[i][0], y: r.pts[i][1] };
          ctx.moveTo(v.sx(pt.x), v.sy(pt.y));
          started = true;
          if (c < from) continue;
        }
        ctx.lineTo(X, Y);
      }
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o.todo !== false) {
      ctx.setLineDash([2, 12]);
      ctx.strokeStyle = o.todoColor || COL.todo; ctx.lineWidth = o.w ? o.w * 0.6 : 5;
      path(sDone, r.len); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (sDone > 0) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = (o.w || 9) + 5; path(0, sDone); ctx.stroke();
      ctx.strokeStyle = o.color || COL.route; ctx.lineWidth = o.w || 9; path(0, sDone); ctx.stroke();
    }
  }
  function pin(ctx, v, xy, text, o = {}) {
    const X = v.sx(xy[0]), Y = v.sy(xy[1]);
    ctx.beginPath(); ctx.arc(X, Y, o.r || 9, 0, Math.PI * 2); A.shape(ctx, o.color || '#fff', 3);
    if (text) A.label(ctx, text, X + (o.dx == null ? 16 : o.dx), Y + (o.dy || 0), o.size || 18, { bg: o.bg || '#fff', align: o.align, color: o.tc });
  }
  function proposedPier(ctx, v, lbl = true) {
    const a = G.places.pierFoot, b = G.places.pierEnd;
    ctx.save();
    ctx.setLineDash([10, 7]);
    ctx.strokeStyle = '#8a2be2'; ctx.lineWidth = Math.max(4, 16 * v.z);
    ctx.beginPath(); ctx.moveTo(v.sx(a[0]), v.sy(a[1])); ctx.lineTo(v.sx(b[0]), v.sy(b[1])); ctx.stroke();
    ctx.restore();
    if (lbl) A.label(ctx, 'PROPOSED pier + terminal', v.sx(b[0]) - 12, v.sy(b[1]) + 34, 17, { bg: '#f1e6ff', align: 'right', color: '#5b1a9a' });
  }
  function compass(ctx, x = W - 70, y = H - 90) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); A.shape(ctx, 'rgba(255,255,255,0.9)', 3);
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(9, 6); ctx.lineTo(0, 0); ctx.lineTo(-9, 6); ctx.closePath(); A.shape(ctx, '#d9433b', 2);
    A.text(ctx, 'N', 0, 22, 14, { align: 'center', weight: 900 });
    ctx.restore();
  }
  function scaleBar(ctx, v, x = 40, y = H - 40) {
    const MI = 1609.344;
    let m = MI;
    const opts = [0.1, 0.25, 0.5, 1, 2, 5];
    for (const o of opts) if (o * MI * v.z < 260) m = o * MI;
    const w = m * v.z;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - 8, y - 26, w + 80, 36);
    ctx.fillStyle = INK; ctx.fillRect(x, y - 4, w, 6);
    A.text(ctx, `${+(m / MI).toFixed(2)} mi`, x + w + 10, y + 4, 16, { weight: 700 });
  }
  function credit(ctx) {
    A.text(ctx, OSM, W - 12, H - 10, 12, { align: 'right', color: 'rgba(30,30,40,0.7)', weight: 500 });
  }

  // vehicle position for an event (moving or holding)
  function vehicleAt(e, p) {
    if (e.route) {
      const d = A.lerp(e.d0, e.d1, p);
      const pt = T.at(e.route, d);
      if (e.rev) pt.ang += Math.PI;
      return Object.assign(pt, { route: e.route, d });
    }
    if (e.hold) return Object.assign(T.at(e.hold.route, e.hold.d), e.hold);
    return null;
  }
  const ZOOM = { am: 0.16, pm: 0.2, search: 0.62, home: 0.42, walk: 0.62 };
  function zoomFor(e) {
    const r = e.route || (e.hold && e.hold.route);
    return ZOOM[r] || 0.18;
  }

  S.map = (ctx, e, p, clock, st) => {
    const veh = vehicleAt(e, p);
    let z = zoomFor(e);
    const prev = T.events[e.i - 1];
    if (prev && prev.scene === 'map') z = A.lerp(zoomFor(prev), z, A.ease(A.clamp((st.local) / 0.8)));
    // look a little ahead so the car isn't dead centre
    const v = cam(veh.x + Math.cos(veh.ang) * 120 / z * 0.0, veh.y, z);
    drawBase(ctx, v);
    const rt = veh.route;
    // the whole day's context: routes already driven stay drawn
    if (rt === 'am') { drawRoute(ctx, v, 'am', veh.d); }
    if (rt === 'pm') { drawRoute(ctx, v, 'pm', veh.d); }
    if (rt === 'search') { drawRoute(ctx, v, 'pm', T.routes.pm.m, { todo: false }); drawRoute(ctx, v, 'search', veh.d, { color: '#d63384' }); }
    if (rt === 'home') { drawRoute(ctx, v, 'walk', T.routes.walk.m, { todo: false, color: '#2a9d8f', w: 6 }); drawRoute(ctx, v, 'home', veh.d); }
    proposedPier(ctx, v, v.z < 0.3);
    pin(ctx, v, G.places.home, v.z < 0.5 ? 'Home: Grizzly Peak Blvd & Senior Ave' : 'Home', { color: '#ffd166' });
    if (rt === 'pm' || rt === 'search' || rt === 'home') pin(ctx, v, G.places.gioia, 'Gioia Pizzeria', { color: '#ff7b6b', dx: -16, align: 'right' });
    if (rt === 'search' && p > 0.6 && e.to === 'end') pin(ctx, v, G.places.spot, 'Parking 1.0 mi walk from Gioia', { color: '#d63384', dy: -30 });
    if (rt === 'home' || (e.kind === 'errand' && !e.route)) pin(ctx, v, G.places.spot, 'Parked here', { color: '#d63384', dy: -30 });
    // the vehicle
    A.suvTop(ctx, v.sx(veh.x), v.sy(veh.y), veh.ang, 1.2);
    // current street
    const street = T.streetAt(veh.route, veh.d);
    if (street) A.label(ctx, street, 40, 64, 30, { bg: '#fff' });
    compass(ctx);
    scaleBar(ctx, v);
    credit(ctx);
    if (e.vig) vignette(ctx, e, p, st);
    if (e.pizza) pizzaInset(ctx, clock, st);
  };

  // ============================================================ VIGNETTES (stop sign, red light, traffic)
  function vignette(ctx, e, p, st) {
    const x = W - 600, y = 190, w = 560, h = 330;
    const pop = A.ease(A.clamp(st.local / 0.25));
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(pop, pop);
    ctx.translate(-(x + w / 2), -(y + h / 2));
    A.rr(ctx, x, y, w, h, 24); A.shape(ctx, '#fff', 5);
    ctx.save();
    A.rr(ctx, x, y, w, h, 24); ctx.clip();
    const sk = A.sky(st.clock);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, sk.top); g.addColorStop(1, sk.bot);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#5a5f6a'; ctx.fillRect(x, y + h - 90, w, 90);
    ctx.fillStyle = '#f4d35e'; for (let i = 0; i < 6; i++) ctx.fillRect(x + 20 + i * 110, y + h - 48, 60, 6);
    if (e.vig === 'stop') {
      ctx.save(); ctx.translate(x + 450, y + 110);
      ctx.fillStyle = '#777'; ctx.fillRect(-5, 20, 10, 140);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; ctx.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); }
      ctx.closePath(); A.shape(ctx, '#d62828', 5, '#fff');
      A.text(ctx, 'STOP', 0, 12, 30, { align: 'center', color: '#fff', weight: 900 });
      ctx.restore();
      A.suv(ctx, x + 230, y + h - 40, 0.75, 1, { night: sk.night, lights: sk.night });
      const n = Math.min(4, Math.floor(p * 4) + 1);
      A.text(ctx, `×${n}`, x + 540, y + 60, 36, { align: 'center', weight: 900, color: '#d62828' });
    } else if (e.vig === 'light') {
      ctx.save(); ctx.translate(x + 460, y + 30);
      ctx.fillStyle = '#555'; ctx.fillRect(-6, 150, 12, 120);
      A.rr(ctx, -34, 0, 68, 160, 12); A.shape(ctx, '#2b2b2b', 4);
      const green = p > 0.85;
      [['#d62828', !green], ['#f4a261', false], ['#2a9d8f', green]].forEach(([c, on], i) => {
        ctx.beginPath(); ctx.arc(0, 28 + i * 52, 20, 0, Math.PI * 2);
        A.shape(ctx, on ? c : '#444', 3);
        if (on) { ctx.fillStyle = c + '55'; ctx.beginPath(); ctx.arc(0, 28 + i * 52, 34, 0, Math.PI * 2); ctx.fill(); }
      });
      ctx.restore();
      A.suv(ctx, x + 230 + (p > 0.85 ? (p - 0.85) * 900 : 0), y + h - 40, 0.75, 1, { night: sk.night, lights: sk.night, puff: st.clock });
    } else if (e.vig === 'traffic') {
      const jig = Math.sin(st.local * 3) * 3;
      for (let i = -1; i < 4; i++) {
        const cx = x + 80 + i * 175 + (i === 1 ? 0 : jig);
        if (i === 1) A.suv(ctx, cx, y + h - 40, 0.55, 1, { night: sk.night, lights: sk.night });
        else {
          ctx.save(); ctx.translate(cx, y + h - 40);
          A.rr(ctx, -70, -60, 140, 46, 14); A.shape(ctx, ['#e76f51', '#457b9d', '#f4a261', '#8d99ae', '#90be6d'][i + 1], 4);
          A.rr(ctx, -40, -88, 80, 32, 10); A.shape(ctx, '#bfe3f0', 4);
          for (const wx of [-40, 40]) { ctx.beginPath(); ctx.arc(wx, -14, 16, 0, Math.PI * 2); A.shape(ctx, '#222', 3); }
          ctx.fillStyle = '#d62828'; ctx.fillRect(-74, -50, 8, 12);
          ctx.restore();
        }
      }
      A.text(ctx, 'HONK', x + 150, y + 90, 28, { weight: 900, color: '#d62828' });
      A.text(ctx, 'HONK', x + 420, y + 130, 22, { weight: 900, color: '#d62828' });
    }
    ctx.restore();
    ctx.restore();
  }

  function pizzaInset(ctx, clock, st) {
    const F = T.pizzaF(clock);
    if (F == null) return;
    A.thermo(ctx, W - 110, 640, F, C.pizza);
  }

  // ============================================================ TITLE: the whole trip on one map
  S.title = (ctx, e, p, clock) => {
    const v = cam(-1400, -500, 0.034);
    drawBase(ctx, v, { streets: false });
    // routes appear in order
    const k = A.ease(A.clamp(p * 1.6));
    const seg = (a, b) => A.clamp((k - a) / (b - a));
    drawRoute(ctx, v, 'am', T.routes.am.m * seg(0, 0.35), { todo: false, w: 7 });
    drawRoute(ctx, v, 'ferry', T.routes.ferry.m * seg(0.35, 0.75), { todo: false, w: 7, color: '#1d6fb8' });
    drawRoute(ctx, v, 'bart', T.routes.bart.m * seg(0.75, 1), { todo: false, w: 7, color: '#c0392b' });
    pin(ctx, v, G.places.home, 'Berkeley hills: Grizzly Peak & Senior', { color: '#ffd166', size: 20 });
    pin(ctx, v, G.places.pierEnd, 'Berkeley Marina: PROPOSED ferry terminal', { color: '#c9a3ff', size: 20, dy: 34 });
    pin(ctx, v, G.places.ferryBuilding, 'Ferry Building', { color: '#7fd1ff', size: 20, dx: 18, dy: -6 });
    pin(ctx, v, G.places.office, 'Office near Civic Center', { color: '#ff8c7a', size: 20, dx: -18, align: 'right' });
    A.text(ctx, 'San Francisco', v.sx(-10500), v.sy(-11500), 34, { color: '#6d6046', weight: 800, halo: COL.land });
    A.text(ctx, 'Berkeley', v.sx(5200), v.sy(6800), 34, { color: '#6d6046', weight: 800, halo: COL.land });
    A.text(ctx, 'San Francisco Bay', v.sx(-500), v.sy(-2300), 26, { color: '#2f6f96', weight: 700, align: 'center' });
    compass(ctx);
    credit(ctx);
    // title block
    ctx.save();
    A.rr(ctx, 40, 40, 700, 400, 26); A.shape(ctx, 'rgba(255,253,244,0.96)', 5);
    A.text(ctx, 'THE FERRY COMMUTE', 74, 118, 58, { weight: 900 });
    A.text(ctx, 'Berkeley hills → proposed Marina ferry →', 76, 170, 27, { weight: 600 });
    A.text(ctx, 'BART → a desk near Civic Center. And back.', 76, 206, 27, { weight: 600 });
    A.suv(ctx, 200, 412, 0.42, 1, { puff: clock + p * 4 });
    A.person(ctx, 400, 412, 0.62, { walk: false });
    A.text(ctx, 'Our commuter', 450, 340, 22, { weight: 800 });
    A.text(ctx, `and his large SUV`, 450, 370, 20, { weight: 600 });
    A.text(ctx, `(~${C.vehicle.mpg} mpg)`, 450, 396, 20, { weight: 600 });
    ctx.restore();
  };

  // ============================================================ HILLS: Grizzly Peak at Senior, looking west
  function westVista(ctx, clock, horizon, o = {}) {
    const sk = A.paintSky(ctx, clock, horizon + 10);
    const far = sk.night ? '#2b3150' : A.mix('#7d93ad', '#9fb2c6', 0.3);
    // Marin + Mt Tam (right/north-west)
    ctx.fillStyle = sk.night ? '#232842' : '#8aa08e';
    ctx.beginPath(); ctx.moveTo(W * 0.66, horizon); ctx.quadraticCurveTo(W * 0.8, horizon - 70, W * 0.88, horizon - 40); ctx.quadraticCurveTo(W * 0.95, horizon - 95, W * 1.05, horizon - 30); ctx.lineTo(W * 1.05, horizon); ctx.fill();
    // water
    ctx.fillStyle = sk.night ? '#1e3554' : '#5fa6cf';
    ctx.fillRect(0, horizon, W, H - horizon);
    // SF (south-west: left of the Golden Gate), Bay Bridge reaching toward us from the left
    A.skyline(ctx, W * (o.sfX || 0.22), horizon + 2, W * (o.sfW || 0.22), o.sfH || 90, far, sk.night);
    A.goldenGate(ctx, W * (o.ggX || 0.58), horizon + 2, o.ggS || 0.5, sk.night ? '#7a3a3a' : '#c0392b');
    A.bayBridge(ctx, W * ((o.sfX || 0.22) + (o.sfW || 0.22) * 0.9), horizon + 2, W * (o.bbX || 0.02), horizon + (o.bbDrop || 22), far);
    // Treasure Island + Yerba Buena, in front of the city
    ctx.fillStyle = sk.night ? '#273049' : '#7f9a7c';
    ctx.beginPath(); ctx.ellipse(W * ((o.sfX || 0.22) + 0.24), horizon + 4, W * 0.035, 6, 0, Math.PI, 0); ctx.fill();
    A.text(ctx, 'San Francisco', W * ((o.sfX || 0.22) + (o.sfW || 0.22) / 2), horizon - (o.sfH || 90) - 22, 22, { align: 'center', color: sk.night ? '#e9ecf5' : INK, weight: 800, halo: sk.night ? '#1d2547' : 'rgba(255,255,255,0.7)' });
    A.text(ctx, 'Golden Gate', W * (o.ggX || 0.58) + 80 * (o.ggS || 0.5), horizon - 60 * (o.ggS || 0.5) - 26, 18, { align: 'center', color: sk.night ? '#e9ecf5' : INK, weight: 700, halo: sk.night ? '#1d2547' : 'rgba(255,255,255,0.7)' });
    return sk;
  }
  function facing(ctx, txt) {
    A.label(ctx, txt, W / 2, 40, 18, { align: 'center', bg: 'rgba(255,255,255,0.92)' });
  }

  S.hills = (ctx, e, p, clock, st) => {
    const hz = 300;
    const sk = westVista(ctx, clock, hz, { sfX: 0.16, sfW: 0.24, sfH: 70, ggX: 0.6, ggS: 0.45 });
    // the East Bay flats below
    ctx.fillStyle = '#b9c79a';
    ctx.beginPath(); ctx.moveTo(0, hz + 70); ctx.quadraticCurveTo(W * 0.5, hz + 40, W, hz + 80); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    ctx.fillStyle = 'rgba(120,110,90,0.35)';
    for (let i = 0; i < 160; i++) ctx.fillRect((i * 97) % W, hz + 80 + ((i * 53) % 160), 10, 6);
    // ridge in the foreground with a winding road
    ctx.fillStyle = '#7a9a5a';
    ctx.beginPath(); ctx.moveTo(W * 0.35, H); ctx.bezierCurveTo(W * 0.55, 520, W * 0.8, 380, W, 360); ctx.lineTo(W, H); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
    const road = [[W + 40, 430], [W * 0.82, 470], [W * 0.92, 590], [W * 0.62, 640], [W * 0.5, H + 60]];
    ctx.strokeStyle = '#5a5f6a'; ctx.lineWidth = 60; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(...road[0]); ctx.bezierCurveTo(...road[1], ...road[2], ...road[3]); ctx.quadraticCurveTo(W * 0.55, 760, ...road[4]); ctx.stroke();
    for (let i = 0; i < 6; i++) A.tree(ctx, W * 0.66 + i * 70, 420 + (i % 2) * 30 - i * 6, 0.9, '#3f7a45');
    A.house(ctx, W * 0.86, 405, 0.6, '#f1e3c6', sk.night);
    // SUV down the road (path parameter)
    const q = A.ease(p);
    const bez = (t) => {
      const [a, b, c, d] = [road[0], road[1], road[2], road[3]];
      const u = 1 - t;
      return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
    };
    const t = 0.12 + q * 0.85;
    const [x, y] = bez(t);
    const [x2] = bez(Math.min(1, t + 0.01));
    const sc = 0.35 + q * 0.4;
    A.suv(ctx, x, y + 18, sc, x2 < x ? -1 : 1, { spin: st.local * 10, puff: st.local });
    // street sign
    ctx.save(); ctx.translate(250, 640);
    ctx.fillStyle = '#777'; ctx.fillRect(-5, -150, 10, 220);
    A.rr(ctx, -10, -180, 300, 46, 6); A.shape(ctx, '#1f6f43', 4, '#fff');
    A.text(ctx, 'Grizzly Peak Blvd', 140, -147, 26, { align: 'center', color: '#fff', weight: 800 });
    A.rr(ctx, -10, -128, 230, 44, 6); A.shape(ctx, '#1f6f43', 4, '#fff');
    A.text(ctx, 'Senior Ave', 105, -96, 26, { align: 'center', color: '#fff', weight: 800 });
    ctx.restore();
    facing(ctx, 'Looking west from the Berkeley hills');
  };

  // ============================================================ MARINA: the terminal lot, looking west
  S.marina = (ctx, e, p, clock, st) => {
    const hz = 330;
    const sk = westVista(ctx, clock, hz, { sfX: 0.04, sfW: 0.3, sfH: 95, ggX: 0.6, ggS: 0.55, bbX: -0.05 });
    // proposed pier: out from the lot toward the WSW, drawn as a ghost
    const foot = [W * 0.62, 640], end = [W * 0.38, hz + 30];
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(foot[0] - 70, foot[1]); ctx.lineTo(end[0] - 12, end[1]); ctx.lineTo(end[0] + 12, end[1]); ctx.lineTo(foot[0] + 70, foot[1]); ctx.closePath();
    ctx.fillStyle = 'rgba(214,190,255,0.55)'; ctx.fill();
    ctx.setLineDash([12, 8]); ctx.strokeStyle = '#6a1fb5'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
    // float + ferry at the end
    const docked = e.act === 'walkPier' || e.act === 'arrive' || e.act === 'walkBack';
    const ferryIn = e.act === 'arrive' ? A.ease(A.clamp(p * 1.5)) : 1;
    if (docked) {
      ctx.save(); ctx.translate(end[0] - 120 + (1 - ferryIn) * -260, end[1] + 6);
      ctx.scale(0.45, 0.45); ferryShape(ctx, sk.night); ctx.restore();
    }
    A.label(ctx, 'PROPOSED pier + terminal', W * 0.5, hz + 100, 20, { align: 'center', bg: '#f1e6ff', color: '#5b1a9a' });
    // lot
    ctx.fillStyle = sk.night ? '#3b3f4a' : '#6c717c';
    ctx.beginPath(); ctx.moveTo(0, 600); ctx.lineTo(W, 620); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 6;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(60 + i * 190, 700); ctx.lineTo(20 + i * 190, 880); ctx.stroke(); }
    // pay station
    ctx.save(); ctx.translate(1410, 760);
    A.rr(ctx, -50, -170, 100, 170, 10); A.shape(ctx, '#2d6a4f', 4);
    A.rr(ctx, -38, -150, 76, 46, 6); A.shape(ctx, '#d8f3dc', 3);
    A.text(ctx, `$${C.parkingFee}`, 0, -116, 30, { align: 'center', weight: 900 });
    A.text(ctx, 'PAY HERE', 0, -80, 14, { align: 'center', color: '#fff', weight: 900 });
    ctx.restore();
    // action
    const slot = 520;
    if (e.act === 'park') {
      const k = A.ease(A.clamp(p / 0.55));
      A.suv(ctx, A.lerp(W + 220, slot, k), 820, 0.7, -1, { spin: k * 20, night: sk.night, lights: sk.night });
      if (p > 0.6) {
        const w = A.ease(A.win(p, 0.6, 0.85));
        A.person(ctx, A.lerp(slot + 160, 1330, w), 860, 0.85, { walk: w < 1, phase: st.local * 1.6, facing: 1 });
        if (p > 0.85) A.label(ctx, `PAID $${C.parkingFee}`, 1410, 560, 26, { align: 'center', bg: '#ffd166' });
      }
    } else {
      const parked = e.act !== 'leave';
      A.suv(ctx, parked ? slot : A.lerp(slot, W + 300, A.ease(p)), 820, 0.7, parked ? -1 : 1, { night: sk.night, lights: sk.night && !parked, driver: !parked, puff: parked ? 0 : st.local });
      if (e.act === 'walkPier') {
        const k = p;
        const x = A.lerp(foot[0], end[0], k), y = A.lerp(foot[1], end[1] + 40, k);
        A.person(ctx, x, y, A.lerp(0.8, 0.2, k), { walk: true, phase: st.local * 1.6, facing: -1 });
      }
      if (e.act === 'walkBack') {
        const k = p;
        const x = A.lerp(end[0], foot[0] - 80, k), y = A.lerp(end[1] + 40, foot[1] + 180, k);
        A.person(ctx, x, y, A.lerp(0.2, 0.85, k), { walk: true, phase: st.local * 1.6, facing: 1, mood: 'flat' });
      }
    }
    facing(ctx, 'Berkeley Marina, looking west across the Bay');
  };

  function ferryShape(ctx, night) {
    // a generic high-speed catamaran ferry, facing left
    ctx.beginPath(); ctx.moveTo(-250, 0); ctx.lineTo(250, 0); ctx.lineTo(230, 50); ctx.lineTo(-210, 50); ctx.closePath(); A.shape(ctx, '#f4f4f4', 6);
    ctx.fillStyle = '#1d6fb8'; ctx.fillRect(-235, 30, 455, 12);
    ctx.beginPath(); ctx.moveTo(-200, 0); ctx.lineTo(-150, -70); ctx.lineTo(190, -70); ctx.lineTo(210, 0); ctx.closePath(); A.shape(ctx, '#ffffff', 6);
    ctx.beginPath(); ctx.moveTo(-120, -70); ctx.lineTo(-90, -120); ctx.lineTo(120, -120); ctx.lineTo(140, -70); ctx.closePath(); A.shape(ctx, '#ffffff', 6);
    ctx.fillStyle = night ? '#f6d67a' : '#2a3f5f';
    for (let i = 0; i < 9; i++) ctx.fillRect(-140 + i * 36, -56, 24, 24);
    for (let i = 0; i < 5; i++) ctx.fillRect(-70 + i * 40, -108, 26, 22);
  }

  // ============================================================ WAIT
  S.wait = (ctx, e, p, clock, st) => {
    const hz = 360;
    const sk = e.eve ? A.paintSky(ctx, clock, hz + 10) : westVista(ctx, clock, hz, { sfX: 0.05, sfW: 0.28, sfH: 90, ggX: 0.62, ggS: 0.5 });
    if (e.eve) {
      // SF side: the Ferry Building behind, Berkeley hills far across the water
      ctx.fillStyle = '#1e3554'; ctx.fillRect(0, hz, W, H - hz);
      ctx.fillStyle = '#262c48';
      ctx.beginPath(); ctx.moveTo(W * 0.3, hz); ctx.quadraticCurveTo(W * 0.6, hz - 50, W * 0.95, hz - 30); ctx.lineTo(W, hz); ctx.fill();
      A.text(ctx, 'Berkeley hills, across the Bay', W * 0.66, hz - 70, 18, { align: 'center', color: '#e9ecf5' });
      ferryBuildingShape(ctx, 230, hz + 230, 0.9, true);
    }
    // float deck + bench
    ctx.fillStyle = e.eve ? '#4a4f5c' : '#9b8b74';
    ctx.fillRect(0, 640, W, 260);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (let i = 0; i < 16; i++) ctx.fillRect(i * 110, 640, 4, 260);
    A.rr(ctx, 520, 700, 420, 26, 6); A.shape(ctx, '#7a4b2a', 4);
    ctx.fillStyle = INK; ctx.fillRect(550, 726, 12, 70); ctx.fillRect(900, 726, 12, 70);
    A.person(ctx, 700, 790, 1.1, { sit: true, phone: Math.floor(st.local / 1.2) % 2 === 0, mood: p > 0.5 ? 'flat' : 'smile', facing: 1 });
    // big countdown
    const left = e.dur * (1 - p);
    const mm = Math.floor(left), ss = Math.floor((left - mm) * 60);
    ctx.save();
    A.rr(ctx, 1040, 470, 420, 260, 24); A.shape(ctx, 'rgba(255,255,255,0.95)', 5);
    ctx.beginPath(); ctx.arc(1150, 600, 70, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); ctx.lineTo(1150, 600); ctx.closePath(); ctx.fillStyle = '#ffd166'; ctx.fill();
    ctx.beginPath(); ctx.arc(1150, 600, 70, 0, Math.PI * 2); A.shape(ctx, null, 5);
    A.text(ctx, `${mm}:${String(ss).padStart(2, '0')}`, 1330, 600, 56, { align: 'center', weight: 900 });
    A.text(ctx, `of ${e.dur}:00 wait`, 1330, 650, 24, { align: 'center', weight: 600 });
    ctx.restore();
    facing(ctx, e.eve ? 'Ferry Building, San Francisco' : 'End of the proposed pier, looking west');
    if (!e.eve) proposedTag(ctx);
  };
  function proposedTag(ctx) {
    A.label(ctx, 'PROPOSED', 40, H - 40, 18, { bg: '#f1e6ff', color: '#5b1a9a' });
  }

  function ferryBuildingShape(ctx, x, base, s, night) {
    ctx.save(); ctx.translate(x, base); ctx.scale(s, s);
    ctx.beginPath(); ctx.rect(-260, -120, 520, 120); A.shape(ctx, '#e9dcc0', 5);
    ctx.fillStyle = night ? '#f6d67a' : '#8a7f6a';
    for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(-230 + i * 42, -70, 14, Math.PI, 0); ctx.lineTo(-216 + i * 42, -40); ctx.lineTo(-244 + i * 42, -40); ctx.fill(); }
    ctx.beginPath(); ctx.rect(-40, -330, 80, 210); A.shape(ctx, '#e9dcc0', 5);
    ctx.beginPath(); ctx.moveTo(-46, -330); ctx.lineTo(0, -400); ctx.lineTo(46, -330); ctx.closePath(); A.shape(ctx, '#cfc2a6', 5);
    ctx.beginPath(); ctx.arc(0, -280, 26, 0, Math.PI * 2); A.shape(ctx, '#fff', 4);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -280); ctx.lineTo(0, -298); ctx.moveTo(0, -280); ctx.lineTo(12, -280); ctx.stroke();
    A.text(ctx, 'FERRY BUILDING', 0, -134, 26, { align: 'center', weight: 900 });
    ctx.restore();
  }

  // ============================================================ BOARDING
  S.board = (ctx, e, p, clock, st) => {
    const hz = 360;
    const sk = A.paintSky(ctx, clock, hz + 10);
    ctx.fillStyle = sk.night ? '#1e3554' : '#5fa6cf'; ctx.fillRect(0, hz, W, H - hz);
    if (e.eve) ferryBuildingShape(ctx, 1250, hz + 180, 0.7, sk.night);
    else { A.skyline(ctx, W * 0.05, hz + 2, W * 0.25, 80, '#8aa0b8', sk.night); }
    const away = A.ease(A.win(p, 0.6, 1));
    ctx.save(); ctx.translate(820 - away * 900, 560 + Math.sin(st.local * 2) * 4); ferryShape(ctx, sk.night); ctx.restore();
    ctx.fillStyle = e.eve ? '#4a4f5c' : '#9b8b74'; ctx.fillRect(1080, 600, W - 1080, 300);
    // gangway + person
    if (p < 0.6) {
      ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(1080, 610); ctx.lineTo(1000, 560); ctx.stroke();
      const k = A.ease(A.win(p, 0, 0.5));
      A.person(ctx, A.lerp(1260, 1000, k), A.lerp(800, 560, k), A.lerp(1, 0.6, k), { walk: k < 1, phase: st.local * 1.6, facing: -1 });
    }
    if (p > 0.6) A.label(ctx, 'Departed', 400, 300, 28, { bg: '#fff' });
    facing(ctx, e.eve ? 'Boarding at the Ferry Building' : 'Boarding at the PROPOSED Berkeley terminal');
  };

  // ============================================================ CROSSING: the Bay map with the ferry
  S.crossing = (ctx, e, p, clock, st) => {
    const v = cam(-2300, -1300, 0.068);
    drawBase(ctx, v, { streets: false });
    // the Bay Bridge (approximate line) for orientation
    const bb = [[-122.3880, 37.7880], [-122.3650, 37.8080], [-122.3250, 37.8220], [-122.3000, 37.8250]];
    ctx.strokeStyle = '#7b8794'; ctx.lineWidth = 5; ctx.beginPath();
    bb.forEach(([lon, lat], i) => { const x = (lon - G.origin[0]) * G.mPerDegLon, y = (lat - G.origin[1]) * G.mPerDegLat; i ? ctx.lineTo(v.sx(x), v.sy(y)) : ctx.moveTo(v.sx(x), v.sy(y)); });
    ctx.stroke();
    const q = A.clamp(p);
    const d = e.rev ? T.routes.ferry.m * (1 - q) : T.routes.ferry.m * q;
    // wake: the travelled part
    if (e.rev) {
      drawRoute(ctx, v, 'ferry', T.routes.ferry.m, { todo: false, w: 6, color: '#1d6fb8' });
    } else {
      drawRoute(ctx, v, 'ferry', d, { w: 8, color: '#1d6fb8' });
    }
    proposedPier(ctx, v, false);
    pin(ctx, v, G.places.pierEnd, 'Berkeley: PROPOSED terminal', { color: '#c9a3ff', size: 20, dy: 30 });
    pin(ctx, v, G.places.ferryBuilding, 'Ferry Building', { color: '#7fd1ff', size: 20, dx: -18, align: 'right' });
    const lab = (lon, lat, s, size = 20, col = '#6d6046') => A.text(ctx, s, v.sx((lon - G.origin[0]) * G.mPerDegLon), v.sy((lat - G.origin[1]) * G.mPerDegLat), size, { align: 'center', color: col, weight: 800, halo: COL.land, haloW: 5 });
    lab(-122.372, 37.826, 'Treasure Island', 17);
    lab(-122.425, 37.775, 'San Francisco', 30);
    lab(-122.29, 37.855, 'Berkeley', 30);
    lab(-122.29, 37.82, 'Oakland', 24);
    lab(-122.345, 37.812, 'Bay Bridge', 16, '#4b5563');
    const pt = T.at('ferry', d);
    const ang = pt.ang + (e.rev ? Math.PI : 0);
    // the boat marker
    ctx.save(); ctx.translate(v.sx(pt.x), v.sy(pt.y)); ctx.rotate(-ang);
    ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-18, -12); ctx.lineTo(-18, 12); ctx.closePath(); A.shape(ctx, '#fff', 4);
    ctx.restore();
    A.label(ctx, `${(T.routes.ferry.len / 1609.344).toFixed(1)} mi by water · ${C.sailMin} min underway`, 40, 60, 24, { bg: '#fff' });
    compass(ctx);
    credit(ctx);
    // side-view inset: the boat, with what's ahead
    const x = W - 560, y = H - 330, w = 520, h = 270;
    A.rr(ctx, x, y, w, h, 20); A.shape(ctx, '#fff', 5);
    ctx.save(); A.rr(ctx, x, y, w, h, 20); ctx.clip();
    const sk = A.sky(clock);
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, sk.top); g.addColorStop(1, sk.bot);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    const hz = y + 150;
    ctx.fillStyle = sk.night ? '#1e3554' : '#5fa6cf'; ctx.fillRect(x, hz, w, h);
    const grow = A.lerp(0.4, 1.4, q);
    if (!e.rev) A.skyline(ctx, x + 20, hz + 2, 200 * grow, 60 * grow, sk.night ? '#3a4466' : '#8aa0b8', sk.night);
    else {
      ctx.fillStyle = sk.night ? '#262c48' : '#8aa08e';
      ctx.beginPath(); ctx.moveTo(x, hz); ctx.quadraticCurveTo(x + 150, hz - 40 * grow, x + 320, hz - 25 * grow); ctx.lineTo(x + 320, hz); ctx.fill();
      if (sk.night) { ctx.fillStyle = '#f6d67a'; for (let i = 0; i < 30; i++) ctx.fillRect(x + (i * 37) % 300, hz - 5 - (i * 13) % (20 * grow), 3, 3); }
    }
    ctx.save(); ctx.translate(x + 380, hz + 30 + Math.sin(st.local * 3) * 4); ctx.scale(0.42, 0.42); ferryShape(ctx, sk.night); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) { const k = (st.local * 0.8 + i / 4) % 1; ctx.beginPath(); ctx.moveTo(x + 490 + k * 60, hz + 46); ctx.lineTo(x + 520 + k * 80, hz + 52); ctx.stroke(); }
    ctx.restore();
    A.text(ctx, e.rev ? 'Ahead: Berkeley' : 'Ahead: San Francisco', x + 20, y + 36, 22, { weight: 800, halo: '#fff' });
  };

  // ============================================================ FERRY BUILDING + walk to BART
  S.ferrybldg = (ctx, e, p, clock, st) => {
    const sk = A.paintSky(ctx, clock, 620);
    ferryBuildingShape(ctx, 520, 620, 1.1, sk.night);
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 620, W, 280);
    ctx.fillStyle = '#c9c9c9'; ctx.fillRect(0, 620, W, 50);
    // BART entrance
    ctx.save(); ctx.translate(1330, 660);
    ctx.fillStyle = '#555'; ctx.fillRect(-6, -200, 12, 200);
    A.rr(ctx, -70, -250, 140, 60, 10); A.shape(ctx, '#0b4f8a', 4, '#fff');
    A.text(ctx, 'BART', 0, -208, 34, { align: 'center', color: '#fff', weight: 900 });
    A.text(ctx, 'Embarcadero', 0, -170, 18, { align: 'center', weight: 800, halo: '#fff' });
    ctx.restore();
    if (e.act === 'dock') {
      A.person(ctx, A.lerp(380, 620, A.ease(p)), 820, 1.0, { walk: true, phase: st.local * 1.6, facing: 1 });
    } else {
      const k = A.ease(p);
      const x = e.rev ? A.lerp(1330, 560, k) : A.lerp(620, 1330, k);
      A.person(ctx, x, 820, 1.0, { walk: true, phase: st.local * 1.6, facing: e.rev ? -1 : 1, mood: e.rev ? 'flat' : 'smile' });
    }
    facing(ctx, 'The Embarcadero, San Francisco');
  };

  // ============================================================ BART
  const STN = ['Embarcadero', 'Montgomery', 'Powell', 'Civic Center'];
  S.bart = (ctx, e, p, clock, st) => {
    ctx.fillStyle = '#2b2f3a'; ctx.fillRect(0, 0, W, H);
    // tunnel wall + platform
    ctx.fillStyle = '#d9d2c3'; ctx.fillRect(0, 120, W, 420);
    ctx.fillStyle = '#b8ad97'; for (let i = 0; i < 20; i++) ctx.fillRect(i * 90, 120, 4, 420);
    ctx.fillStyle = '#8e8e8e'; ctx.fillRect(0, 660, W, 240);
    ctx.fillStyle = '#f4d35e'; ctx.fillRect(0, 660, W, 14);
    const evening = T.events.indexOf(e) > T.events.findIndex((x) => x.kind === 'work');
    const from = evening ? 'Civic Center' : 'Embarcadero';
    const to = evening ? 'Embarcadero' : 'Civic Center';
    let stationName = from;
    if (e.act === 'exit') stationName = to;
    // station strip
    A.rr(ctx, 200, 30, 1200, 70, 16); A.shape(ctx, '#fff', 4);
    const order = evening ? STN.slice().reverse() : STN;
    ctx.strokeStyle = '#0b4f8a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(300, 65); ctx.lineTo(1300, 65); ctx.stroke();
    order.forEach((n, i) => {
      const x = 300 + i * (1000 / 3);
      ctx.beginPath(); ctx.arc(x, 65, 12, 0, Math.PI * 2); A.shape(ctx, '#fff', 4);
      A.text(ctx, n, x, 95, 15, { align: 'center', weight: 800 });
    });
    let k = 0;
    if (e.act === 'ride') k = p; else if (e.act === 'exit') k = 1;
    ctx.beginPath(); ctx.arc(300 + 1000 * k, 65, 16, 0, Math.PI * 2); A.shape(ctx, '#e8562a', 4);
    if (e.act === 'ride') {
      // inside the car: windows streaking
      ctx.fillStyle = '#c8ccd2'; ctx.fillRect(0, 120, W, 780);
      for (let i = 0; i < 4; i++) {
        A.rr(ctx, 80 + i * 390, 200, 300, 200, 20); A.shape(ctx, '#151922', 5);
        ctx.strokeStyle = 'rgba(255,240,180,0.6)'; ctx.lineWidth = 4;
        for (let j = 0; j < 3; j++) { const xx = 80 + i * 390 + ((st.local * 900 + j * 120) % 300); ctx.beginPath(); ctx.moveTo(xx, 240 + j * 50); ctx.lineTo(xx - 60, 240 + j * 50); ctx.stroke(); }
      }
      ctx.fillStyle = '#6b7fa8'; ctx.fillRect(0, 520, W, 100);
      ctx.strokeStyle = '#888'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(W, 150); ctx.stroke();
      A.person(ctx, 800 + Math.sin(st.local * 5) * 4, 760, 1.2, { phone: true, mood: 'flat' });
      A.label(ctx, `Next: ${order[Math.min(3, Math.floor(p * 3) + 1)]}`, W / 2, 470, 26, { align: 'center', bg: '#0b4f8a', color: '#fff', lw: 0 });
      return;
    }
    // station name sign
    A.rr(ctx, 520, 190, 560, 90, 10); A.shape(ctx, '#0b4f8a', 0);
    A.text(ctx, stationName.toUpperCase(), 800, 252, 46, { align: 'center', color: '#fff', weight: 900 });
    if (e.act === 'gates' || e.act === 'exit') {
      for (let i = 0; i < 4; i++) { A.rr(ctx, 450 + i * 190, 560, 70, 110, 8); A.shape(ctx, '#b0b6bf', 4); }
      const kk = A.ease(p);
      A.person(ctx, A.lerp(300, 1300, kk), 800, 1.1, { walk: true, phase: st.local * 1.6, facing: 1 });
      A.text(ctx, e.act === 'gates' ? 'Fare gates' : 'Escalator up', 800, 520, 28, { align: 'center', weight: 800 });
    } else {
      // platform wait; train slides in near the end
      A.person(ctx, 800, 820, 1.1, { phone: true, mood: 'flat' });
      const tin = A.ease(A.win(p, 0.7, 1));
      ctx.save(); ctx.translate(A.lerp(-1800, 0, tin), 0);
      A.rr(ctx, 0, 320, 1700, 330, 30); A.shape(ctx, '#d6dbe0', 5);
      ctx.fillStyle = '#0b4f8a'; ctx.fillRect(0, 560, 1700, 26);
      for (let i = 0; i < 8; i++) { A.rr(ctx, 60 + i * 200, 370, 140, 120, 12); A.shape(ctx, '#2b3445', 4); }
      ctx.restore();
    }
  };

  // ============================================================ OFFICE near Civic Center
  S.office = (ctx, e, p, clock, st) => {
    const sk = A.paintSky(ctx, clock, 660);
    // a generic domed civic building far behind
    ctx.fillStyle = sk.night ? '#333a5a' : '#c9ccd6';
    ctx.beginPath(); ctx.rect(150, 420, 520, 240); ctx.fill();
    ctx.beginPath(); ctx.arc(410, 420, 110, Math.PI, 0); ctx.fill();
    ctx.fillRect(400, 270, 20, 50);
    // the office building
    ctx.beginPath(); ctx.rect(860, 150, 560, 510); A.shape(ctx, '#d8cbb3', 5);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 6; c++) { ctx.beginPath(); ctx.rect(890 + c * 88, 180 + r * 62, 60, 40); A.shape(ctx, sk.night ? ((r + c) % 3 ? '#f6d67a' : '#3a4060') : '#9fc6dc', 3); }
    ctx.beginPath(); ctx.rect(1080, 560, 120, 100); A.shape(ctx, '#5e4b3c', 4);
    A.text(ctx, 'OFFICE', 1140, 548, 22, { align: 'center', weight: 900 });
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 660, W, 240);
    const card = e.kind === 'card';
    if (card) {
      A.person(ctx, 1140, 800, 1.1, { mood: 'flat' });
    } else {
      const k = A.ease(p);
      const x = e.rev ? A.lerp(1140, 200, k) : A.lerp(200, 1140, k);
      A.person(ctx, x, 800, 1.1, { walk: true, phase: st.local * 1.6, facing: e.rev ? -1 : 1, mood: e.rev ? 'flat' : 'smile' });
    }
    facing(ctx, 'Near Civic Center, San Francisco');
  };

  // ============================================================ LATER THAT DAY
  S.later = (ctx, e, p, clock) => {
    A.paintSky(ctx, clock, H);
    // the sun arcs across and sets
    const k = p;
    const sx = A.lerp(200, W - 200, k), sy = 600 - Math.sin(k * Math.PI) * 420;
    ctx.beginPath(); ctx.arc(sx, sy, 50, 0, Math.PI * 2); ctx.fillStyle = A.mix('#fff4b0', '#ff8a4c', k); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 640, W, 260);
    A.text(ctx, 'Later that day…', W / 2, 470, 96, { align: 'center', color: '#fff', weight: 900, halo: 'rgba(0,0,0,0.35)', haloW: 12 });
    A.text(ctx, 'He leaves the office at ' + C.officeLeaves, W / 2, 545, 34, { align: 'center', color: '#fff', weight: 700, halo: 'rgba(0,0,0,0.35)', haloW: 8 });
  };

  // ============================================================ HOPKINS: cycle tracks, no curb space
  S.hopkins = (ctx, e, p, clock, st) => {
    const sk = A.paintSky(ctx, clock, 300);
    // storefronts along the south side of Hopkins
    const shops = [['', '#e9c46a'], ['', '#a8dadc'], ['GIOIA PIZZERIA', '#e76f51'], ['', '#b5c99a'], ['', '#f1faee'], ['', '#cdb4db']];
    shops.forEach(([n, c], i) => {
      const x = i * 270 - 20;
      ctx.beginPath(); ctx.rect(x, 110, 260, 190); A.shape(ctx, c, 4);
      ctx.beginPath(); ctx.rect(x + 30, 190, 120, 110); A.shape(ctx, sk.night ? '#f6d67a' : '#bfe3f0', 3);
      if (n) { A.rr(ctx, x + 10, 120, 240, 50, 8); A.shape(ctx, '#fff', 4); A.text(ctx, n, x + 130, 154, 24, { align: 'center', color: '#b23a2a', weight: 900 }); }
    });
    // sidewalk, cycle track, travel lanes, cycle track, sidewalk
    const rows = [[300, 60, '#cfcfcf'], [360, 80, '#3d9b5b'], [440, 60, '#bdbdbd'], [500, 200, '#5a5f6a'], [700, 60, '#bdbdbd'], [760, 80, '#3d9b5b'], [840, 60, '#cfcfcf']];
    for (const [y, h, c] of rows) { ctx.fillStyle = c; ctx.fillRect(0, y, W, h); }
    ctx.fillStyle = '#f4d35e'; for (let i = 0; i < 12; i++) ctx.fillRect(20 + i * 140, 596, 80, 8);
    // flex posts on the buffers
    for (const y of [470, 730]) for (let i = 0; i < 18; i++) { const x = 30 + i * 92; ctx.beginPath(); ctx.rect(x - 5, y - 26, 10, 36); A.shape(ctx, '#fff', 2); ctx.fillStyle = '#e63946'; ctx.fillRect(x - 5, y - 18, 10, 5); }
    // bike stencils + cyclists
    for (const y of [400, 800]) for (let i = 0; i < 4; i++) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; const x = 160 + i * 400; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.arc(x + 46, y, 14, 0, Math.PI * 2); ctx.stroke(); }
    const cyc = (x, y) => { ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.moveTo(x + 66, y); ctx.arc(x + 50, y, 16, 0, Math.PI * 2); ctx.moveTo(x, y); ctx.lineTo(x + 25, y - 26); ctx.lineTo(x + 50, y); ctx.stroke(); ctx.beginPath(); ctx.arc(x + 25, y - 52, 12, 0, Math.PI * 2); A.shape(ctx, '#f4a261', 3); };
    cyc(((st.local * 180) % (W + 200)) - 100, 405);
    cyc(W - ((st.local * 150 + 600) % (W + 200)), 805);
    // labels
    A.label(ctx, 'Class IV cycle track', 1200, 340, 20, { bg: '#d8f3dc' });
    A.label(ctx, 'NO CURB PARKING', 1180, 880, 20, { bg: '#ffe5e5', color: '#9b1c1c' });
    A.label(ctx, 'Hopkins St', 40, 560, 34, { bg: '#fff' });
    // the SUV: slows at Gioia, looks, carries on
    const xs = [-300, 700, 760, W + 300];
    let x;
    if (p < 0.35) x = A.lerp(xs[0], xs[1], A.ease(p / 0.35));
    else if (p < 0.65) x = A.lerp(xs[1], xs[2], (p - 0.35) / 0.3);
    else x = A.lerp(xs[2], xs[3], A.ease((p - 0.65) / 0.35));
    A.suv(ctx, x, 640, 0.62, 1, { spin: st.local * 8, night: sk.night, lights: sk.night, puff: st.local });
    if (p > 0.3 && p < 0.7) {
      // thought bubble: pizza, but no space
      const bx = x + 40, by = 380;
      ctx.beginPath(); ctx.ellipse(bx, by - 120, 120, 70, 0, 0, Math.PI * 2); A.shape(ctx, '#fff', 4);
      ctx.beginPath(); ctx.arc(bx - 30, by - 40, 12, 0, Math.PI * 2); A.shape(ctx, '#fff', 3);
      ctx.beginPath(); ctx.arc(bx - 20, by - 120, 40, 0, Math.PI * 2); A.shape(ctx, '#f4c56a', 4);
      ctx.fillStyle = '#c0392b'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(bx - 20 + Math.cos(i * 1.3) * 22, by - 120 + Math.sin(i * 1.3) * 22, 6, 0, Math.PI * 2); ctx.fill(); }
      A.text(ctx, 'P?', bx + 60, by - 105, 44, { align: 'center', weight: 900, color: '#1d6fb8' });
      ctx.strokeStyle = '#d62828'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(bx + 30, by - 150); ctx.lineTo(bx + 90, by - 90); ctx.stroke();
    }
    // inset map: the search loop on the real blocks
    const ix = W - 470, iy = 20, iw = 450, ih = 300;
    ctx.save(); A.rr(ctx, ix, iy, iw, ih, 16); ctx.clip();
    const pt = T.at('search', A.lerp(e.d0, e.d1, p));
    ctx.translate(ix + iw / 2 - W / 2, iy + ih / 2 - H / 2);
    const v = cam(G.places.hopkinsMcgee[0] - 100, G.places.hopkinsMcgee[1] + 50, 0.55);
    ctx.save(); ctx.beginPath(); ctx.rect(W / 2 - iw / 2, H / 2 - ih / 2, iw, ih); ctx.clip();
    drawBase(ctx, v);
    drawRoute(ctx, v, 'search', A.lerp(e.d0, e.d1, p), { color: '#d63384', todo: false, w: 7 });
    pin(ctx, v, G.places.gioia, 'Gioia', { color: '#ff7b6b', size: 15 });
    A.suvTop(ctx, v.sx(pt.x), v.sy(pt.y), pt.ang, 0.8);
    ctx.restore();
    ctx.restore();
    A.rr(ctx, ix, iy, iw, ih, 16); A.shape(ctx, null, 5);
    A.text(ctx, 'Circling: ' + (T.streetAt('search', A.lerp(e.d0, e.d1, p)) || ''), ix + 14, iy + ih - 14, 18, { weight: 800, halo: '#fff' });
  };

  // ============================================================ PIZZA at the counter
  S.pizza = (ctx, e, p, clock, st) => {
    ctx.fillStyle = '#f6e7c8'; ctx.fillRect(0, 0, W, H);
    // oven
    ctx.beginPath(); ctx.arc(420, 420, 220, Math.PI, 0); ctx.lineTo(640, 520); ctx.lineTo(200, 520); ctx.closePath(); A.shape(ctx, '#b5651d', 5);
    ctx.beginPath(); ctx.arc(420, 470, 90, Math.PI, 0); ctx.closePath(); A.shape(ctx, '#2b1a10', 4);
    ctx.fillStyle = '#ff9f1c'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(370 + i * 25, 460 - Math.abs(Math.sin(st.local * 6 + i)) * 20, 10, 0, Math.PI * 2); ctx.fill(); }
    // counter
    ctx.beginPath(); ctx.rect(0, 620, W, 280); A.shape(ctx, '#8d5a44', 5);
    A.rr(ctx, 860, 120, 520, 80, 12); A.shape(ctx, '#fff', 4);
    A.text(ctx, 'GIOIA PIZZERIA · Hopkins St', 1120, 172, 30, { align: 'center', color: '#b23a2a', weight: 900 });
    // the box, handed over at the end
    const k = A.ease(A.win(p, 0.4, 0.9));
    const bx = A.lerp(700, 960, k);
    A.rr(ctx, bx - 120, 590, 240, 34, 6); A.shape(ctx, '#e8d3a9', 4);
    const F = Math.max(C.pizza.hotF, T.pizzaF(clock) || C.pizza.hotF);
    A.steam(ctx, bx, 580, 1, st.local);
    A.person(ctx, 1150, 900, 1.6, { mood: 'smile', facing: -1 });
    A.thermo(ctx, W - 110, 520, F, C.pizza);
    A.label(ctx, 'Steaming hot', bx, 520, 26, { align: 'center', bg: '#ffd166' });
  };

  // ============================================================ WALK (the mile each way)
  S.walk = (ctx, e, p, clock, st) => {
    const sk = A.paintSky(ctx, clock, 640);
    const d = A.lerp(e.d0, e.d1, p);
    const scroll = (e.rev ? -1 : 1) * st.local * 260;
    // houses + trees scroll past
    for (let i = -1; i < 9; i++) {
      const x = ((i * 220 - scroll) % (W + 220) + W + 220) % (W + 220) - 220;
      if (i % 3 === 0) A.tree(ctx, x + 100, 640, 1.4);
      else A.house(ctx, x, 640, 1.1, ['#f1e3c6', '#cfe3d4', '#f2d0c4'][i % 3 < 0 ? 0 : i % 3], sk.night);
    }
    ctx.fillStyle = '#cfcfcf'; ctx.fillRect(0, 640, W, 90);
    ctx.fillStyle = '#5a5f6a'; ctx.fillRect(0, 730, W, 170);
    // streetlights at night
    if (sk.night) for (let i = 0; i < 4; i++) { const x = ((i * 420 - scroll * 1.0) % (W + 420) + W + 420) % (W + 420) - 200; ctx.fillStyle = '#444'; ctx.fillRect(x, 400, 8, 240); ctx.fillStyle = 'rgba(255,230,150,0.25)'; ctx.beginPath(); ctx.moveTo(x + 4, 400); ctx.lineTo(x - 90, 640); ctx.lineTo(x + 100, 640); ctx.closePath(); ctx.fill(); }
    const F = e.pizza ? T.pizzaF(clock) : null;
    A.person(ctx, 760, 760, 1.4, { walk: true, phase: st.local * 1.6, facing: e.rev ? 1 : -1, pizza: !!e.pizza, mood: e.pizza ? (p > 0.5 ? 'sad' : 'flat') : 'flat' });
    if (F != null) {
      const amt = A.clamp((F - C.pizza.coldBelowF) / (C.pizza.hotF - C.pizza.coldBelowF));
      A.steam(ctx, 760 + (e.rev ? 70 : -70), 560, amt, st.local);
      A.thermo(ctx, W - 110, 330, F, C.pizza);
    }
    // where we are on the real street
    const street = T.streetAt('walk', d);
    ctx.save(); ctx.translate(260, 640);
    ctx.fillStyle = '#777'; ctx.fillRect(-5, -180, 10, 180);
    A.rr(ctx, -110, -220, 220, 48, 6); A.shape(ctx, '#1f6f43', 4, '#fff');
    A.text(ctx, street || 'Rose St', 0, -186, 26, { align: 'center', color: '#fff', weight: 800 });
    ctx.restore();
    // the mile meter
    const done = Math.abs(d - e.d0) / 1609.344;
    A.rr(ctx, 40, 40, 560, 110, 18); A.shape(ctx, 'rgba(255,255,255,0.95)', 4);
    A.text(ctx, `${done.toFixed(2)} of ${(e.dist / 1609.344).toFixed(2)} mi on foot`, 64, 92, 32, { weight: 900 });
    ctx.fillStyle = '#eee'; ctx.fillRect(64, 112, 500, 16);
    ctx.fillStyle = '#2a9d8f'; ctx.fillRect(64, 112, 500 * (done / (e.dist / 1609.344)), 16);
    facing(ctx, e.rev ? 'Back up to the SUV' : 'Down to Gioia');
  };

  // ============================================================ HOME
  S.home = (ctx, e, p, clock, st) => {
    const hz = 380;
    westVista(ctx, clock, hz, { sfX: 0.12, sfW: 0.24, sfH: 70, ggX: 0.6, ggS: 0.45 });
    ctx.fillStyle = '#1b2a1e';
    ctx.beginPath(); ctx.moveTo(0, 520); ctx.quadraticCurveTo(W * 0.5, 470, W, 500); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    A.house(ctx, 1000, 760, 2.2, '#e9dcc0', true);
    A.suv(ctx, 520, 820, 0.75, 1, { night: true, driver: false });
    A.person(ctx, 900, 840, 1.25, { pizza: true, mood: 'sad', facing: -1 });
    const F = T.pizzaF(clock);
    A.thermo(ctx, W - 110, 330, F, C.pizza);
    A.label(ctx, 'Cold pizza', 900, 560, 30, { align: 'center', bg: '#cfe8ff' });
    facing(ctx, 'Home, Grizzly Peak Blvd at Senior Ave');
  };

  // ============================================================ END
  S.end = (ctx, e, p, clock) => {
    ctx.fillStyle = '#1d2230'; ctx.fillRect(0, 0, W, H);
  };
})();
