/* =============================================
   App Pulse — Main Application Script
   Handles: CSV parsing, filtering, metric cards,
   and all chart rendering (Sections 1–8).
   ============================================= */

(function () {
    'use strict';

    // ── Color constants ────────────────────────────────────────────
    const COLORS = {
        purple: '#6366F1',
        teal: '#06B6D4',
        green: '#10B981',
        amber: '#F59E0B',
        red: '#EF4444',
        palette: ['#6366F1', '#3B82F6', '#06B6D4', '#10B981', '#F59E0B', '#F97316', '#EF4444']
    };

    // ── State ──────────────────────────────────────────────────────
    let rawData = [];          // all parsed rows
    let filteredData = [];     // after applying filters
    let chartInstances = {};   // Chart.js instances for cleanup
    let leafletMap = null;
    let geoLayer = null;
    let geoJsonData = null;

    // ── Utility helpers ────────────────────────────────────────────
    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const std = arr => {
        if (arr.length < 2) return 0;
        const m = mean(arr);
        return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
    };
    const sentimentScore = label => label === 'positive' ? 1 : label === 'negative' ? -1 : 0;
    const fmt = (v, d = 2) => Number(v).toFixed(d);
    const pct = v => (v * 100).toFixed(1) + '%';

    function groupBy(arr, keyFn) {
        const map = {};
        arr.forEach(r => {
            const k = typeof keyFn === 'string' ? r[keyFn] : keyFn(r);
            (map[k] = map[k] || []).push(r);
        });
        return map;
    }

    function monthKey(dateStr) {
        const d = new Date(dateStr);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }

    function gradientFill(ctx, c1, c2) {
        const g = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        return g;
    }

    // ── CSV Loading ────────────────────────────────────────────────
    function loadCSV() {
        Papa.parse('./healthplus_reviews_preview.csv', {
            download: true,
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false,
            complete: function (results) {
                rawData = results.data.map(r => ({
                    review_id: r.review_id,
                    user_id: r.user_id,
                    app_id: r.app_id,
                    app_name: r.app_name,
                    category: (r.category || '').trim(),
                    app_version: (r.app_version || '').trim(),
                    platform: (r.platform || '').trim(),
                    device_model: (r.device_model || '').trim(),
                    os_version: (r.os_version || '').trim(),
                    network_type: (r.network_type || '').trim(),
                    review_text: r.review_text || '',
                    rating: parseFloat(r.rating) || 0,
                    sentiment_label: (r.sentiment_label || '').trim().toLowerCase(),
                    review_length_words: parseInt(r.review_length_words) || 0,
                    helpful_votes: parseInt(r.helpful_votes) || 0,
                    total_votes: parseInt(r.total_votes) || 0,
                    session_duration_min: parseFloat(r.session_duration_min) || 0,
                    daily_active_users: parseInt(r.daily_active_users) || 0,
                    monthly_active_users: parseInt(r.monthly_active_users) || 0,
                    download_count: parseInt(r.download_count) || 0,
                    crash_count: parseInt(r.crash_count) || 0,
                    update_frequency_days: parseInt(r.update_frequency_days) || 0,
                    verified_user: parseInt(r.verified_user) || 0,
                    subscription_user: parseInt(r.subscription_user) || 0,
                    in_app_purchase: parseInt(r.in_app_purchase) || 0,
                    app_price: parseFloat(r.app_price) || 0,
                    app_size_mb: parseFloat(r.app_size_mb) || 0,
                    retention_7d: parseFloat(r.retention_7d) || 0,
                    retention_30d: parseFloat(r.retention_30d) || 0,
                    churn_probability: parseFloat(r.churn_probability) || 0,
                    developer_reply: parseInt(r.developer_reply) || 0,
                    response_time_hours: parseFloat(r.response_time_hours) || 0,
                    country: (r.country || '').trim(),
                    language: (r.language || '').trim(),
                    review_date: (r.review_date || '').trim()
                }));
                // Derived
                rawData.forEach(r => {
                    r.sentiment_score = sentimentScore(r.sentiment_label);
                    r.dau_mau = r.monthly_active_users > 0 ? r.daily_active_users / r.monthly_active_users : 0;
                    r.is_negative = r.sentiment_label === 'negative';
                    r._date = new Date(r.review_date);
                });
                initFilters();
                applyFilters();
                hideLoading();
            },
            error: function () {
                document.getElementById('loading-overlay').innerHTML =
                    '<div class="text-center text-danger"><i class="bi bi-exclamation-circle" style="font-size:3rem"></i><p class="mt-2">Failed to load CSV data.</p></div>';
            }
        });
    }

    function hideLoading() {
        const ov = document.getElementById('loading-overlay');
        ov.classList.add('fade-out');
        setTimeout(() => ov.style.display = 'none', 500);
        document.getElementById('dashboard-content').style.display = 'block';
    }

    // ── Filters ────────────────────────────────────────────────────
    function populateMultiSelect(id, values) {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        values.sort().forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            opt.selected = true;
            sel.appendChild(opt);
        });
    }

    function initFilters() {
        const unique = key => [...new Set(rawData.map(r => r[key]).filter(Boolean))];
        populateMultiSelect('filter-country', unique('country'));
        populateMultiSelect('filter-platform', unique('platform'));
        populateMultiSelect('filter-version', unique('app_version'));
        populateMultiSelect('filter-category', unique('category'));
        populateMultiSelect('filter-device', unique('device_model'));

        // Attach listeners
        ['filter-date-range', 'filter-country', 'filter-platform', 'filter-version',
         'filter-category', 'filter-subscription', 'filter-device'].forEach(id => {
            document.getElementById(id).addEventListener('change', applyFilters);
        });
        document.getElementById('btn-reset-filters').addEventListener('click', resetFilters);
        document.getElementById('toggle-ret-map').addEventListener('change', renderRetentionMap);
    }

    function getSelectedValues(id) {
        const sel = document.getElementById(id);
        return Array.from(sel.selectedOptions).map(o => o.value);
    }

    function resetFilters() {
        document.getElementById('filter-date-range').value = 'all';
        document.getElementById('filter-subscription').value = 'all';
        document.querySelectorAll('#filter-country option, #filter-platform option, #filter-version option, #filter-category option, #filter-device option')
            .forEach(o => o.selected = true);
        applyFilters();
    }

    function applyFilters() {
        const dateRange = document.getElementById('filter-date-range').value;
        const countries = getSelectedValues('filter-country');
        const platforms = getSelectedValues('filter-platform');
        const versions = getSelectedValues('filter-version');
        const categories = getSelectedValues('filter-category');
        const sub = document.getElementById('filter-subscription').value;
        const devices = getSelectedValues('filter-device');

        let cutoff = null;
        if (dateRange !== 'all') {
            cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - parseInt(dateRange));
        }

        filteredData = rawData.filter(r => {
            if (cutoff && r._date < cutoff) return false;
            if (!countries.includes(r.country)) return false;
            if (!platforms.includes(r.platform)) return false;
            if (!versions.includes(r.app_version)) return false;
            if (!categories.includes(r.category)) return false;
            if (!devices.includes(r.device_model)) return false;
            if (sub === '1' && r.subscription_user !== 1) return false;
            if (sub === '0' && r.subscription_user !== 0) return false;
            return true;
        });

        if (filteredData.length === 0) {
            document.getElementById('dashboard-content').style.display = 'none';
            document.getElementById('no-data-message').style.display = 'block';
        } else {
            document.getElementById('dashboard-content').style.display = 'block';
            document.getElementById('no-data-message').style.display = 'none';
            renderAll();
        }
    }

    // ── Master Render ──────────────────────────────────────────────
    function renderAll() {
        renderMetricCards();
        renderSection1Charts();
        renderSection2Charts();
        renderSection3Charts();
        renderSection4Charts();
        renderSection5Charts();
        renderSection6Charts();
        renderSection7Charts();
        renderSection8Charts();
    }

    // Destroy and recreate a Chart.js instance
    function makeChart(id, config) {
        if (chartInstances[id]) {
            chartInstances[id].destroy();
        }
        const ctx = document.getElementById(id).getContext('2d');
        chartInstances[id] = new Chart(ctx, config);
        return chartInstances[id];
    }

    // Shared Chart.js defaults
    const defaultScaleColor = 'rgba(0,0,0,0.06)';
    const defaultTickColor = '#64748B';
    function scaleOpts(title) {
        return {
            grid: { color: defaultScaleColor },
            ticks: { color: defaultTickColor, font: { size: 11 } },
            title: title ? { display: true, text: title, color: defaultTickColor, font: { size: 12 } } : undefined
        };
    }

    const defaultPlugins = {
        legend: { labels: { color: '#1E293B', font: { size: 11 } } },
        tooltip: { enabled: true }
    };

    // ── Section 1: Metric Cards ────────────────────────────────────
    function renderMetricCards() {
        const d = filteredData;
        document.getElementById('mc-avg-rating').textContent = fmt(mean(d.map(r => r.rating)));
        document.getElementById('mc-avg-sentiment').textContent = fmt(mean(d.map(r => r.sentiment_score)));
        document.getElementById('mc-ret7d').textContent = pct(mean(d.map(r => r.retention_7d)));
        document.getElementById('mc-ret30d').textContent = pct(mean(d.map(r => r.retention_30d)));
        document.getElementById('mc-churn').textContent = fmt(mean(d.map(r => r.churn_probability)));
        document.getElementById('mc-session').textContent = fmt(mean(d.map(r => r.session_duration_min))) + ' min';
        document.getElementById('mc-daumau').textContent = fmt(mean(d.map(r => r.dau_mau)));
    }

    // ── Section 1: Charts ──────────────────────────────────────────
    function renderSection1Charts() {
        // Rating Distribution (horizontal bar)
        const ratingCounts = [1, 2, 3, 4, 5].map(r => filteredData.filter(d => Math.round(d.rating) === r).length);
        makeChart('chart-rating-dist', {
            type: 'bar',
            data: {
                labels: ['1 ★', '2 ★', '3 ★', '4 ★', '5 ★'],
                datasets: [{
                    label: 'Reviews',
                    data: ratingCounts,
                    backgroundColor: COLORS.palette,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Count'), y: scaleOpts() }
            }
        });

        // Sentiment Distribution (doughnut)
        const sentCounts = ['positive', 'neutral', 'negative'].map(s => filteredData.filter(d => d.sentiment_label === s).length);
        makeChart('chart-sentiment-dist', {
            type: 'doughnut',
            data: {
                labels: ['Positive', 'Neutral', 'Negative'],
                datasets: [{
                    data: sentCounts,
                    backgroundColor: [COLORS.green, COLORS.amber, COLORS.red],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins },
                cutout: '55%'
            }
        });

        // Retention vs Rating (scatter)
        makeChart('chart-retention-rating', {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Retention vs Rating',
                    data: filteredData.map(r => ({ x: r.rating, y: r.retention_30d })),
                    backgroundColor: COLORS.teal + '88',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Rating'), y: scaleOpts('30d Retention') }
            }
        });

        // Sentiment Trend Over Time (line, monthly)
        const byMonth = groupBy(filteredData, r => monthKey(r.review_date));
        const months = Object.keys(byMonth).sort();
        const monthlyMeanSentiment = months.map(m => mean(byMonth[m].map(r => r.sentiment_score)));
        makeChart('chart-sentiment-trend', {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Avg Sentiment Score',
                    data: monthlyMeanSentiment,
                    borderColor: COLORS.purple,
                    backgroundColor: COLORS.purple + '22',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: defaultPlugins,
                scales: { x: scaleOpts('Month'), y: scaleOpts('Sentiment Score') }
            }
        });

        // Reviews Volume vs Rating (dual-axis)
        const monthlyCount = months.map(m => byMonth[m].length);
        const monthlyMeanRating = months.map(m => mean(byMonth[m].map(r => r.rating)));
        makeChart('chart-volume-rating', {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Review Count',
                        data: monthlyCount,
                        backgroundColor: COLORS.purple + 'AA',
                        borderRadius: 3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Avg Rating',
                        data: monthlyMeanRating,
                        type: 'line',
                        borderColor: COLORS.teal,
                        backgroundColor: COLORS.teal + '22',
                        tension: 0.3,
                        pointRadius: 3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: defaultPlugins,
                scales: {
                    x: scaleOpts('Month'),
                    y: { ...scaleOpts('Review Count'), position: 'left' },
                    y1: { ...scaleOpts('Avg Rating'), position: 'right', grid: { drawOnChartArea: false } }
                }
            }
        });
    }

    // ── Section 2: Retention Diagnostics ───────────────────────────
    function renderSection2Charts() {
        // Retention by App Version
        const byVer = groupBy(filteredData, 'app_version');
        const versions = Object.keys(byVer).sort();
        makeChart('chart-ret-version', {
            type: 'bar',
            data: {
                labels: versions,
                datasets: [{
                    label: 'Mean 30d Retention',
                    data: versions.map(v => mean(byVer[v].map(r => r.retention_30d))),
                    backgroundColor: COLORS.palette.slice(0, versions.length),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('App Version'), y: scaleOpts('Mean Retention (30d)') }
            }
        });

        // Retention by Device & App Version – heatmap
        renderHeatmap('chart-ret-device-version', filteredData, 'app_version', 'device_model', 'retention_30d', 'Retention');

        // Map
        renderRetentionMap();

        // Retention vs Session Duration (scatter)
        makeChart('chart-ret-session', {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Retention vs Session',
                    data: filteredData.map(r => ({ x: r.session_duration_min, y: r.retention_30d })),
                    backgroundColor: COLORS.green + '88',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Session Duration (min)'), y: scaleOpts('30d Retention') }
            }
        });

        // Retention by Category
        const byCat = groupBy(filteredData, 'category');
        const cats = Object.keys(byCat).sort();
        makeChart('chart-ret-category', {
            type: 'bar',
            data: {
                labels: cats,
                datasets: [{
                    label: 'Mean 30d Retention',
                    data: cats.map(c => mean(byCat[c].map(r => r.retention_30d))),
                    backgroundColor: COLORS.palette.slice(0, cats.length),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Category'), y: scaleOpts('Mean Retention (30d)') }
            }
        });
    }

    // ── Heatmap Helper (reused in Sections 2 & 4) ──────────────
    function renderHeatmap(canvasId, data, xKey, yKey, valKey, valLabel) {
        const xVals = [...new Set(data.map(r => r[xKey]))].sort();
        const yVals = [...new Set(data.map(r => r[yKey]))].sort();
        const grouped = groupBy(data, r => r[xKey] + '|' + r[yKey]);
        const points = [];
        let minVal = Infinity, maxVal = -Infinity;
        xVals.forEach((xv, xi) => {
            yVals.forEach((yv, yi) => {
                const key = xv + '|' + yv;
                const v = grouped[key] ? mean(grouped[key].map(r => r[valKey])) : 0;
                points.push({ x: xi, y: yi, v: v });
                if (v < minVal) minVal = v;
                if (v > maxVal) maxVal = v;
            });
        });

        makeChart(canvasId, {
            type: 'matrix',
            data: {
                datasets: [{
                    label: valLabel,
                    data: points,
                    backgroundColor(ctx) {
                        const v = ctx.dataset.data[ctx.dataIndex]?.v || 0;
                        const ratio = maxVal > minVal ? (v - minVal) / (maxVal - minVal) : 0.5;
                        const r = Math.round(214 - ratio * 106);
                        const g = Math.round(48 + ratio * 136);
                        const b = Math.round(49 + ratio * 103);
                        return `rgba(${r},${g},${b},0.85)`;
                    },
                    width: ({ chart }) => (chart.chartArea || {}).width / xVals.length - 2,
                    height: ({ chart }) => (chart.chartArea || {}).height / yVals.length - 2,
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: () => '',
                            label(ctx) {
                                const p = ctx.dataset.data[ctx.dataIndex];
                                return `${xVals[p.x]} / ${yVals[p.y]}: ${fmt(p.v)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        offset: true,
                        min: -0.5, max: xVals.length - 0.5,
                        ticks: {
                            stepSize: 1,
                            callback: (v) => xVals[v] || '',
                            color: defaultTickColor
                        },
                        grid: { display: false },
                        title: { display: true, text: xKey.replace(/_/g, ' '), color: defaultTickColor }
                    },
                    y: {
                        type: 'linear',
                        offset: true,
                        min: -0.5, max: yVals.length - 0.5,
                        ticks: {
                            stepSize: 1,
                            callback: (v) => yVals[v] || '',
                            color: defaultTickColor
                        },
                        grid: { display: false },
                        title: { display: true, text: yKey.replace(/_/g, ' '), color: defaultTickColor }
                    }
                }
            }
        });
    }

    // ── Leaflet Choropleth Map ──────────────────────────────────
    function renderRetentionMap() {
        const is30d = document.getElementById('toggle-ret-map').checked;
        const field = is30d ? 'retention_30d' : 'retention_7d';
        document.getElementById('toggle-ret-map-label').textContent = is30d ? '30d' : '7d';

        const byCountry = groupBy(filteredData, 'country');
        const countryData = {};
        Object.keys(byCountry).forEach(c => {
            countryData[c] = mean(byCountry[c].map(r => r[field]));
        });

        // Map name normalization
        const nameMap = {
            'United States of America': 'USA',
            'United States': 'USA',
            'Canada': 'Canada',
            'India': 'India',
            'Germany': 'Germany',
            'United Kingdom': 'UK'
        };

        function getColor(val) {
            if (val === null || val === undefined) return '#e2e8f0';
            const ratio = Math.min(1, Math.max(0, val));
            // Gradient from red (low) to green (high)
            const r = Math.round(214 - ratio * 180);
            const g = Math.round(48 + ratio * 136);
            const b = Math.round(49 + ratio * 100);
            return `rgb(${r},${g},${b})`;
        }

        function style(feature) {
            const name = feature.properties.name || feature.properties.ADMIN || '';
            const mapped = nameMap[name] || name;
            const val = countryData[mapped] !== undefined ? countryData[mapped] : null;
            return {
                fillColor: val !== null ? getColor(val) : '#e2e8f0',
                weight: 1,
                opacity: 1,
                color: '#94a3b8',
                fillOpacity: val !== null ? 0.8 : 0.3
            };
        }

        function onEachFeature(feature, layer) {
            const name = feature.properties.name || feature.properties.ADMIN || '';
            const mapped = nameMap[name] || name;
            const val = countryData[mapped];
            if (val !== undefined) {
                layer.bindTooltip(`${mapped}: ${pct(val)}`, { sticky: true });
            }
        }

        if (!leafletMap) {
            leafletMap = L.map('map-retention', {
                center: [30, 0],
                zoom: 1.5,
                minZoom: 1,
                maxZoom: 5,
                attributionControl: false,
                zoomControl: true
            });
            // Dark tile layer
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(leafletMap);
        }

        // Load GeoJSON
        if (!geoJsonData) {
            fetch('data/countries.geojson')
                .then(res => res.json())
                .then(geo => {
                    geoJsonData = geo;
                    addGeoLayer(style, onEachFeature);
                    addLegend();
                })
                .catch(() => {
                    document.getElementById('map-retention').innerHTML =
                        '<p class="text-center text-secondary mt-5">GeoJSON not available</p>';
                });
        } else {
            addGeoLayer(style, onEachFeature);
        }
    }

    function addGeoLayer(styleFn, onEachFn) {
        if (geoLayer) leafletMap.removeLayer(geoLayer);
        geoLayer = L.geoJSON(geoJsonData, { style: styleFn, onEachFeature: onEachFn }).addTo(leafletMap);
    }

    function addLegend() {
        if (leafletMap._legend) return;
        const legend = L.control({ position: 'bottomright' });
        legend.onAdd = function () {
            const div = L.DomUtil.create('div', 'map-legend');
            div.innerHTML = '<strong>Retention</strong><br>' +
                '<i style="background:#22a152"></i> High<br>' +
                '<i style="background:#ab7030"></i> Medium<br>' +
                '<i style="background:#d63031"></i> Low<br>' +
                '<i style="background:#e2e8f0"></i> No data';
            return div;
        };
        legend.addTo(leafletMap);
        leafletMap._legend = true;
    }

    // ── Section 3: Churn Drivers ───────────────────────────────────
    function renderSection3Charts() {
        // Feature Importance via multiple linear regression
        renderFeatureImportance();

        // Churn vs Crash (scatter)
        makeChart('chart-churn-crash', {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Churn vs Crashes',
                    data: filteredData.map(r => ({ x: r.crash_count, y: r.churn_probability })),
                    backgroundColor: COLORS.red + '88',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Crash Count'), y: scaleOpts('Churn Probability') }
            }
        });

        // Churn by Subscription
        const subs = groupBy(filteredData, r => r.subscription_user === 1 ? 'Subscriber' : 'Non-subscriber');
        const subLabels = ['Subscriber', 'Non-subscriber'];
        makeChart('chart-churn-sub', {
            type: 'bar',
            data: {
                labels: subLabels,
                datasets: [{
                    label: 'Mean Churn Probability',
                    data: subLabels.map(l => mean((subs[l] || []).map(r => r.churn_probability))),
                    backgroundColor: [COLORS.purple, COLORS.red],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts(), y: scaleOpts('Mean Churn Probability') }
            }
        });

        // Churn by App Size (scatter)
        makeChart('chart-churn-size', {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Churn vs App Size',
                    data: filteredData.map(r => ({ x: r.app_size_mb, y: r.churn_probability })),
                    backgroundColor: COLORS.amber + '88',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('App Size (MB)'), y: scaleOpts('Churn Probability') }
            }
        });
    }

    // ── Feature Importance (ml.js regression) ──────────────────
    function renderFeatureImportance() {
        const features = ['crash_count', 'sentiment_score', 'rating', 'session_duration_min', 'subscription_user', 'app_size_mb'];
        const featureLabels = ['Crash Count', 'Sentiment Score', 'Rating', 'Session Duration', 'Subscription', 'App Size'];

        if (filteredData.length < 3) {
            makeChart('chart-feature-importance', {
                type: 'bar',
                data: { labels: featureLabels, datasets: [{ data: features.map(() => 0), backgroundColor: COLORS.purple }] },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            return;
        }

        // Extract columns and compute z-scores
        const cols = features.map(f => filteredData.map(r => r[f]));
        const colMeans = cols.map(c => mean(c));
        const colStds = cols.map(c => std(c));
        const zCols = cols.map((c, i) => c.map(v => colStds[i] > 0 ? (v - colMeans[i]) / colStds[i] : 0));

        const Y = filteredData.map(r => r.churn_probability);
        const X = filteredData.map((_, ri) => zCols.map(c => c[ri]));

        // Simple OLS: β = (XᵀX)⁻¹Xᵀy using manual calculation
        let coefficients;
        try {
            coefficients = solveOLS(X, Y);
        } catch (e) {
            coefficients = features.map(() => 0);
        }

        const absCoeffs = coefficients.map(Math.abs);
        // Sort descending
        const indexed = absCoeffs.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);

        makeChart('chart-feature-importance', {
            type: 'bar',
            data: {
                labels: indexed.map(o => featureLabels[o.i]),
                datasets: [{
                    label: '|Coefficient|',
                    data: indexed.map(o => o.v),
                    backgroundColor: indexed.map((_, i) => COLORS.palette[i % COLORS.palette.length]),
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('|Standardized Coefficient|'), y: scaleOpts() }
            }
        });
    }

    // Minimal OLS implementation: β = (XᵀX)⁻¹Xᵀy
    function solveOLS(X, y) {
        const n = X.length;
        const p = X[0].length;
        // Add intercept
        const Xa = X.map(row => [1, ...row]);
        const pp = p + 1;
        // XᵀX
        const XtX = Array.from({ length: pp }, () => new Array(pp).fill(0));
        const Xty = new Array(pp).fill(0);
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < pp; j++) {
                Xty[j] += Xa[i][j] * y[i];
                for (let k = 0; k < pp; k++) {
                    XtX[j][k] += Xa[i][j] * Xa[i][k];
                }
            }
        }
        // Gaussian elimination to solve XtX * β = Xty
        const A = XtX.map((row, i) => [...row, Xty[i]]);
        for (let col = 0; col < pp; col++) {
            let maxRow = col;
            for (let row = col + 1; row < pp; row++) {
                if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
            }
            [A[col], A[maxRow]] = [A[maxRow], A[col]];
            if (Math.abs(A[col][col]) < 1e-10) continue;
            for (let row = col + 1; row < pp; row++) {
                const f = A[row][col] / A[col][col];
                for (let j = col; j <= pp; j++) A[row][j] -= f * A[col][j];
            }
        }
        const beta = new Array(pp).fill(0);
        for (let i = pp - 1; i >= 0; i--) {
            beta[i] = A[i][pp];
            for (let j = i + 1; j < pp; j++) beta[i] -= A[i][j] * beta[j];
            beta[i] /= A[i][i] || 1;
        }
        return beta.slice(1); // remove intercept
    }

    // ── Section 4: Technical Issue Analysis ────────────────────────
    function renderSection4Charts() {
        // Crash by Version & OS — heatmap
        renderHeatmap('chart-crash-version-os', filteredData, 'app_version', 'os_version', 'crash_count', 'Crash Count');

        // Crash Impact on Rating (scatter)
        makeChart('chart-crash-rating', {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Crash vs Rating',
                    data: filteredData.map(r => ({ x: r.crash_count, y: r.rating })),
                    backgroundColor: COLORS.red + '88',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Crash Count'), y: scaleOpts('Rating') }
            }
        });

        // OS Version Issues
        const byOS = groupBy(filteredData, 'os_version');
        const osVers = Object.keys(byOS).sort();
        makeChart('chart-os-crash', {
            type: 'bar',
            data: {
                labels: osVers,
                datasets: [{
                    label: 'Mean Crash Count',
                    data: osVers.map(o => mean(byOS[o].map(r => r.crash_count))),
                    backgroundColor: COLORS.palette.slice(0, osVers.length),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('OS Version'), y: scaleOpts('Mean Crash Count') }
            }
        });

        // Crash by Network Type
        const byNet = groupBy(filteredData, 'network_type');
        const nets = Object.keys(byNet).sort();
        makeChart('chart-network-crash', {
            type: 'bar',
            data: {
                labels: nets,
                datasets: [{
                    label: 'Mean Crash Count',
                    data: nets.map(n => mean(byNet[n].map(r => r.crash_count))),
                    backgroundColor: COLORS.palette.slice(0, nets.length),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Network Type'), y: scaleOpts('Mean Crash Count') }
            }
        });
    }

    // ── Section 5: Customer Segmentation ───────────────────────────
    function renderSection5Charts() {
        // Retention by Subscription Status (grouped)
        const subGroups = groupBy(filteredData, r => r.subscription_user === 1 ? 'Subscriber' : 'Non-subscriber');
        const subLabels = ['Subscriber', 'Non-subscriber'];
        makeChart('chart-ret-sub', {
            type: 'bar',
            data: {
                labels: subLabels,
                datasets: [
                    {
                        label: '7d Retention',
                        data: subLabels.map(l => mean((subGroups[l] || []).map(r => r.retention_7d))),
                        backgroundColor: COLORS.purple,
                        borderRadius: 4
                    },
                    {
                        label: '30d Retention',
                        data: subLabels.map(l => mean((subGroups[l] || []).map(r => r.retention_30d))),
                        backgroundColor: COLORS.teal,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: defaultPlugins,
                scales: { x: scaleOpts(), y: scaleOpts('Mean Retention') }
            }
        });

        // In-App Purchase vs Retention (grouped)
        const iapGroups = groupBy(filteredData, r => r.in_app_purchase === 1 ? 'Purchaser' : 'Non-purchaser');
        const iapLabels = ['Purchaser', 'Non-purchaser'];
        makeChart('chart-iap-ret', {
            type: 'bar',
            data: {
                labels: iapLabels,
                datasets: [
                    {
                        label: '7d Retention',
                        data: iapLabels.map(l => mean((iapGroups[l] || []).map(r => r.retention_7d))),
                        backgroundColor: COLORS.purple,
                        borderRadius: 4
                    },
                    {
                        label: '30d Retention',
                        data: iapLabels.map(l => mean((iapGroups[l] || []).map(r => r.retention_30d))),
                        backgroundColor: COLORS.teal,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: defaultPlugins,
                scales: { x: scaleOpts(), y: scaleOpts('Mean Retention') }
            }
        });

        // Retention by Verified User
        const verGroups = groupBy(filteredData, r => r.verified_user === 1 ? 'Verified' : 'Unverified');
        const verLabels = ['Verified', 'Unverified'];
        makeChart('chart-ret-verified', {
            type: 'bar',
            data: {
                labels: verLabels,
                datasets: [{
                    label: 'Mean 30d Retention',
                    data: verLabels.map(l => mean((verGroups[l] || []).map(r => r.retention_30d))),
                    backgroundColor: [COLORS.green, COLORS.amber],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts(), y: scaleOpts('Mean Retention (30d)') }
            }
        });

        // Rating by Subscription Status
        makeChart('chart-rating-sub', {
            type: 'bar',
            data: {
                labels: subLabels,
                datasets: [{
                    label: 'Mean Rating',
                    data: subLabels.map(l => mean((subGroups[l] || []).map(r => r.rating))),
                    backgroundColor: [COLORS.purple, COLORS.teal],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts(), y: scaleOpts('Mean Rating') }
            }
        });

        // Retention by Country
        const byCntry = groupBy(filteredData, 'country');
        const countries = Object.keys(byCntry).sort();
        makeChart('chart-ret-country', {
            type: 'bar',
            data: {
                labels: countries,
                datasets: [{
                    label: 'Mean 30d Retention',
                    data: countries.map(c => mean(byCntry[c].map(r => r.retention_30d))),
                    backgroundColor: COLORS.palette.slice(0, countries.length),
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Country'), y: scaleOpts('Mean Retention (30d)') }
            }
        });
    }

    // ── Section 6: Review Intelligence ─────────────────────────────
    let negReviews = [];
    let currentPage = 1;
    const pageSize = 10;
    let searchQuery = '';

    function renderSection6Charts() {
        // Sentiment vs Retention (scatter)
        makeChart('chart-sentiment-retention', {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Sentiment vs Retention',
                    data: filteredData.map(r => ({ x: r.sentiment_score, y: r.retention_30d })),
                    backgroundColor: COLORS.purple + '88',
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Sentiment Score'), y: scaleOpts('30d Retention') }
            }
        });

        // Review Length vs Sentiment (color-coded scatter)
        const sentColors = {
            positive: COLORS.green + '88',
            neutral: COLORS.amber + '88',
            negative: COLORS.red + '88'
        };
        const byLabel = groupBy(filteredData, 'sentiment_label');
        const datasets = ['positive', 'neutral', 'negative'].filter(l => byLabel[l]).map(label => ({
            label: label.charAt(0).toUpperCase() + label.slice(1),
            data: byLabel[label].map(r => ({ x: r.review_length_words, y: r.sentiment_score })),
            backgroundColor: sentColors[label],
            pointRadius: 3
        }));
        makeChart('chart-length-sentiment', {
            type: 'scatter',
            data: { datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: defaultPlugins,
                scales: { x: scaleOpts('Review Length (words)'), y: scaleOpts('Sentiment Score') }
            }
        });

        // Negative Reviews Table
        negReviews = filteredData
            .filter(r => r.sentiment_label === 'negative')
            .sort((a, b) => b.helpful_votes - a.helpful_votes);
        currentPage = 1;
        searchQuery = '';
        document.getElementById('review-search').value = '';
        renderReviewsTable();

        // Search handler
        document.getElementById('review-search').oninput = function () {
            searchQuery = this.value.toLowerCase();
            currentPage = 1;
            renderReviewsTable();
        };
    }

    function renderReviewsTable() {
        let rows = negReviews;
        if (searchQuery) {
            rows = rows.filter(r =>
                r.review_text.toLowerCase().includes(searchQuery) ||
                r.app_version.toLowerCase().includes(searchQuery)
            );
        }
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        if (currentPage > totalPages) currentPage = totalPages;
        const start = (currentPage - 1) * pageSize;
        const pageRows = rows.slice(start, start + pageSize);

        const tbody = document.getElementById('reviews-tbody');
        tbody.innerHTML = pageRows.map(r => `
            <tr>
                <td>${escapeHtml(r.review_text)}</td>
                <td class="text-center">${r.rating} ★</td>
                <td class="text-center">${r.helpful_votes}</td>
                <td class="text-center">${r.app_version}</td>
                <td>${r.review_date.substring(0, 10)}</td>
            </tr>
        `).join('');

        // Pagination
        const pagEl = document.querySelector('#reviews-pagination .pagination');
        if (rows.length <= pageSize) {
            pagEl.innerHTML = '';
            return;
        }
        let html = `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage - 1}">&laquo;</a></li>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<li class="page-item ${i === currentPage ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
        }
        html += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}"><a class="page-link" href="#" data-page="${currentPage + 1}">&raquo;</a></li>`;
        pagEl.innerHTML = html;
        pagEl.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                const p = parseInt(this.dataset.page);
                if (p >= 1 && p <= totalPages) {
                    currentPage = p;
                    renderReviewsTable();
                }
            });
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Section 7: Developer Response Impact ───────────────────────
    function renderSection7Charts() {
        // Response Time vs Rating (only developer_reply == 1)
        const replied = filteredData.filter(r => r.developer_reply === 1);
        const byRating = groupBy(replied, r => Math.round(r.rating));
        const ratings = [1, 2, 3, 4, 5];
        const meanRT = ratings.map(r => mean((byRating[r] || []).map(d => d.response_time_hours)));
        const stdRT = ratings.map(r => {
            const arr = (byRating[r] || []).map(d => d.response_time_hours);
            return std(arr);
        });

        makeChart('chart-response-rating', {
            type: 'bar',
            data: {
                labels: ratings.map(r => r + ' ★'),
                datasets: [{
                    label: 'Mean Response Time (hrs)',
                    data: meanRT,
                    backgroundColor: COLORS.palette.slice(0, 5),
                    borderRadius: 4,
                    errorBars: stdRT
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    ...defaultPlugins,
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            afterLabel: (ctx) => `Std Dev: ${fmt(stdRT[ctx.dataIndex])} hrs`
                        }
                    }
                },
                scales: { x: scaleOpts('Rating'), y: scaleOpts('Mean Response Time (hrs)') }
            }
        });

        // Developer Reply vs Retention
        const replyGroups = groupBy(filteredData, r => r.developer_reply === 1 ? 'Replied' : 'Not Replied');
        const replyLabels = ['Replied', 'Not Replied'];
        makeChart('chart-reply-retention', {
            type: 'bar',
            data: {
                labels: replyLabels,
                datasets: [{
                    label: 'Mean 30d Retention',
                    data: replyLabels.map(l => mean((replyGroups[l] || []).map(r => r.retention_30d))),
                    backgroundColor: [COLORS.green, COLORS.red],
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts(), y: scaleOpts('Mean Retention (30d)') }
            }
        });
    }

    // ── Section 8: Advanced Product Insights ───────────────────────
    function renderSection8Charts() {
        const maxCrash = Math.max(...filteredData.map(r => r.crash_count), 1);

        // Retention Risk Score per row
        filteredData.forEach(r => {
            r._risk = (0.5 * r.churn_probability)
                + (0.3 * r.crash_count / maxCrash)
                + (0.2 * (r.sentiment_score === -1 ? 1 : 0));
        });

        // Top Risky App Versions (top 5)
        const byVer = groupBy(filteredData, 'app_version');
        const verRisk = Object.keys(byVer).map(v => ({ label: v, val: mean(byVer[v].map(r => r._risk)) }))
            .sort((a, b) => b.val - a.val).slice(0, 5);

        makeChart('chart-risk-version', {
            type: 'bar',
            data: {
                labels: verRisk.map(v => v.label),
                datasets: [{
                    label: 'Risk Score',
                    data: verRisk.map(v => v.val),
                    backgroundColor: verRisk.map((_, i) => COLORS.palette[6 - i] || COLORS.red),
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Mean Risk Score'), y: scaleOpts() }
            }
        });

        // Top Risky Countries
        const byCntry = groupBy(filteredData, 'country');
        const cntryRisk = Object.keys(byCntry).map(c => ({ label: c, val: mean(byCntry[c].map(r => r._risk)) }))
            .sort((a, b) => b.val - a.val);

        makeChart('chart-risk-country', {
            type: 'bar',
            data: {
                labels: cntryRisk.map(c => c.label),
                datasets: [{
                    label: 'Risk Score',
                    data: cntryRisk.map(c => c.val),
                    backgroundColor: cntryRisk.map((_, i) => COLORS.palette[Math.min(6, i + 3)]),
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Mean Risk Score'), y: scaleOpts() }
            }
        });

        // Bug Impact Index by Version
        const bugIndex = Object.keys(byVer).map(v => {
            const rows = byVer[v];
            const meanCrash = mean(rows.map(r => r.crash_count));
            const negCount = rows.filter(r => r.is_negative).length;
            return { label: v, val: meanCrash * negCount };
        }).sort((a, b) => b.val - a.val);

        // Red gradient for bars (darker = worse)
        const maxBug = Math.max(...bugIndex.map(b => b.val), 1);
        const bugColors = bugIndex.map(b => {
            const ratio = b.val / maxBug;
            const r = Math.round(120 + ratio * 94);    // 120 → 214
            const g = Math.round(20 + (1 - ratio) * 28); // darker red
            const bl = Math.round(20 + (1 - ratio) * 29);
            return `rgb(${r},${g},${bl})`;
        });

        makeChart('chart-bug-index', {
            type: 'bar',
            data: {
                labels: bugIndex.map(b => b.label),
                datasets: [{
                    label: 'Bug Impact Index',
                    data: bugIndex.map(b => b.val),
                    backgroundColor: bugColors,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: { ...defaultPlugins, legend: { display: false } },
                scales: { x: scaleOpts('Bug Impact Index'), y: scaleOpts() }
            }
        });
    }

    // ── Init ───────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', loadCSV);
})();
