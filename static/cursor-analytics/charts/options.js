/**
 * Wiederverwendbare Chart.js-Optionen: Plugins (Legend/Zoom/Title), Achsen,
 * Marker-Annotationen und Marker-Tooltip-Zeilen.
 */
import { COLORS } from './theme.js';
import { legendOptions } from './legend.js';
import { t, tf } from './util.js';
import { markers as markersApi } from '../markers/index.js';

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

export function pluginsWithZoom(title, chartKey, extraLimits) {
    return {
        ...basePlugins(title, chartKey),
        zoom: buildZoomPluginOptions(extraLimits),
    };
}

export function markerChartExtras(markerContext, buckets, mode = 'category') {
    if (!markerContext?.markers?.length || markerContext.showMarkers === false) {
        return { plugins: {}, layout: {} };
    }
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
        focusedMarkerId: markerContext.focusedMarkerId,
        onFocusMarker: markerContext.onFocusMarker,
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

export function timelineZoomLimits() {
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

export function markerTooltipLines(markerContext, timeMs) {
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

export function buildTimelineScaleOptions(dateFmt, dateTimeFmt) {
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

export function baseOptions(title, valueCallback, chartKey) {
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
export function horizontalBarOptions(valueCallback, chartKey) {
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
