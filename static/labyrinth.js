/* Animated circular labyrinth. Progressive enhancement: replaces the static
   fallback mark only once a canvas is known to work. */
(function () {
  'use strict';

  var host = document.getElementById('labyrinth');
  if (!host) return;

  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;

  var RINGS = 8;
  var TRACE_UNITS_PER_SECOND = 8;
  var HOLD_SECONDS = 1.4;
  var FADE_SECONDS = 1.1;
  var SOLVES_PER_MAZE = 3;
  var SPIN = 0.022; // radians per second

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  canvas.setAttribute('aria-hidden', 'true');
  host.textContent = '';
  host.appendChild(canvas);
  host.classList.add('is-live');

  // ---- maze model -------------------------------------------------------

  function ringCounts(rings) {
    var counts = [1];
    for (var r = 1; r < rings; r++) {
      if (r === 1) { counts.push(8); continue; }
      var prev = counts[r - 1];
      counts.push((2 * Math.PI * r) / prev > 1.7 ? prev * 2 : prev);
    }
    return counts;
  }

  var counts = ringCounts(RINGS);
  var rimCount = counts[counts.length - 1];

  function id(c) { return c.r + ':' + c.i; }

  function edgeKey(a, b) {
    return (a.r < b.r || (a.r === b.r && a.i <= b.i))
      ? id(a) + '|' + id(b)
      : id(b) + '|' + id(a);
  }

  function parentOf(c) {
    if (c.r <= 1) return { r: 0, i: 0 };
    return { r: c.r - 1, i: Math.floor(c.i * counts[c.r - 1] / counts[c.r]) };
  }

  function neighbors(c) {
    var out = [];
    var i;
    if (c.r === 0) {
      for (i = 0; i < counts[1]; i++) out.push({ r: 1, i: i });
      return out;
    }
    var n = counts[c.r];
    out.push({ r: c.r, i: (c.i + 1) % n });
    if (n > 2) out.push({ r: c.r, i: (c.i - 1 + n) % n });
    out.push(parentOf(c));
    if (c.r + 1 < counts.length) {
      var k = counts[c.r + 1] / n;
      for (i = 0; i < k; i++) out.push({ r: c.r + 1, i: c.i * k + i });
    }
    return out;
  }

  // Recursive backtracker: every cell reachable from the centre by one route.
  function carve() {
    var passages = Object.create(null);
    var visited = Object.create(null);
    var stack = [{ r: 0, i: 0 }];
    visited['0:0'] = true;
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var options = neighbors(cur).filter(function (n) { return !visited[id(n)]; });
      if (!options.length) { stack.pop(); continue; }
      var next = options[(Math.random() * options.length) | 0];
      passages[edgeKey(cur, next)] = true;
      visited[id(next)] = true;
      stack.push(next);
    }
    return passages;
  }

  function solve(passages, target) {
    var prev = Object.create(null);
    var queue = [{ r: 0, i: 0 }];
    prev['0:0'] = null;
    while (queue.length) {
      var cur = queue.shift();
      if (id(cur) === id(target)) break;
      var nbs = neighbors(cur);
      for (var j = 0; j < nbs.length; j++) {
        var n = nbs[j];
        if (!passages[edgeKey(cur, n)] || prev[id(n)] !== undefined) continue;
        prev[id(n)] = cur;
        queue.push(n);
      }
    }
    var path = [];
    var node = target;
    while (node) { path.unshift(node); node = prev[id(node)]; }
    return path;
  }

  // ---- geometry ---------------------------------------------------------

  function angleOf(c) { return (c.i + 0.5) * 2 * Math.PI / counts[c.r]; }

  // Follow the corridors rather than cutting chords across them.
  function tracePoints(path) {
    var pts = [{ a: 0, rad: 0 }];
    for (var i = 1; i < path.length; i++) {
      var from = path[i - 1];
      var to = path[i];
      var toA = angleOf(to);
      var toR = to.r + 0.5;
      if (from.r === to.r) {
        var fromA = pts[pts.length - 1].a;
        var delta = toA - ((fromA % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        var steps = Math.max(2, Math.ceil(Math.abs(delta) / 0.12));
        for (var s = 1; s <= steps; s++) {
          pts.push({ a: fromA + delta * (s / steps), rad: toR });
        }
      } else {
        if (from.r === 0) pts[pts.length - 1] = { a: toA, rad: 0 };
        pts.push({ a: toA, rad: toR });
      }
    }
    var last = pts[pts.length - 1];
    pts.push({ a: last.a, rad: RINGS + 0.55 }); // escape through the rim
    return pts;
  }

  function toXY(p, unit) {
    return { x: Math.cos(p.a) * p.rad * unit, y: Math.sin(p.a) * p.rad * unit };
  }

  function pathLength(pts) {
    var total = 0;
    for (var i = 1; i < pts.length; i++) {
      var a = toXY(pts[i - 1], 1);
      var b = toXY(pts[i], 1);
      total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return total;
  }

  // ---- drawing ----------------------------------------------------------

  function drawWalls(passages, exitIndex, unit) {
    ctx.beginPath();
    for (var r = 1; r < counts.length; r++) {
      var n = counts[r];
      for (var i = 0; i < n; i++) {
        var cell = { r: r, i: i };
        if (n > 2 && !passages[edgeKey(cell, { r: r, i: (i + 1) % n })]) {
          var a = (i + 1) * 2 * Math.PI / n;
          ctx.moveTo(Math.cos(a) * r * unit, Math.sin(a) * r * unit);
          ctx.lineTo(Math.cos(a) * (r + 1) * unit, Math.sin(a) * (r + 1) * unit);
        }
        if (!passages[edgeKey(cell, parentOf(cell))]) {
          var a0 = i * 2 * Math.PI / n;
          var a1 = (i + 1) * 2 * Math.PI / n;
          ctx.moveTo(Math.cos(a0) * r * unit, Math.sin(a0) * r * unit);
          ctx.arc(0, 0, r * unit, a0, a1);
        }
      }
    }
    for (var k = 0; k < rimCount; k++) {
      if (k === exitIndex) continue;
      var b0 = k * 2 * Math.PI / rimCount;
      var b1 = (k + 1) * 2 * Math.PI / rimCount;
      ctx.moveTo(Math.cos(b0) * RINGS * unit, Math.sin(b0) * RINGS * unit);
      ctx.arc(0, 0, RINGS * unit, b0, b1);
    }
    ctx.stroke();
  }

  function drawTrail(pts, unit, fraction) {
    if (fraction <= 0) return;
    var total = 0;
    var segs = [];
    for (var i = 1; i < pts.length; i++) {
      var a = toXY(pts[i - 1], unit);
      var b = toXY(pts[i], unit);
      var len = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ a: a, b: b, len: len });
      total += len;
    }
    var budget = total * fraction;
    ctx.beginPath();
    ctx.moveTo(segs[0].a.x, segs[0].a.y);
    for (var j = 0; j < segs.length && budget > 0; j++) {
      var seg = segs[j];
      if (budget >= seg.len) {
        ctx.lineTo(seg.b.x, seg.b.y);
        budget -= seg.len;
      } else {
        var t = budget / seg.len;
        ctx.lineTo(seg.a.x + (seg.b.x - seg.a.x) * t, seg.a.y + (seg.b.y - seg.a.y) * t);
        budget = 0;
      }
    }
    ctx.stroke();
  }

  // ---- state ------------------------------------------------------------

  var palette = { wall: '#d9cfba', trail: '#7d5a3c' };
  var width = 0, height = 0, unit = 0;
  var passages, exitIndex, points, traceSeconds, solves = 0;
  var phase = 'trace', elapsed = 0, spin = 0;

  function readPalette() {
    var s = getComputedStyle(document.documentElement);
    palette.wall = (s.getPropertyValue('--ink-soft') || '').trim() || palette.wall;
    palette.trail = (s.getPropertyValue('--accent') || '').trim() || palette.trail;
  }

  function nextTarget() {
    exitIndex = (Math.random() * rimCount) | 0;
    points = tracePoints(solve(passages, { r: RINGS - 1, i: exitIndex }));
    traceSeconds = pathLength(points) / TRACE_UNITS_PER_SECOND;
    phase = 'trace';
    elapsed = 0;
  }

  function newMaze() {
    passages = carve();
    solves = 0;
    nextTarget();
  }

  function resize() {
    var rect = host.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    unit = (Math.min(width, height) / 2 - 2) / (RINGS + 0.6);
    render();
  }

  function render() {
    if (!passages || unit <= 0) return;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(spin);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = palette.wall;
    ctx.lineWidth = 1.4;
    drawWalls(passages, exitIndex, unit);

    var fraction = 0;
    if (phase === 'trace') fraction = Math.min(1, elapsed / traceSeconds);
    else if (phase === 'hold' || phase === 'fade') fraction = 1;

    ctx.globalAlpha = phase === 'fade' ? 1 - elapsed / FADE_SECONDS : 1;
    ctx.strokeStyle = palette.trail;
    ctx.lineWidth = 2.6;
    drawTrail(points, unit, fraction);

    ctx.restore();
  }

  var lastFrame = 0;
  var running = false;

  function frame(now) {
    if (!running) return;
    var dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
    lastFrame = now;
    elapsed += dt;
    spin += SPIN * dt;

    if (phase === 'trace' && elapsed >= traceSeconds) { phase = 'hold'; elapsed = 0; }
    else if (phase === 'hold' && elapsed >= HOLD_SECONDS) { phase = 'fade'; elapsed = 0; }
    else if (phase === 'fade' && elapsed >= FADE_SECONDS) {
      if (++solves >= SOLVES_PER_MAZE) newMaze();
      else nextTarget();
    }

    render();
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    lastFrame = 0;
    requestAnimationFrame(frame);
  }

  function stop() { running = false; }

  readPalette();
  newMaze();
  resize();

  if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
  else window.addEventListener('resize', resize);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  if (window.matchMedia) {
    var scheme = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () { readPalette(); render(); };
    if (scheme.addEventListener) scheme.addEventListener('change', onScheme);
    else if (scheme.addListener) scheme.addListener(onScheme);
  }

  if (reduceMotion) render(); else start();
})();
