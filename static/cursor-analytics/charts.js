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

    function t(key) {
        return global.CursorAnalytics?.i18n?.t(key) ?? key;
    }

    function tf(key, params) {
        return global.CursorAnalytics?.i18n?.tf(key, params) ?? t(key);
    }

    function datasetLegendKey(dataset) {
        return dataset.legendKey ?? dataset.label;
    }

    function sliceLegendKey(chart, index) {
        return chart.data.legendKeys?.[index] ?? chart.data.labels[index];
    }

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
                chartState[sliceLegendKey(chart, index)] = Boolean(meta.data[index]?.hidden);
            });
            return chartState;
        }

        chart.data.datasets.forEach((dataset, index) => {
            chartState[datasetLegendKey(dataset)] = !chart.isDatasetVisible(index);
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

    function isDatasetLabelHidden(chartKey, legendKey) {
        return Boolean(loadVisibilityStore()[chartKey]?.[legendKey]);
    }

    function applyStoredVisibility(chart, chartKey) {
        const chartState = loadVisibilityStore()[chartKey];
        if (!chart || !chartState) {
            return;
        }

        if (isSliceChart(chart)) {
            const meta = chart.getDatasetMeta(0);
            chart.data.labels.forEach((label, index) => {
                if (chartState[sliceLegendKey(chart, index)]) {
                    meta.data[index].hidden = true;
                }
            });
            return;
        }

        chart.data.datasets.forEach((dataset, index) => {
            if (chartState[datasetLegendKey(dataset)]) {
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
        return {
            plugins: {
                annotation: markersApi.annotationPluginOptions(markerContext.markers, chartContext),
            },
            layout: {},
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
        const lines = [tf('chartTooltipProject', { project: marker.project })];
        if (marker.task) {
            lines.push(tf('chartTooltipTask', { task: marker.task }));
        }
        if (marker.note) {
            lines.push(tf('chartTooltipNote', { note: marker.note }));
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

    function renderHorizontalBar(canvas, instances, key, labels, values, datasetLabel, color, fmt, legendKey) {
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
                            label: datasetLabel,
                            legendKey: legendKey || datasetLabel,
                            data: values,
                            backgroundColor: `${color}99`,
                            borderColor: color,
                            borderWidth: 1,
                            hidden: isDatasetLabelHidden(key, legendKey || datasetLabel),
                        },
                    ],
                },
                options: horizontalBarOptions(fmt, key),
            })
        );
    }

    function renderDoughnut(canvas, instances, key, slices, values, title) {
        destroyChart(instances, key);
        if (!canvas || !slices.length) {
            return;
        }

        const labels = slices.map((slice) => slice.label);
        const legendKeys = slices.map((slice) => slice.legendKey);

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels,
                    legendKeys,
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
                        hidden: isDatasetLabelHidden(key, datasetLegendKey(dataset)),
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
                        hidden: isDatasetLabelHidden(key, datasetLegendKey(dataset)),
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
            t('chartCostUsd'),
            COLORS.accent,
            safeCurrencyTick,
            'chartCostUsd'
        );

        renderHorizontalBar(
            data.canvases.topTokens,
            instances,
            'topTokens',
            models.byTokens.map((m) => m.model),
            models.byTokens.map((m) => m.tokens),
            t('tokens'),
            COLORS.blue,
            safeNumberTick,
            'tokens'
        );

        renderDoughnut(
            data.canvases.tokenTypes,
            instances,
            'tokenTypes',
            [
                { legendKey: 'inputNoCache', label: t('chartTokenInputNoCache') },
                { legendKey: 'cacheWrite', label: t('chartCacheWrite') },
                { legendKey: 'cacheRead', label: t('cacheRead') },
                { legendKey: 'output', label: t('output') },
            ],
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
                    label: t('chartCostUsd'),
                    legendKey: 'chartCostUsd',
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
                    label: t('chartCalls'),
                    legendKey: 'calls',
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
                        label: t('chartCumulativeCostUsd'),
                        legendKey: 'chartCumulativeCostUsd',
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
            [t('chartInput'), t('output'), t('cacheRead')],
            [
                {
                    label: t('tokens'),
                    legendKey: 'tokens',
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
            [
                { legendKey: 'cacheRead', label: t('cacheRead') },
                { legendKey: 'otherInput', label: t('chartOtherInput') },
            ],
            [cache.cacheRead, Math.max(0, cache.totalInput - cache.cacheRead)],
            tf('chartCacheHit', { pct: cache.hitRate.toFixed(1) })
        );

        renderBar(
            data.canvases.byWeekday,
            instances,
            'byWeekday',
            byDayOfWeek.map((b) => b.label),
            [
                {
                    label: t('tokens'),
                    legendKey: 'tokens',
                    data: byDayOfWeek.map((b) => b.tokens),
                    backgroundColor: `${COLORS.purple}88`,
                    borderColor: COLORS.purple,
                },
            ],
            null,
            safeNumberTick
        );

        if (data.maxMode?.length && data.canvases.maxMode) {
            renderBar(
                data.canvases.maxMode,
                instances,
                'maxMode',
                data.maxMode.map((entry) =>
                    entry.mode === 'Yes' ? t('maxModeYes') : t('maxModeNo')
                ),
                [
                    {
                        label: t('tokens'),
                        legendKey: 'tokens',
                        data: data.maxMode.map((entry) => entry.tokens),
                        backgroundColor: `${COLORS.blue}88`,
                        borderColor: COLORS.blue,
                    },
                    {
                        label: t('chartCostUsd'),
                        legendKey: 'chartCostUsd',
                        data: data.maxMode.map((entry) => entry.costCents / 100),
                        backgroundColor: `${COLORS.gold}99`,
                        borderColor: COLORS.gold,
                    },
                ],
                null,
                safeNumberTick
            );
        } else {
            destroyChart(instances, 'maxMode');
        }
    }

    function dimensionLabel(row, dimension, unmarkedLabel, uncategorizedLabel) {
        if (row.key === '__unmarked__') {
            return dimension === 'category' ? uncategorizedLabel : unmarkedLabel;
        }
        return row.label;
    }

    function renderMarkerDimensionChart(
        canvas,
        instances,
        key,
        rows,
        formatters,
        dimension,
        labels,
        colorMap
    ) {
        destroyChart(instances, key);
        if (!canvas || !rows.length) {
            return;
        }

        const { numberFmt, currencyFmt } = formatters;
        const markersApi = global.CursorAnalytics?.markers;
        const barColors = rows.map((row) => {
            if (row.project && markersApi) {
                return `${markersApi.projectColor(row.project, colorMap)}99`;
            }
            return `${COLORS.muted}99`;
        });
        const barBorders = rows.map((row) => {
            if (row.project && markersApi) {
                return markersApi.projectColor(row.project, colorMap);
            }
            return COLORS.muted;
        });

        const barOptions = horizontalBarOptions((value) => numberFmt.format(value), key);

        registerChart(
            instances,
            key,
            new Chart(canvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: t('tokens'),
                            legendKey: 'tokens',
                            data: rows.map((row) => row.totalTokens),
                            backgroundColor: barColors,
                            borderColor: barBorders,
                            borderWidth: 1,
                            hidden: isDatasetLabelHidden(key, 'tokens'),
                        },
                    ],
                },
                options: {
                    ...barOptions,
                    plugins: {
                        ...barOptions.plugins,
                        tooltip: {
                            callbacks: {
                                afterLabel(context) {
                                    const row = rows[context.dataIndex];
                                    return `${t('cost')}: ${currencyFmt.format(row.costCents / 100)}`;
                                },
                            },
                        },
                    },
                },
            })
        );
    }

    function renderMarkerBreakdown(instances, data, formatters) {
        const { byProject = [], byCategory = [], canvases = {}, colorMap } = data;
        const unmarkedLabel = t('markerUnmarked');
        const uncategorizedLabel = t('markerUncategorized');

        const projectRows = byProject.filter((row) => row.totalTokens > 0 || row.costCents > 0);
        const categoryRows = byCategory.filter((row) => row.totalTokens > 0 || row.costCents > 0);

        renderMarkerDimensionChart(
            canvases.byProject,
            instances,
            'markerByProject',
            projectRows,
            formatters,
            'project',
            projectRows.map((row) => dimensionLabel(row, 'project', unmarkedLabel, uncategorizedLabel)),
            colorMap
        );

        destroyChart(instances, 'markerByCategory');
        if (!canvases.byCategory || !categoryRows.length) {
            return;
        }

        const labels = categoryRows.map((row) =>
            dimensionLabel(row, 'category', unmarkedLabel, uncategorizedLabel)
        );

        registerChart(
            instances,
            'markerByCategory',
            new Chart(canvases.byCategory, {
                type: 'doughnut',
                data: {
                    labels,
                    legendKeys: categoryRows.map((row) => row.key),
                    datasets: [
                        {
                            data: categoryRows.map((row) => row.totalTokens),
                            backgroundColor: labels.map((_, index) => `${PALETTE[index % PALETTE.length]}cc`),
                            borderColor: '#1a2332',
                            borderWidth: 1,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        ...pluginsWithZoom(null, 'markerByCategory'),
                        tooltip: {
                            callbacks: {
                                label(context) {
                                    const row = categoryRows[context.dataIndex];
                                    const total = categoryRows.reduce(
                                        (sum, item) => sum + item.totalTokens,
                                        0
                                    );
                                    const pct =
                                        total > 0 ? ((row.totalTokens / total) * 100).toFixed(1) : '0.0';
                                    return `${context.label}: ${formatters.numberFmt.format(row.totalTokens)} (${pct} %)`;
                                },
                            },
                        },
                    },
                },
            })
        );
        applyStoredVisibility(instances.markerByCategory, 'markerByCategory');
        instances.markerByCategory?.update('none');
    }

    function overviewTokenSeries() {
        return [
            { key: 'inputNoCache', legendKey: 'inputNoCache', label: t('inputNoCacheWrite'), color: COLORS.blue },
            { key: 'inputWithCacheWrite', legendKey: 'inputWithCacheWrite', label: t('inputWithCacheWrite'), color: COLORS.purple },
            { key: 'cacheRead', legendKey: 'cacheRead', label: t('cacheRead'), color: COLORS.gold },
        ];
    }

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
                        ...overviewTokenSeries().map(({ key: fieldKey, legendKey, label, color }) => ({
                            type: 'bar',
                            label,
                            legendKey,
                            data: buckets.map((b) => b[fieldKey] ?? 0),
                            backgroundColor: `${color}77`,
                            borderColor: color,
                            borderWidth: 1,
                            yAxisID: 'y',
                            order: 2,
                            hidden: isDatasetLabelHidden(key, legendKey),
                        })),
                        {
                            type: 'line',
                            label: `${t('output')} ${t('tokens')}`,
                            legendKey: 'outputTokens',
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
                            hidden: isDatasetLabelHidden(key, 'outputTokens'),
                        },
                        {
                            type: 'line',
                            label: t('totalTokens'),
                            legendKey: 'totalTokens',
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
                            hidden: isDatasetLabelHidden(key, 'totalTokens'),
                        },
                        {
                            type: 'line',
                            label: t('chartCostUsd'),
                            legendKey: 'chartCostUsd',
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
                            hidden: isDatasetLabelHidden(key, 'chartCostUsd'),
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
                            label: t('chartCumulativeCostUsd'),
                            legendKey: 'chartCumulativeCostUsd',
                            data: buckets.map((b) => b.cumulativeCost / 100),
                            borderColor: COLORS.accent,
                            backgroundColor: `${COLORS.accent}22`,
                            fill: true,
                            tension: 0.2,
                            hidden: isDatasetLabelHidden(key, 'chartCumulativeCostUsd'),
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
            ...overviewTokenSeries().map(({ key: fieldKey, legendKey, label, color }) => ({
                label,
                legendKey,
                data: point(fieldKey),
                borderColor: color,
                backgroundColor: `${color}22`,
                stepped: 'after',
                pointRadius: 0,
                pointHitRadius: 8,
                spanGaps: true,
                yAxisID: 'y',
                hidden: isDatasetLabelHidden(key, legendKey),
            })),
            {
                label: `${t('output')} ${t('tokens')}`,
                legendKey: 'outputTokens',
                data: point('outputTokens'),
                borderColor: COLORS.orange,
                backgroundColor: `${COLORS.orange}22`,
                stepped: 'after',
                pointRadius: 0,
                pointHitRadius: 8,
                spanGaps: true,
                yAxisID: 'y',
                hidden: isDatasetLabelHidden(key, 'outputTokens'),
            },
            {
                label: t('totalTokens'),
                legendKey: 'totalTokens',
                data: point('totalTokens'),
                borderColor: COLORS.blue,
                backgroundColor: 'transparent',
                borderDash: [6, 4],
                stepped: 'after',
                pointRadius: 0,
                pointHitRadius: 8,
                spanGaps: true,
                yAxisID: 'y',
                hidden: isDatasetLabelHidden(key, 'totalTokens'),
            },
            {
                label: t('chartCostUsd'),
                legendKey: 'chartCostUsd',
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
                hidden: isDatasetLabelHidden(key, 'chartCostUsd'),
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
                            label: t('chartCumulativeCostUsd'),
                            legendKey: 'chartCumulativeCostUsd',
                            data,
                            borderColor: COLORS.accent,
                            backgroundColor: `${COLORS.accent}22`,
                            stepped: 'after',
                            pointRadius: 0,
                            pointHitRadius: 8,
                            spanGaps: true,
                            fill: true,
                            tension: 0.2,
                            hidden: isDatasetLabelHidden(key, 'chartCumulativeCostUsd'),
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
            t('overviewDay'),
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
        destroyChart,
        renderMarkerBreakdown,
    };
})(typeof window !== 'undefined' ? window : globalThis);
