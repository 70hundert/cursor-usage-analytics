/**
 * Events-UI: Events-Tabelle (Filter, Sortierung, Gruppierung, Pagination, Stats-Header)
 * inkl. CSV/JSON-Export der gefilterten Events sowie der Projekt-Filter der Events-Sektion.
 *
 * Haengt an state.js, services.js und markers-ui.js (eventsForDashboard). Einige noch in
 * main.js verbliebene Helfer (userRowClass, Event-Gruppen-Toggle) werden transitorisch
 * aus ../main.js importiert, bis render/controls ausgelagert sind.
 */
import {
    EVENTS_PAGE_SIZE_OPTIONS,
    EVENTS_PAGE_SIZE_STORAGE_KEY,
    EVENTS_UNMARKED_KEY,
    numberFmt,
    currencyFmt,
    dateTimeFmt,
    dataSource,
    userFilter,
    selectionMode,
    range,
    projectFilter,
    setProjectFilter,
    eventsFilterKey,
    setEventsFilterKey,
    eventsGroupMode,
    setEventsGroupMode,
    eventsPageSize,
    setEventsPageSize,
    eventsPageIndex,
    setEventsPageIndex,
    eventsModelFilter,
    setEventsModelFilter,
    eventsKindFilter,
    setEventsKindFilter,
    eventsMaxModeFilter,
    setEventsMaxModeFilter,
    eventsMinCostUsd,
    setEventsMinCostUsd,
    eventsIncludedOnly,
    setEventsIncludedOnly,
    eventsSortColumn,
    setEventsSortColumn,
    eventsSortDir,
    setEventsSortDir,
    collapsedEventGroups,
} from './state.js';
import {
    t,
    tf,
    getMarkersApi,
    getMetrics,
    csvEscape,
    downloadText,
} from './services.js';
import { eventsForDashboard } from './markers-ui.js';
import {
    syncEventGroupsToggleButton,
    toggleAllEventGroups,
} from '../main.js';
import { userRowClass } from './render.js';

export function updateProjectFilterOptions() {
    const select = document.getElementById('project-filter');
    const api = getMarkersApi();
    if (!select || !api) {
        return;
    }
    const projects = [...new Set(api.getStore().markers.map((m) => m.project).filter(Boolean))].sort();
    const current = projectFilter;
    select.innerHTML =
        `<option value="all">${t('allProjects')}</option>` +
        projects
            .map(
                (project) =>
                    `<option value="${project.replace(/"/g, '&quot;')}">${project}</option>`
            )
            .join('');
    select.value = projects.includes(current) || current === 'all' ? current : 'all';
    setProjectFilter(select.value);
}

export function eventsForTable() {
    let events = eventsForDashboard();
    if (projectFilter !== 'all') {
        const api = getMarkersApi();
        if (api) {
            events = events.filter((event) => {
                const marker = api.getMarkerForEvent(event, api.getStore().markers);
                return marker?.project === projectFilter;
            });
        }
    }
    if (eventsModelFilter !== 'all') {
        events = events.filter((event) => event.model === eventsModelFilter);
    }
    if (eventsKindFilter !== 'all') {
        events = events.filter((event) => event.kind === eventsKindFilter);
    }
    if (eventsMaxModeFilter !== 'all') {
        const metrics = getMetrics();
        events = events.filter(
            (event) => metrics.normalizeMaxMode(event.maxMode) === eventsMaxModeFilter
        );
    }
    if (eventsIncludedOnly) {
        events = events.filter((event) => event.isIncluded);
    }
    const minCents = Math.round(eventsMinCostUsd * 100);
    if (minCents > 0) {
        events = events.filter((event) => event.costCents >= minCents);
    }
    return events;
}

export function updateEventsFilterOptions(events) {
    const modelSelect = document.getElementById('events-model-filter');
    const kindSelect = document.getElementById('events-kind-filter');
    const maxModeSelect = document.getElementById('events-maxmode-filter');
    if (!modelSelect || !kindSelect || !maxModeSelect) {
        return;
    }
    const metrics = getMetrics();
    const models = [...new Set(events.map((e) => e.model).filter(Boolean))].sort();
    const kinds = [...new Set(events.map((e) => e.kind).filter(Boolean))].sort();
    const maxModes = [
        ...new Set(events.map((e) => metrics.normalizeMaxMode(e.maxMode)).filter(Boolean)),
    ].sort((a, b) => (a === 'Yes' ? -1 : b === 'Yes' ? 1 : 0));
    const currentModel = eventsModelFilter;
    const currentKind = eventsKindFilter;
    const currentMaxMode = eventsMaxModeFilter;
    modelSelect.innerHTML =
        `<option value="all">${t('allModels')}</option>` +
        models.map((m) => `<option value="${m.replace(/"/g, '&quot;')}">${m}</option>`).join('');
    kindSelect.innerHTML =
        `<option value="all">${t('allKinds')}</option>` +
        kinds.map((k) => `<option value="${k.replace(/"/g, '&quot;')}">${k}</option>`).join('');
    maxModeSelect.innerHTML =
        `<option value="all">${t('allMaxModes')}</option>` +
        maxModes
            .map((mode) => {
                const label = mode === 'Yes' ? t('maxModeYes') : t('maxModeNo');
                return `<option value="${mode.replace(/"/g, '&quot;')}">${label}</option>`;
            })
            .join('');
    modelSelect.value = models.includes(currentModel) || currentModel === 'all' ? currentModel : 'all';
    kindSelect.value = kinds.includes(currentKind) || currentKind === 'all' ? currentKind : 'all';
    maxModeSelect.value =
        maxModes.includes(currentMaxMode) || currentMaxMode === 'all' ? currentMaxMode : 'all';
    setEventsModelFilter(modelSelect.value);
    setEventsKindFilter(kindSelect.value);
    setEventsMaxModeFilter(maxModeSelect.value);
}

export function sortEventsForTable(events) {
    const dir = eventsSortDir === 'asc' ? 1 : -1;
    return [...events].sort((a, b) => {
        let av;
        let bv;
        switch (eventsSortColumn) {
            case 'user':
                av = a.userLabel;
                bv = b.userLabel;
                break;
            case 'model':
                av = a.model;
                bv = b.model;
                break;
            case 'kind':
                av = a.kind;
                bv = b.kind;
                break;
            case 'output':
                av = a.outputTokens;
                bv = b.outputTokens;
                break;
            case 'total':
                av = a.totalTokens;
                bv = b.totalTokens;
                break;
            case 'cost':
                av = a.costCents;
                bv = b.costCents;
                break;
            default:
                av = a.timestamp.getTime();
                bv = b.timestamp.getTime();
                break;
        }
        if (av < bv) {
            return -dir;
        }
        if (av > bv) {
            return dir;
        }
        return 0;
    });
}

export function exportFilteredEventsCsv() {
    const events = sortEventsForTable(eventsForTable());
    const header = [
        'Date',
        'User',
        'Model',
        'Kind',
        'Input w Cache Write',
        'Input w/o Cache',
        'Cache Read',
        'Output',
        'Total',
        'Cost',
    ];
    const lines = [header.join(',')];
    for (const event of events) {
        lines.push(
            [
                event.timestamp.toISOString(),
                event.userLabel,
                event.model,
                event.kind,
                event.inputWithCacheWrite,
                event.inputNoCache,
                event.cacheRead,
                event.outputTokens,
                event.totalTokens,
                formatEventCost(event),
            ]
                .map(csvEscape)
                .join(',')
        );
    }
    downloadText(
        `cursor-events-${new Date().toISOString().slice(0, 10)}.csv`,
        lines.join('\n'),
        'text/csv;charset=utf-8'
    );
}

export function exportFilteredEventsJson() {
    const events = sortEventsForTable(eventsForTable());
    downloadText(
        `cursor-events-${new Date().toISOString().slice(0, 10)}.json`,
        JSON.stringify(events, null, 2),
        'application/json'
    );
}

export function getEventsSortHeaderTitle(col) {
    if (col !== eventsSortColumn) {
        return t('sortClick');
    }
    return eventsSortDir === 'asc' ? t('sortAsc') : t('sortDesc');
}

export function syncEventsSortHeaders() {
    document.querySelectorAll('.usage-table--events th[data-sort-col]').forEach((th) => {
        const col = th.getAttribute('data-sort-col');
        th.classList.toggle('sort-active', col === eventsSortColumn);
        th.classList.toggle('sort-desc', col === eventsSortColumn && eventsSortDir === 'desc');
        th.title = getEventsSortHeaderTitle(col);
    });
}

export function getEventsPageSizeFromButton(btn) {
    return Number.parseInt(btn.getAttribute('data-events-page-size'), 10);
}

export function initEventsSectionUi() {
    document.getElementById('project-filter')?.addEventListener('change', (event) => {
        setProjectFilter(event.target.value);
        setEventsPageIndex(0);
        renderEventsTable(eventsForTable());
    });

    document.getElementById('events-model-filter')?.addEventListener('change', (event) => {
        setEventsModelFilter(event.target.value);
        setEventsPageIndex(0);
        renderEventsTable(eventsForTable());
    });

    document.getElementById('events-kind-filter')?.addEventListener('change', (event) => {
        setEventsKindFilter(event.target.value);
        setEventsPageIndex(0);
        renderEventsTable(eventsForTable());
    });

    document.getElementById('events-maxmode-filter')?.addEventListener('change', (event) => {
        setEventsMaxModeFilter(event.target.value);
        setEventsPageIndex(0);
        renderEventsTable(eventsForTable());
    });

    document.getElementById('events-min-cost')?.addEventListener('change', (event) => {
        setEventsMinCostUsd(Number.parseFloat(event.target.value) || 0);
        setEventsPageIndex(0);
        renderEventsTable(eventsForTable());
    });

    document.getElementById('events-included-only')?.addEventListener('change', (event) => {
        setEventsIncludedOnly(event.target.checked);
        setEventsPageIndex(0);
        renderEventsTable(eventsForTable());
    });

    document.getElementById('events-export-csv-btn')?.addEventListener('click', () => {
        exportFilteredEventsCsv();
    });

    document.getElementById('events-export-json-btn')?.addEventListener('click', () => {
        exportFilteredEventsJson();
    });

    document.getElementById('events-groups-toggle-all')?.addEventListener('click', () => {
        toggleAllEventGroups();
    });

    document.querySelectorAll('[data-events-group]').forEach((btn) => {
        btn.addEventListener('click', () => {
            setEventsGroupMode(btn.dataset.eventsGroup);
            localStorage.setItem('events-group-mode', eventsGroupMode);
            syncEventsGroupModeButtons();
            collapsedEventGroups.clear();
            renderEventsTable(eventsForTable());
        });
    });
    syncEventsGroupModeButtons();

    document.querySelectorAll('[data-events-page-size]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const size = getEventsPageSizeFromButton(btn);
            if (!EVENTS_PAGE_SIZE_OPTIONS.includes(size)) {
                return;
            }
            setEventsPageSize(size);
            setEventsPageIndex(0);
            localStorage.setItem(EVENTS_PAGE_SIZE_STORAGE_KEY, String(size));
            syncEventsPageSizeButtons();
            renderEventsTable(eventsForTable());
        });
    });
    syncEventsPageSizeButtons();

    document.getElementById('events-prev-btn')?.addEventListener('click', () => {
        if (eventsPageIndex > 0) {
            setEventsPageIndex(eventsPageIndex - 1);
            renderEventsTable(eventsForTable());
        }
    });

    document.getElementById('events-next-btn')?.addEventListener('click', () => {
        setEventsPageIndex(eventsPageIndex + 1);
        renderEventsTable(eventsForTable());
    });

    document.querySelectorAll('.usage-table--events th[data-sort-col]').forEach((th) => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort-col');
            if (!col) {
                return;
            }
            if (eventsSortColumn === col) {
                setEventsSortDir(eventsSortDir === 'asc' ? 'desc' : 'asc');
            } else {
                setEventsSortColumn(col);
                setEventsSortDir(col === 'time' ? 'desc' : 'asc');
            }
            setEventsPageIndex(0);
            renderEventsTable(eventsForTable());
        });
    });

    syncEventsSortHeaders();

    document.getElementById('events-table-body')?.addEventListener('click', (event) => {
        const row = event.target.closest('.usage-table__group-header--toggle');
        if (!row) {
            return;
        }
        const key = row.getAttribute('data-group-key');
        if (!key) {
            return;
        }
        if (collapsedEventGroups.has(key)) {
            collapsedEventGroups.delete(key);
            row.classList.remove('usage-table__group-header--collapsed');
        } else {
            collapsedEventGroups.add(key);
            row.classList.add('usage-table__group-header--collapsed');
        }
        document
            .querySelectorAll(`tr[data-group-member="${CSS.escape(key)}"]`)
            .forEach((member) => {
                member.hidden = collapsedEventGroups.has(key);
            });
        syncEventGroupsToggleButton();
    });
}

export function syncEventsGroupModeButtons() {
    document.querySelectorAll('[data-events-group]').forEach((btn) => {
        btn.classList.toggle('btn--active', btn.dataset.eventsGroup === eventsGroupMode);
    });
}

export function syncEventsPageSizeButtons() {
    document.querySelectorAll('[data-events-page-size]').forEach((btn) => {
        btn.classList.toggle(
            'btn--active',
            getEventsPageSizeFromButton(btn) === eventsPageSize
        );
    });
}

export function emptyEventGroupStats() {
    return {
        calls: 0,
        totalTokens: 0,
        outputTokens: 0,
        inputNoCache: 0,
        inputWithCacheWrite: 0,
        cacheRead: 0,
        costCents: 0,
    };
}

export function addEventToGroupStats(stats, event) {
    stats.calls += 1;
    stats.totalTokens += event.totalTokens ?? 0;
    stats.outputTokens += event.outputTokens ?? 0;
    stats.inputNoCache += event.inputNoCache ?? 0;
    stats.inputWithCacheWrite += event.inputWithCacheWrite ?? 0;
    stats.cacheRead += event.cacheRead ?? 0;
    stats.costCents += event.costCents ?? 0;
}

export function computeTotalEventStats(events) {
    const stats = emptyEventGroupStats();
    for (const event of events) {
        addEventToGroupStats(stats, event);
    }
    return stats;
}

export function getEventGroupKey(event, mode, api, markers) {
    const marker = api?.getMarkerForEvent(event, markers);
    if (mode === 'marker') {
        return marker ? marker.id : EVENTS_UNMARKED_KEY;
    }
    if (!marker) {
        return EVENTS_UNMARKED_KEY;
    }
    return `${marker.project}|${marker.task || ''}`;
}

export function buildEventGroupLabel(marker, mode) {
    if (!marker) {
        return t('withoutMarker');
    }
    if (marker.task) {
        return `${marker.project} — ${marker.task}`;
    }
    return marker.project;
}

export function formatEventGroupRange(marker, api, filterEndMs) {
    if (!marker || !api) {
        return '';
    }
    const endMs = marker.end
        ? new Date(marker.end).getTime()
        : api.resolveIntervalEndMs(marker, api.getStore().markers, filterEndMs);
    const endLabel = marker.end
        ? dateTimeFmt.format(new Date(marker.end))
        : `${dateTimeFmt.format(new Date(endMs))} *`;
    return `${dateTimeFmt.format(new Date(marker.start))} – ${endLabel}`;
}

export function formatEventGroupCost(stats) {
    return currencyFmt.format(stats.costCents / 100);
}

export function buildEventGroups(events, mode, api) {
    const markers = api?.getStore().markers ?? [];
    const map = new Map();

    for (const event of events) {
        const marker = api?.getMarkerForEvent(event, markers);
        const key = getEventGroupKey(event, mode, api, markers);
        if (!map.has(key)) {
            map.set(key, {
                key,
                label: buildEventGroupLabel(marker, mode),
                marker: mode === 'marker' ? marker : null,
                events: [],
                stats: emptyEventGroupStats(),
                latestMs: 0,
            });
        }
        const group = map.get(key);
        group.events.push(event);
        addEventToGroupStats(group.stats, event);
        const eventMs = event.timestamp.getTime();
        if (eventMs > group.latestMs) {
            group.latestMs = eventMs;
        }
    }

    const groups = [...map.values()];
    for (const group of groups) {
        group.events.sort((a, b) => b.timestamp - a.timestamp);
    }
    groups.sort((a, b) => b.latestMs - a.latestMs);
    return groups;
}

export function renderEventsStatsHeader(groups, totalStats, mode, api, filterEndMs, displayMeta) {
    const statsEl = document.getElementById('events-stats');
    const totalsEl = document.getElementById('events-stats-totals');
    const hintEl = document.getElementById('events-stats-hint');
    const headEl = document.getElementById('events-groups-table-head');
    const bodyEl = document.getElementById('events-groups-table-body');
    if (!statsEl || !totalsEl || !bodyEl) {
        return;
    }

    statsEl.hidden = false;
    const scopeHint =
        displayMeta.shown < displayMeta.total
            ? `<span class="events-stat__scope">${tf('shownOfTotal', {
                shown: numberFmt.format(displayMeta.shown),
                total: numberFmt.format(displayMeta.total),
            })}</span>`
            : `<span class="events-stat__scope">${tf('shownRequests', {
                shown: numberFmt.format(displayMeta.shown),
            })}</span>`;
    totalsEl.innerHTML = `
        <div class="events-stat events-stat--scope">
            <span class="events-stat__label">${t('displayed')}</span>
            <span class="events-stat__value">${scopeHint}</span>
        </div>
        <div class="events-stat">
            <span class="events-stat__label">${t('totalTokens')}</span>
            <span class="events-stat__value">${numberFmt.format(totalStats.totalTokens)}</span>
        </div>
        <div class="events-stat">
            <span class="events-stat__label">${t('output')}</span>
            <span class="events-stat__value">${numberFmt.format(totalStats.outputTokens)}</span>
        </div>
        <div class="events-stat">
            <span class="events-stat__label">${t('cacheRead')}</span>
            <span class="events-stat__value">${numberFmt.format(totalStats.cacheRead)}</span>
        </div>
        <div class="events-stat">
            <span class="events-stat__label">${t('cost')}</span>
            <span class="events-stat__value">${formatEventGroupCost(totalStats)}</span>
        </div>
    `;

    const markedGroups = groups.filter((group) => group.key !== EVENTS_UNMARKED_KEY);
    if (hintEl) {
        if (groups.length && !markedGroups.length) {
            hintEl.hidden = false;
            hintEl.textContent = t('noMarkedTasks');
        } else {
            hintEl.hidden = true;
            hintEl.textContent = '';
        }
    }

    const showRange = mode === 'marker';
    if (headEl) {
        headEl.innerHTML = `<tr>
            <th>${t('task')}</th>
            ${showRange ? `<th>${t('colTimeRange')}</th>` : ''}
            <th>${t('requests')}</th>
            <th class="usage-table__total">${t('total')}</th>
            <th>${t('output')}</th>
            <th>${t('cacheRead')}</th>
            <th>${t('cost')}</th>
        </tr>`;
    }

    const summaryGroups = [...groups].sort(
        (a, b) => b.stats.totalTokens - a.stats.totalTokens
    );
    bodyEl.innerHTML = summaryGroups
        .map((group) => {
            const rangeCell =
                showRange && group.marker
                    ? `<td>${formatEventGroupRange(group.marker, api, filterEndMs)}</td>`
                    : showRange
                        ? '<td>—</td>'
                        : '';
            return `<tr>
                <td>${group.label}</td>
                ${rangeCell}
                <td>${numberFmt.format(group.stats.calls)}</td>
                <td class="usage-table__total">${numberFmt.format(group.stats.totalTokens)}</td>
                <td>${numberFmt.format(group.stats.outputTokens)}</td>
                <td>${numberFmt.format(group.stats.cacheRead)}</td>
                <td>${formatEventGroupCost(group.stats)}</td>
            </tr>`;
        })
        .join('');
}

export function getEventsFilterKey() {
    return `${dataSource}|${userFilter}|${selectionMode}|${range.mode}|${range.hours}|${range.count}|${range.countFrom}|${range.countTo}|${range.customFrom}|${range.customTo}|${projectFilter}|${eventsGroupMode}|${eventsPageSize}|${eventsModelFilter}|${eventsKindFilter}|${eventsMaxModeFilter}|${eventsMinCostUsd}|${eventsIncludedOnly}|${eventsSortColumn}|${eventsSortDir}`;
}

export function formatEventCost(event) {
    if (event.isIncluded || String(event.costDisplay || '').toLowerCase() === 'included') {
        return event.costDisplay || 'Included';
    }
    return currencyFmt.format(event.costCents / 100);
}

export function renderEventTableRow(event, api, grouped, groupKey) {
    const marker = api?.getMarkerForEvent(event, api.getStore().markers);
    const projectLabel = grouped
        ? marker?.task || marker?.project || '—'
        : marker
            ? marker.task
                ? `${marker.project} — ${marker.task}`
                : marker.project
            : '—';
    const markedClass = marker ? ' usage-table__row--marked' : '';
    const collapsed = groupKey && collapsedEventGroups.has(groupKey);
    const hiddenAttr = collapsed ? ' hidden' : '';
    const memberAttr = groupKey
        ? ` data-group-member="${String(groupKey).replace(/"/g, '&quot;')}"`
        : '';
    const markerIdAttr = marker ? ` data-marker-id="${marker.id}"` : '';
    return `<tr class="${userRowClass(event.userLabel)}${markedClass} usage-table__row--group-member"${markerIdAttr}${memberAttr}${hiddenAttr ? ' hidden' : ''}>
            <td>${dateTimeFmt.format(event.timestamp)}</td>
            <td class="usage-table__user usage-table__user--${event.userLabel}">${event.userLabel}</td>
            <td>${projectLabel}</td>
            <td>${event.model}</td>
            <td>${event.kind}</td>
            <td>${numberFmt.format(event.inputWithCacheWrite)}</td>
            <td>${numberFmt.format(event.inputNoCache)}</td>
            <td>${numberFmt.format(event.cacheRead)}</td>
            <td>${numberFmt.format(event.outputTokens)}</td>
            <td>${numberFmt.format(event.totalTokens)}</td>
            <td>${formatEventCost(event)}</td>
        </tr>`;
}

export function renderEventGroupHeaderRow(group, mode, api, filterEndMs) {
    const rangeHtml =
        mode === 'marker' && group.marker
            ? `<br><span class="usage-table__group-range">${formatEventGroupRange(group.marker, api, filterEndMs)}</span>`
            : '';
    const title = `<strong>${group.label}</strong>${rangeHtml} · ${tf('requestsInGroup', { count: numberFmt.format(group.stats.calls) })}`;
    const collapsed = collapsedEventGroups.has(group.key);
    const collapsedClass = collapsed ? ' usage-table__group-header--collapsed' : '';
    const safeKey = String(group.key).replace(/"/g, '&quot;');
    const markerIdAttr = group.marker ? ` data-marker-id="${group.marker.id}"` : '';
    return `<tr class="usage-table__group-header usage-table__group-header--toggle${collapsedClass}" data-group-key="${safeKey}"${markerIdAttr} role="button" tabindex="0">
            <td colspan="5"><span class="usage-table__group-chevron" aria-hidden="true"></span>${title}</td>
            <td>—</td>
            <td>—</td>
            <td>${numberFmt.format(group.stats.cacheRead)}</td>
            <td>${numberFmt.format(group.stats.outputTokens)}</td>
            <td class="usage-table__total">${numberFmt.format(group.stats.totalTokens)}</td>
            <td>${formatEventGroupCost(group.stats)}</td>
        </tr>`;
}

export function renderEventsTable(events) {
    const body = document.getElementById('events-table-body');
    const statusEl = document.getElementById('events-table-status');
    const statsEl = document.getElementById('events-stats');
    const paginationEl = document.getElementById('events-pagination');
    const paginationInfo = document.getElementById('events-pagination-info');
    const api = getMarkersApi();
    const markers = api?.getStore().markers ?? [];

    updateEventsFilterOptions(events);

    const filterKey = getEventsFilterKey();
    if (filterKey !== eventsFilterKey) {
        setEventsFilterKey(filterKey);
        setEventsPageIndex(0);
    }

    if (!events.length) {
        body.innerHTML =
            `<tr><td class="usage-table__empty" colspan="11">${t('noEvents')}</td></tr>`;
        if (statusEl) {
            statusEl.textContent = t('statusNoData');
        }
        if (statsEl) {
            statsEl.hidden = true;
        }
        if (paginationEl) {
            paginationEl.hidden = true;
        }
        syncEventsSortHeaders();
        syncEventGroupsToggleButton();
        return;
    }

    const sorted = sortEventsForTable(events);
    const totalPages = Math.max(1, Math.ceil(sorted.length / eventsPageSize));
    if (eventsPageIndex >= totalPages) {
        setEventsPageIndex(totalPages - 1);
    }
    if (eventsPageIndex < 0) {
        setEventsPageIndex(0);
    }
    const pageStart = eventsPageIndex * eventsPageSize;
    const displayedEvents = sorted.slice(pageStart, pageStart + eventsPageSize);
    const groups = buildEventGroups(displayedEvents, eventsGroupMode, api);
    const totalStats = computeTotalEventStats(displayedEvents);
    const filterEndMs = sorted[0].timestamp.getTime();
    const displayMeta = { shown: displayedEvents.length, total: sorted.length };
    renderEventsStatsHeader(
        groups,
        totalStats,
        eventsGroupMode,
        api,
        filterEndMs,
        displayMeta
    );

    const groupByKey = new Map(groups.map((group) => [group.key, group]));

    let html = '';
    let lastGroupKey = null;
    for (const event of displayedEvents) {
        const groupKey = getEventGroupKey(event, eventsGroupMode, api, markers);
        if (groupKey !== lastGroupKey) {
            const group = groupByKey.get(groupKey);
            if (group) {
                html += renderEventGroupHeaderRow(
                    group,
                    eventsGroupMode,
                    api,
                    filterEndMs
                );
            }
            lastGroupKey = groupKey;
        }
        html += renderEventTableRow(event, api, true, groupKey);
    }
    body.innerHTML = html;
    syncEventsSortHeaders();
    syncEventGroupsToggleButton();

    if (statusEl) {
        const filterHint =
            projectFilter !== 'all'
                ? tf('filterHintProject', { project: projectFilter })
                : '';
        const groupHint =
            eventsGroupMode === 'marker' ? t('groupHintMarker') : t('groupHintTask');
        const countHint = `${tf('requestsCount', { count: numberFmt.format(sorted.length) })} · ${tf('pageOf', {
            page: eventsPageIndex + 1,
            total: totalPages,
        })}`;
        statusEl.textContent = `${countHint} · ${tf('tasksCount', { count: numberFmt.format(groups.length) })} · ${t('newestFirst')}${groupHint}${filterHint}`;
    }
    if (paginationEl) {
        const showPagination = sorted.length > eventsPageSize;
        paginationEl.hidden = !showPagination;
        if (paginationInfo) {
            paginationInfo.textContent = showPagination
                ? tf('paginationRange', {
                    start: pageStart + 1,
                    end: pageStart + displayedEvents.length,
                    total: sorted.length,
                })
                : '';
        }
        const prevBtn = document.getElementById('events-prev-btn');
        const nextBtn = document.getElementById('events-next-btn');
        if (prevBtn) {
            prevBtn.disabled = eventsPageIndex <= 0;
        }
        if (nextBtn) {
            nextBtn.disabled = eventsPageIndex >= totalPages - 1;
        }
    }
}
