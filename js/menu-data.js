/* =====================================================================
   EMBER — MENU DATA
   ---------------------------------------------------------------------
   This is the ONE file a restaurant edits to make the site its own.

   • restaurant  → name, currency, kitchen story, visit info
   • dishes      → one entry per dish shown in the scroll-to-build menu
                   (name, description, price, options, and how it builds)

   Each dish has a `visual` block that describes the build:
     layers   – stacked from bottom to top. Each layer uses either a
                built-in illustrated `art` key (see js/art.js) OR your own
                transparent PNG/WebP via `src` (see README.md).
     anim     – "static" | "slide" | "drop" | "spread"
     at       – [start, end] of the animation, as a fraction (0–1) of
                this dish's scroll distance.
     y        – resting height of the layer in stage units (negative = up).
     effects  – flame / steam / splash, timed the same way.
     reveal   – when the finished dish slides aside and the text appears.
     exit     – when the dish lifts off to make room for the next one
                (null = stays until the page scrolls on).
   ===================================================================== */

window.EMBER_DATA = {
  restaurant: {
    name: "EMBER",
    locale: "en-US",
    currency: "USD",
    tagline: "Wood-fired kitchen",
    kitchen: {
      title: "One fire.\nEverything passes through it.",
      body:
        "There is no gas line in our kitchen. Every dish you just watched come together is cooked over a single hearth of split oak and cherry wood, lit at dawn and fed all day. Buns toast on the iron, dough blisters at 450°C, and every steak rests beside the embers that seared it. It is slower, it is louder, and it tastes like nothing else.",
      facts: [
        { value: "450°C", label: "Hearth temperature" },
        { value: "Oak & cherry", label: "Split by hand, every morning" },
        { value: "14 hrs", label: "The fire never goes out" }
      ]
    },
    visit: {
      address: ["18 Foundry Lane", "Old Town"],
      hours: ["Tue – Thu · 5pm – 11pm", "Fri – Sat · 5pm – 1am", "Sun · 12pm – 9pm"],
      phone: "+1 (555) 014-2290",
      email: "table@ember.example"
    }
  },

  dishes: [
    /* ------------------------------------------------------------- */
    {
      id: "burger",
      category: "Burgers",
      name: "The Ember Burger",
      description: "Double smashed beef. Aged cheddar. House sauce.",
      price: 18,
      weight: null,
      options: null,
      scroll: 540, // how long the build lasts, in % of screen height

      visual: {
        frame: { width: 700, height: 420, focusY: -80 },
        layers: [
          { art: "plate", anim: "static" },
          { art: "bunBottom", anim: "static" },
          { art: "patty", seed: 11, y: -42, anim: "drop", at: [0.05, 0.14] },
          { art: "patty", seed: 27, y: -70, anim: "drop", at: [0.13, 0.22] },
          {
            art: "cheese", y: -98, anim: "drop", at: [0.23, 0.31], bounce: 6,
            melt: { art: "cheeseMelt", at: [0.30, 0.41] }
          },
          { art: "pickles", y: -101, anim: "drop", at: [0.40, 0.50] },
          { art: "lettuce", y: -104, anim: "drop", at: [0.49, 0.57], bounce: 8 },
          { art: "bunTop", y: -110, anim: "drop", at: [0.57, 0.66], bounce: 20 }
        ],
        effects: [
          { type: "flame", at: [0.64, 0.76], peak: 1.0, hold: 0.32, y: -40, width: 560, height: 560 }
        ],
        reveal: [0.70, 0.80],
        exit: [0.90, 1.0]
      }
    },

    /* ------------------------------------------------------------- */
    {
      id: "pizza",
      category: "Pizza",
      name: "The Margherita",
      description: "San Marzano tomato, fior di latte and torn basil on a 48-hour dough.",
      price: 22,
      weight: null,
      options: null,
      scroll: 500,

      visual: {
        frame: { width: 760, height: 320, focusY: -20 },
        layers: [
          { art: "board", anim: "slide", from: "left", at: [0.0, 0.08] },
          { art: "dough", y: -20, anim: "drop", at: [0.08, 0.17], bounce: 10 },
          { art: "sauce", y: -32, anim: "spread", at: [0.18, 0.31] },
          { art: "mozzarella", y: -33, anim: "drop", at: [0.31, 0.45] },
          { art: "tomato", y: -36, anim: "drop", at: [0.44, 0.54] },
          { art: "basil", y: -39, anim: "drop", at: [0.53, 0.63] }
        ],
        effects: [
          { type: "steam", at: [0.58, 0.66], y: -40, width: 380, height: 420 }
        ],
        reveal: [0.66, 0.77],
        exit: [0.90, 1.0]
      }
    },

    /* ------------------------------------------------------------- */
    {
      id: "steak",
      category: "Steaks",
      name: "The Signature Ribeye",
      description: "Flame seared. Brown butter. Thyme.",
      price: 42,
      weight: "350 g",
      options: {
        label: "Doneness",
        choices: ["Medium rare", "Medium", "Well done"],
        default: 0
      },
      scroll: 520,

      visual: {
        frame: { width: 740, height: 380, focusY: -60 },
        layers: [
          { art: "woodSlice", anim: "slide", from: "right", at: [0.0, 0.09] },
          { art: "pan", y: -46, anim: "slide", from: "right", at: [0.02, 0.11] },
          { art: "ribeye", y: -66, anim: "drop", at: [0.11, 0.23], bounce: 14 },
          {
            art: "butterPat", y: -118, x: -30, anim: "drop", at: [0.35, 0.43], bounce: 6,
            melt: { art: "butterMelt", at: [0.42, 0.53] }
          },
          { art: "thyme", y: -120, x: 30, anim: "drop", at: [0.52, 0.61], spin: 0.9 }
        ],
        effects: [
          { type: "flame", at: [0.20, 0.38], peak: 1.3, hold: 0.42, y: -70, width: 640, height: 640 },
          { type: "splash", at: [0.42, 0.52], x: -30, y: -120 },
          { type: "steam", at: [0.50, 0.60], y: -120, width: 260, height: 360, strength: 0.6 }
        ],
        reveal: [0.64, 0.76],
        exit: null
      }
    }
  ]
};
