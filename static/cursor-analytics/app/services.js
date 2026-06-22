/**
 * Leaf-Service-Helfer: Zugriff auf die window.CursorAnalytics-Bridge (parser/metrics/
 * charts/usersConfig/i18n/markers), i18n-Kurzformen sowie reine DOM-/Datum-/CSV-Helfer.
 *
 * Diese Funktionen haengen nur an Browser-Globals und der Bridge, nicht an anderen
 * app/*-Modulen -> unterste Schicht, von ueberall importierbar.
 */

export function resolveToolPath(relativePath) {
    const cleaned = String(relativePath).replace(/^\.\//, '');
    return new URL(cleaned, new URL('.', window.location.href)).href;
}

export function getMarkersApi() {
    return window.CursorAnalytics?.markers;
}

export function getParser() {
    return window.CursorAnalytics.parser;
}

export function getMetrics() {
    return window.CursorAnalytics.metrics;
}

export function getCharts() {
    return window.CursorAnalytics.charts;
}

export function getUsersConfig() {
    return window.CursorAnalytics?.usersConfig;
}

export function getI18n() {
    return window.CursorAnalytics?.i18n;
}

export function t(key) {
    return getI18n()?.t(key) ?? key;
}

export function tf(key, params) {
    return getI18n()?.tf(key, params) ?? t(key);
}

export function setStatus(text, isError = false) {
    const el = document.getElementById('status-line');
    el.textContent = text;
    el.classList.toggle('status-error', isError);
}

export function setActiveButtons(selector, activeBtn) {
    document.querySelectorAll(selector).forEach((btn) => {
        btn.classList.toggle('btn--active', btn === activeBtn);
    });
}

export function csvEscape(value) {
    const str = String(value ?? '');
    if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
}

export function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function toDateTimeLocalValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function clampDateTimeLocalValue(value, minValue, maxValue) {
    if (!value) {
        return value;
    }
    if (minValue && value < minValue) {
        return minValue;
    }
    if (maxValue && value > maxValue) {
        return maxValue;
    }
    return value;
}

export function parseDateInputValue(value) {
    if (!value) {
        return null;
    }
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }
    return new Date(year, month - 1, day);
}

export function parseDateTimeLocalValue(value) {
    if (!value) {
        return null;
    }
    if (String(value).includes('T')) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return parseDateInputValue(value);
}
