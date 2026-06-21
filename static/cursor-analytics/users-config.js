/**
 * Lädt config/users.json und stellt USER_ORDER / USERS für Parser und UI bereit.
 */
(function initCursorAnalyticsUsersConfig(global) {
    const USER_PALETTE = ['#3ecf8e', '#a78bfa', '#f59e0b', '#38bdf8', '#f472b6', '#34d399'];

    const DEFAULT_CONFIG = {
        users: [
            {
                id: 'primary',
                label: 'Primary',
                defaultCsvPaths: ['./data/usage-events-primary.csv'],
            },
            {
                id: 'secondary',
                label: 'Secondary',
                defaultCsvPaths: ['./data/usage-events-secondary.csv'],
            },
        ],
    };

    let USER_ORDER = [];
    let USERS = {};
    let loaded = false;

    function sanitizeUserId(id) {
        return String(id || '')
            .trim()
            .replace(/[^a-zA-Z0-9_-]/g, '');
    }

    function hexToRgb(hex) {
        const h = String(hex).replace('#', '');
        const full =
            h.length === 3
                ? h
                      .split('')
                      .map((c) => c + c)
                      .join('')
                : h;
        const n = Number.parseInt(full, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function buildFromConfig(config) {
        const entries = Array.isArray(config?.users) ? config.users : DEFAULT_CONFIG.users;
        USER_ORDER = [];
        USERS = {};
        for (const entry of entries) {
            const id = sanitizeUserId(entry.id);
            if (!id) {
                continue;
            }
            USER_ORDER.push(id);
            const colorIndex = USER_ORDER.length - 1;
            USERS[id] = {
                label: String(entry.label || id).trim() || id,
                defaultPaths:
                    Array.isArray(entry.defaultCsvPaths) && entry.defaultCsvPaths.length
                        ? entry.defaultCsvPaths.map(String)
                        : [`./data/usage-events-${id}.csv`],
                color: entry.color || USER_PALETTE[colorIndex % USER_PALETTE.length],
            };
        }
        if (!USER_ORDER.length) {
            buildFromConfig(DEFAULT_CONFIG);
        }
    }

    function injectUserStyles() {
        if (typeof document === 'undefined') {
            return;
        }
        const styleId = 'cursor-user-theme-styles';
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }
        const rules = [];
        for (const userId of USER_ORDER) {
            const color = USERS[userId].color;
            const rgb = hexToRgb(color);
            rules.push(
                `.usage-table__user--${userId} { color: ${color}; }`,
                `.usage-table__row--${userId} { background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08); }`,
                `.usage-table__row--${userId}:hover { background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14); }`
            );
        }
        style.textContent = rules.join('\n');
    }

    async function loadUsersConfig() {
        if (loaded) {
            return { USER_ORDER, USERS };
        }
        try {
            const response = await fetch('./config/users.json', { cache: 'no-store' });
            if (response.ok) {
                buildFromConfig(await response.json());
                loaded = true;
                injectUserStyles();
                return { USER_ORDER, USERS };
            }
        } catch {
            /* fetch failed — use defaults */
        }
        buildFromConfig(DEFAULT_CONFIG);
        loaded = true;
        injectUserStyles();
        return { USER_ORDER, USERS };
    }

    function detectUserFromFilename(filename) {
        const lower = String(filename).toLowerCase();
        for (const userId of USER_ORDER) {
            if (lower.includes(userId.toLowerCase())) {
                return userId;
            }
        }
        return USER_ORDER[0];
    }

    function emptyEventsByUser() {
        const map = {};
        for (const id of USER_ORDER) {
            map[id] = [];
        }
        return map;
    }

    function getDefaultUserId() {
        return USER_ORDER[0] || 'primary';
    }

    function getValidUserFilters() {
        return ['all', ...USER_ORDER];
    }

    global.CursorAnalytics = global.CursorAnalytics || {};
    global.CursorAnalytics.usersConfig = {
        get USER_ORDER() {
            return USER_ORDER;
        },
        get USERS() {
            return USERS;
        },
        loadUsersConfig,
        detectUserFromFilename,
        emptyEventsByUser,
        getDefaultUserId,
        getValidUserFilters,
        injectUserStyles,
    };
})(typeof window !== 'undefined' ? window : globalThis);
