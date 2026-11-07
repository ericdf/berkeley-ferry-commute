'use strict';
// The cartoon kit: ink, text, the SUV, the commuter, skylines, bridges, thermometer.
(function () {
  const A = (window.ART = {});
  const INK = (A.INK = '#1d2230');
  A.W = 1600;
  A.H = 900;

  A.clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  A.lerp = (a, b, t) => a + (b - a) * t;
  A.ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  A.win = (p, a, b) => A.clamp((p - a) / (b - a));
  A.mix = (c1, c2, t) => {
    const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const a = h(c1), b = h(c2);
    return '#' + a.map((v, i) => Math.round(A.lerp(v, b[i], t)).toString(16).padStart(2, '0')).join('');
  };

  A.rr = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  A.shape = (ctx, fill, lw = 4, stroke = INK) => {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  };
  A.FONT = '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  A.text = (ctx, s, x, y, size, o = {}) => {
    ctx.font = `${o.weight || 700} ${size}px ${A.FONT}`;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    if (o.halo) {
      ctx.lineWidth = o.haloW || size * 0.28;
      ctx.strokeStyle = o.halo;
      ctx.lineJoin = 'round';
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = o.color || INK;
    ctx.fillText(s, x, y);
  };
  A.label = (ctx, s, x, y, size, o = {}) => {
    ctx.font = `${o.weight || 800} ${size}px ${A.FONT}`;
    const w = ctx.measureText(s).width + size * 0.9;
    const h = size * 1.55;
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    A.rr(ctx, x0, y - h / 2, w, h, h * 0.3);
    A.shape(ctx, o.bg || '#fff', o.lw == null ? 3 : o.lw);
    A.text(ctx, s, x0 + w / 2, y + size * 0.36, size, { align: 'center', color: o.color || INK, weight: o.weight || 800 });
    return w;
  };

  // ------------------------------------------------------------ sky by clock time (Nov in Berkeley: up ~6:45, down ~5:05)
  A.sky = (min) => {
    const h = min / 60;
    const stops = [
      [0, '#141a33', '#26304f'], [6.3, '#1d2547', '#4b4a6e'], [6.9, '#f2a26b', '#f6d7a8'], [7.6, '#8fc6ea', '#d6ecf7'],
      [16.3, '#8fc6ea', '#dceef6'], [16.9, '#f08a5d', '#f7c88f'], [17.5, '#3a3566', '#8a5f86'], [18.2, '#151b38', '#2b3156'], [24, '#141a33', '#26304f'],
    ];
    let i = 0;
    while (i < stops.length - 2 && stops[i + 1][0] <= h) i++;
    const a = stops[i], b = stops[i + 1];
    const t = A.clamp((h - a[0]) / (b[0] - a[0]));
    return { top: A.mix(a[1], b[1], t), bot: A.mix(a[2], b[2], t), night: h < 6.6 || h > 17.6, dusk: h > 16.5 && h < 18 };
  };
  A.paintSky = (ctx, min, y1 = A.H) => {
    const s = A.sky(min);
    const g = ctx.createLinearGradient(0, 0, 0, y1);
    g.addColorStop(0, s.top);
    g.addColorStop(1, s.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, A.W, y1);
    if (s.night) {
      ctx.fillStyle = 'rgba(255,255,240,0.8)';
      for (let i = 0; i < 60; i++) {
        const x = (i * 263.7) % A.W, y = (i * 97.3) % (y1 * 0.6);
        ctx.fillRect(x, y, 2, 2);
      }
    }
    return s;
  };

  // ------------------------------------------------------------ distant scenery
  const SF_BLDG = [
    // [x (0..1), width, height] — a generic downtown silhouette with a tall rounded tower and a pyramid
    [0.00, 0.05, 0.25], [0.05, 0.04, 0.38], [0.09, 0.05, 0.3], [0.14, 0.03, 0.5], [0.17, 0.05, 0.42],
    [0.22, 0.04, 0.62], [0.26, 0.05, 0.46], [0.31, 0.06, 1.0, 'tower'], [0.37, 0.04, 0.55], [0.41, 0.05, 0.7],
    [0.46, 0.04, 0.48], [0.5, 0.05, 0.6], [0.55, 0.035, 0.82, 'pyramid'], [0.585, 0.05, 0.4], [0.635, 0.06, 0.52],
    [0.695, 0.04, 0.34], [0.735, 0.05, 0.28], [0.785, 0.06, 0.2], [0.845, 0.05, 0.16], [0.9, 0.1, 0.1],
  ];
  A.skyline = (ctx, x, base, w, h, color, lights) => {
    ctx.fillStyle = color;
    // the hills behind downtown
    ctx.beginPath();
    ctx.moveTo(x - w * 0.1, base);
    ctx.quadraticCurveTo(x + w * 0.3, base - h * 0.32, x + w * 0.7, base - h * 0.15);
    ctx.quadraticCurveTo(x + w * 1.0, base - h * 0.3, x + w * 1.2, base);
    ctx.fill();
    for (const [fx, fw, fh, kind] of SF_BLDG) {
      const bx = x + fx * w, bw = fw * w, bh = fh * h;
      ctx.beginPath();
      if (kind === 'pyramid') {
        ctx.moveTo(bx, base); ctx.lineTo(bx + bw / 2, base - bh); ctx.lineTo(bx + bw, base);
      } else if (kind === 'tower') {
        ctx.moveTo(bx, base); ctx.lineTo(bx, base - bh * 0.9);
        ctx.quadraticCurveTo(bx + bw / 2, base - bh * 1.04, bx + bw, base - bh * 0.9); ctx.lineTo(bx + bw, base);
      } else {
        ctx.rect(bx, base - bh, bw, bh);
      }
      ctx.fill();
      if (lights) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,220,130,0.85)';
        for (let yy = base - bh + 6; yy < base - 4; yy += 9) for (let xx = bx + 3; xx < bx + bw - 3; xx += 7) if ((xx * 7 + yy * 3) % 5 < 2) ctx.fillRect(xx, yy, 2.5, 3);
        ctx.restore();
        ctx.fillStyle = color;
      }
    }
  };
  A.goldenGate = (ctx, x, base, s, color = '#c0392b') => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, 3 * s);
    const t1 = x, t2 = x + 160 * s, top = base - 70 * s;
    ctx.beginPath();
    ctx.moveTo(t1 - 70 * s, base - 8 * s); ctx.lineTo(t2 + 70 * s, base - 8 * s); // deck
    ctx.moveTo(t1, base); ctx.lineTo(t1, top); ctx.moveTo(t2, base); ctx.lineTo(t2, top);
    ctx.moveTo(t1 - 70 * s, base - 10 * s); ctx.quadraticCurveTo(t1 - 20 * s, base - 30 * s, t1, top);
    ctx.quadraticCurveTo((t1 + t2) / 2, base - 5 * s, t2, top);
    ctx.quadraticCurveTo(t2 + 20 * s, base - 30 * s, t2 + 70 * s, base - 10 * s);
    ctx.stroke();
  };
  A.bayBridge = (ctx, x0, y0, x1, y1, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const x = A.lerp(x0, x1, i / n), y = A.lerp(y0, y1, i / n);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 16); ctx.stroke();
    }
  };

  // ------------------------------------------------------------ the SUV (side view; a generic boxy luxury 4x4, no badges)
  A.suv = (ctx, x, y, s, facing = 1, o = {}) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * facing, s);
    const body = o.color || '#2e5141', roof = '#f2f0e6';
    const bob = o.bob || 0;
    ctx.translate(0, bob);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(0, 4 - bob, 170, 14, 0, 0, Math.PI * 2); ctx.fill();
    // body: tall slab with a nearly vertical windshield (front is +x)
    ctx.beginPath();
    ctx.moveTo(-160, -30); ctx.lineTo(-162, -112); ctx.lineTo(-150, -122); ctx.lineTo(-138, -196);
    ctx.lineTo(70, -198); ctx.lineTo(112, -126); ctx.lineTo(160, -118); ctx.lineTo(168, -90);
    ctx.lineTo(166, -30); ctx.closePath();
    A.shape(ctx, body, 5);
    // floating roof
    A.rr(ctx, -142, -214, 210, 18, 6);
    A.shape(ctx, roof, 4);
    // roof rack
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-130, -224); ctx.lineTo(56, -224); ctx.moveTo(-110, -214); ctx.lineTo(-110, -224); ctx.moveTo(30, -214); ctx.lineTo(30, -224); ctx.stroke();
    // windows
    ctx.beginPath(); ctx.moveTo(-128, -188); ctx.lineTo(-128, -130); ctx.lineTo(-40, -130); ctx.lineTo(-40, -188); ctx.closePath();
    A.shape(ctx, o.night ? '#e9c46a' : '#9fd3e8', 4);
    ctx.beginPath(); ctx.moveTo(-28, -188); ctx.lineTo(-28, -130); ctx.lineTo(56, -130); ctx.lineTo(56, -188); ctx.closePath();
    A.shape(ctx, o.night ? '#e9c46a' : '#9fd3e8', 4);
    ctx.beginPath(); ctx.moveTo(68, -188); ctx.lineTo(102, -130); ctx.lineTo(68, -130); ctx.closePath();
    A.shape(ctx, o.night ? '#e9c46a' : '#bfe3f0', 4);
    // driver silhouette
    if (o.driver !== false) {
      ctx.fillStyle = '#f1c27d';
      ctx.beginPath(); ctx.arc(20, -160, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5b3a29';
      ctx.beginPath(); ctx.arc(18, -168, 14, Math.PI, Math.PI * 2); ctx.fill();
    }
    // door lines, handle, body crease
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-34, -126); ctx.lineTo(-34, -36); ctx.moveTo(62, -126); ctx.lineTo(62, -36);
    ctx.moveTo(-158, -84); ctx.lineTo(164, -84); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillRect(-16, -110, 18, 5); ctx.fillRect(74, -110, 18, 5);
    // lamps
    A.rr(ctx, 146, -112, 20, 14, 3); A.shape(ctx, o.lights ? '#fff7b0' : '#fdf3c4', 3);
    A.rr(ctx, -166, -110, 12, 22, 3); A.shape(ctx, '#d9433b', 3);
    if (o.lights) {
      ctx.fillStyle = 'rgba(255,245,170,0.35)';
      ctx.beginPath(); ctx.moveTo(166, -106); ctx.lineTo(420, -150); ctx.lineTo(420, -20); ctx.closePath(); ctx.fill();
    }
    // wheels
    for (const wx of [-100, 104]) {
      ctx.beginPath(); ctx.arc(wx, -30, 42, 0, Math.PI * 2); A.shape(ctx, '#2a2a2a', 5);
      ctx.beginPath(); ctx.arc(wx, -30, 20, 0, Math.PI * 2); A.shape(ctx, '#b9bec6', 4);
      const r = (o.spin || 0) * facing;
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(wx + Math.cos(r) * 18, -30 + Math.sin(r) * 18); ctx.lineTo(wx - Math.cos(r) * 18, -30 - Math.sin(r) * 18); ctx.stroke();
    }
    // exhaust puff
    if (o.puff) {
      ctx.fillStyle = 'rgba(120,120,120,0.35)';
      const t = o.puff;
      for (let i = 0; i < 3; i++) {
        const k = (t * 2 + i / 3) % 1;
        ctx.beginPath(); ctx.arc(-176 - k * 90, -26 - k * 30, 10 + k * 22, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  };
  // top-down marker for maps
  A.suvTop = (ctx, x, y, ang, s = 1) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-ang);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    A.rr(ctx, -22, -11, 48, 26, 6); ctx.fill();
    A.rr(ctx, -26, -14, 52, 28, 6); A.shape(ctx, '#2e5141', 3, '#fff');
    A.rr(ctx, -16, -10, 30, 20, 4); A.shape(ctx, '#f2f0e6', 2);
    ctx.fillStyle = '#9fd3e8'; ctx.fillRect(14, -10, 7, 20);
    ctx.restore();
  };

  // ------------------------------------------------------------ the commuter
  A.person = (ctx, x, y, s, o = {}) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * (o.facing || 1), s);
    const ph = o.phase || 0;
    const swing = o.walk ? Math.sin(ph * Math.PI * 2) * 0.5 : 0;
    const suit = '#2b3a67';
    // legs
    ctx.strokeStyle = '#30343f'; ctx.lineWidth = 14; ctx.lineCap = 'round';
    if (o.sit) {
      ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(34, -60); ctx.lineTo(34, -10); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(Math.sin(swing) * 40, -4); ctx.moveTo(0, -70); ctx.lineTo(-Math.sin(swing) * 40, -4); ctx.stroke();
    }
    // body
    const by = o.sit ? -60 : -70;
    A.rr(ctx, -22, by - 78, 44, 84, 16); A.shape(ctx, suit, 4);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-8, by - 78); ctx.lineTo(8, by - 78); ctx.lineTo(0, by - 50); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(-3, by - 74); ctx.lineTo(3, by - 74); ctx.lineTo(4, by - 46); ctx.lineTo(0, by - 40); ctx.lineTo(-4, by - 46); ctx.closePath(); ctx.fill();
    // head
    ctx.beginPath(); ctx.arc(0, by - 100, 24, 0, Math.PI * 2); A.shape(ctx, '#f1c27d', 4);
    ctx.fillStyle = '#5b3a29'; ctx.beginPath(); ctx.arc(-2, by - 108, 23, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(9, by - 100, 3, 0, Math.PI * 2); ctx.fill();
    // mouth: mood
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath();
    if (o.mood === 'sad') ctx.arc(10, by - 84, 7, Math.PI * 1.15, Math.PI * 1.85);
    else if (o.mood === 'flat') { ctx.moveTo(4, by - 88); ctx.lineTo(16, by - 88); }
    else ctx.arc(10, by - 92, 7, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    // arms + props
    ctx.strokeStyle = suit; ctx.lineWidth = 12;
    if (o.pizza) {
      ctx.beginPath(); ctx.moveTo(-6, by - 64); ctx.lineTo(30, by - 40); ctx.stroke();
      ctx.save(); ctx.translate(18, by - 44);
      A.rr(ctx, 0, -10, 70, 16, 3); A.shape(ctx, '#e8d3a9', 3);
      ctx.translate(35, 0); ctx.scale(o.facing || 1, 1);
      A.text(ctx, 'PIZZA', 0, 3, 10, { align: 'center', color: '#b23a2a', weight: 900 });
      ctx.restore();
    } else if (o.phone) {
      ctx.beginPath(); ctx.moveTo(-6, by - 64); ctx.lineTo(24, by - 70); ctx.stroke();
      A.rr(ctx, 22, by - 92, 14, 24, 3); A.shape(ctx, '#222', 2);
    } else {
      ctx.beginPath(); ctx.moveTo(0, by - 64); ctx.lineTo(-Math.sin(swing) * 26, by - 14); ctx.stroke();
      // briefcase
      A.rr(ctx, -Math.sin(swing) * 26 - 16, by - 14, 32, 24, 3); A.shape(ctx, '#7a4b2a', 3);
    }
    ctx.restore();
  };

  // ------------------------------------------------------------ steam + thermometer
  A.steam = (ctx, x, y, amt, t) => {
    if (amt <= 0.02) return;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * amt})`;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ox = x + (i - 1) * 22;
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const yy = y - k * 6 * (0.6 + amt);
        const xx = ox + Math.sin(k * 0.7 + t * 6 + i) * 7;
        if (k === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  };
  A.thermo = (ctx, x, y, F, cfg) => {
    const lo = 50, hi = 200;
    const f = A.clamp((F - lo) / (hi - lo));
    const hot = F >= cfg.steamyAboveF, cold = F <= cfg.coldBelowF;
    const col = hot ? '#d9433b' : cold ? '#3a86c8' : '#e39b2d';
    ctx.save();
    A.rr(ctx, x - 70, y - 210, 140, 270, 18); A.shape(ctx, 'rgba(255,255,255,0.94)', 4);
    A.rr(ctx, x - 12, y - 180, 24, 170, 12); A.shape(ctx, '#eee', 3);
    ctx.fillStyle = col;
    ctx.fillRect(x - 7, y - 10 - 160 * f, 14, 160 * f);
    ctx.beginPath(); ctx.arc(x, y + 4, 22, 0, Math.PI * 2); A.shape(ctx, col, 3);
    A.text(ctx, `${Math.round(F)}°F`, x, y + 50, 26, { align: 'center', weight: 900 });
    A.text(ctx, hot ? 'STEAMING' : cold ? 'COLD' : 'COOLING', x, y - 188, 15, { align: 'center', color: col, weight: 900 });
    ctx.restore();
  };

  // little trees and houses for walks and hills
  A.tree = (ctx, x, y, s, c = '#4f8a4b') => {
    ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 5 * s, y - 40 * s, 10 * s, 40 * s);
    ctx.beginPath(); ctx.arc(x, y - 60 * s, 32 * s, 0, Math.PI * 2); A.shape(ctx, c, 3 * s);
  };
  A.house = (ctx, x, y, s, c, night) => {
    ctx.beginPath(); ctx.rect(x, y - 90 * s, 130 * s, 90 * s); A.shape(ctx, c, 3);
    ctx.beginPath(); ctx.moveTo(x - 10 * s, y - 90 * s); ctx.lineTo(x + 65 * s, y - 140 * s); ctx.lineTo(x + 140 * s, y - 90 * s); ctx.closePath(); A.shape(ctx, '#8d5a44', 3);
    ctx.beginPath(); ctx.rect(x + 20 * s, y - 70 * s, 34 * s, 30 * s); A.shape(ctx, night ? '#f6d67a' : '#bfe3f0', 3);
    ctx.beginPath(); ctx.rect(x + 80 * s, y - 60 * s, 30 * s, 60 * s); A.shape(ctx, '#6b4a2b', 3);
  };
})();
