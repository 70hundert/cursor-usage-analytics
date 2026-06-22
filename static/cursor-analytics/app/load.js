/**
 * CSV/Live data loading, live-fetch orchestration, and JSON export.
 */
import {
    PROXY_BASE,
    LIVE_CACHE_TTL_MS,
    LIVE_INCREMENTAL_OVERLAP_MS,
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
    setEventsByUser,
    setLiveEventsByUser,
    setLiveFetchState,
    setLiveUsersConfigured,
    setLiveLoadingFlag,
} from './state.js';
import {
    resolveToolPath,
    getMarkersApi,
    getParser,
    getMetrics,
    t,
    tf,
    setStatus,
} from './services.js';
import {
    emptyEventsByUser,
    allLiveEvents,
    activeEvents,
    hasLiveData,
} from './data.js';
import { updateCustomDateBounds } from './custom-range.js';
import { renderAll } from './render.js';

async function fetchLiveUserConfig(force = false) {
    if (liveUsersConfigured && !force) {
        return liveUsersConfigured;
    }
    try {
        const response = await fetch(`${PROXY_BASE}/api/users`, { cache: 'no-store' });
        if (!response.ok) {
            return Object.fromEntries(getParser().USER_ORDER.map((id) => [id, false]));
        }
        const payload = await response.json();
        const userTokenMap = {};
        for (const user of payload.users || []) {
            userTokenMap[user.id] = user.hasToken || false;
        }
        setLiveUsersConfigured(userTokenMap);
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

async function fetchCsvText(path) {
    const response = await fetch(`${resolveToolPath(path)}?v=${Date.now()}`, {
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(`${path}: HTTP ${response.status}`);
    }
    return response.text();
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

export async function loadDefaultCsvs() {
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
    const nextEventsByUser = { ...eventsByUser };

    for (const file of files) {
        const userId = detectUserFromFilename(file.name);
        const text = await file.text();
        parsedByUser[userId].push(parseUsageEventsCsv(text, userId));
    }

    for (const userId of USER_ORDER) {
        if (parsedByUser[userId].length) {
            const mergeResult = mergeEvents(parsedByUser[userId]);
            nextEventsByUser[userId] = mergeResult.events;
        }
    }

    setEventsByUser(nextEventsByUser);

    document.getElementById('load-hint').textContent = tf('loadHintLoaded', {
        files: files.map((f) => f.name).join(', '),
    });
    updateCustomDateBounds();
    renderAll();
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

    if (force && getMarkersApi()?.syncFromServer) {
        await getMarkersApi().syncFromServer(PROXY_BASE);
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
                        .map((raw) => {
                            try {
                                return normalizeApiEvent(raw, userId);
                            } catch (error) {
                                console.warn('[load] Failed to normalize API event:', error);
                                return null;
                            }
                        })
                        .filter(Boolean)
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
