/**
 * Marker-Intervalle, Statistik und Event-zu-Marker-Aggregation.
 */
import { eventTimeMs } from './util.js';
import { markersForUser } from './store.js';

export const MARKER_CATEGORY_SUGGESTIONS = [
    'Bugfix',
    'Feature',
    'Refactoring',
    'Analyse',
    'Dokumentation',
    'Suche',
];

export const UNMARKED_DIMENSION_KEY = '__unmarked__';

export function resolveIntervalEndMs(marker, sortedMarkers, filterEndMs) {
    const startMs = new Date(marker.start).getTime();
    if (marker.end) {
        return Math.max(new Date(marker.end).getTime(), startMs + 1);
    }
    const sameUser = markersForUser(sortedMarkers, marker.user === 'all' ? 'all' : marker.user);
    for (const next of sameUser) {
        const nextStart = new Date(next.start).getTime();
        if (nextStart > startMs && next.id !== marker.id) {
            return nextStart;
        }
    }
    let endMs = filterEndMs ?? Date.now();
    if (endMs <= startMs) {
        endMs = startMs + 60_000;
    }
    return endMs;
}

export function markerIntervalMs(marker, allMarkers, filterEndMs) {
    const startMs = new Date(marker.start).getTime();
    let endMs = marker.end
        ? new Date(marker.end).getTime()
        : resolveIntervalEndMs(marker, allMarkers, filterEndMs);
    if (endMs <= startMs) {
        endMs = startMs + 60_000;
    }
    return { startMs, endMs };
}

export function filterEventsByMarkerInterval(events, marker, allMarkers, filterEndMs) {
    const { startMs, endMs } = markerIntervalMs(marker, allMarkers, filterEndMs);
    return events.filter((event) => {
        const userLabel = event.userLabel ?? event.user;
        if (marker.user !== 'all' && userLabel && userLabel !== marker.user) {
            return false;
        }
        const t = eventTimeMs(event);
        return t >= startMs && t < endMs;
    });
}

export function computeStats(events, marker, allMarkers, filterEndMs) {
    const { startMs, endMs } = markerIntervalMs(marker, allMarkers, filterEndMs);

    let calls = 0;
    let totalTokens = 0;
    let outputTokens = 0;
    let inputNoCache = 0;
    let cacheRead = 0;
    let costCents = 0;

    for (const event of events) {
        const userLabel = event.userLabel ?? event.user;
        if (marker.user !== 'all' && userLabel && userLabel !== marker.user) {
            continue;
        }
        const t = eventTimeMs(event);
        if (t < startMs || t >= endMs) {
            continue;
        }
        calls += 1;
        totalTokens += event.totalTokens ?? 0;
        outputTokens += event.outputTokens ?? 0;
        inputNoCache += event.inputNoCache ?? 0;
        cacheRead += event.cacheRead ?? 0;
        costCents += event.costCents ?? 0;
    }

    return {
        startMs,
        endMs,
        calls,
        totalTokens,
        outputTokens,
        inputNoCache,
        cacheRead,
        costCents,
    };
}

export function computeIntervalRows(events, markers, userId, filterEndMs) {
    const userMarkers = markersForUser(markers, userId);
    return userMarkers.map((marker) => ({
        marker,
        stats: computeStats(events, marker, markers, filterEndMs),
    }));
}

export function parseTaskCategory(task) {
    const trimmed = String(task ?? '').trim();
    if (!trimmed) {
        return null;
    }
    const match = trimmed.match(/^([^:–—-]+?)\s*[:–—-]\s+/);
    if (!match) {
        return null;
    }
    const category = match[1].trim();
    return category || null;
}

export function aggregateEventsByMarkerDimension(events, markers, dimension) {
    const byKey = new Map();

    for (const event of events) {
        const marker = getMarkerForEvent(event, markers);
        let key;
        let label;

        if (dimension === 'project') {
            key = marker?.project?.trim() || UNMARKED_DIMENSION_KEY;
            label = key;
        } else if (dimension === 'category') {
            const category = parseTaskCategory(marker?.task);
            key = category || UNMARKED_DIMENSION_KEY;
            label = key;
        } else {
            continue;
        }

        const existing = byKey.get(key) || {
            key,
            label,
            project: dimension === 'project' ? key : marker?.project || '',
            calls: 0,
            totalTokens: 0,
            costCents: 0,
        };
        existing.calls += 1;
        existing.totalTokens += event.totalTokens ?? 0;
        existing.costCents += event.costCents ?? 0;
        byKey.set(key, existing);
    }

    return [...byKey.values()].sort(
        (a, b) => b.totalTokens - a.totalTokens || b.costCents - a.costCents
    );
}

export function getMarkerForEvent(event, markers) {
    const t = eventTimeMs(event);
    const userLabel = event.userLabel ?? event.user;
    const candidates = markersForUser(markers, userLabel);
    let match = null;

    for (const marker of candidates) {
        const startMs = new Date(marker.start).getTime();
        const endMs = marker.end
            ? new Date(marker.end).getTime()
            : resolveIntervalEndMs(marker, markers, Date.now());
        if (t >= startMs && t < endMs) {
            if (!match || new Date(marker.start) > new Date(match.start)) {
                match = marker;
            }
        }
    }
    return match;
}
