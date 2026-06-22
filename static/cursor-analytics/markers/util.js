/**
 * Marker-Utilities: i18n-Helfer, localStorage-Zugriff, Datums-/HTML-Helfer.
 */
import { i18n } from '../i18n.js';

export function t(key) {
    return i18n?.t(key) ?? key;
}

export function tf(key, params) {
    return i18n?.tf(key, params) ?? t(key);
}

export function generateId() {
    if (globalThis.crypto?.randomUUID) {
        return `m-${globalThis.crypto.randomUUID()}`;
    }
    return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function readJsonStorage(key) {
    try {
        const raw = globalThis.localStorage?.getItem(key);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function writeJsonStorage(key, value) {
    try {
        globalThis.localStorage?.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function eventTimeMs(event) {
    const t = event.timestamp ?? event.date;
    if (t instanceof Date) {
        return t.getTime();
    }
    return new Date(t).getTime();
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function formatPopoverDate(iso, formatters) {
    if (!iso) {
        return '—';
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }
    if (formatters?.dateTimeFmt) {
        return formatters.dateTimeFmt.format(date);
    }
    return date.toLocaleString('de-DE');
}

export function toDatetimeLocalValue(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value) {
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getVisibleChartTimeMs(chart) {
    if (!chart?.scales?.x) {
        return Date.now();
    }
    const { min, max } = chart.scales.x;
    if (typeof min === 'number' && typeof max === 'number') {
        return Math.round((min + max) / 2);
    }
    return Date.now();
}
