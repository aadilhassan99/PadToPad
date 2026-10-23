/* Pad to Pad: canvas game engine. No React in here; the component only mounts a canvas and calls createGame. */

export type Dir = "left" | "right" | "up" | "down";

export interface GameHandle {
  /** Press or release a control (used by the touch buttons). */
  press(dir: Dir, down: boolean): void;
  /** Remove listeners and stop the animation loop. */
  destroy(): void;
}

interface Pad { x: number; w: number; y: number; kind: "start" | "target" }
interface Tree { x: number; h: number; shade: number }
interface World { L: number; pads: Pad[]; ys: Float32Array; n: number; trees: Tree[]; windPh: number; par: number }
type HeliState = "landed" | "flying" | "crashed" | "won";
interface Heli {
  x: number; y: number; vx: number; vy: number; a: number; dir: 1 | -1;
  col: number; spin: number; phase: number; state: HeliState; pad: Pad | null; fuel: number; started: boolean;
}
type PartKind = "fire" | "smoke" | "spark" | "dust";
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; t: PartKind; g: number }
interface Stats { vy: number; vx: number; ang: number; score: number; time: number; fuel: number; rating: string; best: number; newBest: boolean }
interface Pt { x: number; y: number; t: "s" | "b" }
type Mode = "ready" | "play" | "crashed" | "won";

const W = 960, H = 540, G = 420, SK = 21, STEP = 10;
const LIM = { vy: 95, vx: 70, ang: 0.3 };
const C = { signal: "#ff5a36", lamp: "#ffd166", go: "#5ee0a0", paper: "#f2e8da", haze: "#8d97b8", ink: "#0e1424" };
const DISPLAY = '"Big Shoulders Display", Impact, "Arial Narrow", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

function rng(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWorld(lv: number): World {
  const r = rng(lv * 7919 + 13);
  const L = 5200 + Math.min(lv - 1, 7) * 1400;
  const A = 48 + Math.min(lv, 7) * 16;
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  const padW = Math.max(104, 150 - lv * 7);
  const pads: Pad[] = [
    { x: 260, w: 150, kind: "start", y: 0 },
    { x: L - 320, w: padW, kind: "target", y: 0 },
  ];
  const peaks: { c: number; h: number; w: number }[] = [];
  const np = 2 + Math.min(lv, 6);
  for (let i = 0; i < np; i++) peaks.push({ c: 900 + r() * (L - 1900), h: 110 + r() * (50 + lv * 22), w: 200 + r() * 220 });
  const n = Math.ceil(L / STEP) + 2;
  const ys = new Float32Array(n);
  const raw = (x: number) => {
    let y = 430 + A * (0.55 * Math.sin(x * 0.0021 + ph[0]) + 0.3 * Math.sin(x * 0.0057 + ph[1]) + 0.15 * Math.sin(x * 0.013 + ph[2]));
    for (const p of peaks) { const d = (x - p.c) / p.w; y -= p.h * Math.exp(-d * d); }
    return y;
  };
  for (let i = 0; i < n; i++) ys[i] = clamp(raw(i * STEP), 170, 520);
  const blend = 100;
  for (const p of pads) {
    p.y = clamp(raw(p.x), 280, 500);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(i * STEP - p.x) - (p.w / 2 + 8);
      if (d <= 0) ys[i] = p.y;
      else if (d < blend) ys[i] = p.y + (ys[i] - p.y) * smooth(d / blend);
    }
  }
  const r2 = rng(lv * 104729 + 7);
  const trees: Tree[] = [];
  for (let x = 60; x < L; x += 40 + r2() * 70) {
    let near = false;
    for (const p of pads) if (Math.abs(x - p.x) < p.w / 2 + 80) near = true;
    const h = 22 + r2() * 34, shade = r2();
    if (!near) trees.push({ x, h, shade });
  }
  return { L, pads, ys, n, trees, windPh: r() * 6.28, par: L / 200 };
}

function fmtTime(t: number) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return String(m).padStart(2, "0") + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
}

export function createGame(cv: HTMLCanvasElement): GameHandle {
  const ctx = cv.getContext("2d");
  if (!ctx) return { press() {}, destroy() {} };
  const g2 = ctx; // non-null alias for closures
  const RM = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  let scale = 1;
  function resize() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(320, Math.round(r.width * dpr));
    cv.height = Math.round((cv.width * H) / W);
    scale = cv.width / W;
  }
  window.addEventListener("resize", resize);
  resize();
  try {
    document.fonts?.load('900 20px "Big Shoulders Display"');
    document.fonts?.load('700 20px "Big Shoulders Display"');
    document.fonts?.load('500 12px "IBM Plex Mono"');
  } catch { /* fonts fall back */ }

  /* ---------- state ---------- */
  let level = 1;
  let world: World = buildWorld(level);
  const NOKEYS: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };
  const keys: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };
  let mode: Mode = "ready";
  let hel!: Heli;
  let parts: Part[] = [];
  let time = 0, runTime = 0, shake = 0, wind = 0, landTimer = 0;
  let camX = 0, camY = 0, crashWhy = "", stats: Stats | null = null, muted = false;

  const stars: { x: number; y: number; s: number; tw: number }[] = [];
  { const r = rng(99); for (let i = 0; i < 90; i++) stars.push({ x: r() * W, y: r() * 300, s: r() * 1.3 + 0.4, tw: r() * 6 }); }
  const clouds: { x: number; y: number; w: number }[] = [];
  { const r = rng(5); for (let i = 0; i < 8; i++) clouds.push({ x: r() * (W + 400), y: 60 + r() * 170, w: 120 + r() * 160 }); }

  function groundY(x: number) {
    const f = clamp(x / STEP, 0, world.n - 1.001);
    const i = Math.floor(f);
    return lerp(world.ys[i], world.ys[i + 1], f - i);
  }

  function reset(intro: boolean) {
    world = buildWorld(level);
    const p = world.pads[0];
    hel = { x: p.x, y: p.y - SK - 1, vx: 0, vy: 0, a: 0, dir: 1, col: 0.2, spin: 0, phase: 0, state: "landed", pad: p, fuel: 100, started: false };
    parts = []; runTime = 0; landTimer = 0; shake = 0; stats = null; crashWhy = "";
    mode = intro ? "ready" : "play";
    camX = hel.x - W * 0.42; camY = 0;
  }

  const bestKey = () => "padtopad.best." + level;
  function getBest() { try { return +(localStorage.getItem(bestKey()) || 0) || 0; } catch { return 0; } }
  function setBest(v: number) { try { localStorage.setItem(bestKey(), String(v)); } catch { /* ignore */ } }

  /* ---------- sound ---------- */
  interface Audio { a: AudioContext; master: GainNode; o: OscillatorNode; g: GainNode; lg: GainNode; lfo: OscillatorNode }
  let au: Audio | null = null;
  function audioInit() {
    if (au) { try { void au.a.resume(); } catch { /* ignore */ } return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const a = new AC();
      const master = a.createGain(); master.gain.value = muted ? 0 : 1; master.connect(a.destination);
      const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.value = 46;
      const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 320;
      const g = a.createGain(); g.gain.value = 0;
      const lfo = a.createOscillator(); lfo.frequency.value = 13;
      const lg = a.createGain(); lg.gain.value = 0;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(f); f.connect(g); g.connect(master);
      o.start(); lfo.start();
      au = { a, master, o, g, lg, lfo };
    } catch { au = null; }
  }
  function audioUpdate() {
    if (!au) return;
    try {
      const h = hel, t = au.a.currentTime;
      const on = mode === "play" && (h.state === "flying" || h.state === "landed");
      const v = on ? (0.05 + 0.07 * h.col) * h.spin : 0;
      au.g.gain.setTargetAtTime(v * 0.55, t, 0.06);
      au.lg.gain.setTargetAtTime(v * 0.45, t, 0.06);
      au.o.frequency.setTargetAtTime(40 + 22 * h.col * h.spin, t, 0.1);
      au.lfo.frequency.setTargetAtTime(10 + 6 * h.col, t, 0.1);
    } catch { /* ignore */ }
  }
  function boomSound() {
    if (!au) return;
    try {
      const a = au.a, len = (a.sampleRate * 0.9) | 0;
      const b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
      const s = a.createBufferSource(); s.buffer = b;
      const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
      const g = a.createGain(); g.gain.value = 0.5;
      s.connect(f); f.connect(g); g.connect(au.master); s.start();
    } catch { /* ignore */ }
  }
  function chime() {
    if (!au) return;
    try {
      const a = au.a, master = au.master;
      [660, 880].forEach((fq, i) => {
        const o = a.createOscillator(); o.type = "sine"; o.frequency.value = fq;
        const g = a.createGain(); const t0 = a.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
        o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.75);
      });
    } catch { /* ignore */ }
  }

  /* ---------- particles ---------- */
  function puff(x: number, y: number, vx: number, vy: number, life: number, r: number, t: PartKind, g?: number) {
    parts.push({ x, y, vx, vy, life, max: life, r, t, g: g || 0 });
  }
  function boom(x: number, y: number) {
    for (let i = 0; i < 48; i++) { const a = Math.random() * 6.283, s = 40 + Math.random() * 220; puff(x, y, Math.cos(a) * s, Math.sin(a) * s - 40, 0.5 + Math.random() * 0.7, 4 + Math.random() * 9, "fire", 120); }
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, s = 30 + Math.random() * 110; puff(x, y, Math.cos(a) * s, Math.sin(a) * s - 60, 1.6 + Math.random() * 1.6, 8 + Math.random() * 10, "smoke", -20); }
    for (let i = 0; i < 16; i++) { const a = -Math.random() * 3.14, s = 120 + Math.random() * 260; puff(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.9 + Math.random() * 0.8, 2.5, "spark", 520); }
  }

  /* ---------- helicopter geometry ---------- */
  function pts(h: Heli): Pt[] {
    const c = Math.cos(h.a), s = Math.sin(h.a);
    const P = (lx: number, ly: number, t: "s" | "b"): Pt => { const x = lx * h.dir; return { x: h.x + x * c - ly * s, y: h.y + x * s + ly * c, t }; };
    return [P(-17, SK, "s"), P(17, SK, "s"), P(34, 8, "b"), P(-58, -6, "b"), P(-36, -26, "b"), P(36, -26, "b"), P(0, 14, "b")];
  }

  function crash(why: string) {
    const h = hel;
    h.state = "crashed"; mode = "crashed"; crashWhy = why; h.vx = 0; h.vy = 0;
    shake = RM ? 0 : 1;
    boom(h.x, h.y); boomSound();
  }

  function win() {
    const h = hel;
    if (!stats) return;
    mode = "won"; h.state = "won";
    const bonusTime = Math.max(0, world.par - runTime) * 25;
    const bonusFuel = h.fuel * 10;
    const bonusSoft = Math.max(0, LIM.vy - stats.vy) * 4;
    stats.score = Math.round(bonusTime + bonusFuel + bonusSoft);
    stats.time = runTime; stats.fuel = h.fuel;
    stats.rating = stats.vy < 35 ? "Butter smooth" : stats.vy < 65 ? "Clean landing" : "Firm but safe";
    const best = getBest();
    stats.best = Math.max(best, stats.score);
    stats.newBest = stats.score > best;
    if (stats.newBest) setBest(stats.score);
    chime();
  }

  /* ---------- simulation ---------- */
  function step(dt: number) {
    const h = hel;
    time += dt;
    wind = level > 1 ? Math.sin(time * 0.35 + world.windPh) * Math.min(level - 1, 5) * 9 : 0;
    const alive = mode === "play";
    const inp = alive ? keys : NOKEYS;

    const spinT = h.state === "crashed" || h.state === "won" ? 0 : mode === "ready" ? 0.2 : 1;
    h.spin += (spinT - h.spin) * Math.min(1, (spinT > h.spin ? 1.2 : 0.8) * dt);
    h.phase += h.spin * 55 * dt;

    if (alive) {
      if (inp.right && !inp.left) h.dir = 1; else if (inp.left && !inp.right) h.dir = -1;
      let ct = 0.5;
      if (inp.up) ct = 0.9; else if (inp.down) ct = 0.2;
      if (h.state === "landed" && !inp.up) ct = 0.2;
      if (h.fuel <= 0) ct = 0;
      const rate = inp.up || inp.down ? 1.5 : 1.8;
      h.col += clamp(ct - h.col, -rate * dt, rate * dt);
      if (h.started) runTime += dt;

      if (h.state === "landed") {
        if (h.pad) h.fuel = Math.min(100, h.fuel + 22 * dt);
        if (h.col > 0.52 && h.fuel > 0) { h.state = "flying"; h.started = true; h.pad = null; h.y -= 1.5; h.vy = -8; landTimer = 0; }
        else if (h.pad && h.pad.kind === "target") { landTimer += dt; if (landTimer > 0.9) win(); }
      }

      if (h.state === "flying") {
        const tgt = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * 0.4;
        h.a += (tgt - h.a) * Math.min(1, 3.5 * dt);
        const thrust = G * 2 * h.col;
        const ax = Math.sin(h.a) * thrust + wind - 0.5 * h.vx;
        const ay = G - Math.cos(h.a) * thrust - 0.9 * h.vy;
        h.vx += ax * dt; h.vy += ay * dt;
        const height = groundY(h.x) - (h.y + SK);
        if (height < 34 && h.vy > 0) h.vy *= 1 - 2.2 * dt;
        h.fuel = Math.max(0, h.fuel - (0.9 + 1.6 * h.col) * dt);
        h.x += h.vx * dt; h.y += h.vy * dt;
        if (h.x < 40) { h.x = 40; h.vx = Math.max(0, h.vx); }
        if (h.x > world.L - 40) { h.x = world.L - 40; h.vx = Math.min(0, h.vx); }
        if (h.y < -320) { h.y = -320; h.vy = Math.max(0, h.vy); }

        const P = pts(h);
        let bodyHit = false; const sk: Pt[] = [];
        for (const p of P) if (p.y >= groundY(p.x) - 0.4) { if (p.t === "s") sk.push(p); else bodyHit = true; }
        if (bodyHit) { crash(h.fuel <= 0 ? "Out of fuel." : "The fuselage or rotor hit the ground."); }
        else if (sk.length) {
          const sl = [P[0], P[1]].sort((p, q) => p.x - q.x);
          const gl = groundY(sl[0].x), gr = groundY(sl[1].x);
          let why: string | null = null;
          if (h.vy > LIM.vy) why = "Came down too fast.";
          else if (Math.abs(h.vx) > LIM.vx) why = "Too much sideways speed.";
          else if (Math.abs(h.a) > LIM.ang) why = "Touched down tilted over.";
          else if (Math.abs(gl - gr) > 14) why = "The slope was too steep for the skids.";
          if (why) crash(why);
          else {
            const td = { vy: Math.max(0, h.vy), vx: Math.abs(h.vx), ang: Math.abs(h.a), score: 0, time: 0, fuel: 0, rating: "", best: 0, newBest: false };
            h.a = Math.atan2(gr - gl, sl[1].x - sl[0].x);
            const Q = pts(h);
            h.y += Math.min(groundY(Q[0].x) - Q[0].y, groundY(Q[1].x) - Q[1].y);
            h.vx = 0; h.vy = 0; h.state = "landed"; h.pad = null; landTimer = 0;
            const Q2 = pts(h);
            for (const p of world.pads) {
              const lo = p.x - p.w / 2, hi = p.x + p.w / 2;
              if (Q2[0].x >= lo && Q2[0].x <= hi && Q2[1].x >= lo && Q2[1].x <= hi) h.pad = p;
            }
            stats = td;
          }
        }
      }
    }

    // ground dust under the rotor wash
    if ((h.state === "flying" || h.state === "landed") && mode === "play" && h.col > 0.5) {
      const gy = groundY(h.x), height = gy - (h.y + SK);
      if (height < 80 && Math.random() < 0.8) {
        const sd = Math.random() < 0.5 ? -1 : 1;
        puff(h.x + (Math.random() - 0.5) * 50, gy - 1, sd * (70 + Math.random() * 110), -Math.random() * 24, 0.55, 3 + Math.random() * 4, "dust", 0);
      }
    }
    if (mode === "crashed" && Math.random() < 0.35) puff(h.x + (Math.random() - 0.5) * 30, h.y - 6, (Math.random() - 0.5) * 20, -40 - Math.random() * 30, 1.6, 7, "smoke", -10);

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t === "smoke") { p.r += dt * 14; p.vx *= 1 - dt; }
      if (p.t === "dust") { p.vx *= 1 - 2 * dt; }
    }
    shake = Math.max(0, shake - dt * 1.6);
  }

  /* ---------- drawing ---------- */
  function text(str: string, x: number, y: number, font: string, color: string, align?: CanvasTextAlign) {
    g2.font = font; g2.fillStyle = color; g2.textAlign = align || "left"; g2.textBaseline = "alphabetic";
    g2.fillText(str, x, y);
  }
  function rr(x: number, y: number, w: number, h: number, r: number) {
    g2.beginPath();
    g2.moveTo(x + r, y); g2.lineTo(x + w - r, y); g2.quadraticCurveTo(x + w, y, x + w, y + r);
    g2.lineTo(x + w, y + h - r); g2.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g2.lineTo(x + r, y + h); g2.quadraticCurveTo(x, y + h, x, y + h - r);
    g2.lineTo(x, y + r); g2.quadraticCurveTo(x, y, x + r, y); g2.closePath();
  }

  function drawSky() {
    const g = g2.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0d1630"); g.addColorStop(0.35, "#26356a"); g.addColorStop(0.6, "#7a4d86");
    g.addColorStop(0.78, "#e27a6a"); g.addColorStop(0.92, "#ffb870");
    g2.fillStyle = g; g2.fillRect(0, 0, W, H);
    for (const s of stars) {
      const x = (((s.x - camX * 0.02) % W) + W) % W, y = s.y - camY * 0.05;
      const a = (0.35 + 0.35 * Math.sin(time * 1.5 + s.tw)) * Math.max(0, 1 - s.y / 320);
      if (a <= 0.02) continue;
      g2.fillStyle = "rgba(255,244,225," + a.toFixed(3) + ")";
      g2.fillRect(x, y, s.s, s.s);
    }
    const sx = W * 0.7 - camX * 0.01, sy = 392 - camY * 0.12;
    const sg = g2.createRadialGradient(sx, sy, 6, sx, sy, 150);
    sg.addColorStop(0, "rgba(255,226,170,0.55)"); sg.addColorStop(1, "rgba(255,184,112,0)");
    g2.fillStyle = sg; g2.fillRect(sx - 150, sy - 150, 300, 300);
    g2.fillStyle = "#ffe4ae"; g2.beginPath(); g2.arc(sx, sy, 40, 0, 6.283); g2.fill();
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      const x = ((((c.x - camX * 0.18 - time * 6) % (W + 400)) + (W + 400)) % (W + 400)) - 200, y = c.y - camY * 0.1;
      g2.fillStyle = i % 2 ? "rgba(255,196,170,0.10)" : "rgba(255,214,190,0.15)";
      g2.beginPath(); g2.ellipse(x, y, c.w * 0.5, 14, 0, 0, 6.283); g2.fill();
      g2.beginPath(); g2.ellipse(x + c.w * 0.22, y - 9, c.w * 0.28, 12, 0, 0, 6.283); g2.fill();
      g2.beginPath(); g2.ellipse(x - c.w * 0.2, y - 6, c.w * 0.25, 10, 0, 0, 6.283); g2.fill();
    }
  }

  function ridge(par: number, base: number, a1: number, f1: number, a2: number, f2: number, ph: number, color: string) {
    g2.fillStyle = color; g2.beginPath(); g2.moveTo(0, H + 40);
    const oy = base - camY * par * 0.25;
    for (let sx = 0; sx <= W + 8; sx += 8) {
      const wx = sx + camX * par;
      const y = oy - (Math.pow(Math.abs(Math.sin(wx * f1 + ph)), 1.4) * a1 + Math.abs(Math.sin(wx * f2 + ph * 2)) * a2);
      g2.lineTo(sx, y);
    }
    g2.lineTo(W, H + 40); g2.closePath(); g2.fill();
  }

  function drawTerrain() {
    const i0 = Math.max(0, Math.floor(camX / STEP) - 2), i1 = Math.min(world.n - 1, Math.ceil((camX + W) / STEP) + 2);
    g2.beginPath();
    g2.moveTo(i0 * STEP - camX, world.ys[i0] - camY);
    for (let i = i0 + 1; i <= i1; i++) g2.lineTo(i * STEP - camX, world.ys[i] - camY);
    g2.lineTo(i1 * STEP - camX, H + 900); g2.lineTo(i0 * STEP - camX, H + 900); g2.closePath();
    g2.fillStyle = "#1c2d2b"; g2.fill();
    const sh = g2.createLinearGradient(0, 330, 0, H);
    sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,0.38)");
    g2.fillStyle = sh; g2.fill();
    g2.beginPath();
    g2.moveTo(i0 * STEP - camX, world.ys[i0] - camY);
    for (let i = i0 + 1; i <= i1; i++) g2.lineTo(i * STEP - camX, world.ys[i] - camY);
    g2.strokeStyle = "#c97b5a"; g2.lineWidth = 2; g2.stroke();
  }

  function drawTrees() {
    for (const t of world.trees) {
      const sx = t.x - camX; if (sx < -30 || sx > W + 30) continue;
      const y = groundY(t.x) - camY + 2;
      g2.fillStyle = t.shade < 0.5 ? "#163029" : "#1b3a33";
      g2.beginPath(); g2.moveTo(sx - t.h * 0.28, y); g2.lineTo(sx, y - t.h); g2.lineTo(sx + t.h * 0.28, y); g2.closePath(); g2.fill();
      g2.beginPath(); g2.moveTo(sx - t.h * 0.22, y - t.h * 0.35); g2.lineTo(sx, y - t.h * 1.18); g2.lineTo(sx + t.h * 0.22, y - t.h * 0.35); g2.closePath(); g2.fill();
    }
  }

  function drawPads() {
    for (const p of world.pads) {
      const sx = p.x - camX; if (sx < -200 || sx > W + 200) continue;
      const y = p.y - camY, lo = sx - p.w / 2, tgt = p.kind === "target";
      if (tgt) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 3);
        const bg = g2.createLinearGradient(0, y - 700, 0, y);
        bg.addColorStop(0, "rgba(94,224,160,0)"); bg.addColorStop(1, "rgba(94,224,160," + (0.16 + 0.1 * pulse).toFixed(3) + ")");
        g2.fillStyle = bg; g2.fillRect(sx - p.w / 2, y - 700, p.w, 700);
      }
      g2.fillStyle = "#0f1a1a"; g2.fillRect(lo - 4, y + 6, p.w + 8, 16);
      g2.fillStyle = "#5a6482"; g2.fillRect(lo, y - 1, p.w, 10);
      g2.fillStyle = tgt ? C.go : C.lamp; g2.fillRect(lo, y - 3, p.w, 3);
      const lit = tgt ? Math.sin(time * 5) > 0 : true;
      for (const ex of [lo + 4, lo + p.w - 4]) {
        g2.fillStyle = lit ? (tgt ? C.go : C.lamp) : "#2d4a40";
        g2.beginPath(); g2.arc(ex, y - 6, 3, 0, 6.283); g2.fill();
      }
      const px = lo - 22;
      g2.fillStyle = "#39415c"; g2.fillRect(px - 1.5, y - 46, 3, 46);
      g2.fillStyle = C.ink; rr(px - 14, y - 66, 28, 22, 4); g2.fill();
      g2.lineWidth = 2; g2.strokeStyle = tgt ? C.go : C.lamp; rr(px - 14, y - 66, 28, 22, 4); g2.stroke();
      text("H", px, y - 49, "900 18px " + DISPLAY, "#f2e8da", "center");
      if (tgt) {
        const wx = sx + p.w / 2 + 34, gy = groundY(p.x + p.w / 2 + 34) - camY;
        g2.fillStyle = "#39415c"; g2.fillRect(wx - 1.5, gy - 52, 3, 54);
        const s = Math.min(1, Math.abs(wind) / 28), dirw = wind >= 0 ? 1 : -1;
        const ang = (1 - s) * 1.25 + Math.sin(time * 6) * 0.05 * s;
        let ox = wx, oy = gy - 52;
        for (let k = 0; k < 3; k++) {
          const nx = ox + dirw * 11 * Math.cos(ang), ny = oy + 11 * Math.sin(ang);
          g2.strokeStyle = k % 2 ? "#f2e8da" : C.signal; g2.lineWidth = 9 - k * 2; g2.lineCap = "butt";
          g2.beginPath(); g2.moveTo(ox, oy); g2.lineTo(nx, ny); g2.stroke();
          ox = nx; oy = ny;
        }
      }
    }
  }

  function drawHeli() {
    const h = hel, gy = groundY(h.x), height = gy - (h.y + SK);
    const sw = 38 * clamp(1 - height / 420, 0.25, 1);
    g2.fillStyle = "rgba(0,0,0," + (0.28 * clamp(1 - height / 420, 0.15, 1)).toFixed(3) + ")";
    g2.beginPath(); g2.ellipse(h.x - camX, gy - camY + 2, sw, 4, 0, 0, 6.283); g2.fill();

    g2.save();
    g2.translate(h.x - camX, h.y - camY); g2.rotate(h.a); g2.scale(h.dir, 1);
    const dead = h.state === "crashed";
    const body = dead ? "#3a2a2a" : C.signal, dark = dead ? "#241a1a" : "#c93a1c";
    g2.fillStyle = dark;
    g2.beginPath(); g2.moveTo(-12, -8); g2.lineTo(-56, -12); g2.lineTo(-58, -6); g2.lineTo(-12, 4); g2.closePath(); g2.fill();
    g2.beginPath(); g2.moveTo(-50, -10); g2.lineTo(-62, -27); g2.lineTo(-55, -27); g2.lineTo(-45, -10); g2.closePath(); g2.fill();
    g2.strokeStyle = "rgba(242,232,218,0.85)"; g2.lineWidth = 2;
    const ta = h.phase * 1.7;
    g2.beginPath(); g2.moveTo(-60 + Math.cos(ta) * 9, -19 + Math.sin(ta) * 9); g2.lineTo(-60 - Math.cos(ta) * 9, -19 - Math.sin(ta) * 9); g2.stroke();
    g2.strokeStyle = "#d9d2c6"; g2.lineWidth = 3; g2.lineCap = "round";
    g2.beginPath(); g2.moveTo(-26, SK - 1); g2.lineTo(26, SK - 1); g2.stroke();
    g2.lineWidth = 2.5;
    g2.beginPath(); g2.moveTo(-14, 11); g2.lineTo(-17, SK - 1); g2.moveTo(14, 11); g2.lineTo(17, SK - 1); g2.stroke();
    g2.fillStyle = body; g2.beginPath(); g2.ellipse(0, 0, 29, 17, 0, 0, 6.283); g2.fill();
    g2.fillStyle = dark; g2.beginPath(); g2.ellipse(0, 6, 27, 9, 0, 0, Math.PI); g2.fill();
    g2.strokeStyle = dead ? "#554040" : "#f2e8da"; g2.lineWidth = 2;
    g2.beginPath(); g2.ellipse(0, 0, 28, 15.5, 0, 0.35, 2.4); g2.stroke();
    g2.fillStyle = dead ? "#1a1a1f" : "#16263f";
    g2.beginPath(); g2.ellipse(11, -3, 15, 10, -0.12, 0, 6.283); g2.fill();
    g2.fillStyle = "rgba(127,180,214,0.55)"; g2.beginPath(); g2.ellipse(14, -6, 7, 3.5, -0.4, 0, 6.283); g2.fill();
    g2.fillStyle = "#2a2f40"; g2.fillRect(-2, -24, 4, 8);
    const tip = 48 * Math.cos(h.phase);
    g2.fillStyle = "rgba(242,232,218," + (0.16 * h.spin).toFixed(3) + ")";
    g2.beginPath(); g2.ellipse(0, -24, 50, 3.5, 0, 0, 6.283); g2.fill();
    g2.strokeStyle = "rgba(242,232,218,0.92)"; g2.lineWidth = 3;
    g2.beginPath(); g2.moveTo(-tip, -24); g2.lineTo(tip, -24); g2.stroke();
    g2.restore();
  }

  function drawParts() {
    for (const p of parts) {
      const t = p.life / p.max, x = p.x - camX, y = p.y - camY;
      if (p.t === "fire") { g2.fillStyle = "rgba(255," + ((90 + 150 * t) | 0) + ",40," + t.toFixed(3) + ")"; g2.beginPath(); g2.arc(x, y, p.r * (0.4 + t), 0, 6.283); g2.fill(); }
      else if (p.t === "smoke") { g2.fillStyle = "rgba(40,36,44," + (0.5 * t).toFixed(3) + ")"; g2.beginPath(); g2.arc(x, y, p.r, 0, 6.283); g2.fill(); }
      else if (p.t === "dust") { g2.fillStyle = "rgba(216,170,140," + (0.35 * t).toFixed(3) + ")"; g2.beginPath(); g2.arc(x, y, p.r, 0, 6.283); g2.fill(); }
      else { g2.fillStyle = "rgba(255,209,102," + t.toFixed(3) + ")"; g2.fillRect(x, y, p.r, p.r); }
    }
  }

  function drawHud() {
    const h = hel, tgt = world.pads[1];
    const alt = Math.max(0, groundY(h.x) - (h.y + SK)) / 10;
    g2.fillStyle = "rgba(10,16,32,0.66)"; rr(14, 14, 262, 86, 6); g2.fill();
    const cols = [
      { l: "ALT m", v: alt.toFixed(1), bad: false },
      { l: h.vy >= 0 ? "SINK m/s" : "CLIMB m/s", v: (Math.abs(h.vy) / 10).toFixed(1), bad: h.vy > LIM.vy },
      { l: "SPEED m/s", v: (Math.abs(h.vx) / 10).toFixed(1), bad: Math.abs(h.vx) > LIM.vx },
      { l: "TILT deg", v: String(Math.round(Math.abs(h.a) * 57.3)), bad: Math.abs(h.a) > LIM.ang },
    ];
    cols.forEach((c, i) => {
      const x = 26 + i * 62;
      text(c.l, x, 34, "500 9px " + MONO, C.haze);
      text(c.v, x, 62, "900 26px " + DISPLAY, c.bad ? C.signal : C.paper);
    });
    text("FUEL", 26, 90, "500 9px " + MONO, C.haze);
    g2.fillStyle = "rgba(141,151,184,0.25)"; rr(60, 82, 204, 8, 4); g2.fill();
    const f = h.fuel / 100;
    g2.fillStyle = f < 0.15 ? C.signal : f < 0.3 ? C.lamp : C.go;
    if (f > 0.01) { rr(60, 82, 204 * f, 8, 4); g2.fill(); }

    const rx = W - 14 - 276;
    g2.fillStyle = "rgba(10,16,32,0.66)"; rr(rx, 14, 276, 86, 6); g2.fill();
    text("LEVEL " + String(level).padStart(2, "0"), rx + 12, 36, "900 18px " + DISPLAY, C.paper);
    text(fmtTime(runTime), rx + 264, 35, "500 13px " + MONO, C.paper, "right");
    const mx = rx + 12, mw = 252, my = 44, mh = 28;
    g2.strokeStyle = "rgba(141,151,184,0.7)"; g2.lineWidth = 1.2; g2.beginPath();
    for (let i = 0; i <= 84; i++) {
      const wx = (i / 84) * world.L, yy = my + ((groundY(wx) + 300) / 840) * mh;
      if (i === 0) g2.moveTo(mx, yy); else g2.lineTo(mx + (i / 84) * mw, yy);
    }
    g2.stroke();
    for (const p of world.pads) {
      const px = mx + (p.x / world.L) * mw, py = my + ((p.y + 300) / 840) * mh;
      g2.fillStyle = p.kind === "target" ? C.go : C.lamp; g2.fillRect(px - 3, py - 3, 6, 3);
    }
    g2.fillStyle = C.signal; g2.beginPath();
    g2.arc(mx + clamp(h.x / world.L, 0, 1) * mw, my + clamp((h.y + 300) / 840, 0, 1) * mh, 3, 0, 6.283); g2.fill();
    const d = (tgt.x - h.x) / 10, on = Math.abs(tgt.x - h.x) < tgt.w / 2;
    text("TARGET", rx + 12, 92, "500 9px " + MONO, C.haze);
    text(on ? "OVER THE PAD" : Math.abs(d).toFixed(0) + " m " + (d > 0 ? "→" : "←"), rx + 264, 93, "700 16px " + DISPLAY, on ? C.go : C.paper, "right");

    const tsx = tgt.x - camX;
    if (tsx > W - 16 || tsx < 16) {
      const right = tsx > W / 2, ax = right ? W - 20 : 20, ay = H * 0.46, s = right ? 1 : -1;
      g2.fillStyle = C.go; g2.beginPath(); g2.moveTo(ax + 10 * s, ay); g2.lineTo(ax - 8 * s, ay - 11); g2.lineTo(ax - 8 * s, ay + 11); g2.closePath(); g2.fill();
      text("TARGET", ax - 16 * s, ay + 4, "500 10px " + MONO, C.go, right ? "right" : "left");
    }
    if (h.state === "landed" && h.pad && h.pad.kind === "start" && !h.started) text("Hold ↑ to lift off", W / 2, H - 22, "500 12px " + MONO, C.paper, "center");
    if (h.fuel <= 0 && mode === "play") text("OUT OF FUEL", W / 2, 140, "900 30px " + DISPLAY, C.signal, "center");
  }

  function dim(a: number) { g2.fillStyle = "rgba(8,12,26," + a + ")"; g2.fillRect(0, 0, W, H); }
  function drawOverlay() {
    if (mode === "ready") {
      dim(0.5);
      text("PAD TO PAD", W / 2, 226, "900 96px " + DISPLAY, C.paper, "center");
      text("Lift off from the first pad. Land on the glowing one.", W / 2, 266, "400 15px " + MONO, C.haze, "center");
      g2.fillStyle = C.signal; rr(W / 2 - 150, 296, 300, 44, 6); g2.fill();
      text("Press an arrow key or tap to fly", W / 2, 324, "500 14px " + MONO, C.ink, "center");
      text("↑ lift   ↓ sink   ← → tilt", W / 2, 372, "500 13px " + MONO, C.haze, "center");
    } else if (mode === "crashed") {
      dim(0.42);
      text("CRASHED", W / 2, 238, "900 84px " + DISPLAY, C.signal, "center");
      text(crashWhy, W / 2, 274, "400 15px " + MONO, C.paper, "center");
      text("Press Enter or tap to try again", W / 2, 314, "500 13px " + MONO, C.haze, "center");
    } else if (mode === "won" && stats) {
      dim(0.5);
      text("TOUCHDOWN", W / 2, 168, "900 84px " + DISPLAY, C.go, "center");
      text(stats.rating, W / 2, 200, "400 15px " + MONO, C.paper, "center");
      const rows: [string, string][] = [["Time", fmtTime(stats.time)], ["Fuel left", stats.fuel.toFixed(0) + "%"], ["Touchdown", (stats.vy / 10).toFixed(1) + " m/s"], ["Score", String(stats.score)]];
      rows.forEach((r, i) => {
        const y = 246 + i * 30;
        text(r[0], W / 2 - 120, y, "400 13px " + MONO, C.haze);
        text(r[1], W / 2 + 120, y + 2, i === 3 ? "900 26px " + DISPLAY : "500 14px " + MONO, i === 3 ? C.lamp : C.paper, "right");
      });
      text(stats.newBest ? "New best for this level" : "Best for this level: " + stats.best, W / 2, 380, "500 12px " + MONO, stats.newBest ? C.go : C.haze, "center");
      g2.fillStyle = C.go; rr(W / 2 - 150, 398, 300, 44, 6); g2.fill();
      text("Enter or tap for level " + (level + 1), W / 2, 426, "500 14px " + MONO, C.ink, "center");
    }
  }

  let last = performance.now();
  let raf = 0;
  function frame(ts: number) {
    const dt = clamp((ts - last) / 1000, 0, 1 / 30); last = ts;
    step(dt / 2); step(dt / 2);
    const h = hel;
    const tx = clamp(h.x - W * 0.5 + h.dir * 60 + h.vx * 0.2, -100, world.L - W + 100);
    const ty = clamp(Math.min(0, h.y - H * 0.55), -600, 0);
    const k = Math.min(1, 4 * dt);
    camX += (tx - camX) * k; camY += (ty - camY) * k;
    audioUpdate();

    g2.setTransform(scale, 0, 0, scale, 0, 0);
    g2.clearRect(0, 0, W, H);
    g2.save();
    if (shake > 0) g2.translate((Math.random() - 0.5) * 14 * shake, (Math.random() - 0.5) * 14 * shake);
    drawSky();
    ridge(0.22, 372, 62, 0.0031, 22, 0.0079, 1.0, "#4a4a86");
    ridge(0.45, 420, 54, 0.0043, 18, 0.011, 2.1, "#2f3163");
    ridge(0.7, 452, 40, 0.0058, 14, 0.015, 0.6, "#212551");
    drawTerrain(); drawTrees(); drawPads(); drawHeli(); drawParts();
    g2.restore();
    drawHud(); drawOverlay();
    raf = requestAnimationFrame(frame);
  }

  /* ---------- input ---------- */
  function action() {
    audioInit();
    if (mode === "ready") mode = "play";
    else if (mode === "crashed") reset(false);
    else if (mode === "won") { level += 1; reset(false); }
  }
  const KEYMAP: Record<string, Dir> = {
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
    a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down",
  };
  function onKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = KEYMAP[e.key];
    if (k || e.key === " " || e.key === "Enter") e.preventDefault();
    audioInit();
    if (e.key === "r" || e.key === "R") { reset(false); return; }
    if (e.key === "m" || e.key === "M") { muted = !muted; if (au) au.master.gain.value = muted ? 0 : 1; return; }
    if (mode === "ready" && (k || e.key === " " || e.key === "Enter")) mode = "play";
    else if ((mode === "crashed" || mode === "won") && (e.key === "Enter" || e.key === " ")) { action(); return; }
    if (k) keys[k] = true;
  }
  function onKeyUp(e: KeyboardEvent) { const k = KEYMAP[e.key]; if (k) keys[k] = false; }
  function onBlur() { (Object.keys(keys) as Dir[]).forEach((k) => { keys[k] = false; }); }
  function onPointerDown() { cv.focus({ preventScroll: true }); action(); }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  cv.addEventListener("pointerdown", onPointerDown);

  reset(true);
  raf = requestAnimationFrame(frame);

  return {
    press(dir, down) {
      if (down) { audioInit(); if (mode === "ready") mode = "play"; }
      keys[dir] = down;
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      cv.removeEventListener("pointerdown", onPointerDown);
      if (au) { try { void au.a.close(); } catch { /* ignore */ } au = null; }
    },
  };
}
