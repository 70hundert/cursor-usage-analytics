/**
 * Legend-Sichtbarkeit: Persistenz pro Chart-Key (localStorage) und Legend-Optionen.
 */
import { COLORS } from './theme.js';

const CHART_VISIBILITY_STORAGE_KEY = 'cursor-analytics-chart-visibility';

export function datasetLegendKey(dataset) {
    return dataset.legendKey ?? dataset.label;
}

function sliceLegendKey(chart, index) {
    return chart.data.legendKeys?.[index] ?? chart.data.labels[index];
}

function loadVisibilityStore() {
    try {
        const raw = globalThis.localStorage?.getItem(CHART_VISIBILITY_STORAGE_KEY);
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
        globalThis.localStorage?.setItem(CHART_VISIBILITY_STORAGE_KEY, JSON.stringify(store));
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

export function persistChartVisibility(chart, chartKey) {
    if (!chart || !chartKey) {
        return;
    }
    const store = loadVisibilityStore();
    store[chartKey] = readChartVisibility(chart, chartKey);
    saveVisibilityStore(store);
}

export function isDatasetLabelHidden(chartKey, legendKey) {
    return Boolean(loadVisibilityStore()[chartKey]?.[legendKey]);
}

export function applyStoredVisibility(chart, chartKey) {
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
        const defaultHandler = window.Chart.defaults.plugins.legend.onClick;
        if (typeof defaultHandler === 'function') {
            defaultHandler.call(legend.chart, event, legendItem, legend);
        }
        persistChartVisibility(legend.chart, chartKey);
    };
}

export function legendOptions(chartKey, extra = {}) {
    return {
        labels: { color: COLORS.text, boxWidth: 12 },
        onClick: legendOnClickHandler(chartKey),
        ...extra,
    };
}
