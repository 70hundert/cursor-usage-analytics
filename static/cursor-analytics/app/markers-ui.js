/**
 * Markers-UI: Marker-Fokus, Marker-Tabelle, Marker-Charts, Modal/Formular sowie die
 * Chart-Display-Steuerung. Haengt an state.js, services.js, data.js und ruft (zyklisch)
 * einige noch in main.js verbliebene Funktionen auf (renderAll usw.) -> transitorischer
 * Import aus ../main.js, bis render/controls/events-ui ebenfalls ausgelagert sind.
 */
import {
    PROXY_BASE,
    MARKER_FOCUS_STORAGE_KEY,
    userFilter,
    dateTimeFmt,
    numberFmt,
    currencyFmt,
    markerFocusId,
    setMarkerFocusId,
    markerChartDisplay,
    setMarkerChartDisplay,
    chartInstances,
    markerTableProjectFilter,
    setMarkerTableProjectFilter,
    markerSortColumn,
    setMarkerSortColumn,
    markerSortDir,
    setMarkerSortDir,
    collapsedMarkerGroups,
} from './state.js';
import {
    getMarkersApi,
    getParser,
    getCharts,
    t,
    tf,
} from './services.js';
import { getDefaultUserId, filteredEvents } from './data.js';
import {
    syncMarkerGroupsToggleButton,
    toggleAllMarkerGroups,
} from './table-groups.js';
import { updateProjectFilterOptions } from './events-ui.js';
import { renderAll } from './render.js';

export async function persistMarkers() {
    const api = getMarkersApi();
    if (!api) {
        return;
    }
    await api.saveStore(api.getStore(), PROXY_BASE);
}

export function buildMarkerContext(events) {
    const api = getMarkersApi();
    if (!api) {
        return null;
    }
    const lastEventMs = events.length
        ? events[events.length - 1].timestamp.getTime()
        : 0;
    const filterEndMs = Math.max(lastEventMs, Date.now());
    return {
        markers: api.getStore().markers,
        user: userFilter,
        filterEndMs,
        events,
        mode: 'category',
        formatters: { dateTimeFmt, numberFmt, currencyFmt },
        showPopover: true,
        focusedMarkerId: markerFocusId,
        onFocusMarker: (marker) => toggleMarkerFocus(marker),
        onEditMarker: (marker) => openMarkerModal({ marker }),
        showMarkers: markerChartDisplay.showMarkers,
        showLabels: markerChartDisplay.showLabels,
        projectFilter: markerChartDisplay.projectFilter,
    };
}

export function loadStoredMarkerFocusId() {
    try {
        const raw = localStorage.getItem(MARKER_FOCUS_STORAGE_KEY);
        return raw && typeof raw === 'string' ? raw : null;
    } catch {
        return null;
    }
}

export function saveStoredMarkerFocusId(id) {
    try {
        if (id) {
            localStorage.setItem(MARKER_FOCUS_STORAGE_KEY, id);
        } else {
            localStorage.removeItem(MARKER_FOCUS_STORAGE_KEY);
        }
    } catch {
        /* ignore */
    }
}

export function getFocusedMarker() {
    if (!markerFocusId) {
        return null;
    }
    const api = getMarkersApi();
    if (!api) {
        return null;
    }
    return api.getStore().markers.find((marker) => marker.id === markerFocusId) ?? null;
}

export function syncMarkerFocusUi() {
    const banner = document.getElementById('marker-focus-banner');
    const textEl = document.getElementById('marker-focus-banner-text');
    const hintEl = document.getElementById('marker-focus-banner-hint');
    const marker = getFocusedMarker();
    if (!banner || !textEl) {
        return;
    }
    if (!marker) {
        banner.hidden = true;
        textEl.textContent = '';
        if (hintEl) {
            hintEl.textContent = '';
        }
        return;
    }
    const api = getMarkersApi();
    const baseEvents = filteredEvents();
    const filterEndMs = baseEvents.length
        ? baseEvents[baseEvents.length - 1].timestamp.getTime()
        : Date.now();
    const { endMs } = api.markerIntervalMs(marker, api.getStore().markers, filterEndMs);
    const label = marker.task?.trim() || marker.project?.trim() || '—';
    textEl.textContent = tf('markerFocusBanner', {
        label,
        from: dateTimeFmt.format(new Date(marker.start)),
        to: marker.end
            ? dateTimeFmt.format(new Date(marker.end))
            : `${dateTimeFmt.format(new Date(endMs))} *`,
    });
    if (hintEl) {
        hintEl.textContent = t('markerFocusZoomHint');
    }
    banner.hidden = false;
}

export function setMarkerFocus(id) {
    setMarkerFocusId(id || null);
    saveStoredMarkerFocusId(markerFocusId);
    syncMarkerFocusUi();
    renderAll();
}

export function clearMarkerFocus() {
    if (!markerFocusId) {
        return;
    }
    setMarkerFocus(null);
}

export function toggleMarkerFocus(marker) {
    if (!marker) {
        return;
    }
    if (markerFocusId === marker.id) {
        clearMarkerFocus();
        return;
    }
    setMarkerFocus(marker.id);
}

export function reconcileMarkerFocus() {
    if (!markerFocusId) {
        return;
    }
    if (!getFocusedMarker()) {
        setMarkerFocusId(null);
        saveStoredMarkerFocusId(null);
    }
}

export function mountMarkerTableHover(tbody) {
    if (!tbody || tbody.dataset.markerHoverBound === '1') {
        return;
    }
    tbody.dataset.markerHoverBound = '1';
    tbody.addEventListener('mouseover', (event) => {
        if (markerChartDisplay.showTablePopover === false) {
            return;
        }
        const row = event.target.closest('tr[data-marker-id]');
        if (!row || row.contains(event.relatedTarget)) {
            return;
        }
        const api = getMarkersApi();
        if (!api) {
            return;
        }
        const marker = api.getStore().markers.find((m) => m.id === row.dataset.markerId);
        if (!marker) {
            return;
        }
        const ctx = buildMarkerContext(eventsForDashboard());
        if (!ctx) {
            return;
        }
        api.showTableMarkerPopover(marker, event, ctx);
    });
    tbody.addEventListener('mouseout', (event) => {
        const row = event.target.closest('tr[data-marker-id]');
        if (!row || row.contains(event.relatedTarget)) {
            return;
        }
        getMarkersApi()?.scheduleMarkerPopoverHide(300);
    });
}

export function persistMarkerChartDisplay() {
    getMarkersApi()?.saveMarkerChartDisplay(markerChartDisplay);
}

export function mountMarkerChartDisplayControls() {
    const template = `
        <span class="toolbar-label">${t('chartMarkers')}</span>
        <button type="button" class="btn btn--active" data-marker-chart-visible aria-pressed="true">${t('showMarkers')}</button>
        <button type="button" class="btn btn--active" data-marker-labels-visible aria-pressed="true">${t('showLabels')}</button>
        <select class="project-filter-select" data-marker-project-filter aria-label="${t('projectFilter')}">
            <option value="all">${t('allProjects')}</option>
        </select>
    `;
    document.querySelectorAll('[data-marker-display-host]').forEach((host) => {
        host.innerHTML = template;
    });
}

export function syncMarkerTablePopoverUi() {
    document.querySelectorAll('[data-marker-table-popover]').forEach((input) => {
        input.checked = markerChartDisplay.showTablePopover !== false;
    });
}

export function syncMarkerChartDisplayUi() {
    document.querySelectorAll('[data-marker-chart-visible]').forEach((markersBtn) => {
        markersBtn.classList.toggle('btn--active', markerChartDisplay.showMarkers);
        markersBtn.setAttribute('aria-pressed', markerChartDisplay.showMarkers ? 'true' : 'false');
    });
    document.querySelectorAll('[data-marker-labels-visible]').forEach((labelsBtn) => {
        labelsBtn.classList.toggle('btn--active', markerChartDisplay.showLabels);
        labelsBtn.setAttribute('aria-pressed', markerChartDisplay.showLabels ? 'true' : 'false');
        labelsBtn.disabled = !markerChartDisplay.showMarkers;
    });
    document.querySelectorAll('[data-marker-project-filter]').forEach((projectSelect) => {
        projectSelect.disabled = !markerChartDisplay.showMarkers;
        projectSelect.value =
            [...projectSelect.options].some(
                (option) => option.value === markerChartDisplay.projectFilter
            )
                ? markerChartDisplay.projectFilter
                : 'all';
    });
}

export function updateMarkerChartProjectFilterOptions() {
    const api = getMarkersApi();
    if (!api) {
        return;
    }
    const projects = [...new Set(api.getStore().markers.map((m) => m.project).filter(Boolean))].sort();
    const current = markerChartDisplay.projectFilter;
    const optionsHtml =
        `<option value="all">${t('allProjects')}</option>` +
        projects
            .map(
                (project) =>
                    `<option value="${project.replace(/"/g, '&quot;')}">${project}</option>`
            )
            .join('');
    markerChartDisplay.projectFilter =
        projects.includes(current) || current === 'all' ? current : 'all';
    document.querySelectorAll('[data-marker-project-filter]').forEach((select) => {
        select.innerHTML = optionsHtml;
    });
    syncMarkerChartDisplayUi();
}

export function initMarkerChartDisplayUi() {
    const api = getMarkersApi();
    if (api?.loadMarkerChartDisplay) {
        setMarkerChartDisplay(api.loadMarkerChartDisplay());
    }

    mountMarkerChartDisplayControls();
    syncMarkerTablePopoverUi();

    document.querySelectorAll('[data-marker-table-popover]').forEach((input) => {
        input.addEventListener('change', () => {
            markerChartDisplay.showTablePopover = input.checked;
            persistMarkerChartDisplay();
            syncMarkerTablePopoverUi();
            if (!markerChartDisplay.showTablePopover) {
                getMarkersApi()?.hideChartPopover(true);
            }
        });
    });

    document.querySelectorAll('[data-marker-chart-visible]').forEach((btn) => {
        btn.addEventListener('click', () => {
            markerChartDisplay.showMarkers = !markerChartDisplay.showMarkers;
            persistMarkerChartDisplay();
            syncMarkerChartDisplayUi();
            renderAll();
        });
    });

    document.querySelectorAll('[data-marker-labels-visible]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (!markerChartDisplay.showMarkers) {
                return;
            }
            markerChartDisplay.showLabels = !markerChartDisplay.showLabels;
            persistMarkerChartDisplay();
            syncMarkerChartDisplayUi();
            renderAll();
        });
    });

    document.querySelectorAll('[data-marker-project-filter]').forEach((select) => {
        select.addEventListener('change', (event) => {
            markerChartDisplay.projectFilter = event.target.value;
            persistMarkerChartDisplay();
            syncMarkerChartDisplayUi();
            renderAll();
        });
    });

    updateMarkerChartProjectFilterOptions();
}

export function openMarkerModal(preset = {}) {
    const modal = document.getElementById('marker-modal');
    const api = getMarkersApi();
    if (!modal || !api) {
        return;
    }

    api.hideChartPopover(true);
    const marker = preset.marker;
    document.getElementById('marker-id').value = marker?.id || '';
    document.getElementById('marker-user').value =
        marker?.user || preset.user || (userFilter === 'all' ? getDefaultUserId() : userFilter);
    document.getElementById('marker-project').value = marker?.project || '';
    document.getElementById('marker-task').value = marker?.task || '';
    document.getElementById('marker-note').value = marker?.note || '';

    let startIso = marker?.start;
    if (!startIso) {
        startIso = new Date().toISOString();
    }
    document.getElementById('marker-start').value = api.toDatetimeLocalValue(startIso);
    document.getElementById('marker-end').value = marker?.end
        ? api.toDatetimeLocalValue(marker.end)
        : '';

    const composerMode = api.resolveComposerMode(marker);
    document.querySelectorAll('input[name="marker-composer-mode"]').forEach((input) => {
        input.checked = input.value === composerMode;
    });

    document.getElementById('marker-modal-title').textContent = marker
        ? t('editMarker')
        : t('setProjectMarker');
    modal.hidden = false;
}

export function closeMarkerModal() {
    const modal = document.getElementById('marker-modal');
    if (modal) {
        modal.hidden = true;
    }
}

export function resolveMarkerUserIdForEdit() {
    return userFilter === 'all' ? getDefaultUserId() : userFilter;
}

export function getActiveOpenMarkerForUi() {
    const api = getMarkersApi();
    if (!api?.getActiveOpenMarker) {
        return null;
    }
    return api.getActiveOpenMarker(resolveMarkerUserIdForEdit());
}

export function syncActiveMarkerSessionButtons() {
    const marker = getActiveOpenMarkerForUi();
    document.querySelectorAll('[data-marker-edit-current]').forEach((btn) => {
        btn.disabled = !marker;
        btn.title = marker ? t('editCurrentMarker') : t('editCurrentMarkerNone');
    });
    document.querySelectorAll('[data-marker-end-current]').forEach((btn) => {
        btn.disabled = !marker;
        btn.title = marker ? t('endCurrentMarker') : t('endCurrentMarkerNone');
    });
}

export function openActiveMarkerForEdit() {
    const marker = getActiveOpenMarkerForUi();
    if (marker) {
        openMarkerModal({ marker });
    }
}

export async function endActiveMarkerSession() {
    const marker = getActiveOpenMarkerForUi();
    const api = getMarkersApi();
    if (!marker || !api) {
        return;
    }
    api.upsertMarker({
        ...marker,
        end: new Date().toISOString(),
    });
    await persistMarkers();
    updateProjectFilterOptions();
    updateMarkerTableProjectFilterOptions();
    syncActiveMarkerSessionButtons();
    renderAll();
}

export async function handleMarkerFormSubmit(event) {
    event.preventDefault();
    const api = getMarkersApi();
    if (!api) {
        return;
    }

    const id = document.getElementById('marker-id').value.trim();
    const user = document.getElementById('marker-user').value.trim() || getDefaultUserId();
    const start = api.fromDatetimeLocalValue(document.getElementById('marker-start').value);
    const endRaw = document.getElementById('marker-end').value;
    const end = endRaw ? api.fromDatetimeLocalValue(endRaw) : null;
    if (!start) {
        return;
    }

    const modeInput = document.querySelector('input[name="marker-composer-mode"]:checked');
    if (!modeInput) {
        document.getElementById('marker-mode-group')?.reportValidity?.();
        return;
    }

    const existing = id ? api.getStore().markers.find((m) => m.id === id) : null;
    api.upsertMarker({
        id: id || undefined,
        user,
        start,
        end,
        project: document.getElementById('marker-project').value,
        composerMode: modeInput.value,
        task: document.getElementById('marker-task').value,
        note: document.getElementById('marker-note').value,
        createdAt: existing?.createdAt,
    });

    await persistMarkers();
    closeMarkerModal();
    updateProjectFilterOptions();
    updateMarkerTableProjectFilterOptions();
    syncActiveMarkerSessionButtons();
    renderAll();
}

export async function deleteMarkerById(id) {
    const api = getMarkersApi();
    if (!api || !id) {
        return;
    }
    api.removeMarker(id);
    if (markerFocusId === id) {
        setMarkerFocusId(null);
        saveStoredMarkerFocusId(null);
    }
    await persistMarkers();
    updateProjectFilterOptions();
    updateMarkerTableProjectFilterOptions();
    syncActiveMarkerSessionButtons();
    renderAll();
}

export function updateMarkerTableProjectFilterOptions() {
    const select = document.getElementById('marker-project-filter');
    const api = getMarkersApi();
    if (!select || !api) {
        return;
    }
    const projects = [...new Set(api.getStore().markers.map((m) => m.project).filter(Boolean))].sort();
    const current = markerTableProjectFilter;
    select.innerHTML =
        `<option value="all">${t('allProjects')}</option>` +
        projects
            .map(
                (project) =>
                    `<option value="${project.replace(/"/g, '&quot;')}">${project}</option>`
            )
            .join('');
    select.value = projects.includes(current) || current === 'all' ? current : 'all';
    setMarkerTableProjectFilter(select.value);
}

export function sortMarkersForTable(rows) {
    const api = getMarkersApi();
    const dir = markerSortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        let av;
        let bv;
        switch (markerSortColumn) {
            case 'end':
                av = a.stats.endMs;
                bv = b.stats.endMs;
                break;
            case 'user':
                av = a.userId;
                bv = b.userId;
                break;
            case 'project':
                av = a.marker.project || '';
                bv = b.marker.project || '';
                break;
            case 'composerMode':
                av = api?.resolveComposerMode(a.marker) || '';
                bv = api?.resolveComposerMode(b.marker) || '';
                break;
            case 'task':
                av = a.marker.task || '';
                bv = b.marker.task || '';
                break;
            case 'events':
                av = a.stats.calls;
                bv = b.stats.calls;
                break;
            case 'total':
                av = a.stats.totalTokens;
                bv = b.stats.totalTokens;
                break;
            case 'output':
                av = a.stats.outputTokens;
                bv = b.stats.outputTokens;
                break;
            case 'cost':
                av = a.stats.costCents;
                bv = b.stats.costCents;
                break;
            default:
                av = a.stats.startMs;
                bv = b.stats.startMs;
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

export function buildMarkerProjectGroups(rows) {
    const map = new Map();
    for (const row of rows) {
        const key = row.marker.project || '—';
        if (!map.has(key)) {
            map.set(key, {
                key,
                label: key,
                stats: { calls: 0, totalTokens: 0, outputTokens: 0, costCents: 0, count: 0 },
            });
        }
        const group = map.get(key);
        group.stats.calls += row.stats.calls;
        group.stats.totalTokens += row.stats.totalTokens;
        group.stats.outputTokens += row.stats.outputTokens;
        group.stats.costCents += row.stats.costCents;
        group.stats.count += 1;
    }
    return map;
}

export function getMarkerSortHeaderTitle(col) {
    if (col !== markerSortColumn) {
        return t('sortClick');
    }
    return markerSortDir === 'asc' ? t('sortAsc') : t('sortDesc');
}

export function syncMarkerSortHeaders() {
    document.querySelectorAll('.usage-table--markers th[data-sort-col]').forEach((th) => {
        const col = th.getAttribute('data-sort-col');
        th.classList.toggle('sort-active', col === markerSortColumn);
        th.classList.toggle('sort-desc', col === markerSortColumn && markerSortDir === 'desc');
        th.title = getMarkerSortHeaderTitle(col);
    });
}

export function renderMarkerProjectBadge(project, colorMap) {
    const api = getMarkersApi();
    const color = api?.projectColor(project, colorMap) ?? '#f0b429';
    const safeProject = String(project || '—').replace(/"/g, '&quot;');
    return `<span class="usage-table__project-badge" style="--project-color: ${color}">${safeProject}</span>`;
}

export function renderMarkerProjectGroupHeader(group, colorMap) {
    const collapsed = collapsedMarkerGroups.has(group.key);
    const collapsedClass = collapsed ? ' usage-table__group-header--collapsed' : '';
    const safeKey = String(group.key).replace(/"/g, '&quot;');
    const badge = renderMarkerProjectBadge(group.label, colorMap);
    const markerLabel = t('markerLabel');
    return `<tr class="usage-table__group-header usage-table__group-header--toggle${collapsedClass}" data-marker-group-key="${safeKey}" role="button" tabindex="0">
            <td colspan="6"><span class="usage-table__group-chevron" aria-hidden="true"></span>${badge} · ${numberFmt.format(group.stats.count)} ${markerLabel}</td>
            <td>${numberFmt.format(group.stats.calls)}</td>
            <td class="usage-table__total">${numberFmt.format(group.stats.totalTokens)}</td>
            <td>${numberFmt.format(group.stats.outputTokens)}</td>
            <td>${currencyFmt.format(group.stats.costCents / 100)}</td>
            <td></td>
        </tr>`;
}

export function renderMarkerTableRow({ marker, stats, userId }, colorMap, groupKey) {
    const api = getMarkersApi();
    const color = api?.projectColor(marker.project, colorMap) ?? '#f0b429';
    const endLabel = marker.end
        ? dateTimeFmt.format(new Date(marker.end))
        : `${dateTimeFmt.format(new Date(stats.endMs))} *`;
    const collapsed = groupKey && collapsedMarkerGroups.has(groupKey);
    const memberAttr = groupKey
        ? ` data-marker-group-member="${String(groupKey).replace(/"/g, '&quot;')}"`
        : '';
    const hiddenAttr = collapsed ? ' hidden' : '';
    const modeLabel = api?.composerModeLabel(api.resolveComposerMode(marker)) ?? '—';
    const focusedClass = marker.id === markerFocusId ? ' usage-table__row--focused' : '';
    return `<tr class="usage-table__row--clickable usage-table__row--group-member${focusedClass}" data-marker-id="${marker.id}" style="--project-color: ${color}"${memberAttr}${hiddenAttr}>
                <td>${dateTimeFmt.format(new Date(marker.start))}</td>
                <td>${endLabel}</td>
                <td class="usage-table__user usage-table__user--${userId}">${userId}</td>
                <td>${renderMarkerProjectBadge(marker.project, colorMap)}</td>
                <td>${modeLabel}</td>
                <td>${marker.task || '—'}</td>
                <td>${numberFmt.format(stats.calls)}</td>
                <td class="usage-table__total">${numberFmt.format(stats.totalTokens)}</td>
                <td>${numberFmt.format(stats.outputTokens)}</td>
                <td>${currencyFmt.format(stats.costCents / 100)}</td>
                <td class="usage-table__actions">
                    <button type="button" class="usage-table__btn-edit" data-marker-edit="${marker.id}" title="${t('editMarker').replace(/"/g, '&quot;')}" aria-label="${t('editMarker').replace(/"/g, '&quot;')}">✎</button>
                    <button type="button" class="usage-table__btn-delete" data-marker-delete="${marker.id}">×</button>
                </td>
            </tr>`;
}

export function renderMarkerCharts(events) {
    const api = getMarkersApi();
    const charts = getCharts();
    const section = document.getElementById('marker-charts-section');
    const intro = document.getElementById('marker-charts-intro');
    if (!api || !charts || !section) {
        return;
    }

    const markers = api.getStore().markers;
    const byProject = api.aggregateEventsByMarkerDimension(events, markers, 'project');
    const byCategory = api.aggregateEventsByMarkerDimension(events, markers, 'category');
    const markedProjects = byProject.filter(
        (row) => row.key !== api.UNMARKED_DIMENSION_KEY && (row.totalTokens > 0 || row.costCents > 0)
    );
    const markedCategories = byCategory.filter(
        (row) =>
            row.key !== api.UNMARKED_DIMENSION_KEY && (row.totalTokens > 0 || row.costCents > 0)
    );
    const hasMarked = markedProjects.length > 0 || markedCategories.length > 0;

    section.hidden = !hasMarked;
    if (intro) {
        intro.hidden = !hasMarked;
    }

    if (!hasMarked) {
        charts.destroyChart(chartInstances, 'markerByProject');
        charts.destroyChart(chartInstances, 'markerByCategory');
        return;
    }

    const colorMap = api.buildProjectColorMap(markers.map((marker) => marker.project));
    charts.renderMarkerBreakdown(
        chartInstances,
        {
            byProject,
            byCategory,
            colorMap,
            canvases: {
                byProject: document.getElementById('chart-marker-by-project'),
                byCategory: document.getElementById('chart-marker-by-category'),
            },
        },
        { numberFmt, currencyFmt }
    );
}

export function renderMarkerTable(events) {
    const bodyEl = document.getElementById('marker-table-body');
    const statusEl = document.getElementById('marker-table-status');
    const api = getMarkersApi();
    if (!bodyEl || !api) {
        return;
    }

    updateMarkerTableProjectFilterOptions();

    const filterEndMs = events.length
        ? events[events.length - 1].timestamp.getTime()
        : Date.now();
    const users =
        userFilter === 'all' ? getParser().USER_ORDER : [userFilter];
    const rows = [];

    for (const userId of users) {
        const userEvents =
            userFilter === 'all'
                ? events.filter((e) => e.userLabel === userId)
                : events;
        const intervals = api.computeIntervalRows(
            userEvents,
            api.getStore().markers,
            userId,
            filterEndMs
        );
        for (const entry of intervals) {
            rows.push({ ...entry, userId });
        }
    }

    const filteredRows =
        markerTableProjectFilter === 'all'
            ? rows
            : rows.filter((row) => row.marker.project === markerTableProjectFilter);

    const sorted = sortMarkersForTable(filteredRows);
    const colorMap = api.buildProjectColorMap(api.getStore().markers.map((m) => m.project));
    const projectGroups = buildMarkerProjectGroups(sorted);

    if (!sorted.length) {
        const emptyMessage = t('statusNoMarkers');
        bodyEl.innerHTML =
            `<tr><td class="usage-table__empty" colspan="10">${emptyMessage}</td></tr>`;
        if (statusEl) {
            statusEl.textContent =
                markerTableProjectFilter !== 'all'
                    ? tf('statusNoMarkersForProject', { project: markerTableProjectFilter })
                    : emptyMessage;
        }
        syncMarkerSortHeaders();
        syncMarkerGroupsToggleButton();
        return;
    }

    let html = '';
    let lastGroupKey = null;
    for (const row of sorted) {
        const groupKey = row.marker.project || '—';
        if (groupKey !== lastGroupKey) {
            const group = projectGroups.get(groupKey);
            if (group) {
                html += renderMarkerProjectGroupHeader(group, colorMap);
            }
            lastGroupKey = groupKey;
        }
        html += renderMarkerTableRow(row, colorMap, groupKey);
    }
    bodyEl.innerHTML = html;

    if (statusEl) {
        const filterHint =
            markerTableProjectFilter !== 'all'
                ? tf('statusMarkerFilterProject', { project: markerTableProjectFilter })
                : '';
        statusEl.textContent = `${tf('statusMarkerCount', {
            count: numberFmt.format(sorted.length),
            filterHint,
        })} ${t('markerTableFocusHint')}`;
    }
    syncMarkerSortHeaders();
    syncMarkerGroupsToggleButton();
}

export function initMarkerCategoryDatalist() {
    const api = getMarkersApi();
    const list = document.getElementById('marker-category-suggestions');
    if (!api || !list) {
        return;
    }
    list.innerHTML = api.MARKER_CATEGORY_SUGGESTIONS.map(
        (category) => `<option value="${category}: "></option>`
    ).join('');
}

export function initMarkerUi() {
    initMarkerCategoryDatalist();
    document.getElementById('marker-add-overview')?.addEventListener('click', () => {
        openMarkerModal();
    });
    document.getElementById('marker-add-table')?.addEventListener('click', () => {
        openMarkerModal();
    });
    document.querySelectorAll('[data-marker-edit-current]').forEach((btn) => {
        btn.addEventListener('click', () => {
            openActiveMarkerForEdit();
        });
    });
    document.querySelectorAll('[data-marker-end-current]').forEach((btn) => {
        btn.addEventListener('click', () => {
            endActiveMarkerSession();
        });
    });
    document.getElementById('marker-form')?.addEventListener('submit', handleMarkerFormSubmit);
    document.getElementById('marker-cancel-btn')?.addEventListener('click', closeMarkerModal);
    document.getElementById('marker-modal-backdrop')?.addEventListener('click', closeMarkerModal);

    document.getElementById('marker-groups-toggle-all')?.addEventListener('click', () => {
        toggleAllMarkerGroups();
    });

    document.getElementById('marker-project-filter')?.addEventListener('change', (event) => {
        setMarkerTableProjectFilter(event.target.value);
        renderMarkerTable(filteredEvents());
    });

    document.querySelectorAll('.usage-table--markers th[data-sort-col]').forEach((th) => {
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort-col');
            if (!col) {
                return;
            }
            if (markerSortColumn === col) {
                setMarkerSortDir(markerSortDir === 'asc' ? 'desc' : 'asc');
            } else {
                setMarkerSortColumn(col);
                setMarkerSortDir('asc');
            }
            renderMarkerTable(filteredEvents());
        });
    });

    syncMarkerSortHeaders();

    mountMarkerTableHover(document.getElementById('marker-table-body'));
    mountMarkerTableHover(document.getElementById('events-table-body'));
    mountMarkerTableHover(document.getElementById('expensive-table-body'));

    document.getElementById('marker-table-body')?.addEventListener('click', (event) => {
        const groupRow = event.target.closest('[data-marker-group-key]');
        if (groupRow) {
            const key = groupRow.getAttribute('data-marker-group-key');
            if (!key) {
                return;
            }
            if (collapsedMarkerGroups.has(key)) {
                collapsedMarkerGroups.delete(key);
                groupRow.classList.remove('usage-table__group-header--collapsed');
            } else {
                collapsedMarkerGroups.add(key);
                groupRow.classList.add('usage-table__group-header--collapsed');
            }
            document
                .querySelectorAll(`[data-marker-group-member="${CSS.escape(key)}"]`)
                .forEach((member) => {
                    member.hidden = collapsedMarkerGroups.has(key);
                });
            syncMarkerGroupsToggleButton();
            return;
        }

        const deleteBtn = event.target.closest('[data-marker-delete]');
        if (deleteBtn) {
            event.stopPropagation();
            deleteMarkerById(deleteBtn.dataset.markerDelete);
            return;
        }
        const editBtn = event.target.closest('[data-marker-edit]');
        if (editBtn) {
            event.stopPropagation();
            const api = getMarkersApi();
            const marker = api?.getStore().markers.find((m) => m.id === editBtn.dataset.markerEdit);
            if (marker) {
                openMarkerModal({ marker });
            }
            return;
        }
        const row = event.target.closest('[data-marker-id]');
        if (!row) {
            return;
        }
        const api = getMarkersApi();
        const marker = api?.getStore().markers.find((m) => m.id === row.dataset.markerId);
        if (marker) {
            toggleMarkerFocus(marker);
        }
    });

    document.getElementById('marker-focus-clear')?.addEventListener('click', () => {
        clearMarkerFocus();
    });

    document.getElementById('marker-export-btn')?.addEventListener('click', () => {
        const api = getMarkersApi();
        if (!api) {
            return;
        }
        const blob = new Blob([JSON.stringify(api.exportStore(), null, 2)], {
            type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `cursor-markers-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('marker-import-input')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) {
            return;
        }
        const api = getMarkersApi();
        if (!api) {
            return;
        }
        try {
            const payload = JSON.parse(await file.text());
            api.importStore(payload, true);
            await persistMarkers();
            updateProjectFilterOptions();
            updateMarkerTableProjectFilterOptions();
            renderAll();
        } catch (error) {
            document.getElementById('marker-table-status').textContent =
                tf('statusImportFailed', { message: error.message });
        }
    });
}

export function buildMarkerUserSelect() {
    const select = document.getElementById('marker-user');
    if (!select) {
        return;
    }
    const { USER_ORDER, USERS } = getParser();
    select.innerHTML =
        USER_ORDER.map(
            (userId) =>
                `<option value="${userId}">${USERS[userId]?.label || userId}</option>`
        ).join('') + `<option value="all">${t('usersAll')}</option>`;
}

export function refreshMarkerChartDisplayLabels() {
    document.querySelectorAll('[data-marker-display-host] .toolbar-label').forEach((el) => {
        el.textContent = t('chartMarkers');
    });
    document.querySelectorAll('[data-marker-chart-visible]').forEach((btn) => {
        btn.textContent = t('showMarkers');
    });
    document.querySelectorAll('[data-marker-labels-visible]').forEach((btn) => {
        btn.textContent = t('showLabels');
    });
}

export function eventsForDashboard() {
    const baseEvents = filteredEvents();
    const marker = getFocusedMarker();
    const api = getMarkersApi();
    if (!marker || !api) {
        return baseEvents;
    }
    const filterEndMs = baseEvents.length
        ? baseEvents[baseEvents.length - 1].timestamp.getTime()
        : Date.now();
    return api.filterEventsByMarkerInterval(
        baseEvents,
        marker,
        api.getStore().markers,
        filterEndMs
    );
}
