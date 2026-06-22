/**
 * Chart.js-Rendering — oeffentliche API.
 *
 * Buendelt die Chart-Submodule und stellt sie als ESM-Export `charts` bereit.
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
