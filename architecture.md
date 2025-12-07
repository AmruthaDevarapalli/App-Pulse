# App Pulse — Architecture Guide

> This file describes the codebase structure, data flow, conventions, and extension patterns so that an AI assistant (or a new developer) can start with full context.

---

## Project Overview

**App Pulse** is a purely static (no backend, no build step) analytics dashboard that loads a CSV file of App Store reviews and renders 25+ interactive charts. Everything runs in the browser — CSV parsing, filtering, aggregation, regression, and charting.

**Tech stack:** Vanilla JS (ES6, IIFE-wrapped), Chart.js 4, chartjs-chart-matrix, Leaflet.js, PapaParse, Bootstrap 5, Bootstrap Icons. No frameworks, no bundlers, no npm.

---

## File Map

```
AppStoreReviewsProject/
├── index.html                          ← Single-page HTML shell (all sections, filter bar, canvas elements)
├── css/
│   └── styles.css                      ← Dark theme, CSS variables, responsive rules, component styles
├── js/
│   └── app.js                          ← ALL application logic in one IIFE (≈1250 lines)
├── data/
│   └── countries.geojson               ← Simplified GeoJSON boundaries for USA, Canada, India, Germany, UK
├── healthplus_reviews_preview.csv      ← Source data (500 rows × 35 columns)
├── SpecificationDocument.md            ← Original requirements / chart specs
├── README.md                           ← User-facing docs
└── architecture.md                     ← This file
```

---

## Data Flow

```
CSV file
  │  PapaParse (download + parse)
  ▼
rawData[]              ← Array of typed row objects (computed once at startup)
  │  Derived fields added: sentiment_score, dau_mau, is_negative, _date
  │
  │  applyFilters() runs on every filter change
  ▼
filteredData[]         ← Subset of rawData matching all active filters
  │
  │  renderAll() orchestrates redraw
  ▼
┌──────────────────────────────────────────────────┐
│ renderMetricCards()   → DOM text updates (7 KPIs)│
│ renderSection1Charts()→ 5 Chart.js charts        │
│ renderSection2Charts()→ 2 bar + 1 heatmap +      │
│                         1 scatter + Leaflet map   │
│ renderSection3Charts()→ 4 charts + OLS regression │
│ renderSection4Charts()→ 1 heatmap + 3 charts      │
│ renderSection5Charts()→ 5 charts                  │
│ renderSection6Charts()→ 2 charts + paginated table │
│ renderSection7Charts()→ 2 charts                  │
│ renderSection8Charts()→ 3 charts (risk + bug idx) │
└──────────────────────────────────────────────────┘
```

---

## js/app.js — Internal Structure

The entire file is wrapped in a single **IIFE** `(function() { 'use strict'; ... })();` with no exports. All state and functions are private.

### Global State Variables

| Variable | Type | Purpose |
|---|---|---|
| `rawData` | `Array<Object>` | All parsed CSV rows with derived fields |
| `filteredData` | `Array<Object>` | Current filtered subset; re-computed on every filter change |
| `chartInstances` | `Object<string, Chart>` | Map of canvas ID → Chart.js instance (for `.destroy()` before re-creating) |
| `leafletMap` | `L.Map \| null` | Leaflet map instance (created once, layers replaced) |
| `geoLayer` | `L.GeoJSON \| null` | Current GeoJSON layer on the map |
| `geoJsonData` | `Object \| null` | Cached parsed GeoJSON (fetched once) |
| `negReviews` | `Array<Object>` | Filtered negative reviews for the paginated table |
| `currentPage` | `number` | Current page of the reviews table |
| `searchQuery` | `string` | Current search text for reviews table filtering |

### Row Object Schema (after parsing + derivation)

Every element in `rawData` / `filteredData` has these properties:

```
// ── From CSV (typed during parse) ──
review_id, user_id, app_id, app_name: string
category, app_version, platform, device_model, os_version, network_type: string
review_text: string
rating: number (1–5)
sentiment_label: string ('positive' | 'neutral' | 'negative')
review_length_words, helpful_votes, total_votes: int
session_duration_min: float
daily_active_users, monthly_active_users, download_count, crash_count: int
update_frequency_days: int
verified_user, subscription_user, in_app_purchase: int (0 | 1)
app_price, app_size_mb: float
retention_7d, retention_30d, churn_probability: float (0–1)
developer_reply: int (0 | 1)
response_time_hours: float (meaningful only when developer_reply == 1)
country, language, review_date: string

// ── Derived at load time ──
sentiment_score: int (-1 | 0 | 1)       ← mapped from sentiment_label
dau_mau: float                           ← daily_active_users / monthly_active_users
is_negative: boolean                     ← sentiment_label === 'negative'
_date: Date                              ← parsed from review_date

// ── Computed per-render in Section 8 ──
_risk: float                             ← Retention Risk Score (transient)
```

### Key Functions (in order of appearance)

| Function | Line | Purpose |
|---|---|---|
| `mean(arr)` | ~34 | Arithmetic mean of a numeric array |
| `std(arr)` | ~35 | Population standard deviation |
| `sentimentScore(label)` | ~40 | `'positive'→1, 'negative'→-1, 'neutral'→0` |
| `fmt(v, d)` | ~41 | Format number to `d` decimal places |
| `pct(v)` | ~42 | Format 0–1 value as `"XX.X%"` |
| `groupBy(arr, keyFn)` | ~44 | Group rows into `{ key: [rows] }` map; keyFn can be string (field name) or function |
| `monthKey(dateStr)` | ~52 | `"2023-07"` from a date string |
| `loadCSV()` | ~60 | PapaParse fetch + row mapping + derivation → calls `initFilters()` + `applyFilters()` |
| `hideLoading()` | ~124 | Fade out the loading overlay, show dashboard |
| `populateMultiSelect(id, values)` | ~131 | Fill a `<select multiple>` with sorted options (all selected) |
| `initFilters()` | ~141 | Populate all filter dropdowns, attach `change` listeners |
| `applyFilters()` | ~164 | Filter `rawData` → `filteredData` using all filter controls; calls `renderAll()` or shows no-data message |
| `renderAll()` | ~211 | Orchestrator: calls all `renderSectionNCharts()` functions sequentially |
| `makeChart(id, config)` | ~222 | Destroy existing Chart.js instance for `id` (if any), create new one. **Always use this to create charts.** |
| `scaleOpts(title)` | ~232 | Returns shared axis config object (grid color, tick color, optional title) |
| `renderMetricCards()` | ~250 | Update 7 KPI card DOM elements with aggregated means |
| `renderSection1Charts()` | ~262 | Rating Distribution, Sentiment Distribution, Retention vs Rating, Sentiment Trend, Volume vs Rating |
| `renderSection2Charts()` | ~386 | Retention by Version, Heatmap, Map, Session scatter, Category bar |
| `renderHeatmap(canvasId, data, xKey, yKey, valKey, valLabel)` | ~455 | Reusable heatmap builder using `chartjs-chart-matrix`. Used in Sections 2 and 4. |
| `renderRetentionMap()` | ~535 | Leaflet choropleth; reads toggle for 7d/30d; lazy-loads GeoJSON |
| `addGeoLayer(styleFn, onEachFn)` | ~620 | Replace Leaflet GeoJSON layer |
| `renderSection3Charts()` | ~644 | Churn scatter plots + subscription bar + Feature Importance |
| `renderFeatureImportance()` | ~707 | Z-score normalization → OLS regression → absolute coefficient bar chart |
| `solveOLS(X, y)` | ~756 | Minimal OLS solver via Gaussian elimination (no external dependency) |
| `renderSection4Charts()` | ~803 | Crash heatmap, crash-rating scatter, OS bar, network bar |
| `renderSection5Charts()` | ~869 | Subscription/IAP/Verified grouped bars, Rating by sub, Country bar |
| `renderSection6Charts()` | ~996 | Sentiment-retention scatter, review-length scatter, negative reviews table |
| `renderReviewsTable()` | ~1055 | Render current page of negative reviews; handles search + pagination |
| `escapeHtml(str)` | ~1104 | XSS-safe HTML escaping via `textContent` → `innerHTML` |
| `renderSection7Charts()` | ~1110 | Response time by rating (replied only), reply vs retention |
| `renderSection8Charts()` | ~1171 | Risk score computation, top risky versions/countries, bug impact index |

---

## index.html — Layout Structure

```
<body>
  <nav#main-nav>                     ← Sticky dark navbar with SVG logo
  <div#loading-overlay>              ← Full-screen spinner (hidden after CSV loads)
  <div#filter-bar .sticky-filter-bar>← Sticky filter ribbon (below navbar)
    ├─ select#filter-date-range      (single select)
    ├─ select#filter-country         (multi-select, populated from data)
    ├─ select#filter-platform        (multi-select)
    ├─ select#filter-version         (multi-select)
    ├─ select#filter-category        (multi-select)
    ├─ select#filter-subscription    (single select: All/Subscriber/Non-subscriber)
    ├─ select#filter-device          (multi-select)
    └─ button#btn-reset-filters
  <div#dashboard-content>            ← Main grid (hidden until data loads)
    ├─ section#section-health        Section 1: Metric cards + 5 chart canvases
    ├─ section#section-retention     Section 2: 4 canvases + div#map-retention + toggle
    ├─ section#section-churn         Section 3: 4 canvases
    ├─ section#section-tech          Section 4: 4 canvases
    ├─ section#section-segment       Section 5: 5 canvases
    ├─ section#section-reviews       Section 6: 2 canvases + table#negative-reviews-table + pagination
    ├─ section#section-devresponse   Section 7: 2 canvases
    └─ section#section-advanced      Section 8: 3 canvases
  <div#no-data-message>              ← Shown when filters yield zero results
```

### Canvas ID Convention

All Chart.js canvases follow the pattern `chart-<short-name>`. The same ID is used as the key in `chartInstances{}` and passed to `makeChart()`.

| Canvas ID | Section | Chart Type |
|---|---|---|
| `chart-rating-dist` | 1 | Horizontal bar |
| `chart-sentiment-dist` | 1 | Doughnut |
| `chart-retention-rating` | 1 | Scatter |
| `chart-sentiment-trend` | 1 | Line |
| `chart-volume-rating` | 1 | Dual-axis (bar + line) |
| `chart-ret-version` | 2 | Bar |
| `chart-ret-device-version` | 2 | Matrix heatmap |
| `chart-ret-session` | 2 | Scatter |
| `chart-ret-category` | 2 | Bar |
| `chart-feature-importance` | 3 | Horizontal bar |
| `chart-churn-crash` | 3 | Scatter |
| `chart-churn-sub` | 3 | Bar |
| `chart-churn-size` | 3 | Scatter |
| `chart-crash-version-os` | 4 | Matrix heatmap |
| `chart-crash-rating` | 4 | Scatter |
| `chart-os-crash` | 4 | Bar |
| `chart-network-crash` | 4 | Bar |
| `chart-ret-sub` | 5 | Grouped bar |
| `chart-iap-ret` | 5 | Grouped bar |
| `chart-ret-verified` | 5 | Bar |
| `chart-rating-sub` | 5 | Bar |
| `chart-ret-country` | 5 | Bar |
| `chart-sentiment-retention` | 6 | Scatter |
| `chart-length-sentiment` | 6 | Scatter (multi-dataset) |
| `chart-response-rating` | 7 | Bar |
| `chart-reply-retention` | 7 | Bar |
| `chart-risk-version` | 8 | Horizontal bar |
| `chart-risk-country` | 8 | Horizontal bar |
| `chart-bug-index` | 8 | Horizontal bar |

Metric card value elements use IDs prefixed `mc-` (e.g., `mc-avg-rating`, `mc-ret30d`).

---

## css/styles.css — Structure

Uses **CSS custom properties** defined in `:root` for the color palette. Organized by labeled comment blocks:

| Block | Key Classes / IDs |
|---|---|
| CSS Variables | `--primary-purple`, `--primary-teal`, `--green`, `--amber`, `--red`, `--bg-body`, `--bg-card`, etc. |
| Global | `body` base styles |
| Navbar | `#main-nav`, `.brand-text` |
| Loading Overlay | `#loading-overlay`, `.fade-out` |
| Sticky Filter Bar | `.sticky-filter-bar`, `.filter-label`, `#btn-reset-filters` |
| Section Titles | `.section-title` (gradient border-bottom, gradient icon) |
| Metric Cards | `.metric-card`, `.metric-icon`, `.metric-value`, `.metric-label` (gradient border hover effect via `::before` mask) |
| Chart Cards | `.chart-card`, `.chart-title`, `.chart-wrap` (min-height 300px) |
| Table | `#negative-reviews-table`, `#review-search`, `.pagination` |
| Map | `#map-retention`, `.map-legend` |
| No-Data | `#no-data-message` |
| Responsive | `@media` breakpoints at 768px and 1200px |

---

## Color Palette Reference

```
Primary gradient:  #6C5CE7 (purple) → #00CEC9 (teal)
Semantic colors:   #00B894 (green/positive), #FDCB6E (amber/neutral), #D63031 (red/negative)
Chart palette:     ['#6C5CE7', '#0984E3', '#00CEC9', '#00B894', '#FDCB6E', '#E17055', '#D63031']
Background:        #0f0f1a (body), #1a1a2e (cards), #161625 (filter bar)
Text:              #e8e8f0 (primary), #a0a0b8 (secondary)
```

All palette colors are stored in the `COLORS` constant in `js/app.js` and as CSS variables in `css/styles.css`.

---

## CDN Dependencies

All libraries are loaded via CDN `<script>` / `<link>` tags in `index.html`. There is no `package.json` or build step.

| Library | CDN | Used For |
|---|---|---|
| Bootstrap 5.3.2 | jsdelivr | Grid, UI components |
| Bootstrap Icons 1.11.3 | jsdelivr | Icons |
| Chart.js 4.4.1 | jsdelivr | All charts |
| chartjs-chart-matrix 2.0.1 | jsdelivr | Heatmap (`type: 'matrix'`) |
| Leaflet 1.9.4 | unpkg | Choropleth map |
| PapaParse 5.4.1 | jsdelivr | CSV parsing |

---

## How to Add a New Chart

1. **Add a `<canvas>` in `index.html`** inside the appropriate section. Use a `chart-card` wrapper with a `chart-wrap` div containing the canvas. Give the canvas a unique `id` following the `chart-<name>` convention and an `aria-label`.

   ```html
   <div class="col-lg-6">
     <div class="chart-card">
       <h6 class="chart-title">My New Chart</h6>
       <div class="chart-wrap">
         <canvas id="chart-my-new" aria-label="Description of chart"></canvas>
       </div>
     </div>
   </div>
   ```

2. **Add rendering logic in `js/app.js`** inside the relevant `renderSectionNCharts()` function (or create a new section function and call it from `renderAll()`). Use `makeChart()` to create the chart — it handles destroying any previous instance.

   ```js
   makeChart('chart-my-new', {
       type: 'bar',  // or 'scatter', 'line', 'doughnut', 'matrix'
       data: { labels: [...], datasets: [{ data: [...], backgroundColor: COLORS.palette }] },
       options: {
           responsive: true, maintainAspectRatio: false,
           plugins: { ...defaultPlugins, legend: { display: false } },
           scales: { x: scaleOpts('X Label'), y: scaleOpts('Y Label') }
       }
   });
   ```

3. **Data aggregation** — use the helpers: `groupBy()`, `mean()`, `std()`, `monthKey()`. Always work with `filteredData` (not `rawData`) so charts respect filter selections.

---

## How to Add a New Filter

1. Add a `<select>` element in the filter bar in `index.html` with a unique `id` (convention: `filter-<name>`).
2. In `initFilters()`, populate it with unique values from `rawData` if needed, and add an event listener.
3. In `applyFilters()`, read its value and add the corresponding filtering condition to the `filteredData` pipeline.
4. In `resetFilters()`, reset it to the default value.

---

## How to Add a New Dashboard Section

1. Add a `<section id="section-xxx">` block in `index.html` inside `#dashboard-content`, following the existing pattern (section title + row of chart cards).
2. Write a `renderSectionXxxCharts()` function in `js/app.js`.
3. Call it from `renderAll()`.

---

## How to Add a New Metric Card

1. Add a new `.metric-card` div inside the `#metric-cards` row in `index.html`. Give the value element an `id` starting with `mc-`.
2. In `renderMetricCards()`, set its `textContent` using the desired aggregation over `filteredData`.

---

## Key Patterns & Conventions

- **Chart lifecycle**: Always use `makeChart(id, config)` — never call `new Chart()` directly. It manages destroy/recreate.
- **Shared options**: Use `scaleOpts(title)` for axis config, `defaultPlugins` for legend/tooltip defaults.
- **Heatmaps**: Use `renderHeatmap(canvasId, data, xKey, yKey, valKey, label)` — a reusable function already supporting any two categorical axes and a numeric value.
- **Map**: Leaflet map is initialized once (`leafletMap`); on filter changes only the GeoJSON layer is replaced. GeoJSON is fetched once and cached in `geoJsonData`.
- **HTML escaping**: Use `escapeHtml()` for any user-generated text rendered into the DOM (review_text).
- **Responsive charts**: All charts use `responsive: true, maintainAspectRatio: false` with `.chart-wrap { min-height: 300px }`.
- **Filter reactivity**: Any filter change → `applyFilters()` → `renderAll()` re-renders everything. No partial updates.
- **No build step**: All files are served as-is. Open with any static HTTP server.

---

## Dataset Quick Reference

- **500 rows**, single app ("HealthPlus"), date range ≈ 2020–2025
- **Countries**: USA, Canada, India, Germany, UK
- **Platforms**: iOS, Android
- **App Versions**: 1.0, 1.2, 2.0, 2.5, 3.0
- **Categories**: Education, Finance, Gaming, Health, Social
- **Device Models**: iPhone 14, Samsung S23, Pixel 8, OnePlus 11
- **OS Versions**: iOS 16, iOS 17, Android 13, Android 14
- **Network Types**: WiFi, 4G, 5G
- **Sentiment Labels**: positive, neutral, negative
