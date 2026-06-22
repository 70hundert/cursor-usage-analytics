// ESM-Entry der Dashboard-App: Bootstrap, Locale, Card-Collapse, Init-Orchestrierung.
// Shared-Module und App-Logik werden ueber die app/*-Schicht per ES-Import eingebunden.
import {
    PROXY_BASE,
    USER_FILTER_STORAGE_KEY,
    CARD_COLLAPSE_STORAGE_KEY,
    rebuildFormatters,
    userFilter,
    setEventsByUser,
    setLiveEventsByUser,
    setUserFilter,
    setMarkerFocusId,
} from './app/state.js';
import {
    getMarkersApi,
    getUsersConfig,
    getParser,
    getI18n,
    t,
    tf,
    setStatus,
    setActiveButtons,
} from './app/services.js';
import {
    emptyEventsByUser,
    normalizeUserFilter,
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
    resizeAllCharts,
    initToolbar,
} from './app/controls.js';
import { renderAll } from './app/render.js';
import { loadDefaultCsvs } from './app/load.js';
import {
    syncEventGroupsToggleButton,
    syncMarkerGroupsToggleButton,
} from './app/table-groups.js';

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

    await getMarkersApi().syncFromServer(PROXY_BASE);
    setMarkerFocusId(loadStoredMarkerFocusId());
    reconcileMarkerFocus();
    await getUsersConfig().loadUsersConfig();
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
