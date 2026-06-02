# House AI — "JARVIS" 🔵

A calm, shared home hub styled as a friendly house **JARVIS** — built for an ADHD
brain (Kirsten) and an Autistic partner (Jack). Low friction, predictable, no guilt.

It greets you by name and speaks in calm status lines. The look is an arc-reactor HUD
(deep navy, soft cyan + gold) — deliberately **not** a flashing sci-fi dashboard, so it
stays low-sensory for both of us (no flashing, gentle motion, honours "reduce motion").

Right now it helps with **routines/chores** and **money** (live Safe-to-Spend from the
Finances Tracker). It's designed to grow into a full home display + automation system —
the JARVIS that actually runs the house — when we get our own place.

## Use it

**📱 Live app: https://curtainswine-cpu.github.io/house-ai/**

Open that link on your phone, then **add it to your home screen** to get a proper app
icon that opens full-screen and works offline:

- **Android (Galaxy/Chrome):** open the link → tap the **⋮** menu → **Add to Home screen** /
  **Install app**.
- **iPhone (Safari):** open the link → tap **Share** → **Add to Home Screen**.

Your data is saved on **your device** (not on the web), so it's private to you. Each
device keeps its own copy for now — real syncing between Kirsten & Jack is Phase 2
(see [docs/ROADMAP.md](docs/ROADMAP.md)).

You can also still just open **`index.html`** locally on a computer.

## Updating the live app

It's hosted on GitHub Pages from this repo (`curtainswine-cpu/house-ai`). To push changes:

1. **Bump the cache version** in `sw.js` (e.g. `jarvis-v1` → `jarvis-v2`) so phones fetch
   the new files instead of the cached old ones.
2. `git add -A && git commit -m "..." && git push`
3. GitHub Pages rebuilds in ~1 minute. Reopen the app to get the update.

## What's inside

| File | What it does |
|------|--------------|
| `index.html` | The page structure (top bar, views, bottom tabs, modal) |
| `styles.css` | All the styling — calm palette, big tap targets, dark mode |
| `js/storage.js` | Saving/loading data + first-run defaults |
| `js/routines.js` | Routines & chores logic + how they're drawn |
| `js/spending.js` | Expense logic + summaries |
| `js/app.js` | Ties it together: navigation, the +Add forms, re-rendering |

Each file has comments explaining what it does — a good place to start if you want
to tweak something.

## Design principles (why it looks/works the way it does)

See [docs/DESIGN-PRINCIPLES.md](docs/DESIGN-PRINCIPLES.md). Short version:

- **Today first** — the home screen only shows what matters *now*.
- **2-tap capture** — adding a chore or expense is fast and forgiving.
- **No shame** — nothing turns angry red; missed things just wait quietly.
- **Explicit & predictable** — steps are spelled out, layout never moves around.
- **Calm senses** — soft colours, gentle motion (and it respects "reduce motion").

## Working on it together

We use git so we can both make changes safely.

```bash
git add -A
git commit -m "describe what you changed"
```

When we're ready to share a repo, we'll push to GitHub and branch per change.
See the roadmap for the plan.
