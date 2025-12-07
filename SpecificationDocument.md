# Context

You are an expert web applications developer, highly proficient in building interactive and adaptive analytics dashboards using Chart.js. Your task is to build the a static web application "App Pulse", a product retention intelligence dashboard.

## Purpose of App Pulse application

Mobile app teams often see declining retention but don’t know why. App Store user reviews contain signals about bugs, feature gaps, performance problems, pricing dissatisfaction, onboarding friction. But these signals are scattered across thousands of reviews. The App Pulse dashboard helps product teams connect sentiment signals with behavioral metrics to identify factors like drivers of churn product, areas hurting retention, technical issues impacting user experience.

## Dataset

The App Pulse application should be a static web app that loads data from a .csv file. The file is `healthplus_reviews_preview.csv`. The columns in this .csv file are as described below -
- review_id
- user_id
- app_id
- app_name
- category
- app_version
- platform
- device_model
- os_version
- network_type
- review_text
- rating
- sentiment_label (categorical: `positive`, `neutral`, `negative`)
- review_length_words
- helpful_votes
- total_votes
- session_duration_min
- daily_active_users
- monthly_active_users
- download_count
- crash_count
- update_frequency_days
- verified_user
- subscription_user
- in_app_purchase
- app_price
- app_size_mb
- retention_7d
- retention_30d
- churn_probability
- developer_reply (binary: `1` = replied, `0` = no reply)
- response_time_hours (only meaningful when `developer_reply == 1`; ignore when `developer_reply == 0`)
- country
- language
- review_date

### Derived Metrics

The following values are not columns in the CSV but must be computed at runtime:

- **sentiment_score** — Numeric mapping of `sentiment_label`: `positive = 1`, `neutral = 0`, `negative = -1`. Use this for all charts that reference "sentiment" on a numeric axis.
- **DAU/MAU ratio** — `daily_active_users / monthly_active_users`. This is the standard "stickiness" metric.
- **is_negative** — Boolean flag: `sentiment_label == 'negative'`. Used in aggregation formulas.


# App Pulse specifications

Build the App Pulse analytics dashboard application based on the context and specifications below.

## Front-end technical specifications

### Core Charting & Visualization Libraries

- **Chart.js** (v4+) — Primary charting library for bar, line, scatter, doughnut, and dual-axis charts.
- **chartjs-chart-matrix** — Chart.js plugin required for heatmap charts (Sections 2 & 4).
- **Leaflet.js** with **leaflet-choropleth** — For the map-based country retention visualization (Section 2). Use GeoJSON boundaries for the 5 countries in the dataset (USA, Canada, India, Germany, UK).
- **ml.js** (`ml-regression-multiplelinear`) — For the browser-side multiple linear regression used in the Feature Importance Simulation (Section 3).

### CSS & UI

- Use **Bootstrap 5** (or Tailwind CSS) for responsive grid layout and UI components.
- Use **Bootstrap Icons** or **Font Awesome** for iconography throughout the dashboard.
- Use stylish color gradients throughout the dashboard for visual appeal.

### Color Palette

- **Primary**: `#6C5CE7` (purple) → `#00CEC9` (teal) gradient.
- **Semantic colors**: Green `#00B894` for positive, Amber `#FDCB6E` for neutral, Red `#D63031` for negative.
- **Chart palette** (sequential): `['#6C5CE7', '#0984E3', '#00CEC9', '#00B894', '#FDCB6E', '#E17055', '#D63031']`.
- **Background**: Light mode default, dark cards with subtle gradient borders.

### Logo

- Create an SVG-based logo for App Pulse depicting a stylized pulse/heartbeat line integrated with a bar chart icon, using the primary gradient colors. Use it in the dashboard header and as a favicon.

## Dashboard Layout


### Section 1: Product Health Overview

Display metric cards for:
- Avg Rating
- Avg Sentiment Score (mean of computed `sentiment_score`)
- 7-day Retention (mean of `retention_7d`)
- 30-day Retention (mean of `retention_30d`)
- Avg Churn Probability
- Avg Session Duration
- DAU/MAU Ratio (mean of `daily_active_users / monthly_active_users`) — stickiness metric

Display Charts for:
- **Rating Distribution** — Horizontal bar chart (histogram) showing count of reviews per star rating (1–5). This is the most fundamental review analytics view.
- **Sentiment Distribution** — Doughnut chart showing proportion of `positive`, `neutral`, and `negative` reviews using the semantic colors (green, amber, red).
- **Retention vs Rating** — Scatter plot where X axis is `rating` and Y axis is `retention_30d`.
- **Sentiment Trend Over Time** — Line chart where X axis is `review_date` (aggregated **monthly**) and Y axis is mean `sentiment_score` for that month.
- **Reviews Volume vs Rating** — Dual-axis chart where X axis is `review_date` (aggregated **monthly**), left Y axis is review count (bar), and right Y axis is average rating (line).

### Section 2: Retention Diagnostics

Display charts for -
- **Retention by App Version** — Bar chart with X axis as `app_version` and Y axis as mean `retention_30d`.
- **Retention by Device & App Version** — Heatmap (using `chartjs-chart-matrix`) where X axis is `app_version`, Y axis is `device_model`, and cell color intensity represents mean `retention_30d`.
- **Retention by Country** — Choropleth map (using **Leaflet.js** with GeoJSON) colored by mean `retention_30d`. Provide a toggle to switch between `retention_7d` and `retention_30d`. Only the 5 countries in the dataset (USA, Canada, India, Germany, UK) will be colored; all other regions remain grey.
- **Retention vs Session Duration** — Scatter plot with X axis as `session_duration_min` and Y axis as `retention_30d`.
- **Retention by Category** — Bar chart with X axis as `category` and Y axis as mean `retention_30d`. This shows how retention varies across app categories.

### Section 3: Churn Drivers

Display charts for -
- **Feature Importance Simulation** — Use `ml.js` (multiple linear regression) in the browser to regress `churn_probability` against these features: `crash_count`, `sentiment_score`, `rating`, `session_duration_min`, `subscription_user`, `app_size_mb`. Display the **absolute values of the standardized regression coefficients** as a horizontal bar chart, sorted descending. This approximates feature importance. Normalize all features to z-scores before regression so coefficients are comparable.
- **Churn Probability vs Crash Count** — Scatter plot with X axis as `crash_count` and Y axis as `churn_probability`.
- **Churn by Subscription Status** — Grouped bar chart with X axis as `subscription_user` (labeled "Subscriber" / "Non-subscriber") and Y axis as mean `churn_probability`.
- **Churn by App Size** — Scatter plot with X axis as `app_size_mb` and Y axis as `churn_probability`. App size is a known churn driver — users uninstall large apps.

### Section 4: Technical Issue Analysis

Display charts for -
- **Crash Frequency by App Version & OS** — Heatmap (using `chartjs-chart-matrix`) where X axis is `app_version`, Y axis is `os_version`, and cell color intensity represents mean `crash_count`.
- **Crash Impact on Rating** — Scatter plot with X axis as `crash_count` and Y axis as `rating`.
- **OS Version Issues** — Bar chart with X axis as `os_version` and Y axis as mean `crash_count`.
- **Crash Count by Network Type** — Bar chart with X axis as `network_type` and Y axis as mean `crash_count`. Network conditions can correlate with crashes and poor experience.

### Section 5: Customer Segmentation

Display charts for -
- **Retention by Subscription Status** — Grouped bar chart. X axis has two groups: `subscription_user = 1` ("Subscriber") and `subscription_user = 0` ("Non-subscriber"). Each group shows two bars: mean `retention_7d` and mean `retention_30d`.
- **In-App Purchase vs Retention** — Grouped bar chart. X axis has two groups: `in_app_purchase = 1` ("Purchaser") and `in_app_purchase = 0` ("Non-purchaser"). Each group shows two bars: mean `retention_7d` and mean `retention_30d`.
- **Retention by Verified User** — Grouped bar chart. X axis: `verified_user = 1` ("Verified") vs `verified_user = 0` ("Unverified"). Y axis: mean `retention_30d`.
- **Rating by Subscription Status** — Bar chart. X axis: Subscriber vs Non-subscriber. Y axis: mean `rating`. Shows whether paying users rate differently.
- **Retention by Country** — Bar chart with X axis as `country` and Y axis as mean `retention_30d`, complementing the map view in Section 2 with exact values.

### Section 6: Review Intelligence

Display charts for -
- **Sentiment vs Retention** — Scatter plot with X axis as `sentiment_score` and Y axis as `retention_30d`.
- **Review Length vs Sentiment** — Scatter plot with X axis as `review_length_words` and Y axis as `sentiment_score`. Color-code points by `sentiment_label` (green/amber/red). Long negative reviews often indicate serious UX issues.
- **Most Helpful Negative Reviews** — Filterable, paginated table showing reviews where `sentiment_label == 'negative'`, sorted by `helpful_votes` descending. Display columns:
   - `review_text`
   - `rating`
   - `helpful_votes`
   - `app_version`
   - `review_date`

   Show 10 rows per page with pagination controls. Provide a search box to filter within the displayed reviews.

### Section 7: Developer Response Impact

**Data note:** Only include rows where `developer_reply == 1` for the Response Time chart. Rows with `developer_reply == 0` have meaningless `response_time_hours` values and must be excluded.

Display charts to show -
- **Response Time vs Rating** — Box plot (or grouped bar chart showing mean ± std) with X axis as `rating` (1–5) and Y axis as mean `response_time_hours`. Only include rows where `developer_reply == 1`. This shows whether developers respond faster to low-rated reviews.
- **Developer Reply vs Retention** — Grouped bar chart. X axis: "Replied" (`developer_reply == 1`) vs "Not Replied" (`developer_reply == 0`). Y axis: mean `retention_30d`. Shows whether developer engagement correlates with better retention.

### Section 8: Advanced Product Insights

#### Retention Risk Score

Calculate per-row Retention Risk Score using the formula:

```
risk = (0.5 × churn_probability) + (0.3 × crash_count / max_crash_count) + (0.2 × (sentiment_score == -1 ? 1 : 0))
```

Where `max_crash_count` is the maximum `crash_count` in the (filtered) dataset, used for normalization. The result is a value in [0, 1].

Then aggregate by `app_version` and display:
- **Top Risky App Versions** — Horizontal bar chart with X axis as mean `risk` score and Y axis as `app_version`, sorted descending. Show the top 5 riskiest versions.

Also aggregate by `country` and display:
- **Top Risky Countries** — Horizontal bar chart with X axis as mean `risk` score and Y axis as `country`, sorted descending.

#### Bug Impact Index

Calculate per `app_version`:

```
bug_index = mean_crash_count × count_of_negative_reviews
```

Where `count_of_negative_reviews` is the number of reviews with `sentiment_label == 'negative'` for that version.

Display:
- **Bug Impact Index by Version** — Horizontal bar chart with X axis as `bug_index` and Y axis as `app_version`, sorted descending. Color bars with a red gradient (darker = worse). This ranks the worst releases by combined crash and sentiment impact.


### Filters (Critical)

Dashboard should include a persistent filter bar at the top of the page (sticky on scroll). All charts and metric cards must update reactively when any filter changes.

Filter controls:

| Filter | Control Type | Notes |
|---|---|---|
| Date Range | Date range picker with presets (Last 30 days, Last 90 days, Last 1 year, All Time) | Default: All Time |
| Country | Multi-select dropdown | Default: All |
| Platform | Multi-select dropdown (iOS, Android) | Default: All |
| App Version | Multi-select dropdown | Default: All |
| Category | Multi-select dropdown | Default: All |
| Subscription User | Dropdown (All, Subscriber, Non-subscriber) | Default: All |
| Device Model | Multi-select dropdown | Default: All |

- Filters combine with AND logic (all filters apply simultaneously).
- Include a **"Reset Filters"** button to restore all filters to their defaults.
- When filters result in zero matching rows, display a centered "No data matches the current filters" message in place of charts.

## Interactivity & UX Specifications

### Tooltips

- All Chart.js charts must have tooltips enabled.
- Tooltips should show the exact data values and relevant labels (e.g., on scatter plot hover: "Rating: 4, Retention: 0.72").

### Loading & Empty States

- Show a spinner/skeleton placeholder while CSV data is being parsed.
- When filtered data returns zero results, display a styled "No data matches the current filters" message (centered, with an icon) in place of each chart.

### Responsive Layout

- Use a 12-column grid (Bootstrap 5).
- **Desktop (≥1200px):** 2–3 chart cards per row.
- **Tablet (768px–1199px):** 2 chart cards per row.
- **Mobile (<768px):** 1 chart card per row, charts stack vertically.
- Metric cards should wrap into a scrollable horizontal row on mobile.
- All charts must resize responsively using Chart.js `responsive: true` and `maintainAspectRatio: false` with a fixed minimum height of 300px.

### Accessibility

- All charts should have `aria-label` attributes describing their purpose.
- Color choices must meet WCAG AA contrast ratio (4.5:1 for text).

## README Structure for GitHub

Add a README to the project explaining -
- How to launch the app.
- Explain folder structure.
- Give detailed explanation of each chart used in the dashboard.
- List all third-party libraries used and their purpose.

## Coding guidelines

- Always use good code comments explaining logic where needed.
- Use good indentation.