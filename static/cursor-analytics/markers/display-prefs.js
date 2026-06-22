/**
 * Chart-Marker-Anzeige-Einstellungen (Sichtbarkeit, Labels, Projektfilter, Tabellen-Popover).
 */
import { markersForUser } from './store.js';

const MARKER_CHART_DISPLAY_STORAGE_KEY = 'cursor-marker-chart-display';

const DEFAULT_MARKER_CHART_DISPLAY = {
    showMarkers: true,
    showLabels: true,
    projectFilter: 'all',
    showTablePopover: true,
};

export function loadMarkerChartDisplay() {
    try {
        const raw = globalThis.localStorage?.getItem(MARKER_CHART_DISPLAY_STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_MARKER_CHART_DISPLAY };
        }
        const parsed = JSON.parse(raw);
        return {
            showMarkers: parsed.showMarkers !== false,
            showLabels: parsed.showLabels !== false,
            projectFilter:
                typeof parsed.projectFilter === 'string' ? parsed.projectFilter : 'all',
            showTablePopover: parsed.showTablePopover !== false,
        };
    } catch {
        return { ...DEFAULT_MARKER_CHART_DISPLAY };
    }
}

export function saveMarkerChartDisplay(prefs) {
    try {
        globalThis.localStorage?.setItem(
            MARKER_CHART_DISPLAY_STORAGE_KEY,
            JSON.stringify({
                showMarkers: prefs.showMarkers !== false,
                showLabels: prefs.showLabels !== false,
                projectFilter: prefs.projectFilter || 'all',
                showTablePopover: prefs.showTablePopover !== false,
            })
        );
    } catch {
        /* ignore quota / private mode */
    }
}

export function filterChartMarkers(markers, chartContext = {}) {
    if (chartContext.showMarkers === false) {
        return [];
    }
    let visible = chartContext.user
        ? markersForUser(markers, chartContext.user)
        : [...markers].sort((a, b) => new Date(a.start) - new Date(b.start));
    const projectFilter = chartContext.projectFilter;
    if (projectFilter && projectFilter !== 'all') {
        visible = visible.filter((m) => m.project === projectFilter);
    }
    return visible;
}
