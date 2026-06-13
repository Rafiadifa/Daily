# Daily Log

A personal health tracker — calorie estimation (no AI, just a formula), weight + body trends, water, fasting window, and daily reflections. Runs entirely in your browser. No backend, no signup. Installable as an app (PWA).

## Two tabs

### Day
Everything about a single day, anchored to a calendar you can scrub through:
- **Weekly summary** — rolling 7-day averages (calories, net, water-goal days, training days, weight change).
- **Net calories** — Eaten − Burned = Net (enter your watch's burn; net turns green/red).
- **Calorie budget** — target from your profile vs what you've eaten, with remaining.
- **Burned + sport** — log your watch burn and activity level (trained days get a dot on the calendar).
- **Fasting window** — set an eating window (e.g. 06:30–14:30); shows live "eating / fasting" status.
- **Water** — progress ring, quick-add buttons, custom amount, goal auto-set from body weight.
- **Food log** — multi-item meals (savory / sweet / drink / manual calorie entry). Tap a meal to edit. Star a meal to save it as a **favorite** for one-tap re-logging.
- **Reflection** — a free-text note per day.

### Weight
- Log weight, body fat %, waist, sleep, energy, exercise minutes, steps.
- Trend chart with a **7-day moving-average** line (smooths daily noise).
- Switch the chart between **Weight / Waist / Body fat**.

## File structure

```
/
├── index.html          ← structure for both tabs + modals
├── manifest.json       ← PWA manifest (installable app)
├── sw.js               ← service worker (offline support)
├── css/
│   └── styles.css      ← all styling
├── icons/              ← app icons (PWA + favicon)
└── js/
    ├── storage.js      ← localStorage wrapper, profile, favorites, import/export
    ├── calories.js     ← calorie formula + BMR/TDEE/water-target math
    ├── day.js          ← the Day tab (calendar, food, water, fasting, favorites, reflection)
    ├── weight.js       ← the Weight tab (charts + moving average)
    └── app.js          ← tabs, modals, profile, backup nudge, service-worker registration
```

Only external dependency is **Chart.js** (from a CDN). Everything else is vanilla JS.

## Deploy to GitHub Pages

1. Create a public repo, upload these files (keep the folder structure — drop the *files inside* `css/`, `js/`, `icons/`, not the folders).
2. Settings → Pages → Deploy from branch → `main` → `/ (root)`.
3. Open `https://<your-username>.github.io/<repo>/`.
4. On your phone: open that URL → Share → **Add to Home Screen**. It installs as a real app (custom icon, fullscreen, works offline).

## Profile & targets (open the ⚙ button)

Set height, age, sex, activity level, goal, and your eating window. Targets are computed with the Mifflin-St Jeor equation; your **weight is pulled automatically from your latest weight log**, so targets update as your weight changes.

> First run: confirm **sex** and **age** — BMR depends on them, and the defaults (male / 20) may not match you.

## Sync & backup

Data lives in your browser's `localStorage` (per device). Use **Export (↗)** to save a JSON backup and **Import (↙)** to restore or move data between devices (merge or replace). A gentle banner reminds you if it's been over a week since your last backup. Clearing browser data wipes logs, so export occasionally.

## Caching

Asset URLs carry `?v=7`. If you change a file, bump that number (and the `CACHE` name in `sw.js`) so browsers fetch fresh copies.

## Tweaking the calorie formula

`js/calories.js` holds the base-kcal tables (`SAVORY_BASE`, `SWEET_BASE`, `DRINK_BASE`) and modifier maps. Adjust the numbers as you learn your portions.
