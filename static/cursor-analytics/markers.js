/**
 * Projekt-Marker: CRUD, Statistik, Chart-Annotationen, Export/Import, Server-Sync
 */
(function initCursorAnalyticsMarkers(global) {
    const STORAGE_KEY = 'cursor-usage-markers-v1';
    const LEGACY_STORAGE_KEY = 'cursor-event-chart-markers-v1';
    const MARKER_CHART_DISPLAY_STORAGE_KEY = 'cursor-marker-chart-display';
    const STORE_VERSION = 1;

    const DEFAULT_MARKER_CHART_DISPLAY = {
        showMarkers: true,
        showLabels: true,
        projectFilter: 'all',
        showTablePopover: true,
    };

    /** 10 Standard-Farben für Projekt-Marker (gut unterscheidbar auf dunklem Chart-Hintergrund). */
    const PROJECT_COLORS = [
        '#f0b429', // Gold
        '#3ecf8e', // Grün
        '#58a6ff', // Blau
        '#e8783a', // Orange
        '#a78bfa', // Violett
        '#f472b6', // Pink
        '#22d3ee', // Cyan
        '#f87171', // Koralle
        '#a3e635', // Limette
        '#818cf8', // Indigo
    ];

    function t(key) {
        return global.CursorAnalytics?.i18n?.t(key) ?? key;
    }

    function tf(key, params) {
        return global.CursorAnalytics?.i18n?.tf(key, params) ?? t(key);
    }

    function generateId() {
        if (global.crypto?.randomUUID) {
            return `m-${global.crypto.randomUUID()}`;
        }
        return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function emptyStore() {
        return { version: STORE_VERSION, markers: [] };
    }

    function readJsonStorage(key) {
        try {
            const raw = global.localStorage?.getItem(key);
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

    function writeJsonStorage(key, value) {
        try {
            global.localStorage?.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    const COMPOSER_MODES = Object.freeze({
        agent: 'markerModeAgents',
        edit: 'markerModeEditor',
    });

    const LEGACY_MODE_NOTE_RE = /^Modus:\s*(Agent|Edit)\b/i;

    function normalizeComposerMode(raw, note = '') {
        const mode = String(raw ?? '').trim().toLowerCase();
        if (mode === 'agent' || mode === 'edit' || mode === 'chat') {
            return mode;
        }
        const noteMatch = String(note ?? '').trim().match(LEGACY_MODE_NOTE_RE);
        if (noteMatch) {
            return noteMatch[1].toLowerCase() === 'edit' ? 'edit' : 'agent';
        }
        return null;
    }

    function resolveComposerMode(marker) {
        if (!marker || typeof marker !== 'object') {
            return 'agent';
        }
        const mode = normalizeComposerMode(marker.composerMode, marker.note);
        return mode === 'edit' ? 'edit' : 'agent';
    }

    function composerModeLabel(mode) {
        const normalized = normalizeComposerMode(mode);
        if (normalized === 'edit') {
            return t(COMPOSER_MODES.edit);
        }
        if (normalized === 'agent' || normalized === 'chat') {
            return t(COMPOSER_MODES.agent);
        }
        return '—';
    }

    function normalizeMarker(raw) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }
        const project = String(raw.project ?? '').trim();
        if (!project) {
            return null;
        }
        const start = raw.start ? new Date(raw.start) : null;
        if (!start || Number.isNaN(start.getTime())) {
            return null;
        }
        let end = null;
        if (raw.end) {
            const endDate = new Date(raw.end);
            if (!Number.isNaN(endDate.getTime())) {
                end = endDate.toISOString();
            }
        }
        const user = String(raw.user ?? 'info').trim() || 'info';
        const note = String(raw.note ?? '').trim();
        const composerMode = normalizeComposerMode(raw.composerMode, note);
        const now = new Date().toISOString();
        const marker = {
            id: String(raw.id || generateId()),
            user,
            start: start.toISOString(),
            end,
            project,
            task: String(raw.task ?? '').trim(),
            note,
            createdAt: raw.createdAt || now,
            updatedAt: raw.updatedAt || now,
        };
        if (composerMode) {
            marker.composerMode = composerMode;
        }
        return marker;
    }

    function migrateLegacyStore(legacy) {
        if (!legacy) {
            return null;
        }
        const markers = Array.isArray(legacy.markers) ? legacy.markers : Array.isArray(legacy) ? legacy : [];
        const normalized = markers.map(normalizeMarker).filter(Boolean);
        if (!normalized.length) {
            return null;
        }
        return { version: STORE_VERSION, markers: normalized };
    }

    function loadStore() {
        const current = readJsonStorage(STORAGE_KEY);
        if (current?.markers) {
            return {
                version: STORE_VERSION,
                markers: current.markers.map(normalizeMarker).filter(Boolean),
            };
        }

        const legacy = migrateLegacyStore(readJsonStorage(LEGACY_STORAGE_KEY));
        if (legacy) {
            writeJsonStorage(STORAGE_KEY, legacy);
            return legacy;
        }

        return emptyStore();
    }

    let memoryStore = loadStore();
    let syncPromise = null;

    function getStore() {
        return memoryStore;
    }

    function saveStoreLocal(store) {
        memoryStore = {
            version: STORE_VERSION,
            markers: (store.markers || []).map(normalizeMarker).filter(Boolean),
        };
        writeJsonStorage(STORAGE_KEY, memoryStore);
        return memoryStore;
    }

    async function saveStore(store, proxyBase = '') {
        const saved = saveStoreLocal(store);
        if (proxyBase !== null) {
            try {
                await pushToServer(saved, proxyBase);
            } catch {
                /* localStorage fallback — caller may show status */
            }
        }
        return saved;
    }

    function listMarkers({ user, from, to } = {}) {
        let markers = [...getStore().markers];
        if (user && user !== 'all') {
            markers = markers.filter((m) => m.user === user || m.user === 'all');
        }
        if (from) {
            const fromMs = new Date(from).getTime();
            markers = markers.filter((m) => new Date(m.start).getTime() >= fromMs);
        }
        if (to) {
            const toMs = new Date(to).getTime();
            markers = markers.filter((m) => new Date(m.start).getTime() <= toMs);
        }
        return markers.sort((a, b) => new Date(a.start) - new Date(b.start));
    }

    function upsertMarker(markerInput) {
        const marker = normalizeMarker({
            ...markerInput,
            updatedAt: new Date().toISOString(),
            createdAt: markerInput.createdAt || new Date().toISOString(),
        });
        if (!marker) {
            throw new Error(t('markerInvalid'));
        }
        const store = getStore();
        const index = store.markers.findIndex((m) => m.id === marker.id);
        if (index >= 0) {
            marker.createdAt = store.markers[index].createdAt;
            store.markers[index] = marker;
        } else {
            store.markers.push(marker);
        }
        return marker;
    }

    function removeMarker(id) {
        const store = getStore();
        store.markers = store.markers.filter((m) => m.id !== id);
        return store;
    }

    function eventTimeMs(event) {
        const t = event.timestamp ?? event.date;
        if (t instanceof Date) {
            return t.getTime();
        }
        return new Date(t).getTime();
    }

    function markersForUser(allMarkers, userId) {
        if (userId === 'all') {
            return [...allMarkers].sort((a, b) => new Date(a.start) - new Date(b.start));
        }
        return allMarkers
            .filter((m) => m.user === userId || m.user === 'all')
            .sort((a, b) => new Date(a.start) - new Date(b.start));
    }

    /** Neuester Marker ohne `end` für einen User (laufende Session). */
    function getActiveOpenMarker(userId) {
        const userMarkers = markersForUser(getStore().markers, userId);
        let active = null;
        for (const marker of userMarkers) {
            if (marker.end) {
                continue;
            }
            if (!active || new Date(marker.start) > new Date(active.start)) {
                active = marker;
            }
        }
        return active;
    }

    function loadMarkerChartDisplay() {
        try {
            const raw = global.localStorage?.getItem(MARKER_CHART_DISPLAY_STORAGE_KEY);
            if (!raw) {
                return { ...DEFAULT_MARKER_CHART_DISPLAY };
            }
            const parsed = JSON.parse(raw);
            return {
                showMarkers: parsed.showMarkers !== false,
                showLabels: parsed.showLabels !== false,
                projectFilter:
                    typeof parsed.projectFilter === 'string' ? parsed.projectFilter : 'all',
                showTablePopover: parsed.showTablePopover !== false,
            };
        } catch {
            return { ...DEFAULT_MARKER_CHART_DISPLAY };
        }
    }

    function saveMarkerChartDisplay(prefs) {
        try {
            global.localStorage?.setItem(
                MARKER_CHART_DISPLAY_STORAGE_KEY,
                JSON.stringify({
                    showMarkers: prefs.showMarkers !== false,
                    showLabels: prefs.showLabels !== false,
                    projectFilter: prefs.projectFilter || 'all',
                    showTablePopover: prefs.showTablePopover !== false,
                })
            );
        } catch {
            /* ignore quota / private mode */
        }
    }

    function filterChartMarkers(markers, chartContext = {}) {
        if (chartContext.showMarkers === false) {
            return [];
        }
        let visible = chartContext.user
            ? markersForUser(markers, chartContext.user)
            : [...markers].sort((a, b) => new Date(a.start) - new Date(b.start));
        const projectFilter = chartContext.projectFilter;
        if (projectFilter && projectFilter !== 'all') {
            visible = visible.filter((m) => m.project === projectFilter);
        }
        return visible;
    }

    function resolveIntervalEndMs(marker, sortedMarkers, filterEndMs) {
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

    function markerIntervalMs(marker, allMarkers, filterEndMs) {
        const startMs = new Date(marker.start).getTime();
        let endMs = marker.end
            ? new Date(marker.end).getTime()
            : resolveIntervalEndMs(marker, allMarkers, filterEndMs);
        if (endMs <= startMs) {
            endMs = startMs + 60_000;
        }
        return { startMs, endMs };
    }

    function computeStats(events, marker, allMarkers, filterEndMs) {
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

    function computeIntervalRows(events, markers, userId, filterEndMs) {
        const userMarkers = markersForUser(markers, userId);
        return userMarkers.map((marker) => ({
            marker,
            stats: computeStats(events, marker, markers, filterEndMs),
        }));
    }

    const MARKER_CATEGORY_SUGGESTIONS = [
        'Bugfix',
        'Feature',
        'Refactoring',
        'Analyse',
        'Dokumentation',
        'Suche',
    ];

    const UNMARKED_DIMENSION_KEY = '__unmarked__';

    function parseTaskCategory(task) {
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

    function aggregateEventsByMarkerDimension(events, markers, dimension) {
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

    function buildProjectColorMap(projects) {
        const unique = [...new Set(projects.filter(Boolean))].sort((a, b) =>
            a.localeCompare(b, 'de', { sensitivity: 'base' }),
        );
        return new Map(unique.map((name, index) => [name, PROJECT_COLORS[index % PROJECT_COLORS.length]]));
    }

    function projectColor(project, colorMapOrMarkers) {
        let colorMap = colorMapOrMarkers;
        if (Array.isArray(colorMapOrMarkers)) {
            colorMap = buildProjectColorMap(
                colorMapOrMarkers.map((entry) => (typeof entry === 'string' ? entry : entry?.project)),
            );
        }
        if (colorMap instanceof Map && colorMap.has(project)) {
            return colorMap.get(project);
        }
        return PROJECT_COLORS[0];
    }

    function bucketStartMs(bucket) {
        if (bucket.bucketStart instanceof Date) {
            return bucket.bucketStart.getTime();
        }
        return bucket.sortKey;
    }

    function bucketEndMs(buckets, index) {
        if (index + 1 < buckets.length) {
            return bucketStartMs(buckets[index + 1]);
        }
        return bucketStartMs(buckets[index]) + 1;
    }

    function bucketIndexRangeForInterval(buckets, startMs, endMs, options = {}) {
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
            const bucketEnd = bucketEndMs(buckets, i);
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

        if (xMin === null) {
            return null;
        }

        return { xMin, xMax };
    }

    /** @deprecated use bucketIndexRangeForInterval */
    function bucketIndexForTimestamp(buckets, timestampMs) {
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

    let popoverEl = null;
    let popoverHideTimer = null;
    let popoverMarkerId = null;
    let popoverPinned = false;

    function clearPopoverHideTimer() {
        if (popoverHideTimer) {
            clearTimeout(popoverHideTimer);
            popoverHideTimer = null;
        }
    }

    function isMouseOverPopover() {
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

    function ensurePopover() {
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

    function scheduleHidePopover(delayMs = 300) {
        clearPopoverHideTimer();
        popoverHideTimer = setTimeout(() => {
            if (isMouseOverPopover()) {
                popoverHideTimer = null;
                return;
            }
            hideChartPopover(true);
        }, delayMs);
    }

    function hideChartPopover(immediate = false) {
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

    function formatPopoverDate(iso, formatters) {
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

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function buildPopoverHtml(marker, chartContext) {
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

    function showChartPopover(marker, event, chartContext, ctx) {
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
        el.querySelector('.marker-chart-popover__body').innerHTML = buildPopoverHtml(marker, chartContext);

        el.hidden = false;
        positionPopoverStable(ctx, event);
    }

    /** Popover bei Tabellenzeilen-Hover (Position am Cursor, kein Chart-Kontext). */
    function showTableMarkerPopover(marker, nativeEvent, chartContext) {
        showChartPopover(marker, nativeEvent, chartContext, null);
    }

    function defaultHitWidthMs(chartContext) {
        if (chartContext.hitWidthMs) {
            return chartContext.hitWidthMs;
        }
        return 20 * 60 * 1000;
    }

    const CHART_LABEL_MAX_LEN = 28;
    const CHART_LABEL_LANE_HEIGHT = 22;
    const CHART_LABEL_OFFSET_LEFT = 6;
    const CHART_LABEL_OFFSET_TOP = 4;
    const CHART_LABEL_COLLISION_GAP = 0.12;

    function compactChartLabelText(marker) {
        const task = String(marker.task ?? '').trim();
        const project = String(marker.project ?? '').trim();
        let text = task || project;
        if (!text) {
            return '';
        }

        const parts = text.split(/\s*[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
        if (parts.length > 1) {
            const shortest = parts.reduce((a, b) => (a.length <= b.length ? a : b));
            const last = parts[parts.length - 1];
            if (shortest.length >= 4 && shortest.length <= CHART_LABEL_MAX_LEN) {
                text = shortest;
            } else if (last.length >= 4 && last.length <= CHART_LABEL_MAX_LEN) {
                text = last;
            }
        }

        if (text.length <= CHART_LABEL_MAX_LEN) {
            return text;
        }
        const splitAt = text.lastIndexOf(' ', CHART_LABEL_MAX_LEN);
        if (splitAt > 8) {
            return `${text.slice(0, splitAt)}…`;
        }
        return `${text.slice(0, CHART_LABEL_MAX_LEN - 1)}…`;
    }

    /** Einzeiliger Chart-Text — vollständige Details im Popover und per Hover. */
    function chartLabelContent(marker) {
        const text = compactChartLabelText(marker);
        return text ? [text] : [];
    }

    function labelTextFromContent(content) {
        if (Array.isArray(content)) {
            return content.join(' ').trim();
        }
        return String(content ?? '').trim();
    }

    function estimateLabelWidthUnits(content, mode) {
        const len = labelTextFromContent(content).length;
        if (mode === 'category') {
            return Math.max(2.4, len * 0.17);
        }
        return Math.max(25 * 60 * 1000, len * 3 * 60 * 1000);
    }

    function computeCollisionLabelLanes(placements) {
        const lanes = new Map();
        if (!placements.length) {
            return { lanes, maxLane: -1 };
        }

        const sorted = [...placements].sort((a, b) => a.x - b.x || String(a.id).localeCompare(String(b.id)));
        const laneEnds = [];

        for (const item of sorted) {
            let lane = 0;
            while (lane < laneEnds.length && item.x < laneEnds[lane] - CHART_LABEL_COLLISION_GAP) {
                lane += 1;
            }
            laneEnds[lane] = item.x + item.width;
            lanes.set(item.id, lane);
        }

        return { lanes, maxLane: laneEnds.length - 1 };
    }

    function collectMarkerLabelPlacements(visible, chartContext) {
        const { mode = 'time', buckets, markers, filterEndMs } = chartContext;
        const showLabels = chartContext.showLabels !== false;
        const canEdit = Boolean(chartContext.onEditMarker);
        const placements = [];

        for (const marker of visible) {
            let content = [];
            if (showLabels) {
                content = chartLabelContent(marker);
            } else if (canEdit) {
                content = ['✎'];
            }
            if (!content.length) {
                continue;
            }

            if (mode === 'category' && buckets?.length) {
                const { startMs, endMs } = markerIntervalMs(marker, markers, filterEndMs);
                const range = bucketIndexRangeForInterval(buckets, startMs, endMs, {
                    events: chartContext.events,
                    marker,
                });
                if (!range) {
                    continue;
                }
                placements.push({
                    id: marker.id,
                    x: range.xMin,
                    width: estimateLabelWidthUnits(content, 'category'),
                    content,
                });
                continue;
            }

            placements.push({
                id: marker.id,
                x: new Date(marker.start).getTime(),
                width: estimateLabelWidthUnits(content, 'time'),
                content,
            });
        }

        return placements;
    }

    function chartMarkerLabelTopPadding(markers, chartContext = {}) {
        return 0;
    }

    function chartMarkerLabelAnnotation({ content, laneIndex, color, xValue, labelInteraction = {} }) {
        const text = labelTextFromContent(content);
        if (!text) {
            return null;
        }
        const laneOffset = CHART_LABEL_OFFSET_TOP + laneIndex * CHART_LABEL_LANE_HEIGHT;
        return {
            type: 'label',
            xScaleID: 'x',
            yScaleID: 'y',
            xValue,
            yValue: (ctx) => ctx.chart.scales.y?.max ?? 0,
            content: text,
            color,
            backgroundColor: 'rgba(11, 17, 26, 0.94)',
            borderColor: `${color}66`,
            borderWidth: 1,
            font: { size: 10, weight: '600', lineHeight: 1.2 },
            padding: { top: 5, bottom: 3, left: 9, right: 6 },
            rotation: 0,
            textAlign: 'start',
            clip: false,
            borderRadius: 3,
            position: { x: 'start', y: 'start' },
            xAdjust: CHART_LABEL_OFFSET_LEFT,
            yAdjust: laneOffset,
            drawTime: 'afterDatasetsDraw',
            ...labelInteraction,
        };
    }

    function createLabelEditInteraction(marker, chartContext) {
        const canEdit = Boolean(chartContext.onEditMarker);
        return {
            click(ctx, event) {
                if (canEdit) {
                    chartContext.onEditMarker(marker);
                    hideChartPopover(true);
                    return;
                }
                showChartPopover(marker, event, chartContext, ctx);
            },
            enter(ctx, event) {
                showChartPopover(marker, event, chartContext, ctx);
            },
            leave() {
                if (popoverPinned && popoverMarkerId === marker.id) {
                    scheduleHidePopover(450);
                    return;
                }
                scheduleHidePopover(300);
            },
        };
    }

    function highlightTimeLineAnnotation(chart, markerId, borderWidth) {
        const lineKey = `marker-${markerId}`;
        const annotations = chart?.options?.plugins?.annotation?.annotations;
        if (annotations?.[lineKey]) {
            annotations[lineKey].borderWidth = borderWidth;
            return true;
        }
        return false;
    }

    function createAnnotationInteraction(marker, chartContext, role, colorMap) {
        return {
            enter(ctx, event) {
                showChartPopover(marker, event, chartContext, ctx);
                if (role === 'line-label' || role === 'hit') {
                    highlightTimeLineAnnotation(ctx.chart, marker.id, 4);
                } else if (role === 'box') {
                    const options = ctx.element?.options;
                    if (options) {
                        if (options.borderWidth != null) {
                            options.borderWidth = 4;
                        }
                        if (options.backgroundColor && String(options.backgroundColor).includes('18')) {
                            options.backgroundColor = `${projectColor(marker.project, colorMap)}33`;
                        }
                    }
                }
            },
            leave(ctx) {
                if (role === 'line-label' || role === 'hit') {
                    highlightTimeLineAnnotation(ctx.chart, marker.id, 2);
                } else if (role === 'box') {
                    const options = ctx.element?.options;
                    if (options) {
                        if (options.borderWidth != null) {
                            options.borderWidth = 1;
                        }
                        if (options.backgroundColor && String(options.backgroundColor).includes('33')) {
                            options.backgroundColor = `${projectColor(marker.project, colorMap)}18`;
                        }
                    }
                }
                if (popoverPinned && popoverMarkerId === marker.id) {
                    scheduleHidePopover(450);
                    return;
                }
                scheduleHidePopover(300);
            },
            click(ctx, event) {
                showChartPopover(marker, event, chartContext, ctx);
            },
        };
    }

    function toChartAnnotations(markers, chartContext = {}) {
        if (chartContext.showMarkers === false) {
            return {};
        }
        const { mode = 'time', buckets, filterEndMs } = chartContext;
        const visible = filterChartMarkers(markers, chartContext);
        const colorMap = buildProjectColorMap(markers.map((marker) => marker.project));
        const interactive = Boolean(chartContext.onEditMarker || chartContext.showPopover);
        const placements = collectMarkerLabelPlacements(visible, chartContext);
        const { lanes: labelLanes } = computeCollisionLabelLanes(placements);
        const contentById = new Map(placements.map((item) => [item.id, item.content]));
        const annotations = {};

        visible.forEach((marker, index) => {
            const color = projectColor(marker.project, colorMap);
            const laneIndex = labelLanes.get(marker.id) ?? 0;
            const labelContent = contentById.get(marker.id);
            const key = `marker-${marker.id || index}`;
            const interaction = interactive
                ? createAnnotationInteraction(marker, chartContext, 'box', colorMap)
                : {};
            const labelInteraction = interactive
                ? createLabelEditInteraction(marker, chartContext)
                : {};

            if (mode === 'category' && buckets?.length) {
                const { startMs, endMs } = markerIntervalMs(marker, markers, filterEndMs);
                const range = bucketIndexRangeForInterval(buckets, startMs, endMs, {
                    events: chartContext.events,
                    marker,
                });
                if (!range) {
                    return;
                }
                const { xMin, xMax } = range;

                annotations[key] = {
                    type: 'box',
                    xMin,
                    xMax,
                    backgroundColor: `${color}18`,
                    borderColor: color,
                    borderWidth: 1,
                    ...interaction,
                    label: { display: false },
                };

                if (labelContent) {
                    const labelAnn = chartMarkerLabelAnnotation({
                        content: labelContent,
                        laneIndex,
                        color,
                        xValue: xMin,
                        labelInteraction,
                    });
                    if (labelAnn) {
                        annotations[`${key}-label`] = labelAnn;
                    }
                }

                annotations[`${key}-line`] = {
                    type: 'line',
                    xMin,
                    xMax: xMin,
                    borderColor: color,
                    borderWidth: 2,
                    label: { display: false },
                };
                return;
            }

            const xValue = new Date(marker.start).getTime();
            const hitWidth = defaultHitWidthMs(chartContext);
            const lineInteraction = interactive
                ? createAnnotationInteraction(marker, chartContext, 'hit', colorMap)
                : {};

            if (interactive) {
                annotations[`${key}-hit`] = {
                    type: 'box',
                    xScaleID: 'x',
                    yScaleID: 'y',
                    xMin: xValue - hitWidth,
                    xMax: xValue + hitWidth,
                    yMin: (ctx) => ctx.chart.scales.y?.min ?? 0,
                    yMax: (ctx) => ctx.chart.scales.y?.max ?? 1,
                    backgroundColor: 'transparent',
                    borderWidth: 0,
                    drawTime: 'beforeDatasetsDraw',
                    ...lineInteraction,
                    label: { display: false },
                };
            }

            annotations[key] = {
                type: 'line',
                scaleID: 'x',
                value: xValue,
                borderColor: color,
                borderWidth: 2,
                borderDash: [4, 4],
                label: { display: false },
            };

            if (labelContent) {
                const labelAnn = chartMarkerLabelAnnotation({
                    content: labelContent,
                    laneIndex,
                    color,
                    xValue,
                    labelInteraction,
                });
                if (labelAnn) {
                    annotations[`${key}-label`] = labelAnn;
                }
            }
        });

        return annotations;
    }

    function annotationPluginOptions(markers, chartContext = {}) {
        const annotations = toChartAnnotations(markers, chartContext);
        if (!Object.keys(annotations).length) {
            return { annotations: {} };
        }
        return {
            interaction: {
                mode: 'nearest',
                axis: 'x',
            },
            annotations,
        };
    }

    function getMarkerForEvent(event, markers) {
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

    function exportStore() {
        return {
            version: STORE_VERSION,
            markers: getStore().markers,
            exportedAt: new Date().toISOString(),
        };
    }

    function importStore(payload, merge = true) {
        const incoming = Array.isArray(payload?.markers) ? payload.markers : [];
        const normalized = incoming.map(normalizeMarker).filter(Boolean);
        if (!merge) {
            return saveStoreLocal({ version: STORE_VERSION, markers: normalized });
        }

        const store = getStore();
        const byId = new Map(store.markers.map((m) => [m.id, m]));
        for (const marker of normalized) {
            byId.set(marker.id, marker);
        }
        return saveStoreLocal({ version: STORE_VERSION, markers: [...byId.values()] });
    }

    function getVisibleChartTimeMs(chart) {
        if (!chart?.scales?.x) {
            return Date.now();
        }
        const { min, max } = chart.scales.x;
        if (typeof min === 'number' && typeof max === 'number') {
            return Math.round((min + max) / 2);
        }
        return Date.now();
    }

    function toDatetimeLocalValue(isoString) {
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function fromDatetimeLocalValue(value) {
        if (!value) {
            return null;
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    async function fetchServerStore(proxyBase = '') {
        const response = await fetch(`${proxyBase}/api/markers`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    }

    async function pushToServer(store, proxyBase = '') {
        const response = await fetch(`${proxyBase}/api/markers`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(store),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    }

    function mergeStores(local, remote) {
        const byId = new Map();
        for (const marker of remote?.markers || []) {
            const normalized = normalizeMarker(marker);
            if (normalized) {
                byId.set(normalized.id, normalized);
            }
        }
        for (const marker of local?.markers || []) {
            const existing = byId.get(marker.id);
            if (!existing) {
                byId.set(marker.id, marker);
                continue;
            }
            const localUpdated = new Date(marker.updatedAt || marker.createdAt).getTime();
            const remoteUpdated = new Date(existing.updatedAt || existing.createdAt).getTime();
            if (localUpdated > remoteUpdated) {
                byId.set(marker.id, marker);
            }
        }
        return { version: STORE_VERSION, markers: [...byId.values()] };
    }

    async function syncFromServer(proxyBase = '') {
        if (syncPromise) {
            return syncPromise;
        }
        syncPromise = (async () => {
            try {
                const remote = await fetchServerStore(proxyBase);
                const merged = mergeStores(getStore(), remote);
                saveStoreLocal(merged);
                return { ok: true, source: 'server' };
            } catch {
                return { ok: false, source: 'local' };
            } finally {
                syncPromise = null;
            }
        })();
        return syncPromise;
    }

    global.CursorAnalytics = global.CursorAnalytics || {};
    global.CursorAnalytics.markers = {
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
        loadMarkerChartDisplay,
        saveMarkerChartDisplay,
        filterChartMarkers,
        syncFromServer,
        pushToServer,
    };
})(typeof window !== 'undefined' ? window : globalThis);
