/* =====================================================================
   EMBER — ILLUSTRATED FOOD LAYERS
   ---------------------------------------------------------------------
   Every ingredient is painted once into an offscreen canvas (at the
   exact pixel density it will be shown at) and then moved around by the
   stage renderer. All art shares one camera: ~20° above the table, light
   from the upper left, so every layer lines up like a single photo.

   Units: 1 unit ≈ 1px at the reference scale. Origin (0,0) is the centre
   of the layer's resting footprint; negative y is up.

   An art entry is either:
     { box:[x0,y0,x1,y1], shadow:{rx,ry,a}, draw(ctx, rnd) }
   or a group of falling pieces:
     { pieces(rnd) => [{ x, z, box, draw(ctx) }], shadow:{rx,ry,a} }
   ===================================================================== */

(function () {
  const K = 0.34;                // ellipse squash: how flat a disc looks
  const TAU = Math.PI * 2;

  /* ---------- small helpers ---------- */
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const noise = (n, r) => Array.from({ length: n }, () => r() * 2 - 1);
  function nAt(arr, u) {
    const n = arr.length;
    let f = (((u % 1) + 1) % 1) * n;
    const i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, fr = f - Math.floor(f);
    const s = fr * fr * (3 - 2 * fr);
    return arr[i0] * (1 - s) + arr[i1] * s;
  }
  function blob(ctx, cx, cy, rx, ry, amp, n1, n2, amp2) {
    ctx.beginPath();
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = u * TAU;
      let d = 1 + (n1 ? amp * nAt(n1, u) : 0) + (n2 ? amp2 * nAt(n2, u) : 0);
      const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function ell(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU);
  }
  function hex(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function toHex(c) {
    return "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  }
  function lerpHex(a, b, t) {
    const A = hex(a), B = hex(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * t));
  }
  function shade(c, amt) {
    return amt >= 0 ? lerpHex(c, "#ffffff", amt) : lerpHex(c, "#000000", -amt);
  }
  function rgba(h, a) {
    const [r, g, b] = hex(h);
    return `rgba(${r},${g},${b},${a})`;
  }
  // horizontal side shading for a cylinder side (light from upper-left)
  function sideGrad(ctx, rx, col) {
    const g = ctx.createLinearGradient(-rx, 0, rx, 0);
    g.addColorStop(0, shade(col, -0.5));
    g.addColorStop(0.16, shade(col, -0.12));
    g.addColorStop(0.38, shade(col, 0.14));
    g.addColorStop(0.68, col);
    g.addColorStop(0.9, shade(col, -0.35));
    g.addColorStop(1, shade(col, -0.62));
    return g;
  }
  function speckle(ctx, r, n, xr, yr, smin, smax, colors, alpha, cx = 0, cy = 0, squash = 0.6) {
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r());
      const x = cx + Math.cos(a) * d * xr, y = cy + Math.sin(a) * d * yr;
      const s = smin + r() * (smax - smin);
      ctx.fillStyle = colors[(r() * colors.length) | 0];
      ctx.globalAlpha = alpha * (0.35 + 0.65 * r());
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * (squash + (1 - squash) * r()), r() * TAU, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function softSpot(ctx, x, y, rx, ry, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // stack a path upward to fake a solid side
  function extrude(ctx, H, pathAt, colorAt, rx, step = 1) {
    for (let y = 0; y <= H; y += step) {
      pathAt(-y, y / H);
      ctx.fillStyle = sideGrad(ctx, rx, colorAt(y / H));
      ctx.fill();
    }
  }

  /* =================================================================
     BURGER
     ================================================================= */
  const plate = {
    box: [-325, -120, 325, 135],
    shadow: { rx: 330, ry: 118, a: 0.85, dy: 22 },
    draw(ctx, r) {
      const RX = 300, RY = RX * K, T = 16;
      extrude(ctx, T, (y) => ell(ctx, 0, y + T, RX * 0.985, RY * 0.985), () => "#141110", RX);
      let g = ctx.createRadialGradient(-70, -50, 10, 0, 0, RX);
      g.addColorStop(0, "#2c2725");
      g.addColorStop(0.55, "#1a1716");
      g.addColorStop(1, "#0d0b0a");
      ell(ctx, 0, 0, RX, RY);
      ctx.fillStyle = g;
      ctx.fill();
      // shallow well
      const WX = RX * 0.7, WY = WX * K;
      g = ctx.createLinearGradient(0, -WY, 0, WY);
      g.addColorStop(0, "#080707");
      g.addColorStop(1, "#1e1b19");
      ell(ctx, 0, 5, WX, WY);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ell(ctx, 0, 5, WX, WY);
      ctx.clip();
      ctx.strokeStyle = "rgba(0,0,0,.65)";
      ctx.lineWidth = 12;
      ell(ctx, 0, -3, WX, WY);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,236,214,.06)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 5, WX + 2, WY + 1, 0, 0.15, Math.PI - 0.15);
      ctx.stroke();
      // rim catch-lights
      ctx.strokeStyle = "rgba(255,232,205,.13)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, RX - 7, RY - 2.5, 0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,232,205,.07)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, RX - 0.5, RY - 0.2, 0, 0.12, Math.PI - 0.12);
      ctx.stroke();
      softSpot(ctx, -40, -RY * 0.72, 190, 34, "#ffe4c4", 0.08);
      ctx.save();
      ell(ctx, 0, 0, RX, RY);
      ctx.clip();
      speckle(ctx, r, 1100, RX, RY, 0.4, 1.1, ["#ffffff"], 0.03);
      ctx.restore();
    }
  };

  const bunBottom = {
    box: [-178, -112, 178, 70],
    shadow: { rx: 165, ry: 58, a: 0.75, dy: 4 },
    draw(ctx, r) {
      const RX = 160, RY = RX * K, H = 46;
      const n = noise(10, r);
      const p = (y, s = 1) => blob(ctx, 0, y, RX * s, RY * s, 0.015, n);
      extrude(ctx, H, (y, f) => p(y, f < 0.3 ? 0.93 + 0.07 * Math.sin((f / 0.3) * Math.PI / 2) : 1),
        (f) => lerpHex("#5e2c0f", "#c98340", Math.pow(f, 0.75)), RX);
      // side flecks
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      speckle(ctx, r, 160, RX, 22, 0.6, 1.8, ["#e2ad6c", "#7a3e17"], 0.35, 0, -H / 2 + RY * 0.6);
      ctx.restore();
      const ty = -H;
      p(ty);
      ctx.fillStyle = "#93501f";
      ctx.fill();
      p(ty, 0.965);
      ctx.fillStyle = "#d9b27a";
      ctx.fill();
      p(ty, 0.93);
      const g = ctx.createRadialGradient(-24, ty - 6, 8, 0, ty, RX * 0.93);
      g.addColorStop(0, "#d29a55");
      g.addColorStop(0.7, "#b47236");
      g.addColorStop(1, "#c48c4e");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      p(ty, 0.93);
      ctx.clip();
      speckle(ctx, r, 520, RX * 0.93, RY * 0.93, 0.6, 2.2, ["#7a4218", "#ecc993", "#9a5a26"], 0.5, 0, ty);
      ctx.restore();
      softSpot(ctx, -40, ty - 8, 90, 26, "#fff0d8", 0.2);
    }
  };

  const patty = {
    box: [-200, -62, 200, 82],
    shadow: { rx: 172, ry: 60, a: 0.7, dy: 4 },
    draw(ctx, r) {
      const RX = 172, RY = RX * K, H = 30;
      const n1 = noise(14, r), n2 = noise(44, r);
      const p = (y, s = 1) => blob(ctx, 0, y, RX * s, RY * s, 0.035, n1, n2, 0.016);
      extrude(ctx, H, (y) => p(y), (f) => lerpHex("#1f0e07", "#4d2713", Math.pow(f, 1.2)), RX);
      // lacy, crispy edge along the front
      for (let i = 0; i < 260; i++) {
        const a = r() * TAU;
        if (Math.sin(a) < -0.25) continue;
        const d = 0.97 + r() * 0.07;
        const x = Math.cos(a) * RX * d;
        const y = Math.sin(a) * RY * d - H * r();
        ctx.fillStyle = r() > 0.4 ? "#160904" : "#6e3819";
        ctx.globalAlpha = 0.5 + r() * 0.5;
        ell(ctx, x, y, 1.5 + r() * 4, 1 + r() * 2.5);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      p(-H);
      const g = ctx.createRadialGradient(-40, -H - 10, 6, 0, -H, RX);
      g.addColorStop(0, "#64341b");
      g.addColorStop(0.55, "#44220f");
      g.addColorStop(1, "#2a1309");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      p(-H);
      ctx.clip();
      speckle(ctx, r, 900, RX, RY, 0.8, 3.2, ["#120603", "#1d0b05"], 0.7, 0, -H);
      speckle(ctx, r, 420, RX, RY, 0.8, 2.6, ["#7c4321", "#975a2e", "#5a2c14"], 0.6, 0, -H);
      speckle(ctx, r, 140, RX * 0.9, RY * 0.9, 0.4, 1.4, ["#ffdcb6"], 0.3, 0, -H);
      ctx.restore();
      softSpot(ctx, -50, -H - 10, 110, 30, "#ffd2a6", 0.12);
    }
  };

  const CHEESE_ROT = 0.38;
  const cheese = {
    box: [-230, -78, 230, 62],
    shadow: { rx: 168, ry: 56, a: 0.3, dy: 0 },
    draw(ctx) {
      const S = 150, c = Math.cos(CHEESE_ROT), s = Math.sin(CHEESE_ROT);
      const pts = [[-S, -S], [S, -S], [S, S], [-S, S]].map(([x, z]) => [x * c - z * s, (x * s + z * c) * K]);
      const poly = (dy) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
        ctx.closePath();
      };
      ctx.lineJoin = "round";
      poly(4);
      ctx.fillStyle = "#c27410";
      ctx.strokeStyle = "#c27410";
      ctx.lineWidth = 10;
      ctx.fill();
      ctx.stroke();
      poly(0);
      const g = ctx.createLinearGradient(-200, -60, 200, 60);
      g.addColorStop(0, "#ffc449");
      g.addColorStop(0.5, "#f4a92a");
      g.addColorStop(1, "#e3941b");
      ctx.fillStyle = g;
      ctx.strokeStyle = g;
      ctx.fill();
      ctx.stroke();
      softSpot(ctx, -50, -14, 120, 22, "#fff1c8", 0.35);
    }
  };

  const cheeseMelt = {
    box: [-232, -80, 232, 150],
    draw(ctx, r) {
      const RX = 170, RY = RX * K;
      const corners = [0, 1, 2, 3].map((k) => CHEESE_ROT + Math.PI / 4 + (k * Math.PI) / 2);
      // draped corners
      corners.forEach((a) => {
        const sn = Math.sin(a), cs = Math.cos(a);
        if (sn < -0.55) return;
        const px = cs * RX * 1.0, py = sn * RY;
        const w = 58 * (0.42 + 0.58 * Math.abs(sn));
        const L = 16 + 22 * Math.max(0, sn) + 8 * Math.abs(cs);
        const g = ctx.createLinearGradient(0, py - 6, 0, py + L);
        g.addColorStop(0, "#f6ad2c");
        g.addColorStop(1, "#d2800f");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(px - w / 2, py - 8);
        ctx.bezierCurveTo(px - w * 0.55, py + L * 0.5, px - w * 0.3, py + L, px, py + L);
        ctx.bezierCurveTo(px + w * 0.3, py + L, px + w * 0.55, py + L * 0.5, px + w / 2, py - 8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,226,150,.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - w * 0.22, py);
        ctx.quadraticCurveTo(px - w * 0.18, py + L * 0.6, px - w * 0.04, py + L * 0.85);
        ctx.stroke();
      });
      // top face
      const n = noise(12, r);
      blob(ctx, 0, 0, RX * 0.99, RY * 1.0, 0.025, n);
      const g = ctx.createRadialGradient(-40, -12, 6, 0, 0, RX);
      g.addColorStop(0, "#ffc54d");
      g.addColorStop(0.7, "#f2a426");
      g.addColorStop(1, "#e1921a");
      ctx.fillStyle = g;
      ctx.fill();
      // drips along the front
      for (let i = 0; i < 4; i++) {
        const a = 0.35 + r() * (Math.PI - 0.7);
        const x = Math.cos(a) * RX * 0.98, y = Math.sin(a) * RY;
        const L = 10 + r() * 24, w = 4 + r() * 4;
        ctx.fillStyle = "#eb9a20";
        ctx.beginPath();
        ctx.moveTo(x - w, y - 3);
        ctx.quadraticCurveTo(x - w * 0.5, y + L * 0.5, x - w * 0.45, y + L);
        ctx.arc(x, y + L, w * 0.5, Math.PI, 0, true);
        ctx.quadraticCurveTo(x + w * 0.5, y + L * 0.5, x + w, y - 3);
        ctx.closePath();
        ctx.fill();
        softSpot(ctx, x - w * 0.15, y + L - 1, w * 0.35, w * 0.3, "#fff0c0", 0.6);
      }
      softSpot(ctx, -55, -14, 120, 22, "#fff3cf", 0.4);
      softSpot(ctx, 40, 6, 60, 12, "#fff3cf", 0.18);
    }
  };

  const pickles = {
    shadow: { rx: 34, ry: 13, a: 0.45, dy: 2 },
    pieces(r) {
      const spots = [[-78, -28], [36, -58], [92, 18], [-14, 40], [-104, 44], [10, -8]];
      return spots.map(([x, z], idx) => {
        const R = 31 + r() * 5, tilt = 1 + r() * 0.25, seed = r() * 1000;
        return {
          x: x + (r() - 0.5) * 10, z: z + (r() - 0.5) * 10,
          box: [-42, -22, 42, 22],
          draw(ctx) {
            const rr = rng(seed + idx);
            const crinkle = Array.from({ length: 22 }, (_, i) => (i % 2 ? 1 : -1));
            const ry = R * K * tilt;
            for (let y = 3; y >= 0; y--) {
              blob(ctx, 0, y, R, ry, 0.04, crinkle);
              ctx.fillStyle = y ? "#334a14" : "#4b6a1c";
              ctx.fill();
            }
            blob(ctx, 0, 0, R * 0.86, ry * 0.86, 0.02, crinkle);
            const g = ctx.createRadialGradient(-4, -2, 1, 0, 0, R * 0.86);
            g.addColorStop(0, "#dfe29a");
            g.addColorStop(0.6, "#b8bf5e");
            g.addColorStop(1, "#8c9a34");
            ctx.fillStyle = g;
            ctx.fill();
            for (let i = 0; i < 9; i++) {
              const a = (i / 9) * TAU + rr();
              ctx.fillStyle = "rgba(120,130,40,.75)";
              ell(ctx, Math.cos(a) * R * 0.48, Math.sin(a) * ry * 0.48, 3, 1.5);
              ctx.fill();
              ctx.fillStyle = "rgba(240,240,190,.8)";
              ell(ctx, Math.cos(a) * R * 0.48, Math.sin(a) * ry * 0.48, 1.4, 0.8);
              ctx.fill();
            }
            softSpot(ctx, -8, -3, 14, 4, "#ffffff", 0.45);
          }
        };
      });
    }
  };

  const lettuce = {
    box: [-222, -82, 222, 112],
    shadow: { rx: 188, ry: 64, a: 0.4, dy: 2 },
    draw(ctx, r) {
      const RX = 194, RY = RX * K;
      const nr = noise(28, r);
      const R = (u) => 1 + 0.035 * Math.sin(u * TAU * 15) + 0.035 * nAt(nr, u);
      // front skirt that droops over the patty
      ctx.beginPath();
      const pts = [];
      for (let i = 0; i <= 90; i++) {
        const u = i / 180, a = u * TAU;
        const rad = R(u);
        const x = Math.cos(a) * RX * rad, y = Math.sin(a) * RY * rad;
        const droop = (10 + 14 * Math.sin(a)) * (0.55 + 0.45 * Math.sin(u * TAU * 11 + 1.3)) + 6;
        pts.push([x, y, droop]);
      }
      ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach(([x, y, d]) => ctx.lineTo(x * 1.01, y + d));
      for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] * 0.92, pts[i][1] * 0.8);
      ctx.closePath();
      let g = ctx.createLinearGradient(0, 0, 0, RY + 30);
      g.addColorStop(0, "#6ea733");
      g.addColorStop(1, "#356616");
      ctx.fillStyle = g;
      ctx.fill();
      // rim thickness
      for (let y = 6; y >= 0; y--) {
        ctx.beginPath();
        for (let i = 0; i <= 180; i++) {
          const u = i / 180, a = u * TAU, rad = R(u);
          const px = Math.cos(a) * RX * rad, py = Math.sin(a) * RY * rad + y;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = y ? "#4d8a22" : "#86c040";
        ctx.fill();
      }
      g = ctx.createRadialGradient(-30, -10, 10, 0, 0, RX);
      g.addColorStop(0, "#c4e77d");
      g.addColorStop(0.55, "#9ad04f");
      g.addColorStop(0.85, "#79b437");
      g.addColorStop(1, "#5c9a28");
      ctx.fillStyle = g;
      ctx.fill();
      // ruffle highlights + veins
      ctx.save();
      ctx.clip();
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU + r() * 0.1;
        ctx.strokeStyle = "rgba(230,250,190,.32)";
        ctx.lineWidth = 1 + r();
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * RX * 0.55, Math.sin(a) * RY * 0.55);
        ctx.quadraticCurveTo(Math.cos(a + 0.05) * RX * 0.8, Math.sin(a + 0.05) * RY * 0.8, Math.cos(a) * RX * 1.02, Math.sin(a) * RY * 1.02);
        ctx.stroke();
      }
      speckle(ctx, r, 200, RX, RY, 1, 4, ["#d8f39a", "#4c8a20"], 0.25);
      ctx.restore();
    }
  };

  const bunTop = {
    box: [-188, -168, 188, 76],
    shadow: { rx: 172, ry: 58, a: 0.55, dy: 2 },
    draw(ctx, r) {
      const RX = 168, RY = RX * K, H = 150;
      const sil = () => {
        ctx.beginPath();
        ctx.moveTo(-RX, 0);
        ctx.bezierCurveTo(-RX, -H * 0.64, -RX * 0.6, -H, 0, -H);
        ctx.bezierCurveTo(RX * 0.6, -H, RX, -H * 0.64, RX, 0);
        ctx.ellipse(0, 0, RX, RY, 0, 0, Math.PI, false);
        ctx.closePath();
      };
      sil();
      let g = ctx.createRadialGradient(-48, -96, 8, -10, -40, 250);
      g.addColorStop(0, "#f2bb70");
      g.addColorStop(0.25, "#d78d3c");
      g.addColorStop(0.55, "#ad5e23");
      g.addColorStop(0.85, "#6d3312");
      g.addColorStop(1, "#4a200a");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      sil();
      ctx.clip();
      // paler band where the bun meets the fillings
      ctx.beginPath();
      ctx.ellipse(0, 2, RX + 2, RY + 2, 0, 0, Math.PI, false);
      ctx.ellipse(0, -18, RX + 2, RY, 0, Math.PI, 0, true);
      ctx.closePath();
      g = ctx.createLinearGradient(0, RY - 30, 0, RY + 4);
      g.addColorStop(0, "rgba(226,170,100,0)");
      g.addColorStop(0.6, "rgba(226,170,100,.55)");
      g.addColorStop(1, "rgba(120,60,20,.7)");
      ctx.fillStyle = g;
      ctx.fill();
      speckle(ctx, r, 500, RX, H * 0.7, 0.4, 1.4, ["#ffe2b8", "#5a2a0e"], 0.08, 0, -H * 0.45);
      // sesame seeds, placed on the 3D dome so they foreshorten correctly
      const vy = Math.sin(0.35), vz = Math.cos(0.35);
      for (let i = 0; i < 130; i++) {
        const al = r() * TAU, be = 0.12 + r() * 1.3;
        const cb = Math.cos(be), sb = Math.sin(be);
        const x = RX * cb * Math.cos(al) * 0.97, z = RX * cb * Math.sin(al) * 0.97, y = H * sb * 0.97;
        const nx = x / (RX * RX), ny = y / (H * H), nz = z / (RX * RX);
        const nl = Math.hypot(nx, ny, nz);
        const dot = (ny * vy + nz * vz) / nl;
        if (dot < 0.18) continue;
        const sx = x, sy = z * K - y;
        const rot = r() * TAU;
        const sz = 5.2 * (0.55 + 0.45 * dot);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(rot);
        ctx.scale(1, 0.5 + 0.5 * dot);
        ctx.fillStyle = "rgba(70,28,8,.45)";
        ell(ctx, 1.2, 1.6, sz, sz * 0.48);
        ctx.fill();
        ctx.fillStyle = "#f6e7c5";
        ell(ctx, 0, 0, sz, sz * 0.48);
        ctx.fill();
        ctx.strokeStyle = "rgba(190,145,85,.6)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ell(ctx, -sz * 0.25, -sz * 0.12, sz * 0.4, sz * 0.14);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      softSpot(ctx, -58, -108, 78, 30, "#fff1d8", 0.38);
      softSpot(ctx, -64, -116, 24, 9, "#ffffff", 0.4);
      softSpot(ctx, 92, -40, 60, 40, "#2a0e02", 0.25);
    }
  };

  /* =================================================================
     PIZZA
     ================================================================= */
  const board = {
    box: [-345, -145, 490, 130],
    shadow: { rx: 345, ry: 122, a: 0.85, dy: 22 },
    draw(ctx, r) {
      const RX = 330, RY = RX * K, H = 20;
      ctx.translate(0, -H); // top surface sits at y = -H
      const handle = (y) => {
        ctx.beginPath();
        const z = 36 * K;
        ctx.moveTo(280, y - z);
        ctx.lineTo(440, y - z);
        ctx.ellipse(440, y, 36, z, 0, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(280, y + z);
        ctx.closePath();
      };
      for (let y = H; y >= 0; y--) {
        const f = 1 - y / H;
        const col = lerpHex("#3d2412", "#6a4222", f);
        handle(-y + H);
        ctx.fillStyle = sideGrad(ctx, 470, col);
        ctx.fill();
        ell(ctx, 0, -y + H, RX, RY);
        ctx.fillStyle = sideGrad(ctx, RX, col);
        ctx.fill();
      }
      const g = ctx.createLinearGradient(-RX, -RY, RX, RY);
      g.addColorStop(0, "#a06b3c");
      g.addColorStop(0.5, "#835430");
      g.addColorStop(1, "#6b4223");
      ell(ctx, 0, 0, RX, RY);
      ctx.fillStyle = g;
      ctx.fill();
      handle(0);
      ctx.fill();
      ctx.save();
      ell(ctx, 0, 0, RX, RY);
      ctx.clip();
      for (let i = 0; i < 90; i++) {
        const y0 = -RY * 1.1 + r() * RY * 2.2, ph = r() * TAU, amp = 1 + r() * 3;
        ctx.strokeStyle = r() > 0.5 ? `rgba(60,32,14,${0.1 + r() * 0.18})` : `rgba(220,170,120,${0.05 + r() * 0.1})`;
        ctx.lineWidth = 0.5 + r() * 1.6;
        ctx.beginPath();
        for (let x = -RX; x <= RX; x += 10) {
          const y = y0 + amp * Math.sin(x * 0.012 + ph) + 0.6 * Math.sin(x * 0.07 + ph * 2);
          x === -RX ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      handle(0);
      ctx.clip();
      for (let i = 0; i < 12; i++) {
        const y0 = -12 + r() * 24;
        ctx.strokeStyle = `rgba(60,32,14,${0.1 + r() * 0.2})`;
        ctx.lineWidth = 0.6 + r();
        ctx.beginPath();
        ctx.moveTo(280, y0);
        ctx.lineTo(480, y0 + (r() - 0.5) * 3);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalCompositeOperation = "destination-out";
      ell(ctx, 448, 0, 10, 4.2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(255,220,180,.16)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, RX - 2, RY - 1, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      softSpot(ctx, -70, -30, 260, 80, "#ffdcae", 0.14);
    }
  };

  const dough = {
    box: [-292, -62, 292, 112],
    shadow: { rx: 276, ry: 94, a: 0.55, dy: 3 },
    draw(ctx, r) {
      const RX = 268, RY = RX * K, H = 12;
      const n = noise(18, r);
      const p = (y, s = 1) => blob(ctx, 0, y, RX * s, RY * s, 0.02, n);
      extrude(ctx, H, (y) => p(y), (f) => lerpHex("#a8692f", "#dba463", f), RX);
      p(-H);
      const g = ctx.createRadialGradient(-30, -H - 10, 10, 0, -H, RX);
      g.addColorStop(0, "#f2d9a6");
      g.addColorStop(0.72, "#eac98d");
      g.addColorStop(0.86, "#dba35e");
      g.addColorStop(1, "#b9773b");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(250,224,176,.55)";
      ctx.lineWidth = 7;
      p(-H - 2, 0.91);
      ctx.stroke();
      ctx.strokeStyle = "rgba(130,75,30,.25)";
      ctx.lineWidth = 3;
      p(-H, 0.85);
      ctx.stroke();
      // leopard char spots on the cornicione
      for (let i = 0; i < 46; i++) {
        const a = r() * TAU, d = 0.87 + r() * 0.13;
        const x = Math.cos(a) * RX * d, y = Math.sin(a) * RY * d - H - 1;
        const s = 2 + r() * 8;
        ctx.fillStyle = "rgba(140,80,32,.35)";
        ell(ctx, x, y, s * 1.8, s * 0.9);
        ctx.fill();
        ctx.fillStyle = `rgba(40,22,10,${0.5 + r() * 0.4})`;
        ell(ctx, x, y, s, s * 0.5);
        ctx.fill();
      }
      ctx.save();
      p(-H, 0.84);
      ctx.clip();
      speckle(ctx, r, 300, RX * 0.84, RY * 0.84, 0.5, 1.6, ["#ffffff"], 0.14, 0, -H);
      ctx.restore();
    }
  };

  const sauce = {
    box: [-250, -100, 250, 100],
    draw(ctx, r) {
      const RX = 226, RY = RX * K;
      const n = noise(16, r);
      blob(ctx, 0, 0, RX, RY, 0.035, n);
      const g = ctx.createRadialGradient(-30, -8, 6, 0, 0, RX);
      g.addColorStop(0, "#cf3a22");
      g.addColorStop(0.7, "#b02a17");
      g.addColorStop(1, "#8a1c0f");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      blob(ctx, 0, 0, RX, RY, 0.035, n);
      ctx.clip();
      speckle(ctx, r, 340, RX, RY, 1, 4, ["#7a160b", "#951f10"], 0.5);
      speckle(ctx, r, 220, RX, RY, 0.8, 3, ["#e2583a"], 0.4);
      speckle(ctx, r, 70, RX * 0.9, RY * 0.9, 0.5, 1.3, ["#2d4a18"], 0.7);
      speckle(ctx, r, 90, RX * 0.9, RY * 0.9, 0.4, 1.6, ["#ffd8c4"], 0.28);
      ctx.restore();
      softSpot(ctx, -60, -10, 110, 22, "#ffcfb8", 0.18);
    }
  };

  const mozzarella = {
    shadow: { rx: 40, ry: 14, a: 0.4, dy: 3 },
    pieces(r) {
      const spots = [[-140, -20], [-60, -62], [40, -70], [130, -30], [150, 50], [55, 30], [-40, 20], [-120, 68], [10, 92]];
      return spots.map(([x, z], i) => {
        const seed = r() * 1e4, R = 36 + r() * 14;
        return {
          x: x + (r() - 0.5) * 14, z: z + (r() - 0.5) * 14,
          box: [-64, -28, 64, 30],
          draw(ctx) {
            const rr = rng(seed + i);
            const n = noise(9, rr);
            const ry = R * K * 1.05;
            for (let y = 5; y >= 0; y--) {
              blob(ctx, 0, y, R, ry, 0.18, n);
              ctx.fillStyle = y ? "#d9c8a4" : "#efe5cc";
              ctx.fill();
            }
            blob(ctx, 0, 0, R * 0.97, ry * 0.97, 0.18, n);
            const g = ctx.createRadialGradient(-6, -3, 2, 0, 0, R);
            g.addColorStop(0, "#fffcf3");
            g.addColorStop(0.7, "#f7efdc");
            g.addColorStop(1, "#e9d8b2");
            ctx.fillStyle = g;
            ctx.fill();
            ctx.save();
            ctx.clip();
            for (let k = 0; k < 6; k++) {
              const a = rr() * TAU, d = 0.5 + rr() * 0.5;
              softSpot(ctx, Math.cos(a) * R * d, Math.sin(a) * ry * d, 6 + rr() * 9, 3 + rr() * 3, rr() > 0.5 ? "#d8a253" : "#b8732c", 0.5);
            }
            ctx.restore();
            softSpot(ctx, -R * 0.3, -ry * 0.3, R * 0.5, ry * 0.4, "#ffffff", 0.55);
          }
        };
      });
    }
  };

  const tomato = {
    shadow: { rx: 36, ry: 13, a: 0.4, dy: 2 },
    pieces(r) {
      const spots = [[-95, -40], [10, -30], [100, 10], [-60, 50], [70, 70]];
      return spots.map(([x, z], i) => {
        const R = 33 + r() * 5, seed = r() * 1e4;
        return {
          x: x + (r() - 0.5) * 12, z: z + (r() - 0.5) * 12,
          box: [-44, -22, 44, 22],
          draw(ctx) {
            const rr = rng(seed + i);
            const ry = R * K * 1.12;
            for (let y = 3; y >= 0; y--) {
              ell(ctx, 0, y, R, ry);
              ctx.fillStyle = y ? "#8f160c" : "#c1271a";
              ctx.fill();
            }
            ell(ctx, 0, 0, R * 0.9, ry * 0.9);
            const g = ctx.createRadialGradient(-4, -2, 2, 0, 0, R);
            g.addColorStop(0, "#f2735a");
            g.addColorStop(1, "#d73b26");
            ctx.fillStyle = g;
            ctx.fill();
            const lobes = 5;
            for (let k = 0; k < lobes; k++) {
              const a = (k / lobes) * TAU + rr() * 0.3;
              const cx = Math.cos(a) * R * 0.5, cy = Math.sin(a) * ry * 0.5;
              ctx.fillStyle = "rgba(246,182,90,.85)";
              ctx.save();
              ctx.translate(cx, cy);
              ctx.rotate(Math.atan2(Math.sin(a) * K, Math.cos(a)));
              ell(ctx, 0, 0, R * 0.22, ry * 0.3);
              ctx.fill();
              ctx.fillStyle = "#fde9b0";
              for (let s = 0; s < 4; s++) {
                ell(ctx, (rr() - 0.5) * R * 0.24, (rr() - 0.5) * ry * 0.3, 1.6, 0.9);
                ctx.fill();
              }
              ctx.restore();
            }
            ctx.fillStyle = "#f69a7c";
            ell(ctx, 0, 0, R * 0.16, ry * 0.16);
            ctx.fill();
            softSpot(ctx, -R * 0.3, -ry * 0.35, R * 0.4, ry * 0.3, "#ffffff", 0.5);
          }
        };
      });
    }
  };

  const basil = {
    shadow: { rx: 22, ry: 8, a: 0.35, dy: 3 },
    pieces(r) {
      const spots = [[-120, 20], [-30, -50], [60, -20], [120, 40], [-10, 60], [40, 100], [-70, -10]];
      return spots.map(([x, z], i) => {
        const rot = r() * TAU, L = 48 + r() * 18, W = 22 + r() * 8, seed = r() * 1e4;
        return {
          x: x + (r() - 0.5) * 16, z: z + (r() - 0.5) * 16,
          box: [-50, -30, 50, 30],
          draw(ctx) {
            const rr = rng(seed + i);
            ctx.save();
            ctx.scale(1, 0.55);
            ctx.rotate(rot);
            const leaf = (dx, dy) => {
              ctx.beginPath();
              ctx.moveTo(-L / 2 + dx, dy);
              ctx.bezierCurveTo(-L * 0.2 + dx, -W + dy, L * 0.3 + dx, -W * 0.7 + dy, L / 2 + dx, dy);
              ctx.bezierCurveTo(L * 0.3 + dx, W * 0.7 + dy, -L * 0.2 + dx, W * 0.9 + dy, -L / 2 + dx, dy);
              ctx.closePath();
            };
            leaf(3, 5);
            ctx.fillStyle = "rgba(40,8,4,.35)";
            ctx.fill();
            leaf(0, 0);
            const g = ctx.createLinearGradient(0, -W, 0, W);
            g.addColorStop(0, "#5cb33a");
            g.addColorStop(0.5, "#3f8f2a");
            g.addColorStop(1, "#2a6a1d");
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = "rgba(170,230,130,.6)";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(-L / 2, 0);
            ctx.quadraticCurveTo(0, -2, L / 2, 0);
            ctx.stroke();
            ctx.lineWidth = 0.7;
            for (let k = -3; k <= 3; k++) {
              if (!k) continue;
              const x0 = (k / 4) * L * 0.4;
              ctx.beginPath();
              ctx.moveTo(x0, -1);
              ctx.quadraticCurveTo(x0 + 6, -W * 0.35, x0 + 12, -W * 0.55);
              ctx.moveTo(x0, 0);
              ctx.quadraticCurveTo(x0 + 6, W * 0.35, x0 + 12, W * 0.55);
              ctx.stroke();
            }
            ctx.strokeStyle = "#3a6b1e";
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(-L / 2, 0);
            ctx.lineTo(-L / 2 - 8, 1);
            ctx.stroke();
            ctx.restore();
            softSpot(ctx, -6, -4, 16, 5, "#e8ffd0", 0.35 + rr() * 0.2);
          }
        };
      });
    }
  };

  /* =================================================================
     STEAK
     ================================================================= */
  const woodSlice = {
    box: [-352, -134, 352, 184],
    shadow: { rx: 345, ry: 120, a: 0.85, dy: 24 },
    draw(ctx, r) {
      const RX = 330, RY = RX * K, H = 46;
      const n = noise(20, r), n2 = noise(50, r);
      const p = (y, s = 1) => blob(ctx, 0, y, RX * s, RY * s, 0.022, n, n2, 0.008);
      extrude(ctx, H, (y) => p(y), (f) => lerpHex("#1c110a", "#3b2515", f), RX);
      // bark streaks
      for (let i = 0; i < 420; i++) {
        const a = r() * Math.PI;
        const x = Math.cos(a) * RX * (0.99 + r() * 0.02);
        const y0 = Math.sin(a) * RY - r() * H * 0.95;
        const len = 5 + r() * 18;
        ctx.strokeStyle = r() > 0.45 ? `rgba(10,6,3,${0.4 + r() * 0.4})` : `rgba(110,78,50,${0.15 + r() * 0.25})`;
        ctx.lineWidth = 0.8 + r() * 2;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x + (r() - 0.5) * 2, Math.min(y0 + len, Math.sin(a) * RY));
        ctx.stroke();
      }
      const ty = -H;
      p(ty);
      ctx.fillStyle = "#24160c";
      ctx.fill();
      p(ty, 0.965);
      ctx.fillStyle = "#d8ab77";
      ctx.fill();
      p(ty, 0.9);
      const g = ctx.createRadialGradient(-30, ty - 10, 6, 0, ty, RX * 0.9);
      g.addColorStop(0, "#d19c63");
      g.addColorStop(0.55, "#b17a45");
      g.addColorStop(1, "#c79260");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      p(ty, 0.9);
      ctx.clip();
      for (let k = 1; k <= 18; k++) {
        const s = (k / 19) * 0.9 + (r() - 0.5) * 0.01;
        const nk = noise(12, r);
        blob(ctx, 14 * (1 - s), ty + 3 * (1 - s), RX * s, RY * s, 0.03, nk);
        ctx.strokeStyle = `rgba(92,52,22,${0.14 + r() * 0.2})`;
        ctx.lineWidth = 0.8 + r() * 1.8;
        ctx.stroke();
      }
      for (let c = 0; c < 4; c++) {
        const a = r() * TAU;
        ctx.strokeStyle = "rgba(50,28,12,.6)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(14, ty + 3);
        let x = 14, y = ty + 3;
        for (let j = 0; j < 8; j++) {
          x += Math.cos(a + (r() - 0.5) * 0.4) * RX * 0.07;
          y += Math.sin(a + (r() - 0.5) * 0.4) * RY * 0.07;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      speckle(ctx, r, 400, RX * 0.9, RY * 0.9, 0.5, 1.5, ["#f0cfa4", "#6d4321"], 0.2, 0, ty);
      ctx.restore();
      ctx.fillStyle = "#5a3416";
      ell(ctx, 14, ty + 3, 5, 2);
      ctx.fill();
      softSpot(ctx, -80, ty - 20, 260, 80, "#ffe3bc", 0.16);
    }
  };

  const pan = {
    box: [-250, -104, 460, 100],
    shadow: { rx: 240, ry: 84, a: 0.8, dy: 6 },
    draw(ctx, r) {
      const RX = 235, RY = RX * K, H = 44;
      // handle
      ctx.beginPath();
      ctx.moveTo(RX - 26, -H - 4);
      ctx.bezierCurveTo(300, -H - 12, 360, -H - 24, 420, -H - 30);
      ctx.arc(420, -H - 18, 12, -Math.PI / 2, Math.PI / 2);
      ctx.bezierCurveTo(360, -H - 10, 300, -H + 4, RX - 26, -H + 18);
      ctx.closePath();
      let g = ctx.createLinearGradient(0, -H - 30, 0, -H + 18);
      g.addColorStop(0, "#3a3a3d");
      g.addColorStop(0.4, "#1c1c1e");
      g.addColorStop(1, "#08080a");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.12)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(RX - 20, -H - 4);
      ctx.bezierCurveTo(300, -H - 12, 360, -H - 24, 420, -H - 30);
      ctx.stroke();
      ctx.globalCompositeOperation = "destination-out";
      ell(ctx, 410, -H - 18, 8, 4.5);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // body
      extrude(ctx, H, (y, f) => ell(ctx, 0, y, RX * (0.95 + 0.05 * f), RY * (0.95 + 0.05 * f)),
        (f) => lerpHex("#08080a", "#232326", f), RX);
      ctx.save();
      ctx.globalCompositeOperation = "source-atop";
      speckle(ctx, r, 500, RX, 24, 0.4, 1.4, ["#4a4a4e", "#000000"], 0.25, 0, -H / 2 + RY * 0.5);
      ctx.restore();
      // rim
      ell(ctx, 0, -H, RX, RY);
      ctx.fillStyle = "#2c2c2f";
      ctx.fill();
      ell(ctx, 0, -H, RX * 0.94, RY * 0.94);
      g = ctx.createLinearGradient(0, -H - RY, 0, -H + RY);
      g.addColorStop(0, "#2a2a2d");
      g.addColorStop(0.5, "#131315");
      g.addColorStop(1, "#0b0b0c");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ell(ctx, 0, -H, RX * 0.94, RY * 0.94);
      ctx.clip();
      ell(ctx, 0, -H + 24, RX * 0.88, RY * 0.88);
      g = ctx.createRadialGradient(-40, -H + 14, 10, 0, -H + 24, RX * 0.88);
      g.addColorStop(0, "#1b1b1d");
      g.addColorStop(1, "#09090a");
      ctx.fillStyle = g;
      ctx.fill();
      softSpot(ctx, -50, -H + 18, 130, 30, "#c08a52", 0.14);
      speckle(ctx, r, 300, RX * 0.88, RY * 0.88, 0.3, 1, ["#6a6a70"], 0.2, 0, -H + 24);
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -H, RX - 1, RY - 0.5, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      ctx.beginPath();
      ctx.ellipse(0, -H, RX - 1, RY - 0.5, 0, 0.1, Math.PI - 0.1);
      ctx.stroke();
    }
  };

  const ribeye = {
    box: [-225, -128, 225, 90],
    shadow: { rx: 186, ry: 60, a: 0.75, dy: 3 },
    draw(ctx, r) {
      const RX = 188, RZ = 136, H = 52, RY = RZ * K;
      const n1 = noise(7, r), n2 = noise(22, r);
      const p = (y, s = 1) => blob(ctx, 0, y, RX * s, RY * s, 0.09, n1, n2, 0.025);
      extrude(ctx, H, (y) => p(y), (f) => (f > 0.88 ? "#7a3d1c" : lerpHex("#241007", "#5a2a13", f)), RX);
      for (let i = 0; i < 200; i++) {
        const a = r() * Math.PI;
        const x = Math.cos(a) * RX * (0.95 + r() * 0.06);
        const y = Math.sin(a) * RY - r() * H;
        ctx.fillStyle = r() > 0.5 ? "#120602" : "#7b3c1b";
        ctx.globalAlpha = 0.4 + r() * 0.5;
        ell(ctx, x, y, 1 + r() * 3, 1 + r() * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      p(-H);
      let g = ctx.createRadialGradient(-30, -H - 8, 6, 0, -H, RX);
      g.addColorStop(0, "#94502a");
      g.addColorStop(0.55, "#6c3417");
      g.addColorStop(1, "#43200d");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      p(-H);
      ctx.clip();
      // fat cap along the left
      ctx.strokeStyle = "rgba(196,150,100,.55)";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.ellipse(-6, -H, RX * 0.94, RY * 0.9, 0, Math.PI * 0.62, Math.PI * 1.32);
      ctx.stroke();
      // grill marks
      ctx.save();
      ctx.translate(0, -H);
      ctx.scale(1, K);
      ctx.rotate(0.62);
      for (let i = -5; i <= 5; i++) {
        const y = i * 38;
        ctx.fillStyle = "rgba(40,16,6,.4)";
        ctx.fillRect(-320, y - 10, 640, 20);
        ctx.fillStyle = "rgba(14,5,2,.75)";
        ctx.fillRect(-320, y - 5, 640, 10);
      }
      ctx.restore();
      speckle(ctx, r, 600, RX, RY, 0.6, 2.6, ["#140602"], 0.6, 0, -H);
      speckle(ctx, r, 260, RX, RY, 0.8, 2.4, ["#94512a", "#a8653a"], 0.45, 0, -H);
      speckle(ctx, r, 70, RX * 0.9, RY * 0.9, 0.5, 1.2, ["#ffffff"], 0.55, 0, -H);
      for (let i = 0; i < 9; i++) {
        const x = (r() - 0.5) * RX * 1.4, y = -H + (r() - 0.5) * RY * 1.2;
        ctx.strokeStyle = "rgba(214,170,124,.24)";
        ctx.lineWidth = 1 + r();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 12, y - 4, x + 18, y + 4, x + 32 + r() * 20, y + (r() - 0.5) * 8);
        ctx.stroke();
      }
      speckle(ctx, r, 120, RX * 0.85, RY * 0.85, 0.5, 2, ["#ffe0bf"], 0.22, 0, -H);
      ctx.restore();
      ctx.strokeStyle = "rgba(30,10,4,.6)";
      ctx.lineWidth = 2;
      p(-H);
      ctx.stroke();
      softSpot(ctx, -50, -H - 10, 100, 22, "#ffcfa0", 0.14);
    }
  };

  const butterPat = {
    box: [-44, -52, 44, 30],
    shadow: { rx: 32, ry: 11, a: 0.5, dy: 2 },
    draw(ctx) {
      const S = 22, Hh = 22, a = 0.55, c = Math.cos(a), s = Math.sin(a);
      const P = [[-S, -S], [S, -S], [S, S], [-S, S]].map(([x, z]) => [x * c - z * s, (x * s + z * c)]);
      const scr = ([x, z], y) => [x, z * K + y];
      ctx.lineJoin = "round";
      for (let i = 0; i < 4; i++) {
        const A = P[i], B = P[(i + 1) % 4];
        const nx = B[1] - A[1], nz = -(B[0] - A[0]);
        if (nz <= 0) continue;
        const q = [scr(A, 0), scr(B, 0), scr(B, -Hh), scr(A, -Hh)];
        ctx.beginPath();
        q.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = nx < 0 ? "#f0d483" : "#d6b25a";
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      P.forEach((pt, k) => {
        const [x, y] = scr(pt, -Hh);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "#fbecb4";
      ctx.strokeStyle = "#fbecb4";
      ctx.lineWidth = 3;
      ctx.fill();
      ctx.stroke();
      softSpot(ctx, -6, -Hh - 2, 14, 5, "#ffffff", 0.6);
    }
  };

  const butterMelt = {
    box: [-130, -54, 130, 54],
    draw(ctx, r) {
      const n = noise(10, r);
      blob(ctx, 0, 0, 100, 32, 0.18, n);
      const g = ctx.createRadialGradient(-10, -4, 4, 0, 0, 100);
      g.addColorStop(0, "rgba(255,226,140,.85)");
      g.addColorStop(0.6, "rgba(236,182,80,.55)");
      g.addColorStop(1, "rgba(200,130,40,.25)");
      ctx.fillStyle = g;
      ctx.fill();
      for (let i = 0; i < 14; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 0.8;
        ctx.strokeStyle = "rgba(255,245,210,.55)";
        ctx.lineWidth = 0.8;
        ell(ctx, Math.cos(a) * 90 * d, Math.sin(a) * 28 * d, 1.5 + r() * 3, 1 + r() * 1.5);
        ctx.stroke();
      }
      blob(ctx, -6, -4, 18, 7, 0.2, noise(6, r));
      ctx.fillStyle = "#f8e6a6";
      ctx.fill();
      softSpot(ctx, -30, -8, 50, 9, "#ffffff", 0.55);
      softSpot(ctx, 30, 6, 30, 6, "#ffffff", 0.3);
    }
  };

  const thyme = {
    box: [-112, -44, 112, 44],
    shadow: { rx: 70, ry: 10, a: 0.3, dy: 3 },
    draw(ctx, r) {
      ctx.save();
      ctx.scale(1, 0.55);
      const stem = (x0, y0, x1, y1, cx, cy, w) => {
        ctx.strokeStyle = "#6e4b2a";
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, cy, x1, y1);
        ctx.stroke();
        for (let t = 0.08; t <= 1; t += 0.06) {
          const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
          const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
          const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
          const dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
          const ang = Math.atan2(dy, dx);
          for (const side of [-1, 1]) {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(ang + side * (0.9 + r() * 0.4));
            ctx.fillStyle = r() > 0.5 ? "#5f7343" : "#7d8f58";
            ell(ctx, 5, 0, 5 + r() * 2.5, 2.2);
            ctx.fill();
            ctx.restore();
          }
        }
      };
      ctx.translate(0, 8);
      stem(-100, 14, 96, -10, 0, 30, 2.6);
      stem(-30, 22, 30, -40, -10, -10, 1.6);
      stem(30, 8, 90, 34, 60, 14, 1.4);
      ctx.restore();
    }
  };

  window.EMBER_ART = {
    K, rng, softSpot,
    art: {
      plate, bunBottom, patty, cheese, cheeseMelt, pickles, lettuce, bunTop,
      board, dough, sauce, mozzarella, tomato, basil,
      woodSlice, pan, ribeye, butterPat, butterMelt, thyme
    }
  };
})();
