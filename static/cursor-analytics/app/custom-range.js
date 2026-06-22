/**
 * Custom datetime range inputs (min/max, persist, sync with loaded events).
 */
import {
    CUSTOM_RANGE_STORAGE_KEY,
    range,
    suppressCustomRangePersist,
    setSuppressCustomRangePersist,
} from './state.js';
import {
    toDateTimeLocalValue,
    startOfLocalDay,
    clampDateTimeLocalValue,
} from './services.js';
import { getAllLoadedEvents, eventDateBounds } from './data.js';

export function getDefaultCustomFrom() {
    const from = startOfLocalDay(new Date());
    from.setDate(from.getDate() - 2);
    return toDateTimeLocalValue(from);
}

export function getDefaultCustomTo() {
    return toDateTimeLocalValue(new Date());
}

export function loadStoredCustomRange() {
    try {
        const raw = localStorage.getItem(CUSTOM_RANGE_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (parsed?.customFrom && parsed?.customTo) {
            return { customFrom: parsed.customFrom, customTo: parsed.customTo };
        }
    } catch {
        return null;
    }
    return null;
}

export function saveStoredCustomRange(from, to) {
    if (suppressCustomRangePersist || !from || !to) {
        return;
    }
    localStorage.setItem(
        CUSTOM_RANGE_STORAGE_KEY,
        JSON.stringify({ customFrom: from, customTo: to })
    );
}

export function clearStoredCustomRange() {
    localStorage.removeItem(CUSTOM_RANGE_STORAGE_KEY);
}

export function resolveCustomRangeValues(minValue, maxValue) {
    const stored = loadStoredCustomRange();
    let customFrom = stored?.customFrom ?? getDefaultCustomFrom();
    let customTo = stored?.customTo ?? getDefaultCustomTo();
    if (minValue && maxValue) {
        customFrom = clampDateTimeLocalValue(customFrom, minValue, maxValue);
        customTo = clampDateTimeLocalValue(customTo, minValue, maxValue);
        if (customFrom > customTo) {
            return { customFrom: customTo, customTo: customFrom };
        }
    }
    return { customFrom, customTo };
}

export function setCustomRangeInputs(from, to) {
    const fromEl = document.getElementById('custom-from');
    const toEl = document.getElementById('custom-to');
    if (!fromEl || !toEl) {
        return;
    }
    setSuppressCustomRangePersist(true);
    fromEl.value = from;
    toEl.value = to;
    setSuppressCustomRangePersist(false);
}

export function updateCustomDateBounds() {
    const fromEl = document.getElementById('custom-from');
    const toEl = document.getElementById('custom-to');
    if (!fromEl || !toEl) {
        return;
    }

    const events = getAllLoadedEvents();
    let minValue = null;
    let maxValue = null;

    if (events.length) {
        const bounds = eventDateBounds(events);
        if (bounds) {
            minValue = bounds.minValue;
            maxValue = bounds.maxValue;
            fromEl.min = minValue;
            fromEl.max = maxValue;
            toEl.min = minValue;
            toEl.max = maxValue;
        }
    }

    let { customFrom, customTo } = resolveCustomRangeValues(minValue, maxValue);

    if (range.mode === 'custom') {
        if (range.customFrom) {
            customFrom =
                minValue && maxValue
                    ? clampDateTimeLocalValue(range.customFrom, minValue, maxValue)
                    : range.customFrom;
        }
        if (range.customTo) {
            customTo =
                minValue && maxValue
                    ? clampDateTimeLocalValue(range.customTo, minValue, maxValue)
                    : range.customTo;
        }
    }

    setCustomRangeInputs(customFrom, customTo);
}
