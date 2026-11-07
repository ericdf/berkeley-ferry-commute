'use strict';
// Playback: a screen clock (seconds of cartoon) drives everything. Speed only scales how fast
// the screen clock runs, so the trip clock and every total stay the same at any speed.
(function () {
  const A = window.ART, T = window.TL, C = window.CFG, S = window.SCENES;
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const st = { s: 0, playing: false, speed: 1, last: 0 };

  // ------------------------------------------------------------ canvas sizing
  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.width * dpr * (A.H / A.W));
    draw();
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(canvas);

  // ------------------------------------------------------------ cards (HTML over the picture)
  const S_ = T.sum, f = T.fmt, d = T.dur, $$ = T.money;
  const row = (k, v, cls = '') => `<div class="row ${cls}"><span>${k}</span><b>${v}</b></div>`;
  const CARDS = {
    am: () => `<h2>At the office door</h2>
      ${row('Left home', f(S_.am.t0))}${row('At the office', f(S_.am.t1))}
      ${row('Door to door', d(S_.am.elapsed), 'big')}
      <h3>Moving: ${d(S_.am.move)}</h3>
      ${row('SUV', d(S_.am.car))}${row('Ferry', d(S_.am.ferry))}${row('BART', d(S_.am.bart))}${row('Walking', d(S_.am.walk))}
      <h3>Waiting, parking, boarding, transfers: ${d(S_.am.wait)}</h3>
      <p class="def">Time in transit = the moving legs only (${d(S_.am.move)}). Waiting is counted separately.</p>`,
    pm: () => `<h2>Home</h2>
      ${row('Left the office', f(S_.pm.t0))}${row('Home', f(S_.pm.t1))}
      ${row('Evening door to door', d(S_.pm.elapsed), 'big')}
      ${row('Moving', d(S_.pm.move))}${row('Waiting, boarding, transfers', d(S_.pm.wait))}${row('Pizza run: parking search, walks, pickup', d(S_.pm.errand))}
      <h3>The whole day</h3>
      ${row('Out the door to back home', d(S_.roundTrip))}
      ${row('Moving, both commutes', d(S_.motionBoth))}
      ${row('Waiting, both commutes', d(S_.waitBoth))}
      <h3>Parking a mile from Gioia</h3>
      ${row('Extra time vs. parking at the curb', d(S_.detourMin))}
      ${row('Extra driving', `${T.mi(S_.detourM)} · ${S_.detourGal.toFixed(2)} gal · ${$$(S_.detourFuel)}`)}
      ${row('Walking', '2.0 mi')}
      ${row('Pizza when he got it', `${C.pizza.hotF}°F`)}${row('Pizza at home', `${Math.round(S_.pizzaHomeF)}°F`, 'cold')}`,
    end: () => `<h2>What the day cost</h2>
      ${row(`Gas: ${T.mi(S_.carM)} in a ${C.vehicle.mpg}-mpg SUV = ${S_.gal.toFixed(2)} gal at ${$$(C.gasPrice)}`, $$(S_.fuel))}
      ${row('Parking at the terminal', $$(S_.parking))}
      ${row(`Ferry fares (2 × ${$$(C.ferryFare)})`, $$(S_.ferryFares))}
      ${row(`BART fares (2 × ${$$(C.bartFare)})`, $$(S_.bartFares))}
      ${row('Out of his pocket', $$(S_.outOfPocket), 'big')}
      <div class="sep"></div>
      ${row(`Public ferry subsidy (2 × ${$$(C.ferrySubsidy)} per boarding)`, $$(S_.subsidy), 'sub')}
      <p class="def">WETA's plan has Berkeley covering the ferry's operating gap, through a surcharge on Marina hotel stays.</p>
      <div class="sep"></div>
      ${row('SUV tailpipe CO₂', `${S_.co2.toFixed(1)} kg (${S_.co2Range[0].toFixed(1)}–${S_.co2Range[1].toFixed(1)} kg at ${C.vehicle.mpgRange[1]}–${C.vehicle.mpgRange[0]} mpg)`)}
      ${row('Time commuting today', d(S_.am.elapsed + S_.pm.elapsed), 'big')}`,
  };

  // ------------------------------------------------------------ drawing
  function draw() {
    const e = T.eventAt(st.s);
    const p = A.clamp((st.s - e.s0) / e.ss);
    const clock = T.clockAt(st.s);
    const k = canvas.width / A.W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, A.W, A.H);
    try {
      (S[e.scene] || S.end)(ctx, e, p, clock, { local: st.s - e.s0, clock });
    } catch (err) {
      console.error('scene ' + e.scene + ' #' + e.i + ': ' + err.message);
    }
    // HUD
    $('clock').textContent = T.fmt(clock);
    const showAdd = (e.kind === 'wait' || e.kind === 'errand' || e.kind === 'work') && e.dur >= 1;
    $('jump').textContent = showAdd ? `+${T.dur(e.dur)}` : '';
    $('jump').hidden = !showAdd;
    if ($('caption').dataset.i !== String(e.i)) {
      $('caption').textContent = e.caption;
      $('caption').dataset.i = e.i;
      const card = $('card');
      if (e.card && CARDS[e.card]) { card.innerHTML = CARDS[e.card](); card.hidden = false; card.scrollTop = 0; }
      else card.hidden = true;
      for (const b of document.querySelectorAll('.chap')) b.classList.toggle('on', +b.dataset.s <= st.s && st.s < +b.dataset.e);
    }
    $('bar').style.width = `${(st.s / T.length) * 100}%`;
    $('stime').textContent = `${Math.floor(st.s / 60)}:${String(Math.floor(st.s % 60)).padStart(2, '0')} / ${Math.floor(T.length / 60)}:${String(Math.floor(T.length % 60)).padStart(2, '0')}`;
  }

  function tick(now) {
    if (st.playing) {
      const dt = Math.min(0.1, (now - st.last) / 1000);
      st.s = Math.min(T.length, st.s + dt * st.speed);
      if (st.s >= T.length) setPlaying(false);
    }
    st.last = now;
    draw();
    requestAnimationFrame(tick);
  }
  function setPlaying(v) {
    st.playing = v;
    if (v && st.s >= T.length) st.s = 0;
    $('play').textContent = v ? '❚❚ Pause' : '▶ Play';
    $('play').setAttribute('aria-pressed', v);
    $('splash').hidden = true;
  }
  const seek = (s) => { st.s = A.clamp(s, 0, T.length - 0.001); $('caption').dataset.i = ''; draw(); };

  // ------------------------------------------------------------ controls
  $('play').onclick = () => setPlaying(!st.playing);
  $('splashPlay').onclick = () => setPlaying(true);
  $('restart').onclick = () => { seek(0); setPlaying(true); };
  $('speed').onchange = (ev) => { st.speed = +ev.target.value; };
  $('morning').onclick = () => seek(0);
  $('evening').onclick = () => seek(T.eveningStart);
  $('track').onclick = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    seek(((ev.clientX - r.left) / r.width) * T.length);
  };
  const chaps = $('chapters');
  T.chapters.forEach((c, i) => {
    const end = i + 1 < T.chapters.length ? T.chapters[i + 1].s : T.length;
    const b = document.createElement('button');
    b.className = 'chap';
    b.textContent = c.name;
    b.dataset.s = c.s;
    b.dataset.e = end;
    b.style.flexGrow = end - c.s;
    b.onclick = () => seek(c.s + 0.001);
    chaps.appendChild(b);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest('select, input, textarea')) return;
    if (ev.key === ' ' || ev.key === 'k') { ev.preventDefault(); setPlaying(!st.playing); }
    if (ev.key === 'ArrowRight') seek(st.s + 5);
    if (ev.key === 'ArrowLeft') seek(st.s - 5);
  });

  // ------------------------------------------------------------ numbers drawer + transcript
  const inputs = [
    ['Leaves home', C.startTime], ['Leaves the office', C.officeLeaves],
    ['SUV fuel economy', `${C.vehicle.mpg} mpg (range ${C.vehicle.mpgRange.join('–')})`], ['Gas', `${$$(C.gasPrice)}/gal`],
    ['Terminal parking', `$${C.parkingFee}/day`], ['Ferry fare', `${$$(C.ferryFare)} each way (WETA 2035 projection)`],
    ['Ferry subsidy', `${$$(C.ferrySubsidy)} per boarding (WETA 2035 projection)`], ['BART fare', `${$$(C.bartFare)} each way`],
    ['Driving speeds (moving)', Object.entries(C.carMph).map(([k, v]) => `${k.replace('Principal ', '')} ${v} mph`).join(', ')],
    ['Walking', `${C.walkMph} mph`], ['Sailing', `${C.sailMin} min, ${(S_.sailM / 1609.344).toFixed(1)} mi`],
    ['Tailpipe CO₂', `${C.co2KgPerGallon} kg per gallon`],
    ['Miles driven', `${T.mi(S_.carM)} (morning ${T.mi(S_.am.carM)}, evening ${T.mi(S_.pm.carM)} incl. ${T.mi(S_.pm.errandCarM)} hunting for parking)`],
  ];
  $('inputs').innerHTML = inputs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('') +
    `<tr><th>Map</th><td>Routes run on City of Berkeley street centerlines; shoreline © OpenStreetMap contributors. Edit everything in <code>js/config.js</code>.</td></tr>`;
  const strip = (h) => { const t = document.createElement('div'); t.innerHTML = h; return t.innerText.replace(/\n+/g, ' · ').replace(/\s+/g, ' ').trim(); };
  const tx = [];
  for (const e of T.events) {
    if (e.card && CARDS[e.card]) {
      const tmp = document.createElement('div');
      tmp.innerHTML = CARDS[e.card]();
      const items = [...tmp.querySelectorAll('h2,h3,.row,p')].map((n) => n.matches('.row') ? `${n.children[0].textContent}: ${n.children[1].textContent}` : n.textContent);
      tx.push(`<li><b>${T.fmt(e.t0)}</b> ${e.caption}<ul>${items.map((s) => `<li>${s}</li>`).join('')}</ul></li>`);
    } else {
      tx.push(`<li><b>${T.fmt(e.t0)}</b> ${e.caption}${e.dur >= 1 && e.kind !== 'move' ? ` <i>(+${T.dur(e.dur)})</i>` : ''}</li>`);
    }
  }
  $('transcript').innerHTML = tx.join('');
  void strip;

  // preview hooks: ?t=SECONDS or ?ev=INDEX, &still
  const q = new URLSearchParams(location.search);
  if (q.has('t')) st.s = +q.get('t');
  if (q.has('ev')) { const e = T.events[+q.get('ev')]; st.s = e.s0 + e.ss * (q.has('p') ? +q.get('p') : 0.5); }
  if (q.has('t') || q.has('ev')) $('splash').hidden = true;

  if (q.has('sweep')) {           // dev check: draw every event at start, middle and end
    let n = 0;
    for (const e of T.events) for (const p of [0, 0.5, 0.999]) { st.s = e.s0 + e.ss * p; draw(); n++; }
    console.log('sweep done', n);
    st.s = 0;
  }
  fit();
  requestAnimationFrame((now) => { st.last = now; tick(now); });
})();
