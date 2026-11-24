/* =====================================================================
   EMBER — page logic: scroll engine, dish panels, cart, ambience
   ===================================================================== */
(function () {
  const DATA = window.EMBER_DATA;
  const R = DATA.restaurant;
  const dishes = DATA.dishes;
  const { DishAssets, renderDish, prog, smooth, easeInOut, clamp, lerp } = window.EMBER_STAGE;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const money = (n, fixed) =>
    new Intl.NumberFormat(R.locale, {
      style: "currency", currency: R.currency,
      minimumFractionDigits: fixed || n % 1 ? 2 : 0, maximumFractionDigits: 2
    }).format(n);

  const params = new URLSearchParams(location.search);
  const reduced = params.get("motion") === "reduce" ||
    (params.get("motion") !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.documentElement.classList.toggle("is-reduced", reduced);

  /* ============================ static content ============================ */
  $(".year").textContent = new Date().getFullYear();
  const k = R.kitchen;
  $(".kitchen__title").innerHTML = esc(k.title).replace(/\n(.*)$/, "\n<em>$1</em>");
  $(".kitchen__body").textContent = k.body;
  $(".kitchen__facts").innerHTML = k.facts.map((f) => `<li><strong>${esc(f.value)}</strong><span>${esc(f.label)}</span></li>`).join("");
  $(".visit__address").innerHTML = R.visit.address.map(esc).join("<br>");
  $(".visit__hours").innerHTML = R.visit.hours.map(esc).join("<br>");
  $(".visit__contact").innerHTML =
    `<a href="tel:${esc(R.visit.phone.replace(/[^+\d]/g, ""))}">${esc(R.visit.phone)}</a><br><a href="mailto:${esc(R.visit.email)}">${esc(R.visit.email)}</a>`;
  $(".hero-copy .eyebrow").textContent = R.tagline;
  $$(".kitchen__inner > *, .visit__inner > *").forEach((el) => el.classList.add("reveal"));

  /* ============================ cart ============================ */
  const STORE = "ember-cart-v1";
  const cart = {
    items: (() => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } })(),
    save() { try { localStorage.setItem(STORE, JSON.stringify(this.items)); } catch {} },
    add(d, qty, option) {
      const key = d.id + (option ? "|" + option : "");
      const hit = this.items.find((i) => i.key === key);
      if (hit) hit.qty += qty;
      else this.items.push({ key, id: d.id, name: d.name, price: d.price, option: option || null, qty });
      this.changed();
    },
    setQty(key, q) {
      const it = this.items.find((i) => i.key === key);
      if (!it) return;
      it.qty = Math.max(0, Math.min(20, q));
      if (!it.qty) this.items = this.items.filter((i) => i !== it);
      this.changed();
    },
    clear() { this.items = []; this.changed(); },
    count() { return this.items.reduce((a, i) => a + i.qty, 0); },
    total() { return this.items.reduce((a, i) => a + i.qty * i.price, 0); },
    changed() { this.save(); renderCart(); }
  };

  const drawer = $("#cart"), backdrop = $(".drawer-backdrop"), bag = $(".bag");
  let lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement;
    renderCart();
    backdrop.hidden = false;
    requestAnimationFrame(() => { backdrop.classList.add("is-open"); drawer.classList.add("is-open"); });
    drawer.setAttribute("aria-hidden", "false");
    bag.setAttribute("aria-expanded", "true");
    setTimeout(() => $(".drawer__close").focus(), 60);
  }
  function closeCart() {
    backdrop.classList.remove("is-open");
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    bag.setAttribute("aria-expanded", "false");
    setTimeout(() => (backdrop.hidden = true), 400);
    if (drawer.querySelector(".confirm")) setTimeout(resetDrawerBody, 500);
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  }
  bag.addEventListener("click", openCart);
  backdrop.addEventListener("click", closeCart);
  $(".drawer__close").addEventListener("click", closeCart);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("is-open")) closeCart(); });

  const bodyHTML = $(".drawer__body").innerHTML;
  function resetDrawerBody() {
    $(".drawer__body").innerHTML = bodyHTML;
    $(".drawer__foot").hidden = false;
    renderCart();
  }

  function renderCart() {
    const list = $(".cart-list");
    const n = cart.count();
    const badge = $(".bag-count");
    badge.textContent = n;
    badge.classList.toggle("has-items", n > 0);
    bag.setAttribute("aria-label", n ? `Open your order, ${n} item${n > 1 ? "s" : ""}` : "Open your order");
    if (!list) return;
    drawer.classList.toggle("has-items", n > 0);
    list.innerHTML = cart.items.map((i) => `
      <li class="cart-item" data-key="${esc(i.key)}">
        <div>
          <div class="cart-item__name">${esc(i.name)}</div>
          ${i.option ? `<div class="cart-item__opt">${esc(i.option)}</div>` : ""}
        </div>
        <div class="cart-item__price">${money(i.price * i.qty, true)}</div>
        <div class="cart-item__row">
          <div class="stepper" role="group" aria-label="Quantity for ${esc(i.name)}">
            <button type="button" data-q="-1" aria-label="Remove one">−</button>
            <output>${i.qty}</output>
            <button type="button" data-q="1" aria-label="Add one">+</button>
          </div>
          <button type="button" class="cart-item__remove">Remove</button>
        </div>
      </li>`).join("");
    $(".cart-total__value").textContent = money(cart.total(), true);
    $(".checkout").disabled = n === 0;
  }
  drawer.addEventListener("click", (e) => {
    const li = e.target.closest(".cart-item");
    if (!li) return;
    const it = cart.items.find((i) => i.key === li.dataset.key);
    if (!it) return;
    const q = e.target.closest("[data-q]");
    if (q) cart.setQty(it.key, it.qty + Number(q.dataset.q));
    if (e.target.closest(".cart-item__remove")) cart.setQty(it.key, 0);
  });
  $(".checkout").addEventListener("click", () => {
    if (!cart.count()) return;
    const total = money(cart.total(), true);
    const ref = "EM-" + Math.random().toString(36).slice(2, 7).toUpperCase();
    cart.clear();
    $(".drawer__foot").hidden = true;
    $(".drawer__body").innerHTML = `
      <div class="confirm">
        <div class="confirm__mark"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h3>It’s on the fire.</h3>
        <p>Your order of ${total} has been sent to the kitchen.</p>
        <small>Order ${ref}</small>
      </div>`;
  });

  let toastTimer;
  function toast(msg) {
    const t = $(".toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  /* ============================ dish panels ============================ */
  function buildPanel(d, i) {
    const el = document.createElement("article");
    el.className = "dish-panel";
    el.dataset.dish = d.id;
    el.setAttribute("aria-labelledby", `dish-${d.id}-name`);
    const opt = d.options;
    el.innerHTML = `
      <p class="kicker">${String(i + 1).padStart(2, "0")}<i></i>${esc(d.category)}</p>
      <h2 class="dish-name" id="dish-${d.id}-name">${esc(d.name)}</h2>
      <p class="dish-desc">${esc(d.description)}</p>
      <div class="dish-meta">
        <span class="dish-price">${money(d.price)}</span>
        ${d.weight ? `<span class="dish-weight">${esc(d.weight)}</span>` : ""}
      </div>
      ${opt ? `<div class="pills" role="radiogroup" aria-label="${esc(opt.label)}">${opt.choices.map((c, k) =>
        `<button type="button" class="pill" role="radio" aria-checked="${k === (opt.default || 0)}">${esc(c)}</button>`).join("")}</div>` : ""}
      <div class="actions">
        <div class="stepper" role="group" aria-label="Quantity">
          <button type="button" data-step="-1" aria-label="Decrease quantity">−</button>
          <output aria-live="polite">1</output>
          <button type="button" data-step="1" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="btn btn--primary add">Add to order</button>
      </div>`;
    let qty = 1;
    let choice = opt ? opt.choices[opt.default || 0] : null;
    const out = $("output", el);
    el.addEventListener("click", (e) => {
      const st = e.target.closest("[data-step]");
      if (st) { qty = clamp(qty + Number(st.dataset.step), 1, 20); out.textContent = qty; }
      const pill = e.target.closest(".pill");
      if (pill) {
        $$(".pill", el).forEach((p) => p.setAttribute("aria-checked", String(p === pill)));
        choice = pill.textContent;
      }
      const add = e.target.closest(".add");
      if (add) {
        cart.add(d, qty, choice);
        toast(`${qty} × ${d.name}${choice ? " · " + choice : ""} added`);
        bag.classList.remove("bump"); void bag.offsetWidth; bag.classList.add("bump");
        add.textContent = "Added ✓"; add.classList.add("is-added");
        setTimeout(() => { add.textContent = "Add to order"; add.classList.remove("is-added"); }, 1400);
        qty = 1; out.textContent = 1;
      }
    });
    // arrow keys inside the radio group
    $(".pills", el)?.addEventListener("keydown", (e) => {
      if (!/Arrow(Left|Right|Up|Down)/.test(e.key)) return;
      const ps = $$(".pill", el);
      const cur = ps.findIndex((p) => p.getAttribute("aria-checked") === "true");
      const nx = ps[(cur + (/Right|Down/.test(e.key) ? 1 : ps.length - 1)) % ps.length];
      nx.click(); nx.focus(); e.preventDefault();
    });
    return el;
  }

  /* ============================ category bar ============================ */
  const catBar = $(".category-bar");
  const cats = [];
  dishes.forEach((d, i) => { if (!cats.find((c) => c.name === d.category)) cats.push({ name: d.category, index: i }); });
  catBar.innerHTML = `<div class="category-bar__inner">${cats.map((c) =>
    `<button type="button" data-index="${c.index}">${esc(c.name)}</button>`).join("")}</div>`;
  const catButtons = $$("button", catBar);
  function setActiveDish(i) {
    const cat = dishes[i] && dishes[i].category;
    catButtons.forEach((b) => b.setAttribute("aria-current", String(dishes[b.dataset.index].category === cat)));
  }

  /* ============================ header nav + progress ============================ */
  const navLinks = $$(".main-nav a");
  const fill = $(".scroll-progress__fill");
  function updateChrome() {
    const max = document.documentElement.scrollHeight - innerHeight;
    fill.style.transform = `scaleY(${max > 0 ? scrollY / max : 0})`;
    const kTop = $("#kitchen").getBoundingClientRect().top;
    const vTop = $("#visit").getBoundingClientRect().top;
    const which = vTop < innerHeight * 0.55 ? "visit" : kTop < innerHeight * 0.55 ? "kitchen" : "menu";
    navLinks.forEach((a) => a.classList.toggle("is-active", a.dataset.nav === which));
    catBar.classList.toggle("is-dim", which !== "menu");
  }

  // fade-in for the editorial sections
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
  }), { threshold: 0.15 });
  $$(".reveal").forEach((el) => io.observe(el));

  /* ============================ assets ============================ */
  const assets = dishes.map((d) => new DishAssets(d));
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));

  /* ============================ ambience: embers ============================ */
  (function embers() {
    const c = $(".embers"), x = c.getContext("2d");
    let w, h, dpr;
    const P = [];
    const N = reduced ? 0 : innerWidth < 760 ? 26 : 46;
    function size() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth; h = innerHeight;
      c.width = w * dpr; c.height = h * dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    addEventListener("resize", size);
    for (let i = 0; i < N; i++) P.push(spawn(true));
    function spawn(any) {
      const dust = Math.random() < 0.45;
      return {
        x: Math.random() * w, y: any ? Math.random() * h : h + 20,
        vx: (Math.random() - 0.5) * 0.2, vy: -(dust ? 0.08 + Math.random() * 0.15 : 0.25 + Math.random() * 0.55),
        r: dust ? 0.6 + Math.random() * 0.9 : 0.8 + Math.random() * 1.6,
        dust, life: Math.random() * 100, flick: Math.random() * 10
      };
    }
    if (!N) return;
    let last = performance.now();
    (function loop(now) {
      const dt = Math.min(50, now - last) / 16.7; last = now;
      if (!document.hidden) {
        x.clearRect(0, 0, w, h);
        for (const p of P) {
          p.life += dt * 0.01;
          p.x += (p.vx + Math.sin(p.life * 3 + p.flick) * 0.15) * dt;
          p.y += p.vy * dt;
          if (p.y < -20) Object.assign(p, spawn(false));
          const a = p.dust ? 0.18 : 0.35 + 0.35 * Math.sin(now * 0.004 + p.flick);
          x.fillStyle = p.dust ? `rgba(255,236,214,${a})` : `rgba(255,${130 + (p.flick * 8) | 0},60,${a})`;
          if (!p.dust) { x.shadowColor = "rgba(255,120,40,.9)"; x.shadowBlur = 8; } else x.shadowBlur = 0;
          x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fill();
        }
        x.shadowBlur = 0;
      }
      requestAnimationFrame(loop);
    })(last);
  })();

  /* ============================ REDUCED MOTION: static menu ============================ */
  if (reduced) {
    $("#menu-track").hidden = true;
    const wrap = $(".menu-static");
    wrap.hidden = false;
    const canvases = [];
    dishes.forEach((d, i) => {
      const sec = document.createElement("section");
      sec.className = "static-dish";
      sec.id = `dish-${d.id}`;
      const vis = document.createElement("div");
      vis.className = "static-visual";
      const cv = document.createElement("canvas");
      cv.setAttribute("role", "img");
      cv.setAttribute("aria-label", d.name);
      vis.appendChild(cv);
      sec.appendChild(buildPanel(d, i));
      sec.appendChild(vis);
      wrap.appendChild(sec);
      canvases.push(cv);
      io.observe(sec);
      new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActiveDish(i); }), { rootMargin: "-45% 0px -45% 0px" }).observe(sec);
    });
    const paintStatic = () => canvases.forEach((cv, i) => {
      const d = dishes[i], f = d.visual.frame;
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = Math.min((r.width * 0.92) / f.width, (r.height * 0.8) / f.height);
      const view = { ox: r.width / 2, oy: r.height * 0.55 - f.focusY * s, s, dropFrom: 600, slideFrom: 600 };
      assets[i].preload().then(() => {
        assets[i].build(s * dpr);
        ctx.clearRect(0, 0, r.width, r.height);
        renderDish(ctx, assets[i], d.visual.reveal[0], view, 1.7);
      });
    });
    paintStatic();
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(paintStatic, 200); });
    catButtons.forEach((b) => b.addEventListener("click", () =>
      $(`#dish-${dishes[b.dataset.index].id}`).scrollIntoView({ block: "start" })));
    setActiveDish(0);
    addEventListener("scroll", updateChrome, { passive: true });
    updateChrome();
    renderCart();
    return;
  }

  /* ============================ SCROLL-TO-BUILD STAGE ============================ */
  const track = $("#menu-track");
  const stage = $(".stage");
  const canvas = $(".stage-canvas");
  const ctx = canvas.getContext("2d");
  const panelsEl = $(".panels");
  const cue = $(".scroll-cue");
  const heroCopy = $(".hero-copy");
  const light = $(".stage-light");
  const panels = dishes.map((d, i) => panelsEl.appendChild(buildPanel(d, i)));
  const ticks = $(".scroll-progress__ticks");

  let W = 0, H = 0, dpr = 1, unit = 1, trackTop = 0, totalVh = 0, dirty = true;
  const starts = [];
  let lastW = 0, lastH = 0;

  function measure(force) {
    const w = stage.clientWidth, h = innerHeight;
    if (!force && w === lastW && Math.abs(h - lastH) < 140) return false;
    lastW = w; lastH = h;
    W = w; H = h;
    dpr = Math.min(devicePixelRatio || 1, W < 760 ? 1.75 : 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    dirty = true;
    unit = H / 100;
    totalVh = 0;
    dishes.forEach((d, i) => { starts[i] = totalVh; totalVh += d.scroll; });
    track.style.height = `${totalVh * unit + H}px`;
    trackTop = track.getBoundingClientRect().top + scrollY;
    // dish markers on the progress rail
    const max = document.documentElement.scrollHeight - innerHeight;
    ticks.innerHTML = dishes.map((d, i) => {
      const y = (trackTop + (starts[i] + d.scroll * restT(d)) * unit) / max;
      return `<span style="top:${(y * 100).toFixed(2)}%"></span>`;
    }).join("");
    assets.forEach((a, i) => { if (a.scale) a.build(viewFor(dishes[i], 0).s * dpr); });
    return true;
  }

  const restT = (d) => Math.min(0.98, d.visual.reveal[1] + 0.04);
  const isMobile = () => W < 760;

  function viewFor(d, r) {
    const f = d.visual.frame;
    let s, cx, cy;
    if (isMobile()) {
      const s0 = Math.min((W * 1.02) / f.width, (H * 0.44) / f.height);
      s = s0 * lerp(1, 0.94, r);
      cx = W / 2;
      cy = lerp(H * 0.5, H * 0.4, r);
    } else {
      const s0 = Math.min((W * 0.54) / f.width, ((H - 150) * 0.62) / f.height);
      s = s0 * lerp(1, 0.9, r);
      cx = lerp(W * 0.5, W * 0.665, r);
      cy = lerp(H * 0.57, H * 0.56, r);
    }
    const oy = cy - f.focusY * s;
    return { ox: cx, oy, s, dropFrom: oy / s + 380, slideFrom: (W * 0.5) / s + 420 };
  }

  function ensure(i) {
    const a = assets[i];
    if (!a) return;
    a.preload();
    if (!a.scale) a.build(viewFor(dishes[i], 0).s * dpr);
  }
  function warm(i) {
    // build the current dish now, the next one when the browser is idle; the rest stay lazy
    ensure(i);
    if (assets[i + 1] && !assets[i + 1].scale) idle(() => ensure(i + 1));
  }

  // smoothed, scrubbed position (in % of screen height along the track)
  let target = 0, pos = 0, lastPos = -1, lastDish = -1, lastT = 0;
  const readTarget = () => clamp((scrollY - trackTop) / unit, 0, totalVh);

  function locate(p) {
    let i = dishes.length - 1;
    for (let k = 0; k < dishes.length; k++) {
      if (p < starts[k] + dishes[k].scroll) { i = k; break; }
    }
    return { i, t: clamp((p - starts[i]) / dishes[i].scroll) };
  }

  function draw(now) {
    const { i, t } = locate(pos);
    const d = dishes[i], v = d.visual;
    if (i !== lastDish) { warm(i); setActiveDish(i); lastDish = i; }

    const rv = easeInOut(prog(t, v.reveal));
    const view = viewFor(d, rv);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const res = renderDish(ctx, assets[i], t, view, now / 1000);

    // panels
    panels.forEach((p, k) => {
      let a = 0;
      if (k === i) {
        const [r0, r1] = v.reveal;
        a = smooth(prog(t, [r0 + (r1 - r0) * 0.35, r1 + 0.02]));
        if (v.exit) a *= 1 - smooth(prog(t, [v.exit[0] - 0.035, v.exit[0] + 0.005]));
      }
      if (p._a === a) return;
      p._a = a;
      p.style.opacity = a.toFixed(3);
      const off = (1 - a) * 26;
      p.style.transform = isMobile() ? `translateY(${off}px)` : `translateY(calc(-50% + ${off}px))`;
      const live = a > 0.6;
      p.classList.toggle("is-live", live);
      if (live) p.removeAttribute("inert"); else p.setAttribute("inert", "");
    });

    // hero cue sits under the plate and fades as the build starts
    const heroA = i === 0 ? 1 - smooth(clamp(t / 0.04)) : 0;
    cue.style.opacity = heroA.toFixed(3);
    cue.style.top = `${Math.min(H - 40, view.oy + 150 * view.s)}px`;
    heroCopy.style.opacity = heroA.toFixed(3);
    light.style.transform = `translateX(${(view.ox - W / 2) * 0.6}px)`;
    return res.active;
  }

  let lastNow = performance.now(), active = true;
  function frame(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    const diff = target - pos;
    if (Math.abs(diff) > 0.02) { pos += diff * (1 - Math.exp(-dt * 9)); dirty = true; }
    else if (pos !== target) { pos = target; dirty = true; }
    const onStage = scrollY < trackTop + totalVh * unit + H;
    if (onStage && !document.hidden && (dirty || active)) {
      active = draw(now);
      dirty = false;
      lastPos = pos;
    }
    requestAnimationFrame(frame);
  }

  function onScroll() {
    target = readTarget();
    updateChrome();
  }

  catButtons.forEach((b) => b.addEventListener("click", () => {
    const i = Number(b.dataset.index), d = dishes[i];
    const y = trackTop + (starts[i] + d.scroll * restT(d)) * unit;
    // pre-build every dish we will fly through
    const from = locate(pos).i;
    for (let k = Math.min(from, i); k <= Math.max(from, i); k++) ensure(k);
    scrollTo({ top: y, behavior: "smooth" });
  }));
  $$('.main-nav a[data-nav="menu"]').forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault(); scrollTo({ top: 0, behavior: "smooth" });
  }));

  let rt;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (measure()) { panels.forEach((p) => (p._a = -1)); onScroll(); dirty = true; } }, 120);
  });
  addEventListener("scroll", onScroll, { passive: true });

  if (params.has("debug")) {
    // test hook: draw synchronously at the current scroll position
    window.EMBER_DEBUG = { draw() { target = pos = readTarget(); draw(performance.now()); } };
  }

  measure(true);
  ensure(0);
  target = pos = readTarget();
  onScroll();
  warm(locate(pos).i);
  renderCart();
  requestAnimationFrame(frame);
  // fonts can shift the layout slightly once loaded
  document.fonts && document.fonts.ready.then(() => { measure(true); onScroll(); dirty = true; });
})();
