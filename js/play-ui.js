'use strict';
// ============================================================================
// PLAY A MONTH — interface: setup form, map, day-by-day playback, scorecard.
// All numbers come from js/play-config.js via js/play-sim.js.
// ============================================================================
(function () {
  const C = window.PLAY, S = window.PlaySim, G = window.GEO;
  const $ = (id) => document.getElementById(id);
  const fmt = S.fmt, T = S.T;
  const money0 = (x) => '$' + Math.round(x).toLocaleString();

  // ---------------- state ----------------
  const st = {
    profile: JSON.parse(JSON.stringify(C.defaults)),
    fill: C.ferry.lot.fillMean,
    seed: (Date.now() % 100000) | 0,
    results: null, chosen: null, day: -1, playing: false, speed: 1,
    anim: null, // { legs, t0, dur, day }
  };

  // ---------------- geometry ----------------
  const ll = ([lat, lon]) => [(lon - G.origin[0]) * G.mPerDegLon, (lat - G.origin[1]) * G.mPerDegLat];
  const PL = G.places;
  const PG = window.PLAYGEO; // street routes and traced lines, from tools/build-play-geo.py
  const pt = {
    marina: PL.pierEnd, fb: PL.ferryBuilding, emb: PL.embarcaderoBart,
    civic: PL.civicCenterBart, fidi: PL.montgomeryBart,
  };
  const homePt = (id) => ll(C.homes[id].ll);
  const stationPt = (id) => ll(C.homes[id].station.ll);
  const destPt = () => pt[st.profile.dest];
  const pierTail = [PL.pierFoot, PL.pierEnd];             // lot or bike rack to the end of the pier
  const marketSt = () => (st.profile.dest === 'civic' ? [pt.emb, PL.montgomeryBart, PL.powellBart, pt.civic] : [pt.emb, pt.fidi]);
  const tube = () => [...PG.transbay.slice(0, -1), ...marketSt()];
  const toSF = () => [...PG.freeway.slice(1), ...PG.sfOff[st.profile.dest].slice(1, -1), destPt()];

  function keyPt(k) {
    if (k === 'home') return homePt(st.profile.home);
    if (k === 'station') return stationPt(st.profile.home);
    if (k === 'dest') return destPt();
    return pt[k];
  }
  // Every leg follows a real line: streets, tracks, the freeway and bridge, or the ferry lane.
  function legPath(L) {
    const has = (k) => L.from === k || L.to === k;
    const from = (k, p) => (L.from === k ? p : p.slice().reverse());   // p is drawn starting at k
    const H = PG.homes[st.profile.home], stn = PG.stations[C.homes[st.profile.home].station.name];
    const net = H[L.mode === 'car' || L.mode === 'bus' ? 'car' : 'bike'];
    if (L.mode === 'ferry') return from('marina', G.ferry.slice());
    if (L.mode === 'bart') return has('fb') ? from('fb', [pt.fb, ...marketSt()]) : from('station', [...stn.bart, ...tube().slice(1)]);
    if (has('home') && has('dest')) return from('home', [...H.car.i80, ...toSF()]);
    if (has('marina') && has('dest')) return from('marina', [...pierTail.slice().reverse(), ...PG.marinaI80, ...toSF()]);
    if (has('home') && has('marina')) {
      const p = L.mode === 'car' && st.profile.home === 'hills' ? G.routes.am.pts : net.marina; // hills: the cartoon's own drive
      return from('home', [...p, ...pierTail]);
    }
    if (has('home') && has('station')) return from('home', net.station);
    if (has('station') && has('marina')) return from('station', [...stn.marina, ...pierTail]);
    return [keyPt(L.from), keyPt(L.to)];
  }
  const pathLen = (p) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
  function along(p, f) {
    const total = pathLen(p); let goal = f * total;
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (goal <= seg || i === p.length - 1) { const k = seg ? Math.min(1, goal / seg) : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k]; }
      goal -= seg;
    }
    return p[p.length - 1];
  }

  // ---------------- map drawing ----------------
  const cv = $('map'), ctx = cv.getContext('2d');
  const MODE_COL = { car: '#e8562a', bike: '#2a9d4b', ebike: '#2a9d4b', walk: '#6b6455', bus: '#8e44ad', bart: '#1d6fb8', ferry: '#0b7a8f' };
  let view = null;

  function fitView() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const pts = [pt.civic, pt.fb, pt.marina, ...Object.keys(C.homes).map(homePt), ...Object.keys(C.homes).map(stationPt)];
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const pad = 1700;
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    const s = Math.min(cv.width / (x1 - x0), cv.height / (y1 - y0));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    view = { s, dpr, sx: (x) => cv.width / 2 + (x - cx) * s, sy: (y) => cv.height / 2 - (y - cy) * s,
      inv: (px, py) => [cx + (px - cv.width / 2) / s, cy - (py - cv.height / 2) / s] };
  }

  function text(s, x, y, size, o = {}) {
    ctx.font = `${o.weight || 700} ${size * view.dpr}px "Avenir Next","Segoe UI","Helvetica Neue",Arial,sans-serif`;
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = (o.haloW || 4) * view.dpr; ctx.strokeStyle = o.halo || '#f3ead2'; ctx.lineJoin = 'round';
    ctx.strokeText(s, x, y); ctx.fillStyle = o.color || '#1d2230'; ctx.fillText(s, x, y);
  }
  function poly(p, col, w, dash) {
    ctx.beginPath(); p.forEach((q, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, view.sx(q[0]), view.sy(q[1])));
    ctx.strokeStyle = col; ctx.lineWidth = w * view.dpr; ctx.setLineDash(dash ? dash.map((v) => v * view.dpr) : []);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.setLineDash([]);
  }
  function dot(q, r, fill, stroke = '#1d2230') {
    ctx.beginPath(); ctx.arc(view.sx(q[0]), view.sy(q[1]), r * view.dpr, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2 * view.dpr; ctx.strokeStyle = stroke; ctx.stroke();
  }

  function drawBase() {
    ctx.fillStyle = '#7cc0e3'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#f3ead2';
    for (const ring of G.land) {
      ctx.beginPath(); ring.forEach((q, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, view.sx(q[0]), view.sy(q[1]))); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#e0d3b2'; ctx.lineWidth = 0.8 * view.dpr; ctx.beginPath();
    for (const s of G.streets) { ctx.moveTo(view.sx(s[1]), view.sy(s[2])); ctx.lineTo(view.sx(s[3]), view.sy(s[4])); }
    ctx.stroke();
    // transit lines
    poly(G.ferry, '#0b7a8f', 3, [7, 6]);
    poly([...PG.bartLine, ...tube().slice(1)], 'rgba(29,111,184,0.55)', 4);
    poly(PG.bridge, 'rgba(120,110,90,0.7)', 3);
    const L = (lat, lon, s, size, col) => { const q = ll([lat, lon]); text(s, view.sx(q[0]), view.sy(q[1]), size, { color: col || '#6d6046', weight: 800 }); };
    L(37.762, -122.405, 'San Francisco', 15); L(37.861, -122.262, 'Berkeley', 15);
    L(37.812, -122.272, 'Oakland', 14); L(37.823, -122.371, 'Treasure Is.', 11); L(37.822, -122.334, 'Bay Bridge', 11, '#5a5446');
  }

  function drawPins() {
    // stations
    const seen = new Set();
    for (const h of Object.keys(C.homes)) {
      const s = C.homes[h].station; if (seen.has(s.name)) continue; seen.add(s.name);
      const q = stationPt(h), x = view.sx(q[0]), y = view.sy(q[1]), r = 6 * view.dpr;
      ctx.fillStyle = '#1d6fb8'; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * view.dpr; ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
    }
    // marina terminal (proposed)
    const m = pt.marina; dot(m, 7, '#0b7a8f', '#fff');
    text('Proposed ferry', view.sx(m[0]) - 10 * view.dpr, view.sy(m[1]) + 16 * view.dpr, 11, { align: 'right', color: '#0b5a6a' });
    dot(pt.fb, 6, '#0b7a8f', '#fff');
    text('Ferry Bldg', view.sx(pt.fb[0]) + 10 * view.dpr, view.sy(pt.fb[1]), 11, { align: 'left', color: '#0b5a6a' });
    // destination
    const d = destPt(); star(view.sx(d[0]), view.sy(d[1]), 11 * view.dpr);
    text(C.dests[st.profile.dest].label, view.sx(d[0]), view.sy(d[1]) + 20 * view.dpr, 12, {});
    // homes
    for (const h of Object.keys(C.homes)) {
      const q = homePt(h), on = h === st.profile.home;
      house(view.sx(q[0]), view.sy(q[1]), (on ? 13 : 9) * view.dpr, on);
      if (on || (cv.width / view.dpr > 480 && $('setup').hidden === false))
        text(C.homes[h].label, view.sx(q[0]), view.sy(q[1]) - (on ? 22 : 17) * view.dpr, on ? 13 : 11, { color: on ? '#1d2230' : '#6d6046' });
    }
  }
  function star(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    ctx.closePath(); ctx.fillStyle = '#ffd166'; ctx.fill(); ctx.lineWidth = 2 * view.dpr; ctx.strokeStyle = '#1d2230'; ctx.stroke();
  }
  function house(x, y, r, on) {
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.75, y);
    ctx.lineTo(x + r * 0.75, y + r * 0.8); ctx.lineTo(x - r * 0.75, y + r * 0.8); ctx.lineTo(x - r * 0.75, y); ctx.closePath();
    ctx.fillStyle = on ? '#e8562a' : '#fffdf6'; ctx.fill(); ctx.lineWidth = 2 * view.dpr; ctx.strokeStyle = '#1d2230'; ctx.stroke();
  }

  function draw(now) {
    if (!view) fitView();
    drawBase();
    const a = st.anim;
    if (a) {
      const f = Math.min(1, (now - a.t0) / a.dur);
      // completed legs drawn solid, current leg partially
      let acc = 0;
      for (const L of a.legs) {
        const share = L.len / a.total, start = acc, end = acc + share; acc = end;
        if (f <= start) break;
        const k = Math.min(1, (f - start) / share);
        const p = L.path, n = Math.max(2, Math.ceil(k * 40)), sub = [];
        for (let i = 0; i <= n; i++) sub.push(along(p, (i / n) * k));
        poly(sub, MODE_COL[L.mode] || '#333', 5);
        if (k < 1) { const q = along(p, k); dot(q, 7, MODE_COL[L.mode] || '#333', '#fff'); }
      }
      const d = a.day;
      if (d.lotFull && f > 0.12) bigX(pt.marina);
      if (d.stranded && f > 0.7) { const q = pt.marina; text('🚗 stranded', view.sx(q[0]) - 12 * view.dpr, view.sy(q[1]) - 18 * view.dpr, 13, { align: 'right', color: '#a8261a', weight: 900 }); }
    }
    drawPins();
  }
  function bigX(q) {
    const x = view.sx(q[0]) + 22 * view.dpr, y = view.sy(q[1]) - 6 * view.dpr, r = 10 * view.dpr;
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 5 * view.dpr; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
    text('LOT FULL', x, y + 20 * view.dpr, 12, { color: '#a8261a', weight: 900 });
  }

  // tap a house on the map
  cv.addEventListener('click', (e) => {
    if ($('setup').hidden) return;
    const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * view.dpr, py = (e.clientY - r.top) * view.dpr;
    let best = null, bd = 1e9;
    for (const h of Object.keys(C.homes)) { const q = homePt(h), d = Math.hypot(view.sx(q[0]) - px, view.sy(q[1]) - py); if (d < bd) { bd = d; best = h; } }
    if (bd < 40 * view.dpr) { st.profile.home = best; renderSetup(); }
  });

  // ---------------- step 1: setup ----------------
  function seg(el, items, cur, onPick) {
    el.innerHTML = '';
    for (const [val, label, sub] of items) {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = label + (sub ? `<small>${sub}</small>` : ''); b.className = val === cur ? 'on' : '';
      b.setAttribute('aria-pressed', val === cur); b.onclick = () => onPick(val); el.appendChild(b);
    }
  }
  function times(el, from, to, step, cur) {
    el.innerHTML = '';
    for (let m = T(from); m <= T(to); m += step) {
      const o = document.createElement('option'); o.value = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
      o.textContent = fmt(m); if (T(o.value) === T(cur)) o.selected = true; el.appendChild(o);
    }
  }
  function renderSetup() {
    const p = st.profile;
    seg($('homeSeg'), Object.entries(C.homes).map(([k, h]) => [k, h.label, h.sub]), p.home, (v) => { p.home = v; renderSetup(); });
    seg($('destSeg'), Object.entries(C.dests).map(([k, d]) => [k, d.label]), p.dest, (v) => { p.dest = v; renderSetup(); });
    seg($('schedSeg'), [['steady', 'Predictable'], ['normal', 'Normal'], ['chaotic', 'All over the place']], p.schedule, (v) => { p.schedule = v; renderSetup(); });
    $('hasCar').checked = !!p.has.car; $('hasBike').checked = !!p.has.bike; $('hasEbike').checked = !!p.has.ebike; $('kids').checked = !!p.kids;
    $('rainLyft').checked = !!p.rainLyft;
    $('vot').value = p.vot; $('votOut').textContent = '$' + p.vot;
    draw(performance.now());
  }
  function initSetup() {
    times($('arrive'), '7:30', '10:00', 15, st.profile.arrive);
    times($('leave'), '15:30', '19:00', 15, st.profile.leave);
    times($('fill'), '6:45', '8:45', 10, st.fill);
    $('arrive').onchange = (e) => { st.profile.arrive = e.target.value; };
    $('leave').onchange = (e) => { st.profile.leave = e.target.value; };
    $('fill').onchange = (e) => { st.fill = e.target.value; };
    $('hasCar').onchange = (e) => { st.profile.has.car = e.target.checked; };
    $('hasBike').onchange = (e) => { st.profile.has.bike = e.target.checked; };
    $('hasEbike').onchange = (e) => { st.profile.has.ebike = e.target.checked; };
    $('kids').onchange = (e) => { st.profile.kids = e.target.checked; };
    $('rainLyft').onchange = (e) => { st.profile.rainLyft = e.target.checked; };
    $('vot').oninput = (e) => { st.profile.vot = +e.target.value; $('votOut').textContent = '$' + st.profile.vot; };
    $('toPick').onclick = () => { applyTweaks(); show('pick'); renderPick(); };
    $('backSetup').onclick = () => show('setup');
    $('again').onclick = () => { stop(); show('setup'); };
    renderSetup();
  }
  function applyTweaks() { C.ferry.lot.fillMean = st.fill; }

  // ---------------- step 2: pick ----------------
  function renderPick() {
    const box = $('cards'); box.innerHTML = '';
    const prev = S.preview(st.profile);
    if (!prev.length) { box.textContent = 'No options match. Go back and tick a car, bike or e-bike.'; return; }
    for (const p of prev) {
      const s = C.strategies.find((x) => x.id === p.id);
      const b = document.createElement('button'); b.className = 'scard ' + s.via;
      b.innerHTML = `<span class="sl">${p.label}</span><span class="sm">${s.via === 'ferry' ? 'proposed ferry' : s.via === 'bart' ? 'BART' : 'Bay Bridge'}</span>
        <span class="sv">~${Math.round(p.min)} min each way<br>${S.money(p.cost)}/day</span>`;
      b.onclick = () => startMonth(p.id);
      box.appendChild(b);
    }
  }

  // ---------------- step 3: the month ----------------
  function startMonth(id) {
    applyTweaks();
    st.results = S.runAll(st.profile, st.seed);
    st.chosen = st.results.find((r) => r.id === id) || st.results[0];
    st.day = -1; show('month'); $('hudbar').hidden = false;
    $('mTitle').textContent = '3 · ' + st.chosen.label;
    const cal = $('cal'); cal.innerHTML = '';
    st.chosen.days.forEach((_, i) => {
      const b = document.createElement('button'); b.className = 'dsq'; b.textContent = i + 1; b.title = 'Day ' + (i + 1);
      b.onclick = () => { st.playing = false; $('mPlay').textContent = '▶ Play'; showDay(i, true); };
      cal.appendChild(b);
    });
    st.playing = true; $('mPlay').textContent = '❚❚ Pause';
    nextDay();
  }
  function dayClass(d) {
    if (d.stranded || d.lotFull) return 'bad';
    if (d.late > 2 || d.lyfts) return 'meh';
    return 'ok';
  }
  function tallies(upto) {
    const ds = st.chosen.days.slice(0, upto + 1);
    const cost = ds.reduce((a, d) => a + d.cost, 0), hrs = ds.reduce((a, d) => a + d.totalMin, 0) / 60;
    const late = ds.filter((d) => d.late > 2).length, lot = ds.filter((d) => d.lotFull).length, str = ds.filter((d) => d.stranded).length;
    $('hDay').textContent = `Day ${upto + 1}/${C.days}`;
    $('hCost').textContent = money0(cost);
    $('hHours').textContent = hrs.toFixed(1) + ' h';
    $('hLate').textContent = late + ' late';
    $('hBad').textContent = [lot ? `${lot} lot full` : '', str ? `${str} car stranded` : ''].filter(Boolean).join(' · ');
  }
  function showDay(i, still) {
    st.day = i; const d = st.chosen.days[i];
    lastShown = Math.max(lastShown, i);
    [...$('cal').children].forEach((b, k) => { b.className = 'dsq ' + (k <= lastShown ? dayClass(st.chosen.days[k]) : '') + (k === i ? ' now' : ''); });
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i % 5];
    $('dayCard').innerHTML = `<h3>Day ${i + 1} · ${wd}</h3><ul>${d.ev.map((e) => `<li class="${e.kind}"><time>${fmt(e.t)}</time><span>${e.text}</span></li>`).join('')}</ul>
      <div class="dsum">${Math.round(d.amMin)} min there · ${Math.round(d.pmMin)} min back · ${S.money(d.cost)}</div>`;
    tallies(Math.max(i, lastShown));
    const legs = d.legs.map((L) => { const path = legPath(L); return { ...L, path, len: Math.max(1, pathLen(path)) }; });
    st.anim = { legs, total: legs.reduce((a, L) => a + L.len, 0), t0: performance.now(), dur: (still ? 900 : 2200) / st.speed, day: d };
  }
  let lastShown = -1, timer = null, raf = null;
  function nextDay() {
    clearTimeout(timer);
    if (!st.playing) return;
    if (st.day + 1 >= C.days) { timer = setTimeout(finish, 1200 / st.speed); return; }
    showDay(st.day + 1, false);
    const d = st.chosen.days[st.day], hold = d.ev.some((e) => e.kind === 'bad') ? 3600 : 2600;
    timer = setTimeout(nextDay, hold / st.speed);
  }
  function stop() { st.playing = false; clearTimeout(timer); }
  function finish() { stop(); lastShown = C.days - 1; tallies(C.days - 1); st.anim = null; show('results'); renderResults(); }
  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }

  function initMonth() {
    $('mPlay').onclick = () => {
      st.playing = !st.playing; $('mPlay').textContent = st.playing ? '❚❚ Pause' : '▶ Play';
      if (st.playing) nextDay(); else clearTimeout(timer);
    };
    $('mSpeed').onchange = (e) => { st.speed = +e.target.value; };
    $('mSkip').onclick = () => { lastShown = C.days - 1; tallies(C.days - 1); finish(); };
    $('newMonth').onclick = () => { st.seed = (st.seed * 7919 + 13) % 1000003; lastShown = -1; startMonth(st.chosen.id); };
  }

  // ---------------- step 4: results ----------------
  function renderResults() {
    const R = st.results.slice().sort((a, b) => a.totals.combined - b.totals.combined);
    const best = R[0], mine = st.chosen, vot = st.profile.vot;
    const t = mine.totals;
    const flags = (x) => [x.lateDays ? `${x.lateDays} late` : '', x.lotFull ? `${x.lotFull} lot full` : '', x.stranded ? `${x.stranded} stranded` : '', x.lyfts ? `${x.lyfts} Lyft` : ''].filter(Boolean).join(', ');
    $('verdict').innerHTML = `<span class="vbig">${mine.label}: ${money0(t.cost)} and ${t.hours.toFixed(0)} hours this month.</span>` +
      (best.id === mine.id ? `That was the best fit for your life, counting your time at $${vot}/hour.`
        : `The best fit for your life was <b>${best.label}</b>: ${money0(best.totals.cost)} and ${best.totals.hours.toFixed(0)} hours. ` +
          `Counting your time at $${vot}/hour, that's <b>${money0(t.combined - best.totals.combined)}</b> a month better.`) +
      (flags(t) ? ` Your month: ${flags(t)}.` : '');
    const maxC = Math.max(...R.map((r) => r.totals.cost)), maxH = Math.max(...R.map((r) => r.totals.hours));
    $('board').innerHTML = `<table><thead><tr><th>Option</th><th class="num">Money</th><th class="num">Hours</th><th class="hide-s">What went wrong</th><th class="num">Total at $${vot}/h</th></tr></thead><tbody>` +
      R.map((r) => `<tr class="row${r.id === mine.id ? ' mine' : ''}" data-id="${r.id}">
        <td>${r.label}${r.via === 'ferry' ? ' <span title="proposed">⛴</span>' : ''}</td>
        <td class="num">${money0(r.totals.cost)}<div class="bar" style="width:${(100 * r.totals.cost / maxC).toFixed(0)}%"></div></td>
        <td class="num">${r.totals.hours.toFixed(0)}<div class="bar t" style="width:${(100 * r.totals.hours / maxH).toFixed(0)}%"></div></td>
        <td class="hide-s flag">${flags(r.totals)}</td>
        <td class="num"><b>${money0(r.totals.combined)}</b></td></tr>`).join('') + '</tbody></table>';
    [...$('board').querySelectorAll('tr.row')].forEach((tr) => { tr.onclick = () => { lastShown = -1; startMonth(tr.dataset.id); }; });
  }

  // ---------------- assumptions table ----------------
  function renderAssump() {
    const rows = [
      ['Ferry schedule (proposed)', `Berkeley → SF: ${C.ferry.amFromBerkeley.map((s) => fmt(T(s))).join(', ')}<br>SF → Berkeley: ${C.ferry.pmFromSF.map((s) => fmt(T(s))).join(', ')}`, 'WETA business plan: 8 AM and 8 PM peak trips, ~35-min headway; exact times illustrative'],
      ['Ferry trip', `${C.ferry.boardMin + C.ferry.sailMin + C.ferry.dockMin} min boarding to stepping off; fare $${C.ferry.fare}`, 'WETA projected 2035 fare'],
      ['Ferry parking', `${C.ferry.lot.stalls} paid stalls + ~${C.ferry.lot.curb} on Marina Blvd; none on University west of I-80. Usually full by ${fmt(T(C.ferry.lot.fillMean))} (±${C.ferry.lot.fillSdMin} min). $${C.ferry.lot.fee}/day.`, 'Draft Parking Mgmt Plan (May 2026); fill time is a game assumption, shared with riders from Albany, El Cerrito and beyond'],
      ['If the next boat is more than', `${C.ferry.maxWaitBeforeBart} min away, you take BART instead. If your car is at the Marina, you go back for it.`, 'game rule'],
      ['BART', `Fares (2026): ${Object.values(C.homes).map((h) => `${h.station.name} $${h.station.fare.civic.toFixed(2)}`).filter((v, i, a) => a.indexOf(v) === i).join(', ')} to Civic Center. Wait 0–${C.bart.waitMaxMin} min; ${Math.round(C.bart.delayP * 100)}% chance of a delay.`, '2026 fare table; some fares estimated'],
      ['Driving into SF', `Bay Bridge toll $${C.drive.toll} (westbound), garage $${C.dests.civic.garage}/day near Civic Center, $${C.drive.perMile}/mile. ${Math.round(C.drive.bridgeMessP * 100)}% chance of a bad bridge day.`, 'toll: 2026; garage and per-mile: estimates'],
      ['Buses', `AC Transit $2.50. The 65 runs about every 45 min. ${Math.round((1 - C.bus.lateP) * 100)}% on time. Morning wait over ${C.bus.maxWaitMin} min or evening over ${C.bus.pmMaxWaitMin} min → Lyft.`, 'Transit app on-time figure'],
      ['Life happens (Normal)', `Out the door late ${Math.round(C.life.normal.runLateP * 100)}% of days; late meeting ${Math.round(C.life.normal.lateMeetingP * 100)}%; school calls ${Math.round(C.life.normal.leaveEarlyKidsP * 100)}% (with kids). Rain ${Math.round(C.rainP * 100)}% of days.`, 'game assumptions'],
    ];
    $('assump').innerHTML = '<table>' + rows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}<br><span class="tag">${c}</span></td></tr>`).join('') +
      '</table><p class="note">Every number is in <code>js/play-config.js</code>.</p>';
  }

  // ---------------- plumbing ----------------
  function show(id) {
    for (const s of ['setup', 'pick', 'month', 'results']) $(s).hidden = s !== id;
    if (id === 'setup' || id === 'pick') { $('hudbar').hidden = true; st.anim = null; }
  }
  window.addEventListener('resize', () => { fitView(); });
  fitView(); initSetup(); initMonth(); renderAssump();
  raf = requestAnimationFrame(loop);

  // ?auto=STRATEGY_ID jumps straight to a month (handy for screenshots/tests)
  const q = new URLSearchParams(location.search);
  if (q.get('seed')) st.seed = +q.get('seed');
  if (C.homes[q.get('home')]) st.profile.home = q.get('home');
  if (C.dests[q.get('dest')]) st.profile.dest = q.get('dest');
  if (q.get('auto')) { applyTweaks(); startMonth(q.get('auto')); if (q.get('results')) finish(); else if (q.get('day')) { stop(); showDay(+q.get('day') - 1, true); st.anim.t0 = -1e9; } }
})();
