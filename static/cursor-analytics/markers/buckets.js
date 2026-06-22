/**
 * Bucket-Index-Helfer: Abbildung von Marker-Zeitintervallen auf Chart-Bucket-Indizes
 * (Kategorie-Achse in Overview/Cumulative).
 */
import { markerIntervalMs } from './stats.js';

export function bucketStartMs(bucket) {
    if (bucket.bucketStart instanceof Date) {
        return bucket.bucketStart.getTime();
    }
    return bucket.sortKey;
}

function inferredBucketDurationMs(buckets, index, matchEvents = false) {
    if (matchEvents) {
        return 60_000;
    }
    if (index > 0) {
        return Math.max(1, bucketStartMs(buckets[index]) - bucketStartMs(buckets[index - 1]));
    }
    if (buckets.length >= 2) {
        return Math.max(1, bucketStartMs(buckets[1]) - bucketStartMs(buckets[0]));
    }
    return 24 * 60 * 60 * 1000;
}

function bucketEndMs(buckets, index, matchEvents = false) {
    if (index + 1 < buckets.length) {
        return bucketStartMs(buckets[index + 1]);
    }
    return bucketStartMs(buckets[index]) + inferredBucketDurationMs(buckets, index, matchEvents);
}

export function bucketIndexRangeForInterval(buckets, startMs, endMs, options = {}) {
    if (!buckets?.length) {
        return null;
    }
    if (endMs <= startMs) {
        endMs = startMs + 60_000;
    }

    const { events, marker } = options;
    const matchEvents = Boolean(marker && events?.length === buckets.length);
    let xMin = null;
    let xMax = null;

    for (let i = 0; i < buckets.length; i += 1) {
        const bucketStart = bucketStartMs(buckets[i]);
        const bucketEnd = bucketEndMs(buckets, i, matchEvents);
        if (bucketStart >= endMs || bucketEnd <= startMs) {
            continue;
        }

        if (matchEvents) {
            const userLabel = events[i].userLabel ?? events[i].user;
            if (marker.user !== 'all' && userLabel && userLabel !== marker.user) {
                continue;
            }
        }

        if (xMin === null) {
            xMin = i;
        }
        xMax = i;
    }

    if (xMin === null && marker) {
        const lastIdx = buckets.length - 1;
        if (matchEvents) {
            const userLabel = events[lastIdx].userLabel ?? events[lastIdx].user;
            if (marker.user !== 'all' && userLabel && userLabel !== marker.user) {
                return null;
            }
        }
        const lastStart = bucketStartMs(buckets[lastIdx]);
        if (startMs >= lastStart) {
            return { xMin: lastIdx, xMax: lastIdx };
        }
        return null;
    }

    if (xMin === null) {
        return null;
    }

    return { xMin, xMax };
}

/** Must stay in sync with renderOverviewBuckets datasets.bar in charts.js */
function categoryBarHalfWidth(buckets, events) {
    const isPerEvent = Boolean(events?.length && events.length === buckets.length);
    const categoryPct = isPerEvent ? 1 : 0.75;
    const barPct = isPerEvent ? 0.95 : 0.85;
    const half = (categoryPct * barPct) / 2;
    return isPerEvent ? half + 0.05 : half;
}

function expandCategoryRangeForBars(range, buckets, events) {
    const half = categoryBarHalfWidth(buckets, events);
    return { xMin: range.xMin - half, xMax: range.xMax + half };
}

export function categoryAnnotationRange(buckets, startMs, endMs, events, marker) {
    const range = bucketIndexRangeForInterval(buckets, startMs, endMs, { events, marker });
    if (!range) {
        return null;
    }
    return expandCategoryRangeForBars(range, buckets, events);
}

export function markerBucketIndexRange(buckets, marker, allMarkers, filterEndMs, events) {
    const { startMs, endMs } = markerIntervalMs(marker, allMarkers, filterEndMs);
    return bucketIndexRangeForInterval(buckets, startMs, endMs, { events, marker });
}

/** @deprecated use bucketIndexRangeForInterval */
export function bucketIndexForTimestamp(buckets, timestampMs) {
    if (!buckets?.length) {
        return null;
    }
    for (let i = 0; i < buckets.length; i += 1) {
        if (buckets[i].sortKey >= timestampMs) {
            return i;
        }
    }
    return buckets.length - 1;
}
