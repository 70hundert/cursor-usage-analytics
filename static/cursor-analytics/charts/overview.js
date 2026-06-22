/**
 * Übersichts-Charts (Bucket- und Timeline-Variante) inkl. Marker-Fokus-Zoom.
 */
import { COLORS } from './theme.js';
import { t } from './util.js';
import { isDatasetLabelHidden } from './legend.js';
import {
    pluginsWithZoom,
    markerChartExtras,
    buildTimelineScaleOptions,
    timelineZoomLimits,
    markerTooltipLines,
} from './options.js';
import { destroyChart, registerChart } from './registry.js';
import { markers as markersApi } from '../markers/index.js';

function overviewTokenSeries() {
    return [
        { key: 'inputNoCache', legendKey: 'inputNoCache', label: t('inputNoCacheWrite'), color: COLORS.blue },
        { key: 'inputWithCacheWrite', legendKey: 'inputWithCacheWrite', label: t('inputWithCacheWrite'), color: COLORS.purple },
        { key: 'cacheRead', legendKey: 'cacheRead', label: t('cacheRead'), color: COLORS.gold },
    ];
}

export function renderOverviewBuckets(
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
        new window.Chart(canvas, {
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

export function renderOverviewTimeline(
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
        new window.Chart(canvas, {
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

/** @deprecated alias */
export function renderOverviewDaily(canvas, instances, key, dailyRows, formatters) {
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

export const MARKER_FOCUS_ZOOM_PADDING = 3;

export function applyMarkerFocusZoom(chart, buckets, marker, markerContext) {
    if (!chart?.zoomScale || !markersApi || !marker || !buckets?.length || !markerContext) {
        return;
    }
    const range = markersApi.markerBucketIndexRange(
        buckets,
        marker,
        markerContext.markers,
        markerContext.filterEndMs,
        markerContext.events
    );
    if (!range) {
        return;
    }
    const pad = Math.min(MARKER_FOCUS_ZOOM_PADDING, Math.max(1, buckets.length - 1));
    const min = Math.max(0, range.xMin - pad);
    const max = Math.min(buckets.length - 1, range.xMax + pad);
    chart.zoomScale('x', { min, max });
}
