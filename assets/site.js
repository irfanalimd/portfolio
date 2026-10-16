(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- entrance ---------- */
  const start = () => {
    root.classList.add('ready');
    const target = $('#target'), conf = $('#conf');
    setTimeout(() => {
      target.classList.add('locked');
      if (reduceMotion) { conf.textContent = '0.97'; return; }
      const t0 = performance.now();
      const tick = now => {
        const k = Math.min(1, (now - t0) / 1400);
        conf.textContent = (0.97 * (1 - Math.pow(1 - k, 3))).toFixed(2);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, reduceMotion ? 0 : 650);
  };
  (document.fonts ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 900))]) : Promise.resolve())
    .then(() => requestAnimationFrame(start));

  /* ---------- theme toggle, with a circular reveal where supported ---------- */
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const themeBtn = $('#theme');
  themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) {}
      readColors();
    };
    if (!document.startViewTransition || reduceMotion) return apply();
    const r = themeBtn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    root.style.setProperty('--tx', x + 'px');
    root.style.setProperty('--ty', y + 'px');
    root.style.setProperty('--tr', Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 'px');
    document.startViewTransition(apply);
  });

  /* ---------- nav: background, hide on scroll down, progress, active section ---------- */
  const nav = $('#nav');
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    nav.classList.toggle('scrolled', y > 10);
    if (!root.classList.contains('menu-open')) nav.classList.toggle('hide', y > lastY && y > 480);
    lastY = y;
    const max = document.documentElement.scrollHeight - innerHeight;
    nav.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const links = $$('.nav-links a');
  const spy = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.hash === '#' + e.target.id));
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  links.forEach(a => { const s = $(a.hash); if (s) spy.observe(s); });

  /* ---------- mobile menu ---------- */
  const menu = $('#menu'), menuBtn = $('#menu-btn');
  const setMenu = open => {
    menu.hidden = !open;
    root.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) nav.classList.remove('hide');
  };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });

  /* ---------- reveal on scroll, with decoding labels ---------- */
  const GLYPHS = '!<>-_\\/[]{}=+*^?#01';
  const scramble = el => {
    if (reduceMotion || el.dataset.done) return;
    el.dataset.done = 1;
    const nodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    nodes.forEach(node => {
      const final = node.textContent;
      let frame = 0;
      const total = 18;
      const step = () => {
        frame++;
        node.textContent = final.split('').map((ch, i) => {
          if (ch === ' ') return ch;
          return i < (frame / total) * final.length ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }).join('');
        if (frame < total) requestAnimationFrame(step); else node.textContent = final;
      };
      step();
    });
  };
  const rev = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      if (e.target.hasAttribute('data-scramble')) scramble(e.target);
      rev.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  $$('.reveal, [data-scramble]').forEach(el => rev.observe(el));
  // stagger siblings that reveal together
  $$('.featured, .roles, .about-row').forEach(g => $$(':scope > .reveal', g).forEach((el, i) => { el.style.transitionDelay = i * 90 + 'ms'; }));

  /* ---------- magnetic buttons + card spotlight ---------- */
  if (finePointer && !reduceMotion) {
    $$('.magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${dx * .18}px, ${dy * .28}px)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1), border-color .3s, color .3s, background .3s';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 600);
      });
    });
    $$('.spot').forEach(el => el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--sx', e.clientX - r.left + 'px');
      el.style.setProperty('--sy', e.clientY - r.top + 'px');
    }));
  }

  /* ---------- project visuals: a sliding 3x3 kernel, and a ViT attention map ---------- */
  const animated = [];
  $$('[data-viz]').forEach(box => {
    const kind = box.dataset.viz;
    const cols = 12, rows = 7;
    const grid = document.createElement('div');
    grid.className = 'viz-grid';
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    const cells = [];
    for (let i = 0; i < cols * rows; i++) { const c = document.createElement('i'); grid.appendChild(c); cells.push(c); }
    const label = document.createElement('span');
    label.className = 'viz-label mono';
    box.append(grid, label);
    const xy = i => [i % cols, (i / cols) | 0];

    if (kind === 'attn') {
      label.textContent = '[CLS] → 16×16 patches · attention';
      const blobs = [[7.6, 3.2, 2.1, 1], [3.6, 2, 1.3, .5]];
      let phase = 0;
      const paint = () => cells.forEach((c, i) => {
        const [x, y] = xy(i);
        let v = .03;
        blobs.forEach(([bx, by, s, w], j) => {
          const ox = Math.sin(phase + j * 2) * .6, oy = Math.cos(phase * .8 + j) * .35;
          v += w * Math.exp(-((x - bx - ox) ** 2 + (y - by - oy) ** 2) / (2 * s * s));
        });
        v = Math.min(1, v);
        c.style.opacity = (0.06 + v * 0.94).toFixed(2);
        c.classList.toggle('k', v > .7);
      });
      paint();
      animated.push({ box, every: 120, step: () => { phase += .12; paint(); } });
    } else {
      label.textContent = 'conv3×3 · sobel · __global__';
      const px = cells.map((_, i) => { const [x, y] = xy(i); return 1 / (1 + Math.exp(-(x - y * 1.3 - 2.5))); });
      const path = [];
      for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) path.push([y % 2 ? cols - 1 - x : x, y]);
      let k = 0;
      const paint = ([kx, ky]) => cells.forEach((c, i) => {
        const [x, y] = xy(i);
        const inK = Math.abs(x - kx) <= 1 && Math.abs(y - ky) <= 1;
        c.classList.toggle('k', inK);
        c.style.opacity = inK ? (x === kx && y === ky ? 1 : .5) : (.08 + px[i] * .5).toFixed(2);
      });
      paint(path[0]);
      animated.push({ box, every: 130, step: () => { k = (k + 1) % path.length; paint(path[k]); } });
    }
  });
  if (!reduceMotion) {
    const vizLoop = now => {
      animated.forEach(a => {
        if (now - (a.last || 0) < a.every) return;
        if (!a.box.getClientRects().length) return;      // hidden (desktop rows before hover)
        a.last = now; a.step();
      });
      requestAnimationFrame(vizLoop);
    };
    requestAnimationFrame(vizLoop);
  }

  /* ---------- floating preview that follows the cursor over project rows ---------- */
  const preview = $('#preview');
  if (finePointer && preview) {
    let tx = 0, ty = 0, x = 0, y = 0, vx = 0, on = false, raf = 0, current = null, home = null;
    const follow = () => {
      const nx = x + (tx - x) * .14, ny = y + (ty - y) * .14;
      vx = nx - x; x = nx; y = ny;
      preview.style.setProperty('--px', x + 'px');
      preview.style.setProperty('--py', y + 'px');
      preview.style.setProperty('--pr', Math.max(-8, Math.min(8, vx * .5)) + 'deg');
      preview.style.setProperty('--ps', on ? 1 : .8);
      raf = on || Math.abs(vx) > .1 ? requestAnimationFrame(follow) : 0;
    };
    const place = e => { tx = e.clientX + 28; ty = e.clientY - preview.offsetHeight / 2; };
    $$('#project-index .row[data-preview]').forEach(row => {
      const media = $('.row-media', row);
      row.addEventListener('pointerenter', e => {
        if (current && current !== media) home.appendChild(current);
        current = media; home = row;
        preview.appendChild(media);
        place(e);
        if (!on) { x = tx; y = ty; }
        on = true; preview.classList.add('on');
        if (!raf) raf = requestAnimationFrame(follow);
      });
      row.addEventListener('pointermove', place);
      row.addEventListener('pointerleave', () => {
        on = false; preview.classList.remove('on');
        setTimeout(() => { if (!on && current) { home.appendChild(current); current = null; } }, 350);
      });
    });
  }

  /* ---------- copy email ---------- */
  const copyBtn = $('#copy'), copied = $('#copied');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.email);
      copyBtn.classList.add('done'); copied.textContent = 'Copied';
      setTimeout(() => { copyBtn.classList.remove('done'); copied.textContent = ''; }, 2000);
    } catch (e) { copied.textContent = 'Press ⌘C / Ctrl+C'; }
  });

  /* ---------- Boston clock ---------- */
  const clock = $('#clock');
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' });
  const tickClock = () => { clock.textContent = fmt.format(new Date()); };
  tickClock(); setInterval(tickClock, 15000);


  /* =========================================================
     HERO: a small SLAM simulation.
     A spinning LiDAR drives a figure-eight through a room of
     pillars, crates and walls. Each frame the beam sweeps a few
     degrees and re-casts those columns from the current pose.
     Obstacle hits are voxelised into a map that persists, and
     the path is kept as a trajectory.
     ========================================================= */
  const canvas = $('#scan');
  const ctx = canvas.getContext('2d');
  let groundRGB = '240,239,235', hitRGB = '255,106,43';
  function readColors() {
    const cs = getComputedStyle(root);
    groundRGB = cs.getPropertyValue('--scan-ground').trim() || groundRGB;
    hitRGB = cs.getPropertyValue('--scan-hit').trim() || hitRGB;
  }
  readColors();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);

  const small = innerWidth < 760;
  const H = 1.6, MAX_R = 24;
  const RINGS = small ? 18 : 24, AZ = small ? 240 : 360;
  const TAN = Array.from({ length: RINGS }, (_, r) => {
    const k = r / (RINGS - 1);                         // +9° (up) to −24° (down), denser near the horizon
    return Math.tan((9 - 33 * Math.pow(k, 1.25)) * Math.PI / 180);
  });

  // [cx, cz, radius, height]
  const CYL = [[-11, 0, .5, 3.2], [11, 0, .5, 3.2], [0, 8.5, .6, 3.2], [0, -8.5, .6, 3.2], [-6, 9.5, .3, 2.2], [7, -10, .3, 2.2], [15.5, 8.5, .9, 1.1], [-16, -8.5, .9, 1.1], [17, -9, .4, 2.6]];
  // [cx, cz, halfW, halfD, height, rotation] (+ cos, sin)
  const BOX = [
    [-4.5, -10.5, 2.2, 1, 1.5, .2], [5, 10.8, 2.2, 1, 1.5, -.3], [-15.5, 4.5, 1, 1, 1.1, .5], [16, -3.5, 1.2, .8, 1.2, .1],
    [-12.5, 14, 9.5, .15, 3, 0], [12.5, 14, 9.5, .15, 3, 0], [0, -14, 22, .15, 3, 0], [22, 0, .15, 14, 3, 0], [-22, 3, .15, 11, 3, 0],
  ].map(b => [...b, Math.cos(b[5]), Math.sin(b[5])]);

  // distance along a ray: >0 obstacle, <0 ground, 0 nothing in range
  function cast(ox, oz, dx, dz, tanE) {
    let t = tanE < -1e-4 ? H / -tanE : Infinity, hit = 0;
    for (let i = 0; i < CYL.length; i++) {
      const c = CYL[i], cx = c[0] - ox, cz = c[1] - oz;
      const b = dx * cx + dz * cz;
      if (b < 0) continue;
      const disc = b * b - (cx * cx + cz * cz - c[2] * c[2]);
      if (disc < 0) continue;
      const tt = b - Math.sqrt(disc);
      if (tt > 0 && tt < t) { const h = H + tt * tanE; if (h >= 0 && h <= c[3]) { t = tt; hit = 1; } }
    }
    for (let i = 0; i < BOX.length; i++) {
      const bx = BOX[i], co = bx[6], si = bx[7];
      const px = ox - bx[0], pz = oz - bx[1];
      const lx = px * co + pz * si, lz = -px * si + pz * co;
      const rx = dx * co + dz * si, rz = -dx * si + dz * co;
      let t0 = -Infinity, t1 = Infinity, miss = false;
      for (let a = 0; a < 2; a++) {
        const o = a ? lz : lx, d = a ? rz : rx, h = a ? bx[3] : bx[2];
        if (Math.abs(d) < 1e-9) { if (Math.abs(o) > h) { miss = true; break; } continue; }
        let a1 = (-h - o) / d, a2 = (h - o) / d;
        if (a1 > a2) { const tmp = a1; a1 = a2; a2 = tmp; }
        if (a1 > t0) t0 = a1;
        if (a2 < t1) t1 = a2;
      }
      if (miss || t0 > t1 || t0 <= 0 || t0 >= t) continue;
      const h = H + t0 * tanE;
      if (h >= 0 && h <= bx[4]) { t = t0; hit = 1; }
    }
    return t <= MAX_R ? (hit ? t : -t) : 0;
  }

  // the robot drives a figure-eight
  const W8 = 0.075;
  const pose = t => {
    const a = t * W8;
    return [7.5 * Math.sin(a), 4 * Math.sin(2 * a), Math.atan2(8 * Math.cos(2 * a), 7.5 * Math.cos(a))];
  };

  const N = AZ * RINGS;
  const SX = new Float32Array(N), SY = new Float32Array(N), SZ = new Float32Array(N);
  const SHIT = new Int8Array(N);                    // 1 obstacle, -1 ground, 0 empty
  const SAGE = new Float32Array(N);                 // time of capture
  const MAXV = small ? 5000 : 9000, VOX = .28;
  const MX = new Float32Array(MAXV), MY = new Float32Array(MAXV), MZ = new Float32Array(MAXV);
  const voxels = new Set();
  let nv = 0;
  const TRAIL = 520, TX = new Float32Array(TRAIL), TZ = new Float32Array(TRAIL);
  let tn = 0, tHead = 0, lastTrail = -1;
  const SPIN = 0.55;                                 // revolutions per second, slowed down to be readable
  let simT = 0, lastCol = 0;

  function scanColumns(fromCol, toCol, t) {
    const [ox, oz] = pose(t);
    for (let c = fromCol; c < toCol; c++) {
      const col = c % AZ;
      const az = (col / AZ) * Math.PI * 2;
      const dx = Math.cos(az), dz = Math.sin(az);
      for (let r = 0; r < RINGS; r++) {
        const i = col * RINGS + r;
        const d = cast(ox, oz, dx, dz, TAN[r]);
        SAGE[i] = t;
        if (d === 0) { SHIT[i] = 0; continue; }
        const dist = Math.abs(d);
        const x = ox + dx * dist, z = oz + dz * dist;
        const y = d > 0 ? H + dist * TAN[r] : 0;
        SX[i] = x; SY[i] = y; SZ[i] = z; SHIT[i] = d > 0 ? 1 : -1;
        if (d > 0 && nv < MAXV) {
          const key = Math.round(x / VOX) + ',' + Math.round(y / VOX) + ',' + Math.round(z / VOX);
          if (!voxels.has(key)) { voxels.add(key); MX[nv] = x; MY[nv] = y; MZ[nv] = z; nv++; }
        }
      }
    }
  }
  function advance(t) {
    const col = Math.floor(t * SPIN * AZ);
    if (col > lastCol) { scanColumns(lastCol, Math.min(col, lastCol + AZ), t); lastCol = col; }
    if (t - lastTrail > .12) {
      const [x, z] = pose(t);
      TX[tHead] = x; TZ[tHead] = z; tHead = (tHead + 1) % TRAIL; tn = Math.min(TRAIL, tn + 1); lastTrail = t;
    }
  }
  // warm up: drive for a while so the map already has shape on first paint
  for (let t = 0; t < 26; t += 1 / 30) advance(t);
  simT = 26;

  let W = 0, Hh = 0, dpr = 1, visible = true, raf = 0, prev = 0;
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  let [camX, camZ] = pose(simT);
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth; Hh = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', () => { resize(); if (reduceMotion) draw(); });
  if (finePointer) addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });

  const hx = $('#hx'), hy = $('#hy'), ht = $('#ht'), hm = $('#hm');
  let hudT = -1;
  const sgn = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);

  const BUCKETS = 6;
  const PG = [], PH = [];
  const o = [0, 0, 0], ahead = [0, 0, 0];
  function draw() {
    mx += (tmx - mx) * .04; my += (tmy - my) * .04;
    const [px, pz, heading] = pose(simT);
    camX += (px - camX) * .03; camZ += (pz - camZ) * .03;
    ctx.clearRect(0, 0, W, Hh);

    const wide = W > 860;
    const cx = wide ? W * .6 : W * .7, cy = wide ? Hh * .48 : Hh * .2;
    const f = Math.max(W * (wide ? .62 : 1.3), Hh * .9);
    const yaw = simT * .025 + mx * .7, tilt = .62 + my * .16, R = 30;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const proj = (x, y, z, out) => {
      x -= camX; z -= camZ;
      const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw;
      const y2 = y * ct + z1 * st, z2 = -y * st + z1 * ct + R;
      if (z2 < 2) return false;
      out[0] = cx + f * x1 / z2; out[1] = cy - f * y2 / z2; out[2] = z2;
      return out[0] > -4 && out[0] < W + 4 && out[1] > -4 && out[1] < Hh + 4;
    };
    const dim = wide ? 1 : .5;
    RS = wide ? 1.3 : .75;

    // persistent map
    const map = new Path2D();
    for (let i = 0; i < nv; i++) {
      if (!proj(MX[i], MY[i], MZ[i], o)) continue;
      const s = Math.max(.8, Math.min(2.2, 30 / o[2]));
      map.rect(o[0] - s / 2, o[1] - s / 2, s, s);
    }
    ctx.fillStyle = `rgba(${groundRGB},${(.26 * dim).toFixed(3)})`;
    ctx.fill(map);

    // live scan, fading with age since capture
    for (let b = 0; b < BUCKETS; b++) { PG[b] = new Path2D(); PH[b] = new Path2D(); }
    const period = 1 / SPIN;
    for (let i = 0; i < N; i++) {
      const kind = SHIT[i];
      if (!kind) continue;
      const age = (simT - SAGE[i]) / period;        // 0 fresh … 1 one revolution old
      if (age > 1) continue;
      if (!proj(SX[i], SY[i], SZ[i], o)) continue;
      const lvl = Math.min(BUCKETS - 1, Math.floor(Math.pow(1 - age, 1.6) * BUCKETS));
      const s = Math.max(1, Math.min(2.8, 34 / o[2]));
      (kind > 0 ? PH : PG)[lvl].rect(o[0] - s / 2, o[1] - s / 2, s, s);
    }
    for (let b = 0; b < BUCKETS; b++) {
      const a = ((b + 1) / BUCKETS) * dim;
      ctx.fillStyle = `rgba(${groundRGB},${(a * .55).toFixed(3)})`; ctx.fill(PG[b]);
      ctx.fillStyle = `rgba(${hitRGB},${(a * .95).toFixed(3)})`; ctx.fill(PH[b]);
    }

    // trajectory, brighter towards the present
    if (tn > 1) {
      ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      const first = (tHead - tn + TRAIL) % TRAIL, seg = 6;
      for (let k = 0; k < tn - 1; k += seg) {
        ctx.beginPath();
        let started = false;
        for (let j = k; j <= Math.min(tn - 1, k + seg); j++) {
          const idx = (first + j) % TRAIL;
          if (!proj(TX[idx], 0, TZ[idx], o)) { started = false; continue; }
          if (started) ctx.lineTo(o[0], o[1]); else { ctx.moveTo(o[0], o[1]); started = true; }
        }
        ctx.strokeStyle = `rgba(${hitRGB},${((.06 + .64 * (k / tn)) * dim).toFixed(3)})`;
        ctx.stroke();
      }
    }

    // the robot: a small wheeled base with a spinning LiDAR puck on top
    drawRobot(px, pz, heading, proj);

    if (simT - hudT > .12 && hx) {
      hudT = simT;
      hx.textContent = sgn(px); hy.textContent = sgn(pz);
      ht.textContent = String(Math.round(((heading * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0') + '°';
      hm.textContent = nv.toLocaleString() + ' vox';
    }
  }


  /* a tiny 3D robot, drawn with painter's-order boxes in the same projection as the scan */
  let RS = 1.3;                                         // robot scale (world units are ~metres)
  const ROBOT = [
    // [fwd, right, y0, height, length, width, kind]
    [0, 0, .12, .36, 1.15, .78, 'body'],
    [.36, .45, 0, .3, .34, .13, 'wheel'], [.36, -.45, 0, .3, .34, .13, 'wheel'],
    [-.36, .45, 0, .3, .34, .13, 'wheel'], [-.36, -.45, 0, .3, .34, .13, 'wheel'],
    [-.12, 0, .48, .1, .5, .44, 'deck'],
  ];
  const LIGHT = [-.45, .8, -.4];
  const shade = (rgb, k) => rgb.map(v => Math.round(Math.min(255, v * k))).join(',');
  function drawRobot(px, pz, heading, proj) {
    const ch = Math.cos(heading), sh = Math.sin(heading);
    const W = (a, b, y) => [px + (a * ch - b * sh) * RS, y * RS, pz + (a * sh + b * ch) * RS];
    const p = [0, 0, 0];
    const P = (a, b, y) => { const w = W(a, b, y); proj(w[0], w[1], w[2], p); return [p[0], p[1], p[2]]; };
    const accent = hitRGB.split(',').map(Number);
    const dark = [30, 30, 33], deck = [42, 42, 46];

    // soft contact shadow
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const t = i / 16 * Math.PI * 2, q = P(Math.cos(t) * .78, Math.sin(t) * .55, 0);
      i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
    }
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill();

    // collect faces from every box, then draw far to near
    const faces = [];
    for (const [fa, rb, y0, h, L, Wd, kind] of ROBOT) {
      const a0 = fa - L / 2, a1 = fa + L / 2, b0 = rb - Wd / 2, b1 = rb + Wd / 2, y1 = y0 + h;
      const quads = [
        [[a0, b0, y1], [a1, b0, y1], [a1, b1, y1], [a0, b1, y1], [0, 0], 1],      // top
        [[a1, b0, y0], [a1, b1, y0], [a1, b1, y1], [a1, b0, y1], [1, 0], 0],      // front
        [[a0, b0, y0], [a0, b1, y0], [a0, b1, y1], [a0, b0, y1], [-1, 0], 0],     // back
        [[a0, b1, y0], [a1, b1, y0], [a1, b1, y1], [a0, b1, y1], [0, 1], 0],      // right
        [[a0, b0, y0], [a1, b0, y0], [a1, b0, y1], [a0, b0, y1], [0, -1], 0],     // left
      ];
      for (const [c1, c2, c3, c4, [na, nb], top] of quads) {
        const pts = [c1, c2, c3, c4].map(c => P(...c));
        const depth = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4;
        const nx = na * ch - nb * sh, nz = na * sh + nb * ch;
        const lit = top ? LIGHT[1] : nx * LIGHT[0] + nz * LIGHT[2];
        const base = kind === 'body' ? accent : kind === 'deck' ? deck : dark;
        faces.push({ pts, depth, color: shade(base, .62 + .5 * Math.max(0, lit)), front: kind === 'body' && na === 1, h: [a1, y0, y1, Wd] });
      }
    }
    faces.sort((f1, f2) => f2.depth - f1.depth);
    ctx.lineJoin = 'round';
    for (const f of faces) {
      ctx.beginPath();
      f.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.closePath();
      ctx.fillStyle = `rgb(${f.color})`; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = .6; ctx.stroke();
      if (f.front) {                                   // headlights
        ctx.fillStyle = 'rgba(255,248,230,.95)';
        for (const b of [-.24, .24]) { const q = P(f.h[0] + .01, b, f.h[1] + (f.h[2] - f.h[1]) * .55); ctx.beginPath(); ctx.arc(q[0], q[1], 1.6, 0, Math.PI * 2); ctx.fill(); }
      }
    }

    // LiDAR puck: a short cylinder on the deck
    const cy0 = .58, cy1 = .78, r = .17, ca = -.12, n = 18;
    const ring = (y) => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return P(ca + Math.cos(t) * r, Math.sin(t) * r, y); });
    const bot = ring(cy0), topR = ring(cy1);
    const sides = [];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; sides.push({ q: [bot[i], bot[j], topR[j], topR[i]], d: (bot[i][2] + bot[j][2]) / 2, k: .7 + .3 * Math.cos(i / n * Math.PI * 2 + heading - 2.4) }); }
    sides.sort((s1, s2) => s2.d - s1.d);
    for (const sd of sides) {
      ctx.beginPath(); sd.q.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
      ctx.fillStyle = `rgb(${shade([24, 24, 27], sd.k * 1.6)})`; ctx.fill();
    }
    ctx.beginPath(); topR.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
    ctx.fillStyle = 'rgb(58,58,64)'; ctx.fill();
    ctx.strokeStyle = `rgba(${hitRGB},.9)`; ctx.lineWidth = 1; ctx.stroke();

    // the beam, sweeping with the scan
    const sweep = (simT * SPIN * Math.PI * 2) % (Math.PI * 2);
    const c0 = W(ca, 0, (cy0 + cy1) / 2), from = [0, 0, 0], to = [0, 0, 0];
    proj(c0[0], c0[1], c0[2], from);
    proj(c0[0] + Math.cos(sweep) * 3.2, c0[1], c0[2] + Math.sin(sweep) * 3.2, to);
    const g = ctx.createLinearGradient(from[0], from[1], to[0], to[1]);
    g.addColorStop(0, `rgba(${hitRGB},.95)`); g.addColorStop(1, `rgba(${hitRGB},0)`);
    ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();

    // range pulse on the ground
    const g0 = [0, 0, 0];
    if (proj(px, 0, pz, g0)) {
      const ph = (simT * SPIN) % 1;
      ctx.strokeStyle = `rgba(${hitRGB},${(.5 * (1 - ph)).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(g0[0], g0[1], 14 + ph * 46, (14 + ph * 46) * .55, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function loop(now) {
    const dt = Math.min(.05, prev ? (now - prev) / 1000 : 0);
    prev = now;
    simT += dt;
    advance(simT);
    draw();
    raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  }
  resize();
  if (reduceMotion) { draw(); return; }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) { prev = 0; raf = requestAnimationFrame(loop); }
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && visible && !raf) { prev = 0; raf = requestAnimationFrame(loop); }
  });
})();
