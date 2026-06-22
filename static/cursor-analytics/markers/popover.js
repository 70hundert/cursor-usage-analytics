/**
 * Gemeinsamer Marker-Info-Popover (Charts + Tabellen) — nur Info, keine Aktions-Buttons.
 *
 * Hinweis: popoverMarkerId / popoverPinned werden als Live-Bindings exportiert, damit
 * die Chart-Annotations-Interaktionen (chart-annotations.js) den aktuellen Zustand lesen
 * koennen, ohne den Popover-State zu mutieren.
 */
import { getStore } from './store.js';
import { resolveIntervalEndMs, computeStats } from './stats.js';
import { composerModeLabel, resolveComposerMode } from './composer-mode.js';
import { t, tf, escapeHtml, formatPopoverDate } from './util.js';

let popoverEl = null;
let popoverHideTimer = null;
export let popoverMarkerId = null;
export let popoverPinned = false;
let popoverChartContext = null;

export function clearPopoverHideTimer() {
    if (popoverHideTimer) {
        clearTimeout(popoverHideTimer);
        popoverHideTimer = null;
    }
}

export function isMouseOverPopover() {
    return Boolean(popoverEl && !popoverEl.hidden && popoverEl.matches(':hover'));
}

function ensurePopoverStyles() {
    if (document.getElementById('marker-chart-popover-styles')) {
        return;
    }
    const style = document.createElement('style');
    style.id = 'marker-chart-popover-styles';
    style.textContent = `
        .marker-chart-popover {
            position: fixed;
            z-index: 1100;
            min-width: 200px;
            max-width: 320px;
            padding: 0.55rem 0.65rem 0.5rem;
            background: #1a222d;
            border: 1px solid #2d3a4a;
            border-radius: 10px;
            box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
            color: #e8eef4;
            font-size: 0.78rem;
            line-height: 1.45;
            pointer-events: auto;
        }
        .marker-chart-popover[hidden] {
            display: none;
        }
        .marker-chart-popover__title {
            font-weight: 600;
            font-size: 0.85rem;
            margin-bottom: 0.35rem;
            color: #f0b429;
        }
        .marker-chart-popover__row {
            color: #8b9aab;
        }
        .marker-chart-popover__row strong {
            color: #e8eef4;
            font-weight: 600;
        }
        .marker-chart-popover__stats {
            margin-top: 0.35rem;
            padding-top: 0.35rem;
            border-top: 1px solid #2d3a4a;
            color: #8b9aab;
        }
    `;
    document.head.appendChild(style);
}

export function ensurePopover() {
    ensurePopoverStyles();
    if (popoverEl) {
        return popoverEl;
    }
    popoverEl = document.createElement('div');
    popoverEl.id = 'marker-chart-popover';
    popoverEl.className = 'marker-chart-popover';
    popoverEl.hidden = true;
    popoverEl.innerHTML = '<div class="marker-chart-popover__body"></div>';
    popoverEl.addEventListener('mouseenter', () => {
        clearPopoverHideTimer();
        popoverPinned = true;
    });
    popoverEl.addEventListener('mouseleave', () => {
        scheduleHidePopover(250);
    });
    document.body.appendChild(popoverEl);
    return popoverEl;
}

export function scheduleHidePopover(delayMs = 300) {
    clearPopoverHideTimer();
    popoverHideTimer = setTimeout(() => {
        if (isMouseOverPopover()) {
            popoverHideTimer = null;
            return;
        }
        hideChartPopover(true);
    }, delayMs);
}

export function hideChartPopover(immediate = false) {
    clearPopoverHideTimer();
    if (!popoverEl) {
        return;
    }
    if (!immediate) {
        scheduleHidePopover(300);
        return;
    }
    popoverEl.hidden = true;
    popoverMarkerId = null;
    popoverPinned = false;
}

export function buildPopoverHtml(marker, chartContext) {
    const { filterEndMs, markers, events, formatters } = chartContext;
    const allMarkers = markers || getStore().markers;
    const endMs = marker.end
        ? new Date(marker.end).getTime()
        : resolveIntervalEndMs(marker, allMarkers, filterEndMs);
    const endLabel = marker.end
        ? formatPopoverDate(marker.end, formatters)
        : `${formatPopoverDate(new Date(endMs).toISOString(), formatters)} *`;

    let statsHtml = '';
    if (events?.length) {
        const stats = computeStats(events, marker, allMarkers, filterEndMs);
        const numberFmt = formatters?.numberFmt;
        const tokenLabel = numberFmt
            ? numberFmt.format(stats.totalTokens)
            : String(stats.totalTokens);
        const parts = [
            tf('kpiEventsSub', { count: stats.calls }),
            `${tokenLabel} ${t('tokens')}`,
        ];
        if (stats.costCents > 0 || formatters?.currencyFmt) {
            const costLabel = formatters?.currencyFmt
                ? formatters.currencyFmt.format(stats.costCents / 100)
                : `${(stats.costCents / 100).toFixed(2)} $`;
            parts.push(costLabel);
        }
        statsHtml = `<div class="marker-chart-popover__stats">${parts.join(' · ')}</div>`;
    }

    const taskRow = marker.task
        ? `<div class="marker-chart-popover__row">${t('task')}: <strong>${escapeHtml(marker.task)}</strong></div>`
        : '';
    const noteRow = marker.note
        ? `<div class="marker-chart-popover__row">${t('popoverNote')}: <strong>${escapeHtml(marker.note)}</strong></div>`
        : '';
    const userLabel = marker.user === 'all' ? t('usersAll') : escapeHtml(marker.user);
    const modeLabel = composerModeLabel(resolveComposerMode(marker));
    const modeRow = `<div class="marker-chart-popover__row">${t('popoverComposerMode')}: <strong>${escapeHtml(modeLabel)}</strong></div>`;

    return `
        <div class="marker-chart-popover__title">${escapeHtml(marker.project)}</div>
        ${taskRow}
        <div class="marker-chart-popover__row">${t('users')}: <strong>${userLabel}</strong></div>
        ${modeRow}
        <div class="marker-chart-popover__row">${t('from')}: <strong>${formatPopoverDate(marker.start, formatters)}</strong></div>
        <div class="marker-chart-popover__row">${t('colEnd')}: <strong>${endLabel}</strong></div>
        ${noteRow}
        ${statsHtml}
    `;
}

function getNativeClientPoint(event) {
    const native = event?.native ?? event;
    if (native && typeof native.clientX === 'number') {
        return { x: native.clientX, y: native.clientY };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 3 };
}

function positionPopoverStable(ctx, event) {
    const el = ensurePopover();
    const canvas = ctx?.chart?.canvas;
    const margin = 12;

    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const width = el.offsetWidth || 240;
        const height = el.offsetHeight || 140;
        let left = rect.right - width - margin;
        let top = rect.top + margin;
        if (left < margin) {
            left = rect.left + margin;
        }
        if (top + height > window.innerHeight - margin) {
            top = window.innerHeight - height - margin;
        }
        el.style.left = `${Math.max(margin, left)}px`;
        el.style.top = `${Math.max(margin, top)}px`;
        return;
    }

    const { x, y } = getNativeClientPoint(event);
    el.style.left = `${Math.min(window.innerWidth - el.offsetWidth - margin, x + margin)}px`;
    el.style.top = `${Math.min(window.innerHeight - el.offsetHeight - margin, y + margin)}px`;
}

export function showChartPopover(marker, event, chartContext, ctx) {
    if (!marker) {
        return;
    }
    clearPopoverHideTimer();

    if (popoverMarkerId === marker.id && popoverEl && !popoverEl.hidden) {
        popoverPinned = true;
        return;
    }

    const el = ensurePopover();
    popoverMarkerId = marker.id;
    popoverPinned = true;
    popoverChartContext = chartContext;
    el.querySelector('.marker-chart-popover__body').innerHTML = buildPopoverHtml(marker, chartContext);

    el.hidden = false;
    positionPopoverStable(ctx, event);
}

/** Popover bei Tabellenzeilen-Hover (Position am Cursor, kein Chart-Kontext). */
export function showTableMarkerPopover(marker, nativeEvent, chartContext) {
    showChartPopover(marker, nativeEvent, chartContext, null);
}
