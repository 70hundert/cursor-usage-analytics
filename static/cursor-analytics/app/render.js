/**
 * Render-Schicht: KPIs, Budget-Panel, Tagestabelle, teuerste Events und der zentrale
 * renderAll-Durchlauf (Aggregation + Charts + Tabellen). Reine Ausgabe-Schicht.
 *
 * Haengt an state/services/data sowie an markers-ui, events-ui und controls. Bewusst KEIN
 * Import aus ../main.js, damit Render eine saubere Blattschicht ueber den UI-Modulen ist.
 */
import {
    BUDGET_STORAGE_KEY,
    numberFmt,
    currencyFmt,
    dateFmt,
    dateTimeFmt,
    monthFmt,
    chartInstances,
    range,
    granularity,
    selectionMode,
    userFilter,
    markerFocusId,
    setLastAggregated,
} from './state.js';
import { escapeHtml } from '../markers/util.js';
import {
    t,
    tf,
    getMetrics,
    getParser,
    getCharts,
    getI18n,
    getMarkersApi,
    setStatus,
} from './services.js';
import { filteredEvents } from './data.js';
import {
    reconcileMarkerFocus,
    syncMarkerFocusUi,
    getFocusedMarker,
    buildMarkerContext,
    renderMarkerTable,
    renderMarkerCharts,
    syncActiveMarkerSessionButtons,
    updateMarkerChartProjectFilterOptions,
    renderMarkerProjectBadge,
    eventsForDashboard,
} from './markers-ui.js';
import {
    renderEventsTable,
    eventsForTable,
    updateProjectFilterOptions,
    formatEventGroupRange,
} from './events-ui.js';
import { rangeLabel, resizeAllCharts } from './controls.js';

function trendLabelText(label) {
    if (label === 'up') {
        return t('trendUp');
    }
    if (label === 'down') {
        return t('trendDown');
    }
    return t('trendStable');
}

function overviewTitleFor(granularity) {
    const key = getI18n()?.getOverviewTitleKey(granularity) || 'overviewDefault';
    return t(key);
}

function cumulativeTitleFor(granularity) {
    const key = getI18n()?.getCumulativeTitleKey(granularity) || 'chartCumulative';
    return t(key);
}

function renderKpis(kpis, events) {
    const trendClass =
        kpis.trendLabel === 'up'
            ? 'trend-up'
            : kpis.trendLabel === 'down'
                ? 'trend-down'
                : '';
    const trendSign = kpis.trendPercent >= 0 ? '+' : '';

    document.getElementById('kpi-grid').innerHTML = `
        <div class="kpi kpi--accent">
            <div class="kpi__label">${t('kpiTotalTokens')}</div>
            <div class="kpi__value">${numberFmt.format(kpis.totalTokens)}</div>
            <div class="kpi__sub">${tf('kpiEventsSub', { count: numberFmt.format(kpis.totalCalls) })}</div>
        </div>
        <div class="kpi">
            <div class="kpi__label">${t('kpiCost')}</div>
            <div class="kpi__value">${currencyFmt.format(kpis.costCents / 100)}</div>
            <div class="kpi__sub">${tf('kpiBillable', { count: numberFmt.format(kpis.billableEvents) })}</div>
        </div>
        <div class="kpi">
            <div class="kpi__label">${t('kpiIncluded')}</div>
            <div class="kpi__value">${numberFmt.format(kpis.includedEvents)}</div>
            <div class="kpi__sub">${t('kpiIncludedSub')}</div>
        </div>
        <div class="kpi">
            <div class="kpi__label">${t('kpiDailyAvg')}</div>
            <div class="kpi__value">${currencyFmt.format(kpis.dailyAvgCents / 100)}</div>
            <div class="kpi__sub">${t('kpiPerDay')}</div>
        </div>
        <div class="kpi kpi--warn">
            <div class="kpi__label">${t('kpiForecast')}</div>
            <div class="kpi__value">${currencyFmt.format(kpis.projectedMonthlyCents / 100)}</div>
            <div class="kpi__sub">${t('kpiLinearExtrapolated')}</div>
        </div>
        <div class="kpi">
            <div class="kpi__label">${t('kpiTrend')}</div>
            <div class="kpi__value ${trendClass}">${trendSign}${kpis.trendPercent.toFixed(1)} %</div>
            <div class="kpi__sub">${trendLabelText(kpis.trendLabel)}</div>
        </div>
    `;

    renderBudget(kpis, events);
}

function getBudgetUsd() {
    const stored = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (stored != null) {
        return Number.parseFloat(stored);
    }
    return Number.parseFloat(document.getElementById('budget-input').value) || 70;
}

function renderBudget(kpis, events) {
    const budgetUsd = getBudgetUsd();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEvents = events.filter((e) => e.timestamp >= monthStart);
    const spentCents = getMetrics().sumField(monthEvents, 'costCents');
    const spentUsd = spentCents / 100;
    const pct = budgetUsd > 0 ? Math.min(100, (spentUsd / budgetUsd) * 100) : 0;
    const fillClass =
        pct >= 100 ? 'budget-bar__fill--over' : pct >= 80 ? 'budget-bar__fill--warn' : '';

    document.getElementById('budget-panel').innerHTML = `
        <p class="card-meta">${tf('budgetSpent', {
        pct: pct.toFixed(1),
        spent: currencyFmt.format(spentUsd),
        budget: currencyFmt.format(budgetUsd),
    })}</p>
        <div class="budget-bar">
            <div class="budget-bar__fill ${fillClass}" style="width: ${pct}%"></div>
        </div>
        <p class="hint-text">${tf('budgetRemaining', {
        amount: currencyFmt.format(Math.max(0, budgetUsd - spentUsd)),
    })}</p>
    `;
}

export function userRowClass(userLabel) {
    const { USER_ORDER } = getParser();
    if (USER_ORDER.includes(userLabel)) {
        return `usage-table__row--${userLabel}`;
    }
    return '';
}

function renderDailyTable(rows) {
    const body = document.getElementById('daily-table-body');
    if (!rows.length) {
        body.innerHTML =
            `<tr><td class="usage-table__empty" colspan="6">${t('noDailyData')}</td></tr>`;
        return;
    }

    body.innerHTML = rows
        .map(
            (row) => `<tr class="${userRowClass(row.userLabel)}">
            <td>${dateFmt.format(new Date(`${row.dayKey}T12:00:00Z`))}</td>
            <td class="usage-table__user usage-table__user--${row.userLabel}">${row.userLabel}</td>
            <td>${numberFmt.format(row.events)}</td>
            <td>${numberFmt.format(row.totalTokens)}</td>
            <td>${currencyFmt.format(row.costCents / 100)}</td>
            <td>${row.topModel}</td>
        </tr>`
        )
        .join('');
}

function renderExpensiveTable(rows, filterEvents = []) {
    const body = document.getElementById('expensive-table-body');
    const colspan = 8;
    if (!rows.length) {
        body.innerHTML =
            `<tr><td class="usage-table__empty" colspan="${colspan}">${t('noBillableEvents')}</td></tr>`;
        return;
    }

    const api = getMarkersApi();
    const markers = api?.getStore().markers ?? [];
    const colorMap = api?.buildProjectColorMap(markers.map((m) => m.project)) ?? {};
    const filterEndMs = filterEvents.length
        ? filterEvents[filterEvents.length - 1].timestamp.getTime()
        : rows[rows.length - 1].timestamp.getTime();

    body.innerHTML = rows
        .map((row) => {
            const marker = api?.getMarkerForEvent(row, markers);
            const markedClass = marker ? ' usage-table__row--marked' : '';
            const projectCell = marker
                ? renderMarkerProjectBadge(marker.project, colorMap)
                : '—';
            const taskCell = marker?.task || '—';
            const rangeCell = marker
                ? `<span class="usage-table__group-range">${formatEventGroupRange(marker, api, filterEndMs)}</span>`
                : '—';
            const markerIdAttr = marker ? ` data-marker-id="${marker.id}"` : '';
            return `<tr class="${userRowClass(row.userLabel)}${markedClass}"${markerIdAttr}>
            <td>${dateTimeFmt.format(row.timestamp)}</td>
            <td class="usage-table__user usage-table__user--${row.userLabel}">${row.userLabel}</td>
            <td>${projectCell}</td>
            <td>${escapeHtml(taskCell)}</td>
            <td>${rangeCell}</td>
            <td>${escapeHtml(row.model)}</td>
            <td>${numberFmt.format(row.totalTokens)}</td>
            <td>${currencyFmt.format(row.costCents / 100)}</td>
        </tr>`;
        })
        .join('');
}

export function renderAll() {
    if (typeof window.Chart === 'undefined' || !getCharts()) {
        return;
    }

    reconcileMarkerFocus();
    syncMarkerFocusUi();

    const metrics = getMetrics();
    const charts = getCharts();
    const baseEvents = filteredEvents();
    const events = eventsForDashboard();

    if (!events.length) {
        charts.destroyAll(chartInstances);
        document.getElementById('kpi-grid').innerHTML = '';
        document.getElementById('overview-section').hidden = true;
        document.getElementById('drop-zone').classList.remove('drop-zone--hidden', 'drop-zone--compact');
        renderDailyTable([]);
        renderExpensiveTable([]);
        renderEventsTable([]);
        renderMarkerTable(baseEvents);
        renderMarkerCharts([]);
        syncActiveMarkerSessionButtons();
        if (markerFocusId && getFocusedMarker() && baseEvents.length) {
            setStatus(t('statusMarkerFocusEmpty'));
        } else {
            setStatus(
                selectionMode === 'count' ? t('noEventsCount') : t('noEvents')
            );
        }
        return;
    }

    document.getElementById('drop-zone').classList.add('drop-zone--compact', 'drop-zone--hidden');
    document.getElementById('overview-section').hidden = false;

    const kpis = metrics.computeKpis(events, range);
    const models = metrics.aggregateByModel(events);
    const tokenTypes = metrics.aggregateTokenTypes(events);
    const byHour = metrics.aggregateByHour(events);
    const byDayOfWeek = metrics.aggregateByDayOfWeek(events);
    const bucketFormatters = { dateFmt, dateTimeFmt, monthFmt };
    const timeBuckets = metrics.aggregateByGranularity(events, granularity, bucketFormatters);
    const cumulativeBuckets = metrics.cumulativeByGranularity(
        events,
        granularity,
        bucketFormatters
    );
    const cumulative = metrics.cumulativeCostByDay(events);
    const families = metrics.aggregateByModelFamily(events);
    const maxMode = metrics.aggregateByMaxMode(events);
    const cache = metrics.cacheEfficiency(events);
    const dailyRows = metrics.aggregateDailyTable(events);
    const expensive = metrics.topExpensiveEvents(events);

    setLastAggregated({
        kpis,
        models,
        tokenTypes,
        byHour,
        byDayOfWeek,
        timeBuckets,
        cumulativeBuckets,
        cumulative,
        families,
        cache,
        dailyRows,
        expensive,
        eventCount: events.length,
    });

    renderKpis(kpis, events);
    renderDailyTable(dailyRows);
    renderExpensiveTable(expensive, events);
    renderEventsTable(eventsForTable());
    renderMarkerTable(baseEvents);
    renderMarkerCharts(events);
    updateProjectFilterOptions();
    updateMarkerChartProjectFilterOptions();
    syncActiveMarkerSessionButtons();

    const first = events[0].timestamp;
    const last = events[events.length - 1].timestamp;
    const userLabel = userFilter === 'all' ? t('usersAll') : userFilter;
    setStatus(
        `${rangeLabel()} · ${userLabel} · ${events.length} ${t('events')} · ${dateTimeFmt.format(first)} – ${dateTimeFmt.format(last)}`
    );

    try {
        const formatters = { numberFmt, currencyFmt, dateFmt, dateTimeFmt, monthFmt };
        const chartEvents = markerFocusId ? baseEvents : events;
        const chartMarkerContext = buildMarkerContext(chartEvents);
        const focusedMarker = getFocusedMarker();
        const overviewTitleEl = document.getElementById('overview-section-title');
        const cumulativeTitleEl = document.getElementById('chart-cumulative-title');
        const chartGranularity = selectionMode === 'count' ? 'event' : granularity;
        const overviewBuckets =
            selectionMode === 'count'
                ? metrics.aggregateByGranularity(chartEvents, 'event', bucketFormatters)
                : markerFocusId
                    ? metrics.aggregateByGranularity(chartEvents, granularity, bucketFormatters)
                    : timeBuckets;
        const chartCumulativeBuckets =
            selectionMode === 'count'
                ? metrics.cumulativeByGranularity(chartEvents, 'event', bucketFormatters)
                : markerFocusId
                    ? metrics.cumulativeByGranularity(chartEvents, granularity, bucketFormatters)
                    : cumulativeBuckets;
        const overviewTitle = overviewTitleFor(chartGranularity);

        if (overviewTitleEl) {
            overviewTitleEl.textContent = overviewTitle;
        }
        if (cumulativeTitleEl) {
            cumulativeTitleEl.textContent = cumulativeTitleFor(chartGranularity);
        }

        charts.renderOverviewBuckets(
            document.getElementById('chart-overview-daily'),
            chartInstances,
            'overview',
            overviewBuckets,
            overviewTitle,
            formatters,
            chartGranularity,
            chartMarkerContext
        );

        if (focusedMarker) {
            charts.applyMarkerFocusZoom(
                chartInstances.overview,
                overviewBuckets,
                focusedMarker,
                chartMarkerContext
            );
        }

        charts.renderAll(
            chartInstances,
            {
                models,
                tokenTypes,
                byHour,
                byDayOfWeek,
                cumulative,
                cumulativeBuckets: chartCumulativeBuckets,
                granularity: chartGranularity,
                families,
                maxMode,
                cache,
                markerContext: chartMarkerContext,
                canvases: {
                    topCost: document.getElementById('chart-top-cost'),
                    topTokens: document.getElementById('chart-top-tokens'),
                    tokenTypes: document.getElementById('chart-token-types'),
                    modelFamily: document.getElementById('chart-model-family'),
                    byHour: document.getElementById('chart-by-hour'),
                    cumulative: document.getElementById('chart-cumulative'),
                    inputOutput: document.getElementById('chart-input-output'),
                    cacheEfficiency: document.getElementById('chart-cache'),
                    byWeekday: document.getElementById('chart-weekday'),
                    maxMode: document.getElementById('chart-max-mode'),
                },
            },
            formatters
        );

        if (focusedMarker) {
            charts.applyMarkerFocusZoom(
                chartInstances.cumulative,
                chartCumulativeBuckets,
                focusedMarker,
                chartMarkerContext
            );
        }

        resizeAllCharts();
    } catch (error) {
        console.error(error);
        setStatus(tf('chartError', { message: error.message }), true);
    }
}
