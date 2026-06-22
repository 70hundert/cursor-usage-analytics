/**
 * Zentraler App-Zustand + Konfiguration + Formatter.
 *
 * Veraenderlicher Zustand wird als `export let` mit Live-Bindings bereitgestellt:
 * andere Module lesen die Werte direkt (Imports spiegeln Aenderungen wider) und
 * schreiben ausschliesslich ueber die Setter-Funktionen.
 */
import { i18n } from '../i18n.js';

// --- Konfiguration / Konstanten -------------------------------------------------
export const PROXY_BASE = '';
export const BUDGET_STORAGE_KEY = 'cursor-analytics-monthly-budget-usd';
export const GRANULARITY_STORAGE_KEY = 'cursor-analytics-granularity';
export const SELECTION_MODE_STORAGE_KEY = 'cursor-analytics-selection-mode';
export const COUNT_STORAGE_KEY = 'cursor-analytics-count';
export const CUSTOM_RANGE_STORAGE_KEY = 'cursor-analytics-custom-range';
export const TIME_RANGE_STORAGE_KEY = 'cursor-analytics-time-range';
export const MARKER_FOCUS_STORAGE_KEY = 'cursor-marker-focus-id';
export const DATA_SOURCE_STORAGE_KEY = 'cursor-analytics-data-source';
export const USER_FILTER_STORAGE_KEY = 'cursor-analytics-user-filter';
export const CARD_COLLAPSE_STORAGE_KEY = 'cursor-analytics-collapsed-cards';
export const EVENTS_COLLAPSED_GROUPS_STORAGE_KEY = 'cursor-analytics-collapsed-event-groups';
export const MARKER_COLLAPSED_GROUPS_STORAGE_KEY = 'cursor-analytics-collapsed-marker-groups';
export const EVENTS_PAGE_SIZE_STORAGE_KEY = 'events-page-size';
export const VALID_DATA_SOURCES = ['csv', 'live', 'merge'];
export const DEFAULT_TIME_RANGE_HOURS = 24;
export const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;
export const LIVE_INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;
export const EVENTS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const EVENTS_UNMARKED_KEY = '__unmarked__';

export const CHART_CANVAS_IDS = {
    overview: 'chart-overview-daily',
    topCost: 'chart-top-cost',
    topTokens: 'chart-top-tokens',
    tokenTypes: 'chart-token-types',
    modelFamily: 'chart-model-family',
    byHour: 'chart-by-hour',
    cumulative: 'chart-cumulative',
    inputOutput: 'chart-input-output',
    cacheEfficiency: 'chart-cache',
    byWeekday: 'chart-weekday',
    maxMode: 'chart-max-mode',
    markerByProject: 'chart-marker-by-project',
    markerByCategory: 'chart-marker-by-category',
};

const storedCount = Number.parseInt(localStorage.getItem(COUNT_STORAGE_KEY) || '50', 10);
const safeStoredCount = Number.isFinite(storedCount) && storedCount > 0 ? storedCount : 50;

// --- Persistenz-Helfer fuer Zeitbereich ----------------------------------------
export function loadStoredTimeRange() {
    try {
        const raw = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (parsed?.mode === 'all') {
            return {
                mode: 'all',
                hours: DEFAULT_TIME_RANGE_HOURS,
                customFrom: '',
                customTo: '',
            };
        }
        if (parsed?.mode === 'custom' && parsed.customFrom && parsed.customTo) {
            return {
                mode: 'custom',
                hours: DEFAULT_TIME_RANGE_HOURS,
                customFrom: parsed.customFrom,
                customTo: parsed.customTo,
            };
        }
        if (parsed?.mode === 'hours') {
            const hours = Number(parsed.hours);
            if (Number.isFinite(hours) && hours > 0) {
                return {
                    mode: 'hours',
                    hours,
                    customFrom: '',
                    customTo: '',
                };
            }
        }
    } catch {
        return null;
    }
    return null;
}

export function getInitialTimeRange() {
    return (
        loadStoredTimeRange() ?? {
            mode: 'hours',
            hours: DEFAULT_TIME_RANGE_HOURS,
            customFrom: '',
            customTo: '',
        }
    );
}

export function saveStoredTimeRange(timeRange) {
    localStorage.setItem(
        TIME_RANGE_STORAGE_KEY,
        JSON.stringify({
            mode: timeRange.mode,
            hours: timeRange.hours,
            customFrom: timeRange.customFrom || '',
            customTo: timeRange.customTo || '',
        })
    );
}

const initialTimeRange = getInitialTimeRange();

// --- Formatter (Live-Bindings, via rebuildFormatters gesetzt) -------------------
export let numberFmt;
export let currencyFmt;
export let dateFmt;
export let dateTimeFmt;
export let monthFmt;

export function rebuildFormatters() {
    const intlLocale = i18n?.getIntlLocale() || 'de-DE';
    numberFmt = new Intl.NumberFormat(intlLocale);
    currencyFmt = new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency: 'USD',
    });
    dateFmt = new Intl.DateTimeFormat(intlLocale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
    dateTimeFmt = new Intl.DateTimeFormat(intlLocale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    monthFmt = new Intl.DateTimeFormat(intlLocale, {
        month: 'short',
        year: 'numeric',
    });
}

rebuildFormatters();

// --- Veraenderlicher Zustand ----------------------------------------------------
export let eventsByUser = {};
export let liveEventsByUser = {};
export let liveFetchState = { fetchedAt: 0, bounds: null };
export let liveUsersConfigured = null;
export let liveLoading = false;
export let lastAggregated = null;
export let eventsFilterKey = '';

export let dataSource = VALID_DATA_SOURCES.includes(localStorage.getItem(DATA_SOURCE_STORAGE_KEY))
    ? localStorage.getItem(DATA_SOURCE_STORAGE_KEY)
    : 'csv';
export let userFilter = localStorage.getItem(USER_FILTER_STORAGE_KEY) || 'all';
export let granularity = localStorage.getItem(GRANULARITY_STORAGE_KEY) || 'hour';
export let selectionMode = localStorage.getItem(SELECTION_MODE_STORAGE_KEY) || 'time';

export let range = {
    mode: initialTimeRange.mode,
    hours: initialTimeRange.hours,
    customFrom: initialTimeRange.customFrom,
    customTo: initialTimeRange.customTo,
    windowEndMs: null,
    count: safeStoredCount,
    countFrom: 1,
    countTo: safeStoredCount,
};
export let suppressCustomRangePersist = false;
export let savedTimeRange = { ...initialTimeRange };
export let savedCountRange = {
    mode: 'count',
    count: safeStoredCount,
    countFrom: 1,
    countTo: safeStoredCount,
};

export const chartInstances = {};

export let projectFilter = 'all';
export let markerTableProjectFilter = 'all';
export let markerChartDisplay = {
    showMarkers: true,
    showLabels: true,
    projectFilter: 'all',
    showTablePopover: true,
};
export let markerFocusId = null;

export let eventsGroupMode = localStorage.getItem('events-group-mode') || 'marker';
export let eventsPageSize = (() => {
    const stored = Number.parseInt(localStorage.getItem(EVENTS_PAGE_SIZE_STORAGE_KEY), 10);
    return EVENTS_PAGE_SIZE_OPTIONS.includes(stored) ? stored : 25;
})();
export let eventsPageIndex = 0;
export let eventsModelFilter = 'all';
export let eventsKindFilter = 'all';
export let eventsMaxModeFilter = 'all';
export let eventsMinCostUsd = 0;
export let eventsIncludedOnly = false;
export let eventsSortColumn = 'time';
export let eventsSortDir = 'desc';
export let markerSortColumn = 'start';
export let markerSortDir = 'asc';

export let resizeChartsFrame = null;

function loadMarkerCollapsedGroupKeys() {
    try {
        const raw = localStorage.getItem(MARKER_COLLAPSED_GROUPS_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

function loadEventCollapsedGroupKeys(mode) {
    try {
        const raw = localStorage.getItem(EVENTS_COLLAPSED_GROUPS_STORAGE_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return [];
        }
        const keys = parsed[mode];
        return Array.isArray(keys) ? keys.filter((item) => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

export const collapsedEventGroups = new Set(loadEventCollapsedGroupKeys(eventsGroupMode));
export const collapsedMarkerGroups = new Set(loadMarkerCollapsedGroupKeys());

// --- Setter ---------------------------------------------------------------------
export function setEventsByUser(value) { eventsByUser = value; }
export function setLiveEventsByUser(value) { liveEventsByUser = value; }
export function setLiveFetchState(value) { liveFetchState = value; }
export function setLiveUsersConfigured(value) { liveUsersConfigured = value; }
export function setLiveLoadingFlag(value) { liveLoading = value; }
export function setLastAggregated(value) { lastAggregated = value; }
export function setEventsFilterKey(value) { eventsFilterKey = value; }
export function setDataSource(value) { dataSource = value; }
export function setUserFilter(value) { userFilter = value; }
export function setGranularity(value) { granularity = value; }
export function setSelectionMode(value) { selectionMode = value; }
export function setRange(value) { range = value; }
export function setSuppressCustomRangePersist(value) { suppressCustomRangePersist = value; }
export function setSavedTimeRange(value) { savedTimeRange = value; }
export function setSavedCountRange(value) { savedCountRange = value; }
export function setProjectFilter(value) { projectFilter = value; }
export function setMarkerTableProjectFilter(value) { markerTableProjectFilter = value; }
export function setMarkerChartDisplay(value) { markerChartDisplay = value; }
export function setMarkerFocusId(value) { markerFocusId = value; }
export function setEventsGroupMode(value) { eventsGroupMode = value; }
export function setEventsPageSize(value) { eventsPageSize = value; }
export function setEventsPageIndex(value) { eventsPageIndex = value; }
export function setEventsModelFilter(value) { eventsModelFilter = value; }
export function setEventsKindFilter(value) { eventsKindFilter = value; }
export function setEventsMaxModeFilter(value) { eventsMaxModeFilter = value; }
export function setEventsMinCostUsd(value) { eventsMinCostUsd = value; }
export function setEventsIncludedOnly(value) { eventsIncludedOnly = value; }
export function setEventsSortColumn(value) { eventsSortColumn = value; }
export function setEventsSortDir(value) { eventsSortDir = value; }
export function setMarkerSortColumn(value) { markerSortColumn = value; }
export function setMarkerSortDir(value) { markerSortDir = value; }
export function setResizeChartsFrame(value) { resizeChartsFrame = value; }
