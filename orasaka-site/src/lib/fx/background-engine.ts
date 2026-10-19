import { easeFactor, mixScene, particleBudget, SCENES, type Quality, type Scene, type SceneId } from "./scenes";

/*
 * ORASAKA interactive background: a single Canvas 2D renderer, drawn behind the page.
 * Layers (back → front): depth + red light pools, cursor light, far/near skyline,
 * reactive grid, light lines, data packets, particles, angular click waves.
 * Everything that never changes per frame is pre-rendered to offscreen canvases on resize.
 */

const RED = "229, 9, 20";
const BRIGHT = "255, 32, 53";
const BG = "#080809";

type Wave = { x: number; y: number; born: number };
type Line = { y: number; x: number; len: number; speed: number; alpha: number };
type Packet = { x: number; y: number; dir: 0 | 1 | 2 | 3; speed: number; len: number; nextTurn: number };

export type EngineOptions = {
  mobile: boolean;
  reducedMotion: boolean;
  quality: Quality;
  onQuality?: (q: Quality) => void;
  onFirstFrame?: () => void;
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BackgroundEngine {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private running = false;
  private last = 0;
  private lastDraw = 0;
  private t = 0;
  private firstFrame = false;

  private quality: Quality;
  private readonly maxQuality: Quality;
  private frameEma = 16.7;
  private slowFrames = 0;
  private fastFrames = 0;

  private scene: Scene = { ...SCENES.home };
  private target: Scene = SCENES.home;

  private ptx = -1;
  private pty = -1;
  private px = -1;
  private py = -1;
  private pointerAlpha = 0;
  private pointerActive = false;
  private lastInput = 0;

  private scrollY = 0;
  private scrollVel = 0;
  private waves: Wave[] = [];

  private px_: Float32Array = new Float32Array(0);
  private count = 0;
  private lines: Line[] = [];
  private packets: Packet[] = [];

  private base: HTMLCanvasElement | null = null;
  private far: HTMLCanvasElement | null = null;
  private near: HTMLCanvasElement | null = null;
  private gridStep = 72;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: EngineOptions,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    this.quality = opts.quality;
    this.maxQuality = opts.quality;
    this.resize();
  }

  // ── public API ──────────────────────────────────────────────────────────
  start() {
    if (this.opts.reducedMotion) {
      this.drawStatic();
      return;
    }
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.base = this.far = this.near = null;
  }

  setScene(id: SceneId) {
    this.target = SCENES[id];
    if (this.opts.reducedMotion) {
      this.scene = { ...this.target };
      this.drawStatic();
    }
  }

  pointer(x: number, y: number) {
    if (this.px < 0) {
      this.px = x;
      this.py = y;
    }
    this.ptx = x;
    this.pty = y;
    this.pointerActive = true;
    this.lastInput = performance.now();
  }

  pointerLeave() {
    this.pointerActive = false;
  }

  click(x: number, y: number) {
    if (this.opts.reducedMotion) return;
    this.waves.push({ x, y, born: performance.now() });
    if (this.waves.length > 6) this.waves.shift();
    this.lastInput = performance.now();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 2 ? 1.5 : 1);
    const widthChanged = w !== this.w;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.gridStep = w < 640 ? 56 : 72;
    this.buildBase();
    if (widthChanged || !this.far) this.buildSkyline();
    this.seed();
    if (this.opts.reducedMotion) this.drawStatic();
  }

  get currentQuality() {
    return this.quality;
  }

  // ── setup ───────────────────────────────────────────────────────────────
  private offscreen(w: number, h: number) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * this.dpr));
    c.height = Math.max(1, Math.round(h * this.dpr));
    const g = c.getContext("2d");
    if (!g) return null;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return { c, g };
  }

  /** Background depth: base colour, three soft red light pools, vignette. Taller than the viewport for scroll depth. */
  private buildBase() {
    const W = this.w;
    const H = this.h * 1.3;
    const o = this.offscreen(W, H);
    if (!o) return;
    const { g } = o;
    g.fillStyle = BG;
    g.fillRect(0, 0, W, H);
    const pools: [number, number, number, number][] = [
      [0.18, 0.18, 0.62, 0.2],
      [0.88, 0.52, 0.5, 0.12],
      [0.42, 0.98, 0.7, 0.1],
    ];
    for (const [x, y, r, a] of pools) {
      const rad = Math.max(W, H) * r;
      const grad = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, rad);
      grad.addColorStop(0, `rgba(${RED}, ${a})`);
      grad.addColorStop(0.45, `rgba(${RED}, ${a * 0.35})`);
      grad.addColorStop(1, "rgba(8, 8, 9, 0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    this.base = o.c;
  }

  /** Original geometric silhouettes: megacity towers, stepped temple roofs, gates and neon strips. */
  private buildSkyline() {
    const W = this.w * 1.08;
    const H = Math.min(this.h * 0.55, 520);
    const make = (seed: number, near: boolean) => {
      const o = this.offscreen(W, H);
      if (!o) return null;
      const { g } = o;
      const r = rng(seed);
      const fill = near ? "rgba(17, 17, 20, 0.95)" : "rgba(14, 14, 17, 0.9)";
      let x = -20;
      while (x < W) {
        const kind = r();
        const bw = near ? 40 + r() * 90 : 18 + r() * 54;
        const bh = (near ? 0.25 + r() * 0.45 : 0.3 + r() * 0.65) * H;
        const top = H - bh;
        g.fillStyle = fill;
        if (kind < 0.12 && !near) {
          // Stepped temple roof: three tiers with upturned eaves.
          const cx = x + bw;
          const tiers = 3;
          for (let i = 0; i < tiers; i++) {
            const tw = bw * (1.6 - i * 0.38);
            const ty = H - bh * 0.45 - i * bh * 0.16;
            g.fillRect(cx - tw * 0.32, ty, tw * 0.64, bh * 0.16 + 2);
            g.beginPath();
            g.moveTo(cx - tw * 0.62, ty + 2);
            g.quadraticCurveTo(cx - tw * 0.4, ty - 2, cx, ty - bh * 0.07);
            g.quadraticCurveTo(cx + tw * 0.4, ty - 2, cx + tw * 0.62, ty + 2);
            g.closePath();
            g.fill();
          }
          g.fillRect(cx - bw * 0.5, H - bh * 0.45, bw, bh * 0.45);
          g.fillStyle = `rgba(${RED}, 0.22)`;
          g.fillRect(cx - 0.5, H - bh * 0.45 - tiers * bh * 0.16 - bh * 0.18, 1, bh * 0.14);
          x += bw * 2.2;
          continue;
        }
        if (kind < 0.2 && near) {
          // Gate: two posts and a double lintel.
          const gw = bw * 1.4;
          const gh = bh * 0.7;
          g.fillRect(x + gw * 0.14, H - gh, 5, gh);
          g.fillRect(x + gw * 0.82, H - gh, 5, gh);
          g.fillRect(x, H - gh - 6, gw, 7);
          g.fillRect(x + gw * 0.08, H - gh + 10, gw * 0.84, 4);
          g.fillStyle = `rgba(${RED}, 0.35)`;
          g.fillRect(x, H - gh - 7, gw, 1);
          x += gw + 30;
          continue;
        }
        // Tower with stepped crown and antenna.
        g.fillRect(x, top, bw, bh);
        if (r() < 0.6) g.fillRect(x + bw * 0.18, top - bh * 0.06, bw * 0.64, bh * 0.06 + 1);
        if (r() < 0.45) g.fillRect(x + bw * 0.48, top - bh * 0.18, 1.5, bh * 0.14);
        // Neon strips and sparse windows.
        if (r() < (near ? 0.35 : 0.5)) {
          g.fillStyle = `rgba(${BRIGHT}, ${near ? 0.28 : 0.18})`;
          g.fillRect(x + bw * (0.15 + r() * 0.6), top + bh * 0.08, 1.2, bh * (0.25 + r() * 0.5));
        }
        g.fillStyle = `rgba(245, 245, 245, ${near ? 0.035 : 0.05})`;
        for (let wy = top + 10; wy < H - 8; wy += 9 + r() * 10) {
          if (r() < 0.55) continue;
          g.fillRect(x + 4 + r() * (bw - 10), wy, 2, 1.2);
        }
        x += bw + (near ? 30 + r() * 90 : 2 + r() * 10);
      }
      // Fade upward into the haze.
      g.globalCompositeOperation = "destination-in";
      const fade = g.createLinearGradient(0, 0, 0, H);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(0.35, "rgba(0,0,0,0.6)");
      fade.addColorStop(1, "rgba(0,0,0,1)");
      g.fillStyle = fade;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = "source-over";
      return o.c;
    };
    this.far = make(0x0a5a7a, false);
    this.near = this.quality > 0 ? make(0x7a3a11, true) : null;
  }

  private seed() {
    const r = rng(0x5eed);
    const max = particleBudget(this.w, this.h, this.maxQuality, this.opts.mobile);
    // x, y, vx, vy, baseVx, baseVy, size, phase
    const p = new Float32Array(max * 8);
    for (let i = 0; i < max; i++) {
      const o = i * 8;
      p[o] = r() * this.w;
      p[o + 1] = r() * this.h;
      const ang = r() * Math.PI * 2;
      const sp = 0.05 + r() * 0.18;
      p[o + 4] = Math.cos(ang) * sp;
      p[o + 5] = Math.sin(ang) * sp - 0.06;
      p[o + 2] = p[o + 4];
      p[o + 3] = p[o + 5];
      p[o + 6] = 0.9 + r() * r() * 2;
      p[o + 7] = r() * Math.PI * 2;
    }
    this.px_ = p;
    this.count = max;

    this.lines = Array.from({ length: 12 }, () => ({
      y: r(),
      x: r() * this.w,
      len: 60 + r() * 220,
      speed: 0.6 + r() * 1.4,
      alpha: 0.12 + r() * 0.3,
    }));

    this.packets = Array.from({ length: 14 }, () => this.newPacket(r));
  }

  private newPacket(r: () => number = Math.random): Packet {
    const s = this.gridStep;
    return {
      x: Math.round((r() * this.w) / s) * s,
      y: Math.round((r() * this.h) / s) * s,
      dir: (Math.floor(r() * 4) % 4) as Packet["dir"],
      speed: 1.2 + r() * 1.6,
      len: 18 + r() * 30,
      nextTurn: 2 + Math.floor(r() * 5),
    };
  }

  // ── frame loop ──────────────────────────────────────────────────────────
  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const idle = now - this.lastInput > 4000 && this.waves.length === 0 && Math.abs(this.scrollVel) < 0.05;
    const minInterval = this.quality === 0 || idle ? 32 : 0;
    if (now - this.lastDraw < minInterval) return;

    const elapsed = now - this.last;
    this.last = now;
    this.lastDraw = now;
    this.adapt(elapsed, idle);
    const frames = Math.min(elapsed, 50) / (1000 / 60);
    this.t += frames;
    this.update(frames, now);
    this.draw(now);
  };

  /** Drops quality when frames are consistently slow, recovers slowly when they are fast again. */
  private adapt(elapsed: number, idle: boolean) {
    if (idle || elapsed > 250) return;
    this.frameEma += (elapsed - this.frameEma) * 0.05;
    if (this.frameEma > 24) {
      this.fastFrames = 0;
      if (++this.slowFrames > 90 && this.quality > 0) this.setQuality((this.quality - 1) as Quality);
    } else if (this.frameEma < 15) {
      this.slowFrames = 0;
      if (++this.fastFrames > 900 && this.quality < this.maxQuality) this.setQuality((this.quality + 1) as Quality);
    }
  }

  private setQuality(q: Quality) {
    this.quality = q;
    this.slowFrames = 0;
    this.fastFrames = 0;
    this.frameEma = 16.7;
    this.resize();
    this.opts.onQuality?.(q);
  }

  private update(frames: number, now: number) {
    this.scene = mixScene(this.scene, this.target, easeFactor(0.035, frames));

    const k = easeFactor(0.16, frames);
    if (this.px >= 0) {
      this.px += (this.ptx - this.px) * k;
      this.py += (this.pty - this.py) * k;
    }
    this.pointerAlpha += ((this.pointerActive ? 1 : 0) - this.pointerAlpha) * easeFactor(0.06, frames);

    const y = window.scrollY;
    const v = (y - this.scrollY) / Math.max(frames, 0.001);
    this.scrollY = y;
    this.scrollVel += (v - this.scrollVel) * easeFactor(v === 0 ? 0.06 : 0.25, frames);
    if (Math.abs(v) > 0.5) this.lastInput = now;

    while (this.waves.length && now - this.waves[0].born > 900) this.waves.shift();
  }

  private draw(now: number) {
    const { ctx, w, h, scene } = this;
    const depth = this.scrollY;

    // 1. Depth + light pools (pre-rendered), shifted slowly with scroll.
    if (this.base) {
      const shift = (Math.sin(depth / 1600) * 0.5 + 0.5) * h * 0.3;
      ctx.globalAlpha = 1;
      ctx.drawImage(this.base, 0, -shift, w, h * 1.3);
      if (scene.pools < 1) {
        ctx.fillStyle = `rgba(8, 8, 9, ${(1 - scene.pools) * 0.75})`;
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Soft cursor light.
    const pa = this.pointerAlpha * scene.cursorLight;
    if (pa > 0.01 && this.px >= 0) {
      const r = this.opts.mobile ? 180 : 320;
      const g = ctx.createRadialGradient(this.px, this.py, 0, this.px, this.py, r);
      g.addColorStop(0, `rgba(${RED}, ${0.16 * pa})`);
      g.addColorStop(1, "rgba(229, 9, 20, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(this.px - r, this.py - r, r * 2, r * 2);
    }

    // 3. Skyline silhouettes with pointer + scroll parallax.
    const nx = this.px >= 0 ? this.px / w - 0.5 : 0;
    const sink = Math.min(depth * 0.06, h * 0.12);
    if (this.far && scene.skyline > 0.02) {
      const fh = this.far.height / this.dpr;
      ctx.globalAlpha = 0.9 * scene.skyline;
      ctx.drawImage(this.far, -w * 0.04 - nx * 14, h - fh + sink * 0.6, this.far.width / this.dpr, fh);
    }

    // 4. Grid.
    this.drawGrid(depth, now);

    if (this.near && scene.skyline > 0.02) {
      const nh = this.near.height / this.dpr;
      ctx.globalAlpha = 0.85 * scene.skyline;
      ctx.drawImage(this.near, -w * 0.04 - nx * 30, h - nh * 0.82 + sink, this.near.width / this.dpr, nh);
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "lighter";
    this.drawLines();
    this.drawPackets(depth);
    this.drawParticles();
    ctx.globalCompositeOperation = "source-over";
    this.drawWaves(now);

    if (!this.firstFrame) {
      this.firstFrame = true;
      this.opts.onFirstFrame?.();
    }
  }

  private drawGrid(depth: number, now: number) {
    const { ctx, w, h, scene } = this;
    const s = this.gridStep;
    const oy = -((depth * 0.25) % s);
    const a = 0.045 * scene.grid;
    if (a < 0.002) return;

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(245, 245, 245, ${a})`;
    ctx.beginPath();
    for (let x = 0.5; x < w; x += s) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = oy + 0.5; y < h; y += s) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Registration crosses every third node: the "corporate blueprint" motif.
    ctx.fillStyle = `rgba(${BRIGHT}, ${0.2 * scene.grid})`;
    for (let x = 0; x < w; x += s * 3) {
      for (let y = oy + s; y < h; y += s * 3) {
        ctx.fillRect(x - 3, y, 7, 1);
        ctx.fillRect(x, y - 3, 1, 7);
      }
    }

    // Reactive zone: lines near the cursor glow red, bend slightly away and carry a travelling glow wave.
    const pa = this.pointerAlpha;
    if (pa < 0.02 || this.px < 0 || this.opts.mobile) return;
    const R = 240;
    const { px, py } = this;
    const wave = ((now / 1000) * 0.55) % 1;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, R);
    const peak = 0.75 * pa * Math.max(scene.grid, 0.5);
    grad.addColorStop(0, `rgba(${BRIGHT}, ${peak})`);
    grad.addColorStop(Math.max(0, wave - 0.08), `rgba(${BRIGHT}, ${peak * 0.35})`);
    grad.addColorStop(wave, `rgba(${BRIGHT}, ${peak * 0.85})`);
    grad.addColorStop(Math.min(1, wave + 0.08), `rgba(${BRIGHT}, ${peak * 0.25})`);
    grad.addColorStop(1, "rgba(255, 32, 53, 0)");
    ctx.strokeStyle = grad;

    const bend = this.quality > 0;
    const step = 12;
    const push = (x: number, y: number): [number, number] => {
      if (!bend) return [x, y];
      const dx = x - px;
      const dy = y - py;
      const d = Math.hypot(dx, dy) || 1;
      if (d > R) return [x, y];
      const f = (1 - d / R) ** 2 * 9;
      return [x + (dx / d) * f, y + (dy / d) * f];
    };

    ctx.beginPath();
    const x0 = Math.floor((px - R) / s) * s + 0.5;
    for (let x = x0; x <= px + R; x += s) {
      for (let y = py - R; y <= py + R; y += step) {
        const [qx, qy] = push(x, y);
        if (y === py - R) ctx.moveTo(qx, qy);
        else ctx.lineTo(qx, qy);
      }
    }
    const y0 = oy + Math.floor((py - R - oy) / s) * s + 0.5;
    for (let y = y0; y <= py + R; y += s) {
      for (let x = px - R; x <= px + R; x += step) {
        const [qx, qy] = push(x, y);
        if (x === px - R) ctx.moveTo(qx, qy);
        else ctx.lineTo(qx, qy);
      }
    }
    ctx.lineWidth = 1;
    ctx.stroke();
    if (this.quality === 2) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawLines() {
    const { ctx, w, h, scene } = this;
    const n = Math.round(this.lines.length * scene.lines);
    if (!n) return;
    const boost = 1 + Math.min(Math.abs(this.scrollVel) * 0.35, 9);
    for (let i = 0; i < n; i++) {
      const l = this.lines[i];
      l.x -= l.speed * scene.lineSpeed * boost;
      if (l.x + l.len < 0) l.x = w + Math.random() * 200;
      const y = Math.round(l.y * h) + 0.5;
      const a = l.alpha * Math.min(1, scene.lines * 1.4);
      ctx.fillStyle = `rgba(${RED}, ${a * 0.45})`;
      ctx.fillRect(l.x, y, l.len, 1);
      ctx.fillStyle = `rgba(${BRIGHT}, ${a})`;
      ctx.fillRect(l.x, y - 0.5, Math.min(26, l.len), 2);
    }
  }

  private drawPackets(depth: number) {
    const { ctx, w, h, scene } = this;
    const n = Math.round(this.packets.length * scene.data);
    if (!n) return;
    const s = this.gridStep;
    const oy = -((depth * 0.25) % s);
    for (let i = 0; i < n; i++) {
      const p = this.packets[i];
      const prevCell = Math.floor((p.dir % 2 === 0 ? p.x : p.y) / s);
      if (p.dir === 0) p.x += p.speed;
      else if (p.dir === 1) p.y += p.speed;
      else if (p.dir === 2) p.x -= p.speed;
      else p.y -= p.speed;
      const cell = Math.floor((p.dir % 2 === 0 ? p.x : p.y) / s);
      if (cell !== prevCell && --p.nextTurn <= 0) {
        if (p.dir % 2 === 0) p.x = Math.round(p.x / s) * s;
        else p.y = Math.round(p.y / s) * s;
        p.dir = ((p.dir + (Math.random() < 0.5 ? 1 : 3)) % 4) as Packet["dir"];
        p.nextTurn = 2 + Math.floor(Math.random() * 5);
      }
      if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) Object.assign(p, this.newPacket());
      const x = p.x + 0.5;
      const y = p.y + oy + 0.5;
      const a = 0.55 * scene.data;
      ctx.fillStyle = `rgba(${BRIGHT}, ${a})`;
      if (p.dir === 0) ctx.fillRect(x - p.len, y - 0.5, p.len, 1.5);
      else if (p.dir === 2) ctx.fillRect(x, y - 0.5, p.len, 1.5);
      else if (p.dir === 1) ctx.fillRect(x - 0.5, y - p.len, 1.5, p.len);
      else ctx.fillRect(x - 0.5, y, 1.5, p.len);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  private drawParticles() {
    const { ctx, w, h, scene } = this;
    const p = this.px_;
    const n = Math.min(this.count, Math.round(particleBudget(w, h, this.quality, this.opts.mobile) * scene.particles));
    if (!n) return;
    const interact = this.pointerAlpha > 0.05 && this.px >= 0;
    const R = 130;
    const R2 = R * R;
    const drift = -this.scrollVel * 0.04;
    const ease = 0.02;
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      let vx = p[o + 2];
      let vy = p[o + 3];
      vx += (p[o + 4] - vx) * ease;
      vy += (p[o + 5] - vy) * ease;
      if (interact) {
        const dx = p[o] - this.px;
        const dy = p[o + 1] - this.py;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2 && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = (1 - d / R) * 0.35 * this.pointerAlpha;
          vx += (dx / d) * f;
          vy += (dy / d) * f;
        }
      }
      const size = p[o + 6];
      let x = p[o] + vx;
      let y = p[o + 1] + vy + drift * size;
      if (x < -10) x = w + 10;
      else if (x > w + 10) x = -10;
      if (y < -10) y = h + 10;
      else if (y > h + 10) y = -10;
      p[o] = x;
      p[o + 1] = y;
      p[o + 2] = vx;
      p[o + 3] = vy;
      const tw = 0.55 + 0.45 * Math.sin(this.t * 0.03 + p[o + 7]);
      ctx.globalAlpha = Math.min(1, 0.35 + size * 0.3) * tw;
      ctx.fillStyle = `rgb(${BRIGHT})`;
      ctx.fillRect(x, y, size, size);
      if (size > 1.5 && this.quality > 0) {
        ctx.globalAlpha *= 0.22;
        ctx.fillRect(x - size, y - size, size * 3, size * 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Angular click wave: an expanding notched octagon with four ticks; no round bubbles. */
  private drawWaves(now: number) {
    const { ctx } = this;
    for (const wv of this.waves) {
      const life = (now - wv.born) / 900;
      if (life < 0 || life > 1) continue;
      const e = 1 - (1 - life) ** 3;
      const r = 8 + e * 120;
      const a = (1 - life) ** 1.6;
      ctx.strokeStyle = `rgba(${BRIGHT}, ${0.8 * a})`;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const rr = i % 2 === 0 ? r : r * 0.82;
        const x = wv.x + Math.cos(ang) * rr;
        const y = wv.y + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = `rgba(${BRIGHT}, ${0.6 * a})`;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        ctx.moveTo(wv.x + c * (r + 6), wv.y + sn * (r + 6));
        ctx.lineTo(wv.x + c * (r + 16), wv.y + sn * (r + 16));
      }
      ctx.stroke();
    }
  }

  /** Reduced motion: one composed still frame, redrawn only on resize or scene change. */
  private drawStatic() {
    this.pointerAlpha = 0;
    this.t = 0;
    this.draw(performance.now());
  }
}
