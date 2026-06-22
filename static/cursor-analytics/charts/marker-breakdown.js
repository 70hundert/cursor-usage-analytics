/**
 * Marker-Aufschlüsselung nach Projekt (Bar) und Kategorie (Doughnut).
 */
import { COLORS, PALETTE } from './theme.js';
import { t } from './util.js';
import { applyStoredVisibility, isDatasetLabelHidden } from './legend.js';
import { horizontalBarOptions, pluginsWithZoom } from './options.js';
import { destroyChart, registerChart } from './registry.js';
import { markers as markersApi } from '../markers/index.js';

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
        new window.Chart(canvas, {
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

export function renderMarkerBreakdown(instances, data, formatters) {
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
        new window.Chart(canvases.byCategory, {
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
