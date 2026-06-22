/**
 * Chart-Instanzverwaltung und Render-Primitive (Bar/Line/Doughnut/HorizontalBar).
 */
import { COLORS, PALETTE } from './theme.js';
import {
    persistChartVisibility,
    applyStoredVisibility,
    isDatasetLabelHidden,
    datasetLegendKey,
    legendOptions,
} from './legend.js';
import { horizontalBarOptions, baseOptions } from './options.js';

export function destroyChart(instances, key) {
    if (instances[key]) {
        persistChartVisibility(instances[key], key);
        instances[key].destroy();
        instances[key] = null;
    }
}

export function registerChart(instances, key, chart) {
    instances[key] = chart;
    applyStoredVisibility(chart, key);
    chart.update('none');
}

export function renderHorizontalBar(canvas, instances, key, labels, values, datasetLabel, color, fmt, legendKey) {
    destroyChart(instances, key);
    if (!canvas || !labels.length) {
        return;
    }

    registerChart(
        instances,
        key,
        new window.Chart(canvas, {
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

export function renderDoughnut(canvas, instances, key, slices, values, title) {
    destroyChart(instances, key);
    if (!canvas || !slices.length) {
        return;
    }

    const labels = slices.map((slice) => slice.label);
    const legendKeys = slices.map((slice) => slice.legendKey);

    registerChart(
        instances,
        key,
        new window.Chart(canvas, {
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

export function renderLine(canvas, instances, key, labels, datasets, title, yFmt) {
    destroyChart(instances, key);
    if (!canvas || !labels.length) {
        return;
    }

    registerChart(
        instances,
        key,
        new window.Chart(canvas, {
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

export function renderBar(canvas, instances, key, labels, datasets, title, yFmt) {
    destroyChart(instances, key);
    if (!canvas || !labels.length) {
        return;
    }

    registerChart(
        instances,
        key,
        new window.Chart(canvas, {
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

export function destroyAll(instances) {
    for (const key of Object.keys(instances)) {
        destroyChart(instances, key);
    }
}
