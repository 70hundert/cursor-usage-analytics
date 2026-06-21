/**
 * Lightweight i18n (de / en) for Cursor Usage Dashboard.
 */
(function initCursorAnalyticsI18n(global) {
    const STORAGE_KEY = 'cursor-usage-locale';

    const translations = {
        de: {
            localeName: 'Deutsch',
            users: 'Benutzer',
            usersAll: 'Gesamt',
            dataSource: 'Datenquelle',
            dataCsv: 'CSV',
            dataLive: 'Live (Proxy)',
            dataMerge: 'Beides',
            loadCsv: 'CSV laden',
            liveRefresh: 'Live aktualisieren',
            exportJson: 'Export JSON',
            exportMarkers: 'Marker exportieren',
            importMarkers: 'Marker importieren',
            view: 'Ansicht',
            timeRange: 'Zeitraum',
            requests: 'Anfragen',
            individualRequests: 'Einzelne Anfragen',
            projectFilter: 'Projekt-Filter',
            allProjects: 'Alle Projekte',
            grouping: 'Gruppierung',
            groupByMarker: 'Pro Marker',
            groupByTask: 'Pro Aufgabe',
            perPage: 'Pro Seite',
            modelFilter: 'Modell',
            kindFilter: 'Kind',
            allModels: 'Alle Modelle',
            allKinds: 'Alle Kinds',
            minCost: 'Min. Kosten ($)',
            includedOnly: 'Nur Included',
            exportCsv: 'Events CSV',
            exportEventsJson: 'Events JSON',
            prevPage: 'Zurück',
            nextPage: 'Weiter',
            noEvents: 'Keine Events im gewählten Zeitraum',
            sortClick: 'Klicken zum Sortieren',
            sortAsc: 'Aufsteigend sortiert — erneut klicken für absteigend',
            sortDesc: 'Absteigend sortiert — erneut klicken für aufsteigend',
            locale: 'Sprache',
        },
        en: {
            localeName: 'English',
            users: 'Users',
            usersAll: 'All',
            dataSource: 'Data source',
            dataCsv: 'CSV',
            dataLive: 'Live (proxy)',
            dataMerge: 'Both',
            loadCsv: 'Load CSV',
            liveRefresh: 'Refresh live',
            exportJson: 'Export JSON',
            exportMarkers: 'Export markers',
            importMarkers: 'Import markers',
            view: 'View',
            timeRange: 'Time range',
            requests: 'Requests',
            individualRequests: 'Individual requests',
            projectFilter: 'Project filter',
            allProjects: 'All projects',
            grouping: 'Grouping',
            groupByMarker: 'By marker',
            groupByTask: 'By task',
            perPage: 'Per page',
            modelFilter: 'Model',
            kindFilter: 'Kind',
            allModels: 'All models',
            allKinds: 'All kinds',
            minCost: 'Min. cost ($)',
            includedOnly: 'Included only',
            exportCsv: 'Events CSV',
            exportEventsJson: 'Events JSON',
            prevPage: 'Previous',
            nextPage: 'Next',
            noEvents: 'No events in the selected range',
            sortClick: 'Click to sort',
            sortAsc: 'Sorted ascending — click for descending',
            sortDesc: 'Sorted descending — click for ascending',
            locale: 'Language',
        },
    };

    let locale = localStorage.getItem(STORAGE_KEY) || 'de';
    if (!translations[locale]) {
        locale = 'de';
    }

    function t(key) {
        const table = translations[locale] || translations.de;
        return table[key] ?? translations.de[key] ?? key;
    }

    function getLocale() {
        return locale;
    }

    function getIntlLocale() {
        return locale === 'en' ? 'en-US' : 'de-DE';
    }

    function setLocale(next) {
        if (!translations[next]) {
            return;
        }
        locale = next;
        localStorage.setItem(STORAGE_KEY, locale);
        if (typeof document !== 'undefined') {
            document.documentElement.lang = locale;
        }
    }

    function onLocaleChange(listener) {
        if (typeof listener === 'function') {
            global.CursorAnalytics = global.CursorAnalytics || {};
            global.CursorAnalytics._localeListeners = global.CursorAnalytics._localeListeners || [];
            global.CursorAnalytics._localeListeners.push(listener);
        }
    }

    function notifyLocaleChange() {
        const listeners = global.CursorAnalytics?._localeListeners || [];
        for (const listener of listeners) {
            listener(locale);
        }
    }

    function switchLocale(next) {
        setLocale(next);
        notifyLocaleChange();
    }

    if (typeof document !== 'undefined') {
        document.documentElement.lang = locale;
    }

    global.CursorAnalytics = global.CursorAnalytics || {};
    global.CursorAnalytics.i18n = {
        t,
        getLocale,
        getIntlLocale,
        setLocale,
        switchLocale,
        onLocaleChange,
        translations,
    };
})(typeof window !== 'undefined' ? window : globalThis);
