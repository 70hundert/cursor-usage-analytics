/**
 * Controls-UI: Zeitbereich (Presets/All/Custom), Count-Modus, Selection-Mode,
 * Chart-Hoehe/Zoom, Time-Window-Pan sowie das Verdrahten der gesamten Toolbar.
 *
 * Die eigentliche Daten-/Render-Orchestrierung (renderAll, applyRangeAndRender,
 * fetchLiveEvents, loadCsvFiles, exportJson) liegt weiterhin in ../main.js und wird
 * transitorisch importiert, bis render/data ausgelagert sind.
 */
import {
    CUSTOM_RANGE_STORAGE_KEY,
    COUNT_STORAGE_KEY,
    SELECTION_MODE_STORAGE_KEY,
    DATA_SOURCE_STORAGE_KEY,
    GRANULARITY_STORAGE_KEY,
    BUDGET_STORAGE_KEY,
    DEFAULT_TIME_RANGE_HOURS,
    CHART_CANVAS_IDS,
    saveStoredTimeRange,
    dateFmt,
    dateTimeFmt,
    range,
    selectionMode,
    userFilter,
    dataSource,
    granularity,
    suppressCustomRangePersist,
    savedTimeRange,
    savedCountRange,
    chartInstances,
    resizeChartsFrame,
    setRange,
    setSelectionMode,
    setSavedTimeRange,
    setSavedCountRange,
    setSuppressCustomRangePersist,
    setGranularity,
    setDataSource,
    setResizeChartsFrame,
    setLiveFetchState,
} from './state.js';
import {
    t,
    tf,
    getMetrics,
    setStatus,
    setActiveButtons,
    toDateTimeLocalValue,
    startOfLocalDay,
    clampDateTimeLocalValue,
    parseDateTimeLocalValue,
} from './services.js';
import { getAllLoadedEvents, eventDateBounds, activeEvents } from './data.js';
import {
    applyRangeAndRender,
    fetchLiveEvents,
    loadCsvFiles,
    exportJson,
} from '../main.js';
import { renderAll } from './render.js';

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

export function resetCustomRange() {
    clearStoredCustomRange();

    const events = getAllLoadedEvents();
    let minValue = null;
    let maxValue = null;
    if (events.length) {
        const bounds = eventDateBounds(events);
        if (bounds) {
            minValue = bounds.minValue;
            maxValue = bounds.maxValue;
        }
    }

    const { customFrom, customTo } = resolveCustomRangeValues(minValue, maxValue);
    setCustomRangeInputs(customFrom, customTo);

    if (range.mode === 'custom') {
        applyCustomRange();
    }
}

export function clearRangeButtons() {
    document
        .querySelectorAll(
            '#time-range-group [data-hours], #time-range-group [data-all], #custom-apply'
        )
        .forEach((button) => {
            button.classList.remove('btn--active');
        });
}

export function clearCountButtons() {
    document
        .querySelectorAll(
            '#count-range-group [data-count], #count-range-group [data-count-all], #count-custom-apply'
        )
        .forEach((button) => {
            button.classList.remove('btn--active');
        });
}

export function updateSelectionModeUi() {
    const timeGroup = document.getElementById('time-range-group');
    const countGroup = document.getElementById('count-range-group');
    if (timeGroup) {
        timeGroup.hidden = selectionMode !== 'time';
    }
    if (countGroup) {
        countGroup.hidden = selectionMode !== 'count';
    }
    document.querySelectorAll('[data-selection-mode]').forEach((btn) => {
        btn.classList.toggle('btn--active', btn.dataset.selectionMode === selectionMode);
    });
}

export function syncTimeRangeButtons() {
    clearRangeButtons();
    if (range.mode === 'custom') {
        document.getElementById('custom-apply')?.classList.add('btn--active');
        return;
    }
    if (range.mode === 'all') {
        document.querySelector('#time-range-group [data-all]')?.classList.add('btn--active');
        return;
    }
    const activeBtn = document.querySelector(
        `#time-range-group [data-hours="${range.hours}"]`
    );
    if (activeBtn) {
        activeBtn.classList.add('btn--active');
    } else {
        document
            .querySelector(`#time-range-group [data-hours="${DEFAULT_TIME_RANGE_HOURS}"]`)
            ?.classList.add('btn--active');
    }
}

export function syncCountRangeButtons() {
    clearCountButtons();
    const customApply = document.getElementById('count-custom-apply');
    if (range.mode === 'countRange') {
        customApply?.classList.add('btn--active');
        syncCountCustomInputs();
        return;
    }
    if (range.mode === 'all') {
        document
            .querySelector('#count-range-group [data-count-all]')
            ?.classList.add('btn--active');
        return;
    }
    const activeBtn = document.querySelector(
        `#count-range-group [data-count="${range.count}"]`
    );
    if (activeBtn) {
        activeBtn.classList.add('btn--active');
    } else {
        document
            .querySelector('#count-range-group [data-count="50"]')
            ?.classList.add('btn--active');
    }
    syncCountCustomInputs();
}

export function syncCountCustomInputs() {
    const fromEl = document.getElementById('count-from');
    const toEl = document.getElementById('count-to');
    if (!fromEl || !toEl) {
        return;
    }
    if (range.mode === 'countRange') {
        fromEl.value = String(range.countFrom ?? 1);
        toEl.value = String(range.countTo ?? 50);
        return;
    }
    if (range.mode === 'count') {
        fromEl.value = '1';
        toEl.value = String(range.count ?? 50);
        return;
    }
    fromEl.value = '1';
    toEl.value = String(range.countTo ?? range.count ?? 50);
}

export function rangeLabel() {
    if (selectionMode === 'count') {
        if (range.mode === 'all') {
            return t('rangeAllRequests');
        }
        if (range.mode === 'countRange') {
            return tf('rangeCountRange', {
                from: range.countFrom,
                to: range.countTo,
            });
        }
        return tf('rangeLastN', { count: range.count });
    }
    if (range.mode === 'all') {
        return t('all');
    }
    if (range.mode === 'custom') {
        const fromDate = parseDateTimeLocalValue(range.customFrom);
        const toDate = parseDateTimeLocalValue(range.customTo);
        if (fromDate && toDate) {
            const [startDate, endDate] =
                fromDate <= toDate ? [fromDate, toDate] : [toDate, fromDate];
            const hasTime =
                String(range.customFrom).includes('T') ||
                String(range.customTo).includes('T');
            const fmt = hasTime ? dateTimeFmt : dateFmt;
            return `${fmt.format(startDate)} – ${fmt.format(endDate)}`;
        }
        return t('rangeCustom');
    }
    const presetLabels = {
        1: t('preset1h'),
        2: t('preset2h'),
        3: t('preset3h'),
        6: t('preset6h'),
        12: t('preset12h'),
        24: t('preset1d'),
        168: t('preset7d'),
        720: t('preset30d'),
    };
    return presetLabels[range.hours] || tf('presetHours', { hours: range.hours });
}

export function canPanTimeWindow() {
    if (selectionMode !== 'time') {
        return false;
    }
    if (range.mode !== 'hours' && range.mode !== 'custom') {
        return false;
    }
    const metrics = getMetrics();
    const events = metrics.filterByUser(activeEvents(), userFilter);
    return events.length > 0 && Boolean(metrics.resolveFilterBoundsMs(range, events));
}

export function clampTimeWindowEndMs(endMs, durationMs) {
    const metrics = getMetrics();
    const events = metrics.filterByUser(activeEvents(), userFilter);
    const dataBounds = metrics.getEventTimeBoundsMs(events);
    if (!dataBounds || !durationMs) {
        return endMs;
    }
    const minEnd = dataBounds.minMs + durationMs;
    const maxEnd = dataBounds.maxMs;
    return Math.min(maxEnd, Math.max(minEnd, endMs));
}

export function applyShiftedTimeWindow(endMs, durationMs) {
    const clampedEnd = clampTimeWindowEndMs(endMs, durationMs);
    const clampedStart = clampedEnd - durationMs;

    if (range.mode === 'hours') {
        range.windowEndMs = clampedEnd;
        return;
    }

    if (range.mode === 'custom') {
        range.customFrom = toDateTimeLocalValue(new Date(clampedStart));
        range.customTo = toDateTimeLocalValue(new Date(clampedEnd));
        setCustomRangeInputs(range.customFrom, range.customTo);
    }
}

export function applyPresetRange(hours, activeButton) {
    setRange({
        mode: 'hours',
        hours,
        customFrom: '',
        customTo: '',
        windowEndMs: null,
        count: range.count,
        countFrom: range.countFrom,
        countTo: range.countTo,
    });
    setSavedTimeRange({ mode: 'hours', hours, customFrom: '', customTo: '' });
    saveStoredTimeRange(savedTimeRange);
    clearRangeButtons();
    if (activeButton) {
        activeButton.classList.add('btn--active');
    }
    applyRangeAndRender();
}

export function applyCountRange(count, activeButton) {
    setRange({
        mode: 'count',
        hours: 720,
        customFrom: '',
        customTo: '',
        windowEndMs: null,
        count,
        countFrom: 1,
        countTo: count,
    });
    setSavedCountRange({
        mode: 'count',
        count,
        countFrom: 1,
        countTo: count,
    });
    localStorage.setItem(COUNT_STORAGE_KEY, String(count));
    clearCountButtons();
    if (activeButton) {
        activeButton.classList.add('btn--active');
    }
    syncCountCustomInputs();
    applyRangeAndRender();
}

export function applyCountAll(activeButton) {
    setRange({
        mode: 'all',
        hours: 720,
        customFrom: '',
        customTo: '',
        windowEndMs: null,
        count: range.count,
        countFrom: 1,
        countTo: range.countTo ?? range.count ?? 50,
    });
    setSavedCountRange({
        mode: 'all',
        count: range.count,
        countFrom: 1,
        countTo: range.countTo ?? range.count ?? 50,
    });
    clearCountButtons();
    if (activeButton) {
        activeButton.classList.add('btn--active');
    }
    applyRangeAndRender();
}

export function applyCountCustomRange() {
    const fromEl = document.getElementById('count-from');
    const toEl = document.getElementById('count-to');
    const countFrom = Math.max(1, Math.floor(Number(fromEl?.value) || 1));
    const countTo = Math.max(countFrom, Math.floor(Number(toEl?.value) || countFrom));

    if (!fromEl?.value || !toEl?.value) {
        setStatus(t('statusSelectCountRange'), true);
        return;
    }

    setRange({
        mode: 'countRange',
        hours: 720,
        customFrom: '',
        customTo: '',
        windowEndMs: null,
        count: countTo - countFrom + 1,
        countFrom,
        countTo,
    });
    setSavedCountRange({
        mode: 'countRange',
        count: range.count,
        countFrom,
        countTo,
    });
    localStorage.setItem(COUNT_STORAGE_KEY, String(countTo));
    clearCountButtons();
    document.getElementById('count-custom-apply')?.classList.add('btn--active');
    fromEl.value = String(countFrom);
    toEl.value = String(countTo);
    applyRangeAndRender();
}

export function applySelectionMode(mode) {
    if (mode === selectionMode) {
        return;
    }

    const previousMode = selectionMode;

    if (selectionMode === 'time') {
        setSavedTimeRange({
            mode: range.mode,
            hours: range.hours,
            customFrom: range.customFrom,
            customTo: range.customTo,
        });
        saveStoredTimeRange(savedTimeRange);
    } else {
        setSavedCountRange({
            mode: range.mode,
            count: range.count,
            countFrom: range.countFrom,
            countTo: range.countTo,
        });
    }

    setSelectionMode(mode);
    localStorage.setItem(SELECTION_MODE_STORAGE_KEY, selectionMode);

    if (selectionMode === 'count') {
        const saved = savedCountRange;
        setRange({
            mode: saved.mode === 'all' ? 'all' : saved.mode === 'countRange' ? 'countRange' : 'count',
            hours: 720,
            customFrom: '',
            customTo: '',
            windowEndMs: null,
            count: saved.count || 50,
            countFrom: saved.countFrom || 1,
            countTo: saved.countTo || saved.count || 50,
        });
    } else {
        setRange({
            ...savedTimeRange,
            windowEndMs: null,
            count: range.count,
            countFrom: range.countFrom,
            countTo: range.countTo,
        });
        if (previousMode === 'count' && (dataSource === 'live' || dataSource === 'merge')) {
            setLiveFetchState({ fetchedAt: 0, bounds: null });
        }
    }

    updateSelectionModeUi();
    if (selectionMode === 'count') {
        syncCountRangeButtons();
    } else {
        syncTimeRangeButtons();
    }
    applyRangeAndRender();
}

export function applyCustomRange() {
    const fromEl = document.getElementById('custom-from');
    const toEl = document.getElementById('custom-to');
    if (!fromEl?.value || !toEl?.value) {
        setStatus(t('statusSelectTimeRange'), true);
        return;
    }

    setRange({
        mode: 'custom',
        hours: DEFAULT_TIME_RANGE_HOURS,
        customFrom: fromEl.value,
        customTo: toEl.value,
        windowEndMs: null,
        count: range.count,
        countFrom: range.countFrom,
        countTo: range.countTo,
    });
    setSavedTimeRange({
        mode: 'custom',
        hours: DEFAULT_TIME_RANGE_HOURS,
        customFrom: fromEl.value,
        customTo: toEl.value,
    });
    saveStoredCustomRange(fromEl.value, toEl.value);
    saveStoredTimeRange(savedTimeRange);
    clearRangeButtons();
    document.getElementById('custom-apply')?.classList.add('btn--active');
    applyRangeAndRender();
}

export function getChartWrap(key) {
    const canvas = document.getElementById(CHART_CANVAS_IDS[key]);
    return canvas?.closest('.chart-wrap') ?? null;
}

export function resizeAllCharts() {
    if (resizeChartsFrame) {
        window.cancelAnimationFrame(resizeChartsFrame);
    }
    setResizeChartsFrame(window.requestAnimationFrame(() => {
        setResizeChartsFrame(null);
        document.querySelectorAll('.chart-wrap').forEach((wrap) => {
            const canvas = wrap.querySelector('canvas');
            const chart =
                canvas && typeof window.Chart !== 'undefined' ? window.Chart.getChart(canvas) : null;
            if (!chart) {
                return;
            }
            const rect = wrap.getBoundingClientRect();
            const width = Math.floor(rect.width);
            const height = Math.floor(rect.height);
            if (width > 0 && height > 0) {
                chart.resize(width, height);
            }
        });
    }));
}

export function setChartExpanded(key, expanded) {
    const wrap = getChartWrap(key);
    const btn = document.querySelector(`.btn-chart-height[data-chart-key="${key}"]`);
    const card = wrap?.closest('.chart-card');
    if (!wrap || !btn) {
        return;
    }

    wrap.classList.toggle('chart-wrap--expanded', expanded);
    card?.classList.toggle('chart-card--expanded', expanded);
    btn.classList.toggle('btn--active', expanded);
    btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    btn.textContent = expanded ? t('chartHeightStandard') : t('stretch');

    const chart = chartInstances[key];
    if (!chart) {
        return;
    }

    wrap.offsetHeight;
    resizeAllCharts();
    wrap.addEventListener('transitionend', () => resizeAllCharts(), { once: true });
}

export function initTimeWindowPan() {
    const canvas = document.getElementById('chart-overview-daily');
    const wrap = canvas?.closest('.chart-wrap--overview');
    if (!canvas || !wrap) {
        return;
    }

    let dragging = false;
    let startX = 0;
    let startEndMs = 0;
    let durationMs = 0;
    let rafId = 0;
    let pendingEndMs = null;

    function flushPendingPan() {
        if (pendingEndMs == null) {
            return;
        }
        const endMs = pendingEndMs;
        pendingEndMs = null;
        applyShiftedTimeWindow(endMs, durationMs);
        if (dataSource === 'live' || dataSource === 'merge') {
            applyRangeAndRender();
        } else {
            renderAll();
        }
    }

    function schedulePanRender() {
        if (rafId) {
            return;
        }
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            flushPendingPan();
        });
    }

    function endDrag() {
        if (!dragging) {
            return;
        }
        dragging = false;
        wrap.classList.remove('chart-wrap--time-pan-dragging');
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        flushPendingPan();
    }

    canvas.addEventListener('pointerdown', (event) => {
        if (!event.shiftKey || !canPanTimeWindow()) {
            return;
        }

        const metrics = getMetrics();
        const events = metrics.filterByUser(activeEvents(), userFilter);
        const bounds = metrics.resolveFilterBoundsMs(range, events);
        if (!bounds) {
            return;
        }

        dragging = true;
        startX = event.clientX;
        startEndMs = bounds.endMs;
        durationMs = bounds.durationMs;
        wrap.classList.add('chart-wrap--time-pan-dragging');
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!dragging) {
            return;
        }

        const chart = chartInstances.overview;
        const chartWidth = chart?.chartArea?.width;
        if (!chartWidth) {
            return;
        }

        const dx = event.clientX - startX;
        const deltaMs = -(dx / chartWidth) * durationMs;
        pendingEndMs = clampTimeWindowEndMs(startEndMs + deltaMs, durationMs);
        schedulePanRender();
        event.preventDefault();
    });

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Shift' && canPanTimeWindow()) {
            wrap.classList.add('chart-wrap--time-pan-ready');
        }
    });

    window.addEventListener('keyup', (event) => {
        if (event.key === 'Shift') {
            wrap.classList.remove('chart-wrap--time-pan-ready', 'chart-wrap--time-pan-dragging');
            endDrag();
        }
    });
}

export function initChartHelpButtons() {
    document.querySelectorAll('.chart-help-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const wasOpen = btn.classList.contains('is-open');
            document.querySelectorAll('.chart-help-btn.is-open').forEach((openBtn) => {
                openBtn.classList.remove('is-open');
                openBtn.setAttribute('aria-expanded', 'false');
            });
            if (!wasOpen) {
                btn.classList.add('is-open');
                btn.setAttribute('aria-expanded', 'true');
            }
        });
    });
    document.addEventListener('click', () => {
        document.querySelectorAll('.chart-help-btn.is-open').forEach((btn) => {
            btn.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
        });
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            document.querySelectorAll('.chart-help-btn.is-open').forEach((btn) => {
                btn.classList.remove('is-open');
                btn.setAttribute('aria-expanded', 'false');
            });
        }
    });
}

export function initChartControls() {
    initChartHelpButtons();
    document.querySelectorAll('.btn-chart-height').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.chartKey;
            const expanded = btn.getAttribute('aria-pressed') !== 'true';
            setChartExpanded(key, expanded);
        });
    });

    document.querySelectorAll('.btn-chart-zoom-reset:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', () => {
            chartInstances[btn.dataset.chartKey]?.resetZoom();
        });
    });

    window.addEventListener('resize', resizeAllCharts);

    if (typeof ResizeObserver !== 'undefined') {
        const layoutObserver = new ResizeObserver(resizeAllCharts);
        document.querySelectorAll('.dashboard-grid, .chart-wrap').forEach((el) => {
            layoutObserver.observe(el);
        });
    }

    initTimeWindowPan();
}

// Beim manuellen CSV-Laden sicherstellen, dass die geladenen Events auch sichtbar sind:
// Steht die Quelle auf "live", werden CSV-Events sonst gar nicht angezeigt. Wir wechseln
// dann auf "csv", damit die frisch geladene Datei sofort erscheint.
function ensureCsvVisibleOnManualLoad() {
    if (dataSource !== 'live') {
        return;
    }
    setDataSource('csv');
    localStorage.setItem(DATA_SOURCE_STORAGE_KEY, dataSource);
    const csvBtn = document.querySelector('[data-source="csv"]');
    if (csvBtn) {
        setActiveButtons('[data-source]', csvBtn);
    }
}

export function initToolbar() {
    const storedSourceBtn = document.querySelector(`[data-source="${dataSource}"]`);
    if (storedSourceBtn) {
        setActiveButtons('[data-source]', storedSourceBtn);
    }

    document.querySelectorAll('[data-source]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            setDataSource(btn.dataset.source);
            localStorage.setItem(DATA_SOURCE_STORAGE_KEY, dataSource);
            setActiveButtons('[data-source]', btn);
            if (dataSource === 'live' || dataSource === 'merge') {
                try {
                    await fetchLiveEvents();
                } catch (error) {
                    setStatus(error.message, true);
                    renderAll();
                }
            } else {
                renderAll();
            }
        });
    });

    document.querySelectorAll('[data-hours]').forEach((btn) => {
        btn.addEventListener('click', () => {
            applyPresetRange(Number(btn.dataset.hours), btn);
        });
    });

    document.querySelector('#time-range-group [data-all]')?.addEventListener('click', (event) => {
        setRange({
            mode: 'all',
            hours: DEFAULT_TIME_RANGE_HOURS,
            customFrom: '',
            customTo: '',
            windowEndMs: null,
            count: range.count,
            countFrom: range.countFrom,
            countTo: range.countTo,
        });
        setSavedTimeRange({
            mode: 'all',
            hours: DEFAULT_TIME_RANGE_HOURS,
            customFrom: '',
            customTo: '',
        });
        saveStoredTimeRange(savedTimeRange);
        clearRangeButtons();
        event.currentTarget.classList.add('btn--active');
        applyRangeAndRender();
    });

    document.querySelectorAll('[data-selection-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
            applySelectionMode(btn.dataset.selectionMode);
        });
    });

    document.querySelectorAll('[data-count]').forEach((btn) => {
        btn.addEventListener('click', () => {
            applyCountRange(Number(btn.dataset.count), btn);
        });
    });

    document.querySelector('[data-count-all]')?.addEventListener('click', (event) => {
        applyCountAll(event.currentTarget);
    });

    document.getElementById('count-custom-apply')?.addEventListener('click', applyCountCustomRange);

    document.getElementById('count-from')?.addEventListener('change', () => {
        if (range.mode === 'countRange') {
            applyCountCustomRange();
        }
    });

    document.getElementById('count-to')?.addEventListener('change', () => {
        if (range.mode === 'countRange') {
            applyCountCustomRange();
        }
    });

    if (selectionMode === 'count') {
        const saved = savedCountRange;
        setRange({
            mode: saved.mode === 'all' ? 'all' : saved.mode === 'countRange' ? 'countRange' : 'count',
            hours: 720,
            customFrom: '',
            customTo: '',
            windowEndMs: null,
            count: saved.count || 50,
            countFrom: saved.countFrom || 1,
            countTo: saved.countTo || saved.count || 50,
        });
    }
    updateSelectionModeUi();
    if (selectionMode === 'count') {
        syncCountRangeButtons();
    } else {
        syncTimeRangeButtons();
    }

    document.getElementById('custom-apply')?.addEventListener('click', applyCustomRange);
    document.getElementById('custom-reset')?.addEventListener('click', resetCustomRange);

    document.getElementById('custom-from')?.addEventListener('change', () => {
        const fromEl = document.getElementById('custom-from');
        const toEl = document.getElementById('custom-to');
        if (fromEl?.value && toEl?.value) {
            saveStoredCustomRange(fromEl.value, toEl.value);
        }
        if (range.mode === 'custom') {
            applyCustomRange();
        }
    });

    document.getElementById('custom-to')?.addEventListener('change', () => {
        const fromEl = document.getElementById('custom-from');
        const toEl = document.getElementById('custom-to');
        if (fromEl?.value && toEl?.value) {
            saveStoredCustomRange(fromEl.value, toEl.value);
        }
        if (range.mode === 'custom') {
            applyCustomRange();
        }
    });

    updateCustomDateBounds();

    const granularitySelect = document.getElementById('granularity-select');
    if (granularitySelect) {
        granularitySelect.value = granularity;
        granularitySelect.addEventListener('change', () => {
            setGranularity(granularitySelect.value);
            localStorage.setItem(GRANULARITY_STORAGE_KEY, granularity);
            renderAll();
        });
    }

    document.getElementById('csv-file-input')?.addEventListener('change', async (event) => {
        const files = [...(event.target.files || [])];
        if (!files.length) {
            return;
        }
        try {
            ensureCsvVisibleOnManualLoad();
            await loadCsvFiles(files);
        } catch (error) {
            setStatus(tf('csvError', { message: error.message }), true);
        }
    });

    document.getElementById('live-refresh-btn')?.addEventListener('click', async () => {
        try {
            await fetchLiveEvents({ force: true, incremental: true });
            setStatus(t('liveUpdated'));
        } catch (error) {
            setStatus(error.message, true);
        }
    });

    document.getElementById('export-json-btn')?.addEventListener('click', exportJson);

    document.getElementById('budget-save-btn')?.addEventListener('click', () => {
        const value = Number.parseFloat(document.getElementById('budget-input').value);
        if (Number.isFinite(value) && value >= 0) {
            localStorage.setItem(BUDGET_STORAGE_KEY, String(value));
            renderAll();
        }
    });

    const dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('drop-zone--active');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drop-zone--active');
    });
    dropZone.addEventListener('drop', async (event) => {
        event.preventDefault();
        dropZone.classList.remove('drop-zone--active');
        const files = [...event.dataTransfer.files].filter((f) =>
            f.name.toLowerCase().endsWith('.csv')
        );
        if (files.length) {
            try {
                ensureCsvVisibleOnManualLoad();
                await loadCsvFiles(files);
            } catch (error) {
                setStatus(tf('csvError', { message: error.message }), true);
            }
        }
    });

    const storedBudget = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (storedBudget != null) {
        document.getElementById('budget-input').value = storedBudget;
    }

    initChartControls();
}
