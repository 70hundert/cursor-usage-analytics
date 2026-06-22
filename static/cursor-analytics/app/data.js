/**
 * Daten-Selektion (Lese-Schicht): liefert die je nach Datenquelle/Filter relevanten
 * Events sowie abgeleitete Helfer (User-Filter, Datums-Grenzen, Live-Verfuegbarkeit).
 *
 * Haengt nur an state.js + services.js (keine Render-/Markers-UI-Aufrufe), damit es als
 * untere Schicht von Render, Controls, Events-UI und Markers-UI nutzbar bleibt.
 */
import {
    eventsByUser,
    liveEventsByUser,
    dataSource,
    selectionMode,
    range,
    userFilter,
    setUserFilter,
    USER_FILTER_STORAGE_KEY,
} from './state.js';
import {
    getParser,
    getMetrics,
    getUsersConfig,
    toDateTimeLocalValue,
} from './services.js';

export function getValidUserFilters() {
    return getUsersConfig()?.getValidUserFilters() || ['all', 'primary', 'secondary'];
}

export function getDefaultUserId() {
    return getUsersConfig()?.getDefaultUserId() || 'primary';
}

export function emptyEventsByUser() {
    return getUsersConfig()?.emptyEventsByUser() || { primary: [], secondary: [] };
}

export function normalizeUserFilter() {
    const valid = getValidUserFilters();
    if (!valid.includes(userFilter)) {
        setUserFilter('all');
        localStorage.setItem(USER_FILTER_STORAGE_KEY, userFilter);
    }
}

export function allCsvEvents() {
    const { USER_ORDER } = getParser();
    return USER_ORDER.flatMap((userId) => eventsByUser[userId] || []);
}

export function allLiveEvents() {
    const { USER_ORDER } = getParser();
    return USER_ORDER.flatMap((userId) => liveEventsByUser[userId] || []);
}

export function activeEvents() {
    const { mergeEvents } = getParser();
    if (dataSource === 'csv') {
        return allCsvEvents();
    }
    if (dataSource === 'live') {
        return allLiveEvents();
    }
    return mergeEvents([allCsvEvents(), allLiveEvents()]).events;
}

export function filteredEvents() {
    const metrics = getMetrics();
    let events = activeEvents();
    if (selectionMode === 'count') {
        events = metrics.filterEventsByCount(events, range);
    } else {
        events = metrics.filterEvents(events, range);
    }
    events = metrics.filterByUser(events, userFilter);
    return events;
}

export function getAllLoadedEvents() {
    const { mergeEvents } = getParser();
    return mergeEvents([allCsvEvents(), allLiveEvents()]).events;
}

export function eventDateBounds(events) {
    if (!events.length) {
        return null;
    }
    let minMs = events[0].timestamp.getTime();
    let maxMs = minMs;
    for (const event of events) {
        const ms = event.timestamp.getTime();
        if (ms < minMs) {
            minMs = ms;
        }
        if (ms > maxMs) {
            maxMs = ms;
        }
    }
    return {
        minValue: toDateTimeLocalValue(new Date(minMs)),
        maxValue: toDateTimeLocalValue(new Date(maxMs)),
    };
}

export function hasLiveData() {
    const { USER_ORDER } = getParser();
    return USER_ORDER.some((userId) => (liveEventsByUser[userId] || []).length > 0);
}
