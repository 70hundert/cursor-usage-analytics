/**
 * Chart.js-Rendering — oeffentliche API.
 *
 * Buendelt die Chart-Submodule und registriert die API auf window.CursorAnalytics.charts
 * (Bridge fuer klassische Consumer wie app.js). Zusaetzlich ESM-Export `charts`.
 */
import { COLORS } from './theme.js';
import { destroyChart, destroyAll } from './registry.js';
import { renderAll } from './detail-charts.js';
import { renderMarkerBreakdown } from './marker-breakdown.js';
import {
    renderOverviewBuckets,
    renderOverviewTimeline,
    renderOverviewDaily,
    applyMarkerFocusZoom,
    MARKER_FOCUS_ZOOM_PADDING,
} from './overview.js';
import { renderCumulativeBuckets, renderCumulativeTimeline } from './cumulative.js';

export const charts = {
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
    applyMarkerFocusZoom,
    MARKER_FOCUS_ZOOM_PADDING,
};

// Bridge: klassische Consumer (app.js) lesen window.CursorAnalytics.charts
window.CursorAnalytics = window.CursorAnalytics || {};
window.CursorAnalytics.charts = charts;
