/* =====================================================================
   EMBER — STAGE RENDERER
   ---------------------------------------------------------------------
   Draws one dish at a given build progress t (0–1) onto a canvas.
   Everything is a pure function of t, so scrubbing backwards un-builds
   the dish exactly. Only the fire flicker and steam drift use real time.
   ===================================================================== */

(function () {
  const { K, rng } = window.EMBER_ART;
  const ART = window.EMBER_ART.art;
  const TAU = Math.PI * 2;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const prog = (t, [a, b]) => clamp((t - a) / (b - a));
  const smooth = (u) => u * u * (3 - 2 * u);
  const easeOut = (u) => 1 - Math.pow(1 - u, 3);
  const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const lerp = (a, b, u) => a + (b - a) * u;

  /* ---------- soft sprites (shadows, steam puffs) ---------- */
  function makeSprite(color) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color.replace("A", "1"));
    g.addColorStop(0.45, color.replace("A", "0.55"));
    g.addColorStop(1, color.replace("A", "0"));
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return c;
  }
  const SHADOW = makeSprite("rgba(0,0,0,A)");
  const PUFF = makeSprite("rgba(255,244,232,A)");

  /* ---------- bitmap cache ---------- */
  function paint(box, scale, draw, seed) {
    const [x0, y0, x1, y1] = box;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil((x1 - x0) * scale));
    c.height = Math.max(1, Math.ceil((y1 - y0) * scale));
    const ctx = c.getContext("2d");
    ctx.scale(scale, scale);
    ctx.translate(-x0, -y0);
    draw(ctx, rng(seed));
    return { canvas: c, box };
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  /** Prepares every bitmap a dish needs at a given pixel scale. */
  class DishAssets {
    constructor(dish) {
      this.dish = dish;
      this.scale = 0;
      this.layers = [];
      this.frames = null;
      this.images = {};
    }
    // Load any external images (PNG layers / frame sequences). Safe to call many times.
    preload() {
      if (this._preload) return this._preload;
      const v = this.dish.visual;
      const jobs = [];
      v.layers.forEach((L) => {
        [L.src, L.melt && L.melt.src].filter(Boolean).forEach((src) => {
          jobs.push(loadImage(src).then((img) => (this.images[src] = img)).catch(() => {}));
        });
      });
      if (v.sequence) {
        const s = v.sequence;
        this.frames = new Array(s.count);
        for (let i = 0; i < s.count; i++) {
          const src = s.pattern.replace("{i}", String(i + (s.start || 0)).padStart(s.pad || 4, "0"));
          jobs.push(loadImage(src).then((img) => (this.frames[i] = img)).catch(() => {}));
        }
      }
      this._preload = Promise.all(jobs);
      return this._preload;
    }
    build(scale) {
      if (this.scale && Math.abs(scale - this.scale) / this.scale < 0.12) return;
      this.scale = scale;
      this.layers = this.dish.visual.layers.map((L, i) => this._buildLayer(L, scale, i));
    }
    _bitmapFor(spec, scale, seed) {
      if (spec.src) {
        const img = this.images[spec.src];
        if (!img) return null;
        const w = spec.width || img.naturalWidth;
        const h = w * (img.naturalHeight / img.naturalWidth);
        const [ax, ay] = spec.anchor || [0.5, 0.85];
        return { canvas: img, box: [-w * ax, -h * ay, w * (1 - ax), h * (1 - ay)] };
      }
      const art = ART[spec.art];
      if (!art || !art.box) return null;
      return paint(art.box, scale, art.draw, seed);
    }
    _buildLayer(L, scale, i) {
      const seed = L.seed || 7 + i * 13;
      const art = ART[L.art] || {};
      const out = { spec: L, shadow: L.shadow || art.shadow || null };
      if (art.pieces && !L.src) {
        out.pieces = art.pieces(rng(seed)).map((p, k) => ({
          x: p.x, z: p.z, bmp: paint(p.box, scale, p.draw, seed + k),
          spin: (rng(seed + k * 7)() - 0.5) * 1.6, drift: (rng(seed + k * 3)() - 0.5) * 60
        }));
      } else {
        out.bmp = this._bitmapFor(L, scale, seed);
      }
      if (L.melt) out.melt = this._bitmapFor(L.melt, scale, seed + 1);
      return out;
    }
  }

  /* ---------- animation states ---------- */
  // falling with a soft landing: returns offset (units), squash, alpha, landed (0–1)
  function dropState(u, dropH, bounceH) {
    if (u <= 0) return null;
    const fallEnd = 0.6;
    if (u < fallEnd) {
      const k = u / fallEnd;
      return { dy: -dropH * (1 - k * k), sx: 1, sy: 1 + 0.04 * k, a: clamp(u / 0.1), land: k * k * k };
    }
    const k = (u - fallEnd) / (1 - fallEnd);
    let dy = 0, sy = 1, sx = 1;
    if (k < 0.22) {
      const q = Math.sin((k / 0.22) * Math.PI);
      sy = 1 - 0.11 * q; sx = 1 + 0.05 * q;
    } else if (k < 0.78) {
      const q = (k - 0.22) / 0.56;
      dy = -bounceH * 4 * q * (1 - q);
      sy = 1 + 0.025 * Math.sin(q * Math.PI);
    } else {
      const q = Math.sin(((k - 0.78) / 0.22) * Math.PI);
      sy = 1 - 0.03 * q; sx = 1 + 0.015 * q;
    }
    return { dy, sx, sy, a: 1, land: 1 - Math.min(1, Math.abs(dy) / 60) * 0.4 };
  }

  function flameIntensity(fx, t) {
    if (t < fx.at[0]) return 0;
    const u = prog(t, fx.at);
    const peak = fx.peak ?? 1, hold = fx.hold ?? 0.3;
    if (u < 0.3) return peak * easeOut(u / 0.3);
    return lerp(peak, hold, smooth((u - 0.3) / 0.7));
  }

  /* ---------- effects ---------- */
  function drawFlames(ctx, x, y, w, h, I, time, s) {
    if (I <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gI = Math.min(1, I);
    const g = ctx.createRadialGradient(x, y - h * 0.3 * I, 0, x, y - h * 0.3 * I, w * 0.95);
    g.addColorStop(0, `rgba(255,128,36,${0.34 * gI})`);
    g.addColorStop(0.45, `rgba(190,58,10,${0.16 * gI})`);
    g.addColorStop(1, "rgba(120,30,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - w, y - h * 1.6, w * 2, h * 2);
    const N = 18;
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < N; i++) {
        const f = i / (N - 1);
        const edge = 1 - Math.pow(Math.abs(f - 0.5) * 2, 1.7);
        const ph = i * 1.71 + layer * 3.3;
        const n = Math.sin(time * 3.1 + ph) * 0.5 + Math.sin(time * 5.7 + ph * 1.9) * 0.3 + Math.sin(time * 11.3 + ph * 0.7) * 0.2;
        const fh = h * I * (0.28 + 0.72 * edge) * (0.72 + 0.28 * n) * (layer ? 0.62 : 1);
        const fw = (w / N) * (layer ? 1.7 : 2.5) * (0.85 + 0.25 * Math.sin(time * 2 + ph));
        const bx = x + (f - 0.5) * w * (layer ? 0.6 : 0.92);
        const sway = Math.sin(time * 2.3 + ph) * fw * 0.55 + Math.sin(time * 7.1 + ph) * fw * 0.18;
        const gr = ctx.createLinearGradient(0, y, 0, y - fh);
        if (layer) {
          gr.addColorStop(0, "rgba(255,248,210,.55)");
          gr.addColorStop(0.35, "rgba(255,200,90,.35)");
          gr.addColorStop(1, "rgba(255,120,30,0)");
        } else {
          gr.addColorStop(0, "rgba(255,210,120,.5)");
          gr.addColorStop(0.3, "rgba(255,140,40,.42)");
          gr.addColorStop(0.65, "rgba(220,70,14,.22)");
          gr.addColorStop(1, "rgba(150,28,4,0)");
        }
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(bx - fw / 2, y);
        ctx.bezierCurveTo(bx - fw / 2, y - fh * 0.45, bx + sway - fw * 0.18, y - fh * 0.72, bx + sway, y - fh);
        ctx.bezierCurveTo(bx + sway + fw * 0.12, y - fh * 0.7, bx + fw / 2, y - fh * 0.42, bx + fw / 2, y);
        ctx.closePath();
        ctx.fill();
      }
    }
    // sparks
    for (let i = 0; i < 34; i++) {
      const r = rng(i + 91);
      const sp = 0.25 + r() * 0.35;
      const ph = (time * sp + r()) % 1;
      const px = x + (r() - 0.5) * w * 0.85 + Math.sin(time * 1.7 + i) * 14 * s;
      const py = y - ph * h * 1.35 * Math.min(1.2, I);
      const a = (1 - ph) * Math.min(1, I) * (0.5 + 0.5 * r());
      ctx.fillStyle = `rgba(255,${170 + ((r() * 60) | 0)},90,${a})`;
      ctx.beginPath();
      ctx.arc(px, py, (0.6 + 1.6 * (1 - ph)) * s * 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSteam(ctx, x, y, w, h, I, time, s) {
    if (I <= 0.01) return;
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const r = rng(i * 17 + 3);
      const bx = x + (r() - 0.5) * w;
      for (let k = 0; k < 9; k++) {
        const ph = (time * (0.07 + r() * 0.04) + k / 9 + r()) % 1;
        const px = bx + Math.sin(ph * 5 + time * 0.8 + i) * w * 0.07 * (0.3 + ph);
        const py = y - ph * h;
        const rad = (30 + ph * 90) * s;
        ctx.globalAlpha = I * 0.04 * Math.sin(ph * Math.PI);
        ctx.drawImage(PUFF, px - rad, py - rad, rad * 2, rad * 2);
      }
    }
    ctx.restore();
  }

  function drawSplash(ctx, fx, t, ox, oy, s) {
    const u = prog(t, fx.at);
    if (u <= 0 || u >= 1) return;
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const r = rng(i * 7 + 5);
      const ang = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.25;
      const sp = 120 + r() * 220;
      const px = ox + Math.cos(ang) * sp * u * s;
      const py = oy + (Math.sin(ang) * sp * 0.6 * u + 260 * u * u) * s;
      const a = u < 0.08 ? u / 0.08 : 1 - (u - 0.08) / 0.92;
      const rad = (2 + r() * 5) * (1 - u * 0.6) * s;
      ctx.globalAlpha = a;
      ctx.fillStyle = r() > 0.25 ? "#f6d47a" : "#fff6da";
      ctx.beginPath();
      ctx.ellipse(px, py, rad, rad * 0.8, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function shadowAt(ctx, x, y, rx, ry, a) {
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    ctx.drawImage(SHADOW, x - rx * 1.25, y - ry * 1.25, rx * 2.5, ry * 2.5);
    ctx.globalAlpha = 1;
  }

  function blit(ctx, bmp, x, y, s, sx = 1, sy = 1, rot = 0, alpha = 1) {
    if (!bmp || alpha <= 0.002) return;
    const [x0, y0, x1, y1] = bmp.box;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(sx, sy);
    ctx.drawImage(bmp.canvas, x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
    ctx.restore();
  }

  /**
   * Render a dish.
   * view: { ox, oy, s, dropFrom, slideFrom }  (origin px, px-per-unit, distances in units)
   * returns { active } — whether time-based effects are running
   */
  function renderDish(ctx, assets, t, view, time) {
    const v = assets.dish.visual;
    const { ox, oy, s } = view;
    let active = false;

    const exitU = v.exit ? easeInOut(prog(t, v.exit)) : 0;
    const liftY = -exitU * (view.dropFrom * 0.9);
    const dishAlpha = 1 - smooth(clamp(exitU * 1.4));
    if (dishAlpha <= 0.001) return { active: false };

    const X = (ux) => ox + ux * s;
    const Y = (uy) => oy + (uy + liftY) * s;

    // ground shadow + effects behind
    (v.effects || []).forEach((fx) => {
      if (fx.type === "flame") {
        const I = flameIntensity(fx, t) * dishAlpha;
        if (I > 0.01) {
          active = true;
          drawFlames(ctx, X(fx.x || 0), Y(fx.y || -40), fx.width * s, fx.height * s, I, time, s);
        }
      }
    });

    ctx.save();
    ctx.globalAlpha = dishAlpha;

    if (v.sequence && assets.frames) {
      const sq = v.sequence;
      const u = prog(t, sq.at || [0, v.reveal[0]]);
      const idx = Math.round(u * (sq.count - 1));
      let img = assets.frames[idx];
      for (let k = idx; !img && k >= 0; k--) img = assets.frames[k];
      if (img) {
        const w = (sq.width || v.frame.width) * s, h = w * (img.naturalHeight / img.naturalWidth);
        ctx.drawImage(img, X(0) - w / 2, Y(v.frame.focusY) - h / 2, w, h);
      }
    } else {
      assets.layers.forEach((Lb) => drawLayer(ctx, Lb, t, view, X, Y, s));
    }
    ctx.restore();

    // front effects
    (v.effects || []).forEach((fx) => {
      if (fx.type === "steam") {
        const I = smooth(prog(t, [fx.at[0], fx.at[1]])) * (fx.strength ?? 1) * dishAlpha;
        if (I > 0.01) {
          active = true;
          drawSteam(ctx, X(fx.x || 0), Y(fx.y || -40), fx.width * s, fx.height * s, I, time, s);
        }
      } else if (fx.type === "splash") {
        drawSplash(ctx, fx, t, X(fx.x || 0), Y(fx.y || 0), s);
      } else if (fx.type === "flame") {
        // warm rim light spilling onto the food
        const I = flameIntensity(fx, t) * dishAlpha;
        if (I > 0.01) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const flick = 0.85 + 0.15 * Math.sin(time * 9) * Math.sin(time * 4.3);
          const g = ctx.createRadialGradient(X(0), Y(v.frame.focusY - 140), 0, X(0), Y(v.frame.focusY - 140), 300 * s);
          g.addColorStop(0, `rgba(255,140,50,${0.1 * Math.min(1, I) * flick})`);
          g.addColorStop(1, "rgba(255,100,30,0)");
          ctx.fillStyle = g;
          ctx.fillRect(X(-400), Y(v.frame.focusY - 460), 800 * s, 700 * s);
          ctx.restore();
        }
      }
    });
    return { active };
  }

  function drawLayer(ctx, Lb, t, view, X, Y, s) {
    const L = Lb.spec;
    const lx = L.x || 0, ly = L.y || 0;
    const anim = L.anim || "static";
    const sh = Lb.shadow;

    if (anim === "static") {
      if (sh) shadowAt(ctx, X(lx), Y(ly + (sh.dy || 0)), sh.rx * s, sh.ry * s, sh.a);
      blit(ctx, Lb.bmp, X(lx), Y(ly), s);
      return;
    }

    if (anim === "slide") {
      const u = prog(t, L.at);
      if (u <= 0) return;
      const e = easeOut(u);
      const dir = L.from === "right" ? 1 : -1;
      const dx = dir * (1 - e) * view.slideFrom;
      if (sh) shadowAt(ctx, X(lx + dx), Y(ly + (sh.dy || 0)), sh.rx * s, sh.ry * s, sh.a * e);
      blit(ctx, Lb.bmp, X(lx + dx), Y(ly), s, 1, 1, 0, clamp(u * 3));
      return;
    }

    if (anim === "spread") {
      const u = prog(t, L.at);
      if (u <= 0 || !Lb.bmp) return;
      const e = easeOut(u);
      const [x0, y0, x1, y1] = Lb.bmp.box;
      ctx.save();
      ctx.beginPath();
      const rx = ((x1 - x0) / 2) * e * 1.06, ry = ((y1 - y0) / 2) * e * 1.06;
      // slightly wobbly, rotating spread like a ladle swirl
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * TAU;
        const wob = 1 + 0.06 * Math.sin(a * 5 + u * 9) * (1 - u);
        const px = X(lx) + Math.cos(a) * rx * wob * s, py = Y(ly) + Math.sin(a) * ry * wob * s;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.clip();
      blit(ctx, Lb.bmp, X(lx), Y(ly), s, 1, 1, 0, clamp(u * 4));
      ctx.restore();
      return;
    }

    if (anim === "drop") {
      const u = prog(t, L.at);
      if (u <= 0) return;
      const bounce = L.bounce ?? 12;

      if (Lb.pieces) {
        const n = Lb.pieces.length;
        Lb.pieces.forEach((p, k) => {
          const st = n > 1 ? (k / (n - 1)) * 0.45 : 0;
          const pu = clamp((u - st) / 0.55);
          const d = dropState(pu, view.dropFrom, bounce * 0.5);
          if (!d) return;
          const fall = 1 - clamp(pu / 0.6);
          const px = lx + p.x + p.drift * fall, py = ly + p.z * K;
          if (sh) shadowAt(ctx, X(px), Y(py + (sh.dy || 0)), sh.rx * s, sh.ry * s, sh.a * d.land);
          blit(ctx, p.bmp, X(px), Y(py + d.dy), s, d.sx, d.sy, p.spin * fall * (L.spin ?? 1), d.a);
        });
        return;
      }

      const d = dropState(u, view.dropFrom, bounce);
      if (!d) return;
      const fall = 1 - clamp(u / 0.6);
      const rot = (L.spin || 0) * fall;
      if (sh) shadowAt(ctx, X(lx), Y(ly + (sh.dy || 0)), sh.rx * s, sh.ry * s, sh.a * d.land);

      if (L.melt && Lb.melt) {
        const m = prog(t, L.melt.at);
        const cross = smooth(clamp(m / 0.35));
        blit(ctx, Lb.bmp, X(lx), Y(ly + d.dy), s, d.sx, d.sy, rot, d.a * (1 - cross));
        if (m > 0) {
          const [x0, y0, x1, y1] = Lb.melt.box;
          ctx.save();
          ctx.beginPath();
          const reveal = y0 + (y1 - y0) * (0.35 + 0.65 * Math.pow(m, 0.8));
          ctx.rect(X(lx + x0 - 10), Y(ly + y0 - 10), (x1 - x0 + 20) * s, (reveal - y0 + 10) * s);
          ctx.clip();
          blit(ctx, Lb.melt, X(lx), Y(ly), s, 1, 1, 0, cross);
          ctx.restore();
        }
        return;
      }
      blit(ctx, Lb.bmp, X(lx), Y(ly + d.dy), s, d.sx, d.sy, rot, d.a);
    }
  }

  window.EMBER_STAGE = { DishAssets, renderDish, prog, smooth, easeOut, easeInOut, clamp, lerp };
})();
