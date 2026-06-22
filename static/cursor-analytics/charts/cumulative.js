/**
 * Kumulative Kosten-Charts (Bucket- und Timeline-Variante).
 */
import { COLORS } from './theme.js';
import { t } from './util.js';
import { isDatasetLabelHidden } from './legend.js';
import {
    baseOptions,
    markerChartExtras,
    pluginsWithZoom,
    buildTimelineScaleOptions,
    timelineZoomLimits,
    markerTooltipLines,
} from './options.js';
import { destroyChart, registerChart } from './registry.js';

export function renderCumulativeBuckets(
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
        new window.Chart(canvas, {
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

export function renderCumulativeTimeline(
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
        new window.Chart(canvas, {
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
