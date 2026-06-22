/**
 * Projekt-Marker — oeffentliche API.
 *
 * Buendelt die Marker-Submodule und stellt sie als ESM-Export `markers` bereit.
 */
import {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    loadStore,
    getStore,
    saveStore,
    saveStoreLocal,
    listMarkers,
    upsertMarker,
    removeMarker,
    getActiveOpenMarker,
    exportStore,
    importStore,
    fetchServerStore,
    pushToServer,
    mergeStores,
    syncFromServer,
} from './store.js';
import {
    computeStats,
    computeIntervalRows,
    markerIntervalMs,
    filterEventsByMarkerInterval,
    parseTaskCategory,
    aggregateEventsByMarkerDimension,
    getMarkerForEvent,
    resolveIntervalEndMs,
    MARKER_CATEGORY_SUGGESTIONS,
    UNMARKED_DIMENSION_KEY,
} from './stats.js';
import {
    COMPOSER_MODES,
    normalizeComposerMode,
    resolveComposerMode,
    composerModeLabel,
} from './composer-mode.js';
import { projectColor, buildProjectColorMap } from './colors.js';
import {
    loadMarkerChartDisplay,
    saveMarkerChartDisplay,
    filterChartMarkers,
} from './display-prefs.js';
import { categoryAnnotationRange, markerBucketIndexRange } from './buckets.js';
import {
    showChartPopover,
    showTableMarkerPopover,
    scheduleHidePopover,
    hideChartPopover,
} from './popover.js';
import {
    toChartAnnotations,
    annotationPluginOptions,
    chartMarkerLabelTopPadding,
} from './chart-annotations.js';
import {
    eventTimeMs,
    toDatetimeLocalValue,
    fromDatetimeLocalValue,
    getVisibleChartTimeMs,
} from './util.js';

export const markers = {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    loadStore,
    getStore,
    saveStore,
    saveStoreLocal,
    listMarkers,
    upsertMarker,
    removeMarker,
    getActiveOpenMarker,
    computeStats,
    computeIntervalRows,
    markerIntervalMs,
    filterEventsByMarkerInterval,
    parseTaskCategory,
    MARKER_CATEGORY_SUGGESTIONS,
    COMPOSER_MODES,
    normalizeComposerMode,
    resolveComposerMode,
    composerModeLabel,
    UNMARKED_DIMENSION_KEY,
    aggregateEventsByMarkerDimension,
    toChartAnnotations,
    annotationPluginOptions,
    chartMarkerLabelTopPadding,
    showChartPopover,
    showTableMarkerPopover,
    scheduleMarkerPopoverHide: scheduleHidePopover,
    hideChartPopover,
    getMarkerForEvent,
    projectColor,
    buildProjectColorMap,
    exportStore,
    importStore,
    getVisibleChartTimeMs,
    toDatetimeLocalValue,
    fromDatetimeLocalValue,
    eventTimeMs,
    resolveIntervalEndMs,
    categoryAnnotationRange,
    markerBucketIndexRange,
    loadMarkerChartDisplay,
    saveMarkerChartDisplay,
    filterChartMarkers,
    syncFromServer,
    pushToServer,
};
