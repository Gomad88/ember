# EMBER: scroll-to-build menu

A one-page site for a wood-fired restaurant. As you scroll, each dish builds itself layer by layer. Plain HTML/CSS/JS with no build step and no dependencies.

## Run it

```bash
python3 -m http.server 4321 --directory ember
```

Then open http://localhost:4321. Any static host works (Netlify, Vercel, S3, nginx).

Useful URL flags:
- `?motion=reduce` previews the reduced-motion version (finished dishes that fade in).
- `?motion=full` forces the full build even when the OS asks for reduced motion.
- `?debug` exposes `EMBER_DEBUG.draw()` for testing.

## Make it your restaurant: `js/menu-data.js`

This is the only file you need to edit.

| Field | What it does |
|---|---|
| `restaurant.name / locale / currency` | Logo and price formatting (via `Intl.NumberFormat`) |
| `restaurant.kitchen` | The "One fire" section: title, body text, three facts |
| `restaurant.visit` | Address, hours, phone, email |
| `dishes[].category` | Label in the BURGERS / PIZZA / STEAKS bar. Dishes that share a category share a tab. |
| `dishes[].name / description / price / weight` | The text panel |
| `dishes[].options` | Optional pill picker, e.g. doneness. Its value goes into the cart line. |
| `dishes[].scroll` | How long the build lasts, as a % of screen height (500 means five screens) |
| `dishes[].visual` | How the dish builds (see below) |

To add a dish, copy an existing entry and change the text. The category bar, progress rail ticks, panels and cart all pick it up automatically.

## Visuals

Every timing value is a fraction (0 to 1) of that dish's scroll distance. Scrolling back up un-builds the dish exactly.

```js
layers: [
  { art: "plate", anim: "static" },                        // always there
  { art: "board", anim: "slide", from: "left", at: [0, .08] },
  { art: "patty", y: -42, anim: "drop", at: [.05, .14] },  // falls, squashes, bounces
  { art: "sauce", y: -32, anim: "spread", at: [.18, .31] },
  { art: "cheese", y: -98, anim: "drop", at: [.23, .31],
    melt: { art: "cheeseMelt", at: [.30, .41] } },         // crossfades into a melted version
],
effects: [
  { type: "flame",  at: [.64, .76], peak: 1, hold: .3, y: -40, width: 560, height: 560 },
  { type: "steam",  at: [.58, .66], y: -40, width: 380, height: 420 },
  { type: "splash", at: [.42, .52], x: -30, y: -120 },
],
reveal: [.70, .80],   // dish slides right (desktop) or up (phone) and the text fades in
exit:   [.90, 1],     // dish lifts off; use null on the last dish
```

`y` is the resting height in stage units, where negative means up. A burger stacks around 30 units per patty.

### Using real photography or AI renders instead of the built-in art

**Option A: layered transparent PNG/WebP.** Shoot or generate every ingredient from the same camera angle (about 20° above the table, light from the upper left), cut each one out, and point a layer at the file:

```js
{ src: "assets/burger/patty.webp", width: 360, anchor: [0.5, 0.8], y: -42, anim: "drop", at: [.05, .14] }
```

- `width` is in stage units. The plate is 600 wide.
- `anchor` is the point of the image (as a fraction of its width and height) that sits on `y`, usually the centre of the ingredient's base.

**Option B: frame sequence from a video.** Export a clip of the dish assembling as numbered frames:

```js
visual: {
  ...,
  sequence: { pattern: "frames/burger/{i}.webp", count: 120, pad: 4, at: [0, .66], width: 700 }
}
```

The frame shown follows scroll position. Flames, steam and the text reveal still work on top.

## Performance

- Each ingredient is painted once into an offscreen bitmap at the screen's pixel density. After that, every frame is just a few `drawImage` calls.
- The current dish is built straight away. The next one is built when the browser is idle, and the rest wait until you get near them. Images and frames load the same way.
- The scroll position is smoothed (critically damped), so the scrub feels like GSAP `scrub: true` with no library.
- The canvas only redraws while you scroll or while fire or steam is on screen, and it pauses in background tabs.

## Files

```
index.html        page shell
css/styles.css    look and responsive layout
js/menu-data.js   ← edit this
js/art.js         built-in illustrated ingredients
js/stage.js       scrubbed renderer (layers, drop/slide/spread/melt, flame, steam, splash)
js/main.js        scroll engine, panels, category bar, cart drawer, ambient embers
```
