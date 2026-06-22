// ES-Modul-Bootstrap: laedt parser/metrics/markers/charts/usersConfig/i18n und
// registriert sie auf window.CursorAnalytics (Bridge). Da dies ein statischer Import
// ist, sind alle Module fertig geladen, bevor der restliche Code hier laeuft.
import './bootstrap.js';
import {
    PROXY_BASE,
    USER_FILTER_STORAGE_KEY,
    CARD_COLLAPSE_STORAGE_KEY,
    LIVE_CACHE_TTL_MS,
    LIVE_INCREMENTAL_OVERLAP_MS,
    rebuildFormatters,
    numberFmt,
    dateTimeFmt,
    eventsByUser,
    liveEventsByUser,
    liveFetchState,
    liveUsersConfigured,
    lastAggregated,
    dataSource,
    userFilter,
    selectionMode,
    range,
    collapsedEventGroups,
    collapsedMarkerGroups,
    setEventsByUser,
    setLiveEventsByUser,
    setLiveFetchState,
    setLiveUsersConfigured,
    setLiveLoadingFlag,
    setUserFilter,
    setMarkerFocusId,
} from './app/state.js';
import {
    resolveToolPath,
    getMarkersApi,
    getParser,
    getMetrics,
    getI18n,
    t,
    tf,
    setStatus,
    setActiveButtons,
} from './app/services.js';
import {
    emptyEventsByUser,
    normalizeUserFilter,
    allLiveEvents,
    activeEvents,
    hasLiveData,
} from './app/data.js';
import {
    loadStoredMarkerFocusId,
    syncMarkerFocusUi,
    reconcileMarkerFocus,
    initMarkerChartDisplayUi,
    syncMarkerSortHeaders,
    initMarkerUi,
    buildMarkerUserSelect,
    refreshMarkerChartDisplayLabels,
} from './app/markers-ui.js';
import {
    updateProjectFilterOptions,
    syncEventsSortHeaders,
    initEventsSectionUi,
} from './app/events-ui.js';
import {
    updateCustomDateBounds,
    resizeAllCharts,
    initToolbar,
} from './app/controls.js';
import { renderAll } from './app/render.js';

async function fetchLiveUserConfig(force = false) {
    if (liveUsersConfigured && !force) {
        return liveUsersConfigured;
    }
    try {
        const response = await fetch(`${PROXY_BASE}/health`, { cache: 'no-store' });
        if (!response.ok) {
            return Object.fromEntries(getParser().USER_ORDER.map((id) => [id, false]));
        }
        const payload = await response.json();
        setLiveUsersConfigured(payload.users || {});
        return liveUsersConfigured;
    } catch {
        return Object.fromEntries(getParser().USER_ORDER.map((id) => [id, false]));
    }
}

function setLiveLoading(loading, message = null) {
    setLiveLoadingFlag(loading);
    const overlay = document.getElementById('live-loading');
    const text = document.getElementById('live-loading-text');
    const refreshBtn = document.getElementById('live-refresh-btn');
    const loadingMessage = message ?? t('liveLoading');

    if (overlay) {
        overlay.hidden = !loading;
        overlay.setAttribute('aria-busy', loading ? 'true' : 'false');
    }
    if (text) {
        text.textContent = loadingMessage;
    }

    document.querySelectorAll('[data-source]').forEach((btn) => {
        btn.disabled = loading;
    });
    if (refreshBtn) {
        refreshBtn.disabled = loading;
        refreshBtn.classList.toggle('btn--loading', loading);
        refreshBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
    }
}

function syncChartHeightLabels() {
    document.querySelectorAll('.btn-chart-height').forEach((btn) => {
        const expanded = btn.getAttribute('aria-pressed') === 'true';
        btn.textContent = expanded ? t('chartHeightStandard') : t('stretch');
    });
}

function buildUserFilterToolbar() {
    const host = document.getElementById('user-filter-toolbar');
    if (!host) {
        return;
    }
    const label = host.querySelector('.toolbar-label');
    const allBtn = host.querySelector('[data-user="all"]');
    host.querySelectorAll('[data-user]:not([data-user="all"])').forEach((el) => el.remove());
    const { USER_ORDER, USERS } = getParser();
    for (const userId of USER_ORDER) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.dataset.user = userId;
        btn.textContent = USERS[userId]?.label || userId;
        host.appendChild(btn);
    }
    if (label) {
        label.textContent = t('users');
    }
    if (allBtn) {
        allBtn.textContent = t('usersAll');
    }
    const storedUserBtn = document.querySelector(`[data-user="${userFilter}"]`);
    if (storedUserBtn) {
        setActiveButtons('[data-user]', storedUserBtn);
    }
    host.querySelectorAll('[data-user]').forEach((btn) => {
        btn.addEventListener('click', () => {
            setUserFilter(btn.dataset.user);
            localStorage.setItem(USER_FILTER_STORAGE_KEY, userFilter);
            setActiveButtons('[data-user]', btn);
            renderAll();
        });
    });
}

function applyI18nLabels() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = t(key);
        }
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        const key = el.getAttribute('data-i18n-aria');
        if (key) {
            el.setAttribute('aria-label', t(key));
        }
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.getAttribute('data-i18n-title');
        if (key) {
            el.setAttribute('title', t(key));
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
            el.setAttribute('placeholder', t(key));
        }
    });
    refreshMarkerChartDisplayLabels();
    syncChartHeightLabels();
    syncEventsSortHeaders();
    syncMarkerSortHeaders();
    syncEventGroupsToggleButton();
    syncMarkerGroupsToggleButton();
    syncMarkerFocusUi();
    syncCardCollapseLabels();
    const locale = getI18n()?.getLocale() || 'de';
    document.querySelectorAll('[data-locale]').forEach((btn) => {
        btn.classList.toggle('btn--active', btn.dataset.locale === locale);
    });
}

function loadCollapsedCards() {
    try {
        const raw = localStorage.getItem(CARD_COLLAPSE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveCollapsedCards(state) {
    localStorage.setItem(CARD_COLLAPSE_STORAGE_KEY, JSON.stringify(state));
}

function getCardToggleTitle(toggle) {
    return toggle.querySelector('.card__title')?.textContent?.trim() || '';
}

function syncCardCollapseToggleLabel(toggle, collapsed) {
    const title = getCardToggleTitle(toggle);
    toggle.setAttribute(
        'aria-label',
        tf(collapsed ? 'expandCard' : 'collapseCard', { title })
    );
}

function syncCardCollapseLabels() {
    document.querySelectorAll('.card--collapsible .card__toggle').forEach((toggle) => {
        const card = toggle.closest('.card--collapsible');
        syncCardCollapseToggleLabel(toggle, card?.classList.contains('card--collapsed') === true);
    });
}

function setCardCollapsed(card, toggle, body, collapsed) {
    card.classList.toggle('card--collapsed', collapsed);
    body.hidden = collapsed;
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    syncCardCollapseToggleLabel(toggle, collapsed);
}

function initCardCollapse() {
    const collapsedState = loadCollapsedCards();
    document.querySelectorAll('.dashboard-grid > .card--collapsible').forEach((card) => {
        const cardId = card.dataset.cardId;
        const toggle = card.querySelector('.card__toggle');
        const body = card.querySelector('.card__body');
        if (!cardId || !toggle || !body) {
            return;
        }

        setCardCollapsed(card, toggle, body, collapsedState[cardId] === true);

        toggle.addEventListener('click', () => {
            const collapsed = card.classList.contains('card--collapsed');
            setCardCollapsed(card, toggle, body, !collapsed);
            collapsedState[cardId] = !collapsed;
            saveCollapsedCards(collapsedState);
            if (collapsed) {
                resizeAllCharts();
            }
        });
    });
    syncCardCollapseLabels();
}

function initLocaleSwitcher() {
    document.querySelectorAll('[data-locale]').forEach((btn) => {
        btn.addEventListener('click', () => {
            getI18n()?.switchLocale(btn.dataset.locale);
            rebuildFormatters();
            applyI18nLabels();
            buildUserFilterToolbar();
            buildMarkerUserSelect();
            renderAll();
        });
    });
    getI18n()?.onLocaleChange(() => {
        rebuildFormatters();
        applyI18nLabels();
    });
    applyI18nLabels();
}

function getTableGroupHeaderKeys(tableSelector, keyAttr) {
    return [...document.querySelectorAll(`${tableSelector} .usage-table__group-header--toggle[${keyAttr}]`)]
        .map((row) => row.getAttribute(keyAttr))
        .filter(Boolean);
}

function setAllTableGroupsCollapsed({ tableSelector, keyAttr, memberAttr, collapsedSet }) {
    const keys = getTableGroupHeaderKeys(tableSelector, keyAttr);
    if (!keys.length) {
        return;
    }
    const collapse = !keys.every((key) => collapsedSet.has(key));
    for (const key of keys) {
        if (collapse) {
            collapsedSet.add(key);
        } else {
            collapsedSet.delete(key);
        }
        const header = document.querySelector(
            `${tableSelector} .usage-table__group-header--toggle[${keyAttr}="${CSS.escape(key)}"]`
        );
        header?.classList.toggle('usage-table__group-header--collapsed', collapse);
        document
            .querySelectorAll(`${tableSelector} [${memberAttr}="${CSS.escape(key)}"]`)
            .forEach((member) => {
                member.hidden = collapse;
            });
    }
}

function syncTableGroupsToggleButton(btn, tableSelector, keyAttr, collapsedSet) {
    if (!btn) {
        return;
    }
    const keys = getTableGroupHeaderKeys(tableSelector, keyAttr);
    btn.disabled = keys.length === 0;
    if (!keys.length) {
        return;
    }
    const allCollapsed = keys.every((key) => collapsedSet.has(key));
    btn.textContent = allCollapsed ? t('expandAllGroups') : t('collapseAllGroups');
    btn.setAttribute('aria-pressed', allCollapsed ? 'true' : 'false');
}

export function syncEventGroupsToggleButton() {
    syncTableGroupsToggleButton(
        document.getElementById('events-groups-toggle-all'),
        '.usage-table--events',
        'data-group-key',
        collapsedEventGroups
    );
}

export function syncMarkerGroupsToggleButton() {
    syncTableGroupsToggleButton(
        document.getElementById('marker-groups-toggle-all'),
        '.usage-table--markers',
        'data-marker-group-key',
        collapsedMarkerGroups
    );
}

export function toggleAllEventGroups() {
    setAllTableGroupsCollapsed({
        tableSelector: '.usage-table--events',
        keyAttr: 'data-group-key',
        memberAttr: 'data-group-member',
        collapsedSet: collapsedEventGroups,
    });
    syncEventGroupsToggleButton();
}

export function toggleAllMarkerGroups() {
    setAllTableGroupsCollapsed({
        tableSelector: '.usage-table--markers',
        keyAttr: 'data-marker-group-key',
        memberAttr: 'data-marker-group-member',
        collapsedSet: collapsedMarkerGroups,
    });
    syncMarkerGroupsToggleButton();
}

async function fetchCsvText(path) {
    const response = await fetch(`${resolveToolPath(path)}?v=${Date.now()}`, {
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(`${path}: HTTP ${response.status}`);
    }
    return response.text();
}

async function loadDefaultCsvs() {
    const { USER_ORDER, USERS, parseUsageEventsCsv, mergeEvents } = getParser();
    const nextEventsByUser = emptyEventsByUser();
    const loadSummary = {};
    const loadedLabels = [];
    const failed = [];

    for (const userId of USER_ORDER) {
        const texts = [];
        for (const path of USERS[userId].defaultPaths) {
            try {
                texts.push(await fetchCsvText(path));
                loadedLabels.push(path.replace('./data/', ''));
            } catch (error) {
                failed.push(String(error?.message || error));
            }
        }
        if (texts.length) {
            const mergeResult = mergeEvents(
                texts.map((text) => parseUsageEventsCsv(text, userId))
            );
            nextEventsByUser[userId] = mergeResult.events;
            loadSummary[userId] = mergeResult;
        }
    }

    setEventsByUser(nextEventsByUser);

    const hintParts = USER_ORDER.map((userId) => {
        const summary = loadSummary[userId];
        if (!summary) {
            return null;
        }
        return `${userId}: ${numberFmt.format(summary.events.length)} Events`;
    }).filter(Boolean);

    document.getElementById('load-hint').textContent =
        loadedLabels.length
            ? tf('loadHintCsv', {
                files: loadedLabels.join(' + '),
                counts: hintParts.join(' · '),
            })
            : t('loadHintNoDefault');

    if (failed.length) {
        document.getElementById('load-hint').textContent += tf('loadHintWarning', {
            warnings: failed.join('; '),
        });
    }

    updateCustomDateBounds();
    await applyRangeAndRender();
}

export async function loadCsvFiles(files) {
    const { USER_ORDER, parseUsageEventsCsv, mergeEvents, detectUserFromFilename } =
        getParser();
    const parsedByUser = emptyEventsByUser();

    for (const file of files) {
        const userId = detectUserFromFilename(file.name);
        const text = await file.text();
        parsedByUser[userId].push(parseUsageEventsCsv(text, userId));
    }

    for (const userId of USER_ORDER) {
        if (parsedByUser[userId].length) {
            const mergeResult = mergeEvents(parsedByUser[userId]);
            eventsByUser[userId] = mergeResult.events;
        }
    }

    document.getElementById('load-hint').textContent = tf('loadHintLoaded', {
        files: files.map((f) => f.name).join(', '),
    });
    updateCustomDateBounds();
    renderAll();
}

function desiredLiveBounds() {
    const metrics = getMetrics();
    const events = metrics.filterByUser(activeEvents(), userFilter);
    return metrics.liveFetchBoundsMs(range, Date.now(), selectionMode, events);
}

function liveCacheUsable(desiredBounds) {
    if (!hasLiveData()) {
        return false;
    }
    if (Date.now() - liveFetchState.fetchedAt > LIVE_CACHE_TTL_MS) {
        return false;
    }
    return getMetrics().liveBoundsContains(liveFetchState.bounds, desiredBounds);
}

function liveBoundsQuery(bounds) {
    if (!bounds) {
        return '';
    }
    const params = new URLSearchParams({
        startDate: String(bounds.startMs),
        endDate: String(bounds.endMs),
    });
    return `&${params.toString()}`;
}

function formatLiveFetchScope(bounds) {
    if (!bounds) {
        return t('liveFullHistory');
    }
    return `${dateTimeFmt.format(new Date(bounds.startMs))} – ${dateTimeFmt.format(new Date(bounds.endMs))}`;
}

function updateLiveLoadHint(nextLive, { cached = false, scopeBounds = null } = {}) {
    const { USER_ORDER } = getParser();
    const counts = USER_ORDER.map(
        (id) => `${id}: ${numberFmt.format((nextLive[id] || []).length)}`
    ).join(' · ');
    const scope = formatLiveFetchScope(scopeBounds ?? liveFetchState.bounds);
    const ageMin = cached
        ? Math.max(1, Math.round((Date.now() - liveFetchState.fetchedAt) / 60000))
        : 0;
    const prefix = cached
        ? tf('livePrefixCached', { minutes: ageMin })
        : t('livePrefix');
    document.getElementById('load-hint').textContent = tf('liveHint', { prefix, counts, scope });
}

export async function applyRangeAndRender() {
    updateCustomDateBounds();
    if (dataSource === 'live' || dataSource === 'merge') {
        try {
            await fetchLiveEvents();
        } catch (error) {
            setStatus(error.message, true);
            renderAll();
        }
        return;
    }
    renderAll();
}

export async function fetchLiveEvents({ force = false, incremental = false } = {}) {
    const { USER_ORDER, normalizeApiEvent, mergeEvents } = getParser();
    const metrics = getMetrics();
    const desiredBounds = desiredLiveBounds();
    const userConfig = await fetchLiveUserConfig(force);
    const usersToFetch = USER_ORDER.filter((userId) => userConfig[userId]);

    if (!usersToFetch.length) {
        throw new Error(t('liveTokenMissing'));
    }

    if (force && window.CursorAnalytics?.markers?.syncFromServer) {
        await window.CursorAnalytics.markers.syncFromServer(PROXY_BASE);
    }

    if (!force && liveCacheUsable(desiredBounds)) {
        updateLiveLoadHint(liveEventsByUser, { cached: true, scopeBounds: desiredBounds });
        renderAll();
        return;
    }

    let fetchBounds = desiredBounds;
    if (incremental && hasLiveData() && desiredBounds) {
        const newestMs = Math.max(
            ...allLiveEvents().map((event) => event.timestamp.getTime())
        );
        fetchBounds = {
            startMs: Math.max(
                desiredBounds.startMs,
                newestMs - LIVE_INCREMENTAL_OVERLAP_MS
            ),
            endMs: desiredBounds.endMs,
        };
        if (fetchBounds.startMs >= fetchBounds.endMs) {
            updateLiveLoadHint(liveEventsByUser, { cached: true, scopeBounds: desiredBounds });
            setStatus(t('liveUpToDate'));
            renderAll();
            return;
        }
    }

    const nextLive = emptyEventsByUser();
    for (const userId of USER_ORDER) {
        if (!usersToFetch.includes(userId)) {
            nextLive[userId] = liveEventsByUser[userId] || [];
        }
    }
    const errors = [];
    const scopeLabel = formatLiveFetchScope(fetchBounds);

    setLiveLoading(true, tf('liveLoadingScope', { scope: scopeLabel }));

    try {
        const results = await Promise.all(
            usersToFetch.map(async (userId) => {
                try {
                    const response = await fetch(
                        `${PROXY_BASE}/api/events?user=${encodeURIComponent(userId)}${liveBoundsQuery(fetchBounds)}`,
                        { cache: 'no-store' }
                    );
                    if (!response.ok) {
                        const body = await response.json().catch(() => ({}));
                        throw new Error(body.error || `HTTP ${response.status}`);
                    }
                    const payload = await response.json();
                    const fetched = (payload.events || [])
                        .map((raw) => normalizeApiEvent(raw, userId))
                        .sort((a, b) => a.timestamp - b.timestamp);
                    const existing = liveEventsByUser[userId] || [];
                    const merged =
                        incremental || existing.length
                            ? mergeEvents([existing, fetched]).events
                            : fetched;
                    return { userId, events: merged };
                } catch (error) {
                    errors.push(`${userId}: ${error.message}`);
                    const existing = liveEventsByUser[userId] || [];
                    return { userId, events: existing };
                }
            })
        );

        for (const { userId, events } of results) {
            nextLive[userId] = events;
        }

        setLiveEventsByUser(nextLive);
        setLiveFetchState({
            fetchedAt: Date.now(),
            bounds: metrics.mergeLiveBounds(liveFetchState.bounds, fetchBounds),
        });

        if (errors.length && errors.length === usersToFetch.length) {
            throw new Error(tf('liveServerError', { errors: errors.join(' · ') }));
        }

        if (errors.length) {
            document.getElementById('load-hint').textContent = tf('livePartial', {
                errors: errors.join(' · '),
            });
        } else {
            updateLiveLoadHint(nextLive, { scopeBounds: liveFetchState.bounds });
        }

        updateCustomDateBounds();
        renderAll();
    } finally {
        setLiveLoading(false);
    }
}

export function exportJson() {
    if (!lastAggregated) {
        setStatus(t('exportEmpty'), true);
        return;
    }

    const payload = {
        ...lastAggregated,
        markers: getMarkersApi()?.exportStore() ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cursor-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
}

async function initWhenReady(attempt = 0) {
    if (typeof window.Chart === 'undefined') {
        if (attempt > 200) {
            setStatus(t('chartJsMissing'), true);
            return;
        }
        window.setTimeout(() => initWhenReady(attempt + 1), 50);
        return;
    }

    const annotationPlugin =
        window.chartjsPluginAnnotation || window.ChartAnnotation;
    if (annotationPlugin) {
        window.Chart.register(annotationPlugin);
    }

    await window.CursorAnalytics.markers.syncFromServer(PROXY_BASE);
    setMarkerFocusId(loadStoredMarkerFocusId());
    reconcileMarkerFocus();
    await window.CursorAnalytics.usersConfig.loadUsersConfig();
    setEventsByUser(emptyEventsByUser());
    setLiveEventsByUser(emptyEventsByUser());
    normalizeUserFilter();
    buildUserFilterToolbar();
    buildMarkerUserSelect();
    initLocaleSwitcher();
    initCardCollapse();
    updateProjectFilterOptions();
    initMarkerUi();
    initMarkerChartDisplayUi();
    initEventsSectionUi();
    initToolbar();
    loadDefaultCsvs();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhenReady);
} else {
    initWhenReady();
}