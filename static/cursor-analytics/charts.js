/**
 * Chart.js-Rendering für Cursor Usage Analytics
 */
(function initCursorAnalyticsCharts(global) {
    const COLORS = {
        accent: '#3ecf8e',
        blue: '#58a6ff',
        gold: '#c9a227',
        orange: '#e8783a',
        purple: '#a78bfa',
        pink: '#f472b6',
        muted: '#8b9aab',
        grid: '#2d3a4a55',
        text: '#e8eef4',
    };

    const PALETTE = [
        COLORS.accent,
        COLORS.blue,
        COLORS.gold,
        COLORS.orange,
        COLORS.purple,
        COLORS.pink,
        '#34d399',
        '#60a5fa',
    ];

    const CHART_VISIBILITY_STORAGE_KEY = 'cursor-analytics-chart-visibility';

    function loadVisibilityStore() {
        try {
            const raw = global.localStorage?.getItem(CHART_VISIBILITY_STORAGE_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }

    function saveVisibilityStore(store) {
        try {
            global.localStorage?.setItem(CHART_VISIBILITY_STORAGE_KEY, JSON.stringify(store));
        } catch {
            /* ignore quota / private mode */
        }
    }

    function isSliceChart(chart) {
        const type = chart?.config?.type;
        return type === 'doughnut' || type === 'pie';
    }

    function readChartVisibility(chart, chartKey) {
        const chartState = {};
        if (!chart) {
            return chartState;
        }

        if (isSliceChart(chart)) {
            const meta = chart.getDatasetMeta(0);
            chart.data.labels.forEach((label, index) => {
                chartState[label] = Boolean(meta.data[index]?.hidden);
            });
            return chartState;
        }

        chart.data.datasets.forEach((dataset, index) => {
            chartState[dataset.label] = !chart.isDatasetVisible(index);
        });
        return chartState;
    }

    function persistChartVisibility(chart, chartKey) {
        if (!chart || !chartKey) {
            return;
        }
        const store = loadVisibilityStore();
        store[chartKey] = readChartVisibility(chart, chartKey);
        saveVisibilityStore(store);
    }

    function isDatasetLabelHidden(chartKey, label) {
        return Boolean(loadVisibilityStore()[chartKey]?.[label]);
    }

    function applyStoredVisibility(chart, chartKey) {
        const chartState = loadVisibilityStore()[chartKey];
        if (!chart || !chartState) {
            return;
        }

        if (isSliceChart(chart)) {
            const meta = chart.getDatasetMeta(0);
            chart.data.labels.forEach((label, index) => {
                if (chartState[label]) {
                    meta.data[index].hidden = true;
                }
            });
            return;
        }

        chart.data.datasets.forEach((dataset, index) => {
            if (chartState[dataset.label]) {
                chart.setDatasetVisibility(index, false);
            }
        });
    }

    function legendOnClickHandler(chartKey) {
        return (event, legendItem, legend) => {
            const defaultHandler = Chart.defaults.plugins.legend.onClick;
            if (typeof defaultHandler === 'function') {
                defaultHandler.call(legend.chart, event, legendItem, legend);
            }
            persistChartVisibility(legend.chart, chartKey);
        };
    }

    function legendOptions(chartKey, extra = {}) {
        return {
            labels: { color: COLORS.text, boxWidth: 12 },
            onClick: legendOnClickHandler(chartKey),
            ...extra,
        };
    }

    function basePlugins(title, chartKey) {
        return {
            legend: legendOptions(chartKey),
            title: {
                display: Boolean(title),
                text: title,
                color: COLORS.text,
                font: { size: 13, weight: '600' },
            },
        };
    }

    function buildZoomPluginOptions(extraLimits = {}) {
        return {
            pan: {
                enabled: true,
                mode: 'xy',
                modifierKey: 'ctrl',
                threshold: 5,
            },
            zoom: {
                wheel: { enabled: true, speed: 0.08 },
                pinch: { enabled: true },
                mode: 'xy',
            },
            limits: {
                x: { min: 'original', max: 'original', ...(extraLimits.x || {}) },
                y: { min: 'original', max: 'original', ...(extraLimits.y || {}) },
            },
        };
    }

    function pluginsWithZoom(title, chartKey, extraLimits) {
        return {
            ...basePlugins(title, chartKey),
            zoom: buildZoomPluginOptions(extraLimits),
        };
    }

    function markerChartExtras(markerContext, buckets, mode = 'category') {
        if (!markerContext?.markers?.length || markerContext.showMarkers === false) {
            return { plugins: {}, layout: {} };
        }
        const markersApi = global.CursorAnalytics?.markers;
        if (!markersApi) {
            return { plugins: {}, layout: {} };
        }
        const annotationMode = markerContext.mode || mode;
        const chartContext = {
            mode: annotationMode,
            buckets: annotationMode === 'category' ? buckets : undefined,
            user: markerContext.user,
            filterEndMs: markerContext.filterEndMs,
            events: markerContext.events,
            markers: markerContext.markers,
            formatters: markerContext.formatters,
            onEditMarker: markerContext.onEditMarker,
            showPopover: markerContext.showPopover !== false,
            showMarkers: markerContext.showMarkers !== false,
            showLabels: markerContext.showLabels !== false,
            projectFilter: markerContext.projectFilter || 'all',
        };
        const topPadding = markersApi.chartMarkerLabelTopPadding(markerContext.markers, chartContext);
        return {
            plugins: {
                annotation: markersApi.annotationPluginOptions(markerContext.markers, chartContext),
            },
            layout: topPadding > 0 ? { padding: { top: topPadding } } : {},
        };
    }

    function markerAnnotationPlugins(markerContext, buckets, mode = 'category') {
        return markerChartExtras(markerContext, buckets, mode).plugins;
    }

    function timelineZoomLimits() {
        return {
            x: { minRange: 60 * 60 * 1000 },
            y: { minRange: 1000 },
        };
    }

    function findEventAtTime(events, timeMs) {
        if (!events?.length || timeMs == null) {
            return null;
        }
        return events.find((event) => event.timestamp.getTime() === timeMs) || null;
    }

    function markerTooltipLines(markerContext, timeMs) {
        const markersApi = global.CursorAnalytics?.markers;
        const event = findEventAtTime(markerContext?.events, timeMs);
        if (!markersApi || !event) {
            return [];
        }
        const marker = markersApi.getMarkerForEvent(event, markerContext.markers);
        if (!marker) {
            return [];
        }
        const lines = [`Projekt: ${marker.project}`];
        if (marker.task) {
            lines.push(`Aufgabe: ${marker.task}`);
        }
        return lines;
    }

    function buildTimelineScaleOptions(dateFmt, dateTimeFmt) {
        return {
            x: {
                type: 'linear',
                ticks: {
                    color: COLORS.muted,
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 8,
                    callback(value) {
                        if (typeof value !== 'number' || !Number.isFinite(value)) {
                            return value;
                        }
                        const date = new Date(value);
                        return date.getHours() === 0 && date.getMinutes() === 0
                            ? dateFmt.format(date)
                            : dateTimeFmt.format(date);
                    },
                },
                grid: { color: COLORS.grid },
            },
            y: {
                type: 'linear',
                position: 'left',
                ticks: {
                    color: COLORS.blue,
                },
                grid: { color: '#2d3a4a88' },
            },
            y1: {
                type: 'linear',
                position: 'right',
                ticks: {
                    color: COLORS.accent,
                },
                grid: { drawOnChartArea: false },
            },
        };
    }

    function baseOptions(title, valueCallback, chartKey) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: pluginsWithZoom(title, chartKey),
            scales: {
                x: {
                    ticks: { color: COLORS.muted, maxRotation: 0 },
                    grid: { color: COLORS.grid },
                },
                y: {
                    ticks: {
                        color: COLORS.muted,
                        callback: valueCallback || ((v) => v),
                    },
                    grid: { color: '#2d3a4a88' },
                },
            },
        };
    }

    /** Horizontal bars: categories on Y, values on X — formatter belongs on X only. */
    function horizontalBarOptions(valueCallback, chartKey) {
        return {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: pluginsWithZoom(null, chartKey),
            scales: {
                x: {
                    ticks: {
                        color: COLORS.muted,
                        callback: valueCallback || ((v) => v),
                    },
                    grid: { color: COLORS.grid },
                },
                y: {
                    ticks: { color: COLORS.muted, autoSkip: false },
                    grid: { color: '#2d3a4a88' },
                },
            },
        };
    }

    function destroyChart(instances, key) {
        if (instances[key]) {
            persistChartVisibility(instances[key], key);
            instances[key].destroy();
            instances[key] = null;
        }
    }

    function registerChart(instances, key, chart) {
        instances[key] = chart;
        applyStoredVisibility(chart, key);
        chart.update('none');
    }

    function renderHorizontalBar(canvas, instances, key, labels, values, label, color, fmt) {
        destroyChart(instances, key);
        if (!canvas || !labels.length) {
            return;
        }

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label,
                            data: values,
                            backgroundColor: `${color}99`,
                            borderColor: color,
                            borderWidth: 1,
                            hidden: isDatasetLabelHidden(key, label),
                        },
                    ],
                },
                options: horizontalBarOptions(fmt, key),
            })
        );
    }

    function renderDoughnut(canvas, instances, key, labels, values, title) {
        destroyChart(instances, key);
        if (!canvas || !labels.length) {
            return;
        }

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [
                        {
                            data: values,
                            backgroundColor: labels.map((_, i) => `${PALETTE[i % PALETTE.length]}cc`),
                            borderColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
                            borderWidth: 1,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: legendOptions(key, { position: 'right' }),
                        title: {
                            display: Boolean(title),
                            text: title,
                            color: COLORS.text,
                            font: { size: 13, weight: '600' },
                        },
                    },
                },
            })
        );
    }

    function renderLine(canvas, instances, key, labels, datasets, title, yFmt) {
        destroyChart(instances, key);
        if (!canvas || !labels.length) {
            return;
        }

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: datasets.map((dataset) => ({
                        ...dataset,
                        hidden: isDatasetLabelHidden(key, dataset.label),
                    })),
                },
                options: baseOptions(title, yFmt, key),
            })
        );
    }

    function renderBar(canvas, instances, key, labels, datasets, title, yFmt) {
        destroyChart(instances, key);
        if (!canvas || !labels.length) {
            return;
        }

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: datasets.map((dataset) => ({
                        ...dataset,
                        hidden: isDatasetLabelHidden(key, dataset.label),
                    })),
                },
                options: baseOptions(title, yFmt, key),
            })
        );
    }

    function renderAll(instances, data, formatters) {
        const { numberFmt, currencyFmt, dateFmt } = formatters;
        const { models, tokenTypes, byHour, byDayOfWeek, cumulative, families, cache } = data;
        const safeNumberTick = (value) => {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                return value;
            }
            return numberFmt.format(value);
        };
        const safeCurrencyTick = (value) => {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                return value;
            }
            return currencyFmt.format(value);
        };

        renderHorizontalBar(
            data.canvases.topCost,
            instances,
            'topCost',
            models.byCost.map((m) => m.model),
            models.byCost.map((m) => m.costCents / 100),
            'Kosten ($)',
            COLORS.accent,
            safeCurrencyTick
        );

        renderHorizontalBar(
            data.canvases.topTokens,
            instances,
            'topTokens',
            models.byTokens.map((m) => m.model),
            models.byTokens.map((m) => m.tokens),
            'Tokens',
            COLORS.blue,
            safeNumberTick
        );

        renderDoughnut(
            data.canvases.tokenTypes,
            instances,
            'tokenTypes',
            ['Input (ohne Cache Write)', 'Cache Write', 'Cache Read', 'Output'],
            [
                tokenTypes.inputNoCache,
                tokenTypes.inputWithCacheWrite,
                tokenTypes.cacheRead,
                tokenTypes.outputTokens,
            ],
            null
        );

        renderBar(
            data.canvases.modelFamily,
            instances,
            'modelFamily',
            families.map((f) => f.family),
            [
                {
                    label: 'Kosten ($)',
                    data: families.map((f) => f.costCents / 100),
                    backgroundColor: `${COLORS.gold}99`,
                    borderColor: COLORS.gold,
                },
            ],
            null,
            safeCurrencyTick
        );

        renderBar(
            data.canvases.byHour,
            instances,
            'byHour',
            byHour.map((b) => `${String(b.hour).padStart(2, '0')}:00`),
            [
                {
                    label: 'Calls',
                    data: byHour.map((b) => b.calls),
                    backgroundColor: `${COLORS.blue}88`,
                    borderColor: COLORS.blue,
                },
            ],
            null,
            safeNumberTick
        );

        if (data.cumulativeBuckets?.length) {
            renderCumulativeBuckets(
                data.canvases.cumulative,
                instances,
                'cumulative',
                data.cumulativeBuckets,
                data.granularity || 'day',
                formatters,
                data.markerContext || null
            );
        } else {
            renderLine(
                data.canvases.cumulative,
                instances,
                'cumulative',
                cumulative.map((d) => dateFmt.format(new Date(`${d.dayKey}T12:00:00Z`))),
                [
                    {
                        label: 'Kumulierte Kosten ($)',
                        data: cumulative.map((d) => d.cumulativeCost / 100),
                        borderColor: COLORS.accent,
                        backgroundColor: `${COLORS.accent}22`,
                        fill: true,
                        tension: 0.2,
                    },
                ],
                null,
                safeCurrencyTick
            );
        }

        renderBar(
            data.canvases.inputOutput,
            instances,
            'inputOutput',
            ['Input', 'Output', 'Cache Read'],
            [
                {
                    label: 'Tokens',
                    data: [
                        tokenTypes.inputNoCache + tokenTypes.inputWithCacheWrite,
                        tokenTypes.outputTokens,
                        tokenTypes.cacheRead,
                    ],
                    backgroundColor: [COLORS.blue, COLORS.orange, COLORS.gold].map(
                        (c) => `${c}99`
                    ),
                    borderColor: [COLORS.blue, COLORS.orange, COLORS.gold],
                },
            ],
            null,
            safeNumberTick
        );

        renderDoughnut(
            data.canvases.cacheEfficiency,
            instances,
            'cacheEfficiency',
            ['Cache Read', 'Anderer Input'],
            [cache.cacheRead, Math.max(0, cache.totalInput - cache.cacheRead)],
            `Cache-Hit ${cache.hitRate.toFixed(1)} %`
        );

        renderBar(
            data.canvases.byWeekday,
            instances,
            'byWeekday',
            byDayOfWeek.map((b) => b.label),
            [
                {
                    label: 'Tokens',
                    data: byDayOfWeek.map((b) => b.tokens),
                    backgroundColor: `${COLORS.purple}88`,
                    borderColor: COLORS.purple,
                },
            ],
            null,
            safeNumberTick
        );
    }

    const OVERVIEW_TOKEN_SERIES = [
        { key: 'inputNoCache', label: 'Input (w/o Cache Write)', color: COLORS.blue },
        { key: 'inputWithCacheWrite', label: 'Input (w/ Cache Write)', color: COLORS.purple },
        { key: 'cacheRead', label: 'Cache Read', color: COLORS.gold },
    ];

    function renderOverviewBuckets(
        canvas,
        instances,
        key,
        buckets,
        title,
        formatters,
        granularity = 'day',
        markerContext = null
    ) {
        destroyChart(instances, key);
        if (!canvas || !buckets.length) {
            return;
        }

        const { numberFmt, currencyFmt } = formatters;
        const labels = buckets.map((b) => b.label);
        const isPerEvent = granularity === 'event';
        const linePointRadius = isPerEvent ? 0 : 3;
        const markerExtras = markerChartExtras(markerContext, buckets);

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        ...OVERVIEW_TOKEN_SERIES.map(({ key: fieldKey, label, color }) => ({
                            type: 'bar',
                            label,
                            data: buckets.map((b) => b[fieldKey] ?? 0),
                            backgroundColor: `${color}77`,
                            borderColor: color,
                            borderWidth: 1,
                            yAxisID: 'y',
                            order: 2,
                            hidden: isDatasetLabelHidden(key, label),
                        })),
                        {
                            type: 'line',
                            label: 'Output Tokens',
                            data: buckets.map((b) => b.outputTokens ?? 0),
                            borderColor: COLORS.orange,
                            backgroundColor: 'transparent',
                            borderWidth: 2.5,
                            pointRadius: linePointRadius,
                            pointHoverRadius: 5,
                            pointBackgroundColor: COLORS.orange,
                            tension: 0.3,
                            fill: false,
                            yAxisID: 'y',
                            order: 0,
                            hidden: isDatasetLabelHidden(key, 'Output Tokens'),
                        },
                        {
                            type: 'line',
                            label: 'Total Tokens',
                            data: buckets.map((b) => b.tokens),
                            borderColor: COLORS.blue,
                            backgroundColor: 'transparent',
                            borderWidth: 2.5,
                            borderDash: [6, 4],
                            pointRadius: linePointRadius,
                            pointHoverRadius: 5,
                            pointBackgroundColor: COLORS.blue,
                            tension: 0.3,
                            fill: false,
                            yAxisID: 'y',
                            order: 0,
                            hidden: isDatasetLabelHidden(key, 'Total Tokens'),
                        },
                        {
                            type: 'line',
                            label: 'Kosten ($)',
                            data: buckets.map((b) => b.costCents / 100),
                            borderColor: COLORS.accent,
                            backgroundColor: `${COLORS.accent}18`,
                            borderWidth: 2.5,
                            pointRadius: linePointRadius,
                            pointHoverRadius: 5,
                            pointBackgroundColor: COLORS.accent,
                            tension: 0.3,
                            fill: false,
                            yAxisID: 'y1',
                            order: 1,
                            hidden: isDatasetLabelHidden(key, 'Kosten ($)'),
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        ...pluginsWithZoom(title, key),
                        ...markerExtras.plugins,
                    },
                    layout: markerExtras.layout,
                    scales: {
                        x: {
                            ticks: {
                                color: COLORS.muted,
                                maxRotation: isPerEvent ? 90 : 45,
                                autoSkip: true,
                                maxTicksLimit: isPerEvent ? 24 : 14,
                            },
                            grid: { color: COLORS.grid },
                        },
                        y: {
                            type: 'linear',
                            position: 'left',
                            stacked: false,
                            ticks: {
                                color: COLORS.blue,
                                callback: (v) =>
                                    typeof v === 'number' && Number.isFinite(v) ? numberFmt.format(v) : v,
                            },
                            grid: { color: '#2d3a4a88' },
                        },
                        y1: {
                            type: 'linear',
                            position: 'right',
                            stacked: false,
                            ticks: {
                                color: COLORS.accent,
                                callback: (v) =>
                                    typeof v === 'number' && Number.isFinite(v) ? currencyFmt.format(v) : v,
                            },
                            grid: { drawOnChartArea: false },
                        },
                    },
                    datasets: {
                        bar: {
                            categoryPercentage: isPerEvent ? 1 : 0.75,
                            barPercentage: isPerEvent ? 0.95 : 0.85,
                        },
                    },
                },
            })
        );
    }

    function renderCumulativeBuckets(
        canvas,
        instances,
        key,
        buckets,
        granularity,
        formatters,
        markerContext = null
    ) {
        destroyChart(instances, key);
        if (!canvas || !buckets.length) {
            return;
        }

        const { currencyFmt } = formatters;
        const markerExtras = markerChartExtras(markerContext, buckets);

        const cumulativeOptions = baseOptions(
            null,
            (v) => (typeof v === 'number' && Number.isFinite(v) ? currencyFmt.format(v) : v),
            key
        );
        cumulativeOptions.plugins = {
            ...cumulativeOptions.plugins,
            ...markerExtras.plugins,
        };
        cumulativeOptions.layout = markerExtras.layout;

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'line',
                data: {
                    labels: buckets.map((b) => b.label),
                    datasets: [
                        {
                            label: 'Kumulierte Kosten ($)',
                            data: buckets.map((b) => b.cumulativeCost / 100),
                            borderColor: COLORS.accent,
                            backgroundColor: `${COLORS.accent}22`,
                            fill: true,
                            tension: 0.2,
                            hidden: isDatasetLabelHidden(key, 'Kumulierte Kosten ($)'),
                        },
                    ],
                },
                options: cumulativeOptions,
            })
        );
    }

    function renderOverviewTimeline(
        canvas,
        instances,
        key,
        events,
        title,
        formatters,
        markerContext = null
    ) {
        destroyChart(instances, key);
        if (!canvas || !events.length) {
            return;
        }

        const { numberFmt, currencyFmt, dateTimeFmt } = formatters;
        const point = (field) =>
            events.map((event) => ({
                x: event.timestamp.getTime(),
                y: event[field] ?? 0,
            }));

        const lineSeries = [
            ...OVERVIEW_TOKEN_SERIES.map(({ key: fieldKey, label, color }) => ({
                label,
                data: point(fieldKey),
                borderColor: color,
                backgroundColor: `${color}22`,
                stepped: 'after',
                pointRadius: 0,
                pointHitRadius: 8,
                spanGaps: true,
                yAxisID: 'y',
                hidden: isDatasetLabelHidden(key, label),
            })),
            {
                label: 'Output Tokens',
                data: point('outputTokens'),
                borderColor: COLORS.orange,
                backgroundColor: `${COLORS.orange}22`,
                stepped: 'after',
                pointRadius: 0,
                pointHitRadius: 8,
                spanGaps: true,
                yAxisID: 'y',
                hidden: isDatasetLabelHidden(key, 'Output Tokens'),
            },
            {
                label: 'Total Tokens',
                data: point('totalTokens'),
                borderColor: COLORS.blue,
                backgroundColor: 'transparent',
                borderDash: [6, 4],
                stepped: 'after',
                pointRadius: 0,
                pointHitRadius: 8,
                spanGaps: true,
                yAxisID: 'y',
                hidden: isDatasetLabelHidden(key, 'Total Tokens'),
            },
            {
                label: 'Kosten ($)',
                data: events.map((event) => ({
                    x: event.timestamp.getTime(),
                    y: event.costCents / 100,
                })),
                borderColor: COLORS.accent,
                backgroundColor: `${COLORS.accent}18`,
                stepped: 'after',
                pointRadius: 0,
                pointHitRadius: 8,
                spanGaps: true,
                yAxisID: 'y1',
                hidden: isDatasetLabelHidden(key, 'Kosten ($)'),
            },
        ];

        const scales = buildTimelineScaleOptions(formatters.dateFmt, dateTimeFmt);
        scales.y.ticks.callback = (v) =>
            typeof v === 'number' && Number.isFinite(v) ? numberFmt.format(v) : v;
        scales.y1.ticks.callback = (v) =>
            typeof v === 'number' && Number.isFinite(v) ? currencyFmt.format(v) : v;
        const markerExtras = markerChartExtras(markerContext, null, 'time');

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'line',
                data: { datasets: lineSeries },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    parsing: false,
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false,
                    },
                    plugins: {
                        ...pluginsWithZoom(title, key, timelineZoomLimits()),
                        ...markerExtras.plugins,
                        tooltip: {
                            callbacks: {
                                title(items) {
                                    const x = items[0]?.parsed?.x;
                                    if (x == null) {
                                        return '';
                                    }
                                    return dateTimeFmt.format(new Date(x));
                                },
                                label(context) {
                                    const value = context.parsed.y;
                                    if (context.dataset.yAxisID === 'y1') {
                                        return `${context.dataset.label}: ${currencyFmt.format(value)}`;
                                    }
                                    return `${context.dataset.label}: ${numberFmt.format(value)}`;
                                },
                                afterBody(items) {
                                    const x = items[0]?.parsed?.x;
                                    return markerTooltipLines(markerContext, x);
                                },
                            },
                        },
                    },
                    layout: markerExtras.layout,
                    scales,
                },
            })
        );
    }

    function renderCumulativeTimeline(
        canvas,
        instances,
        key,
        events,
        formatters,
        markerContext = null
    ) {
        destroyChart(instances, key);
        if (!canvas || !events.length) {
            return;
        }

        const { currencyFmt, dateTimeFmt } = formatters;
        let cumulativeCost = 0;
        const data = events.map((event) => {
            cumulativeCost += event.costCents;
            return {
                x: event.timestamp.getTime(),
                y: cumulativeCost / 100,
            };
        });

        const scales = buildTimelineScaleOptions(formatters.dateFmt, dateTimeFmt);
        delete scales.y1;
        scales.y.ticks.color = COLORS.muted;
        scales.y.ticks.callback = (v) =>
            typeof v === 'number' && Number.isFinite(v) ? currencyFmt.format(v) : v;
        const markerExtras = markerChartExtras(markerContext, null, 'time');

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'line',
                data: {
                    datasets: [
                        {
                            label: 'Kumulierte Kosten ($)',
                            data,
                            borderColor: COLORS.accent,
                            backgroundColor: `${COLORS.accent}22`,
                            stepped: 'after',
                            pointRadius: 0,
                            pointHitRadius: 8,
                            spanGaps: true,
                            fill: true,
                            tension: 0.2,
                            hidden: isDatasetLabelHidden(key, 'Kumulierte Kosten ($)'),
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    parsing: false,
                    interaction: {
                        mode: 'nearest',
                        axis: 'x',
                        intersect: false,
                    },
                    plugins: {
                        ...pluginsWithZoom(null, key, timelineZoomLimits()),
                        ...markerExtras.plugins,
                        tooltip: {
                            callbacks: {
                                title(items) {
                                    const x = items[0]?.parsed?.x;
                                    if (x == null) {
                                        return '';
                                    }
                                    return dateTimeFmt.format(new Date(x));
                                },
                                label(context) {
                                    return `${context.dataset.label}: ${currencyFmt.format(context.parsed.y)}`;
                                },
                                afterBody(items) {
                                    const x = items[0]?.parsed?.x;
                                    return markerTooltipLines(markerContext, x);
                                },
                            },
                        },
                    },
                    layout: markerExtras.layout,
                    scales,
                },
            })
        );
    }

    /** @deprecated alias */
    function renderOverviewDaily(canvas, instances, key, dailyRows, formatters) {
        const buckets = dailyRows.map((d) => ({
            label: formatters.dateFmt.format(new Date(`${d.dayKey}T12:00:00Z`)),
            tokens: d.tokens,
            costCents: d.costCents,
        }));
        renderOverviewBuckets(
            canvas,
            instances,
            key,
            buckets,
            'Übersicht — Tokens & Kosten pro Tag',
            formatters
        );
    }

    function destroyAll(instances) {
        for (const key of Object.keys(instances)) {
            destroyChart(instances, key);
        }
    }

    global.CursorAnalytics = global.CursorAnalytics || {};
    global.CursorAnalytics.charts = {
        COLORS,
        renderAll,
        renderOverviewBuckets,
        renderOverviewTimeline,
        renderOverviewDaily,
        renderCumulativeBuckets,
        renderCumulativeTimeline,
        destroyAll,
    };
})(typeof window !== 'undefined' ? window : globalThis);
