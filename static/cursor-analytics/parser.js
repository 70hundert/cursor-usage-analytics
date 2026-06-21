/**
 * CSV + API → normalisiertes Usage-Event-Modell
 */
(function initCursorAnalyticsParser(global) {
    function getUsersConfig() {
        return global.CursorAnalytics?.usersConfig;
    }

    function getUserOrder() {
        const config = getUsersConfig();
        return config?.USER_ORDER?.length ? [...config.USER_ORDER] : ['primary'];
    }

    function getUsers() {
        const config = getUsersConfig();
        return config?.USERS ? { ...config.USERS } : {};
    }

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i += 1) {
            const char = text[i];
            const next = text[i + 1];

            if (inQuotes) {
                if (char === '"' && next === '"') {
                    field += '"';
                    i += 1;
                } else if (char === '"') {
                    inQuotes = false;
                } else {
                    field += char;
                }
                continue;
            }

            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(field);
                field = '';
            } else if (char === '\n') {
                row.push(field);
                field = '';
                if (row.some((cell) => cell.length > 0)) {
                    rows.push(row);
                }
                row = [];
            } else if (char !== '\r') {
                field += char;
            }
        }

        if (field.length > 0 || row.length > 0) {
            row.push(field);
            if (row.some((cell) => cell.length > 0)) {
                rows.push(row);
            }
        }

        return rows;
    }

    function parseIntField(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        const parsed = Number.parseInt(String(value).trim(), 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function parseCostCents(costRaw, kindRaw) {
        const cost = String(costRaw ?? '').trim();
        const kind = String(kindRaw ?? '').trim().toLowerCase();

        if (!cost || cost.toLowerCase() === 'included' || kind === 'included') {
            return { costCents: 0, isIncluded: true, costDisplay: cost || 'Included' };
        }

        if (cost.toLowerCase().includes('no charge') || cost.toLowerCase().includes('errored')) {
            return { costCents: 0, isIncluded: false, costDisplay: cost };
        }

        const normalized = cost.replace(/[^0-9.,-]/g, '').replace(',', '.');
        const dollars = Number.parseFloat(normalized);
        if (Number.isFinite(dollars)) {
            return {
                costCents: Math.round(dollars * 100),
                isIncluded: false,
                costDisplay: cost,
            };
        }

        return { costCents: 0, isIncluded: false, costDisplay: cost };
    }

    function normalizeEvent(fields) {
        const timestamp = fields.timestamp instanceof Date ? fields.timestamp : new Date(fields.timestamp);
        const kind = String(fields.kind ?? '').trim();
        const costInfo = parseCostCents(fields.costRaw, kind);

        return {
            timestamp,
            dayKey: timestamp.toISOString().slice(0, 10),
            userLabel: fields.userLabel,
            model: String(fields.model ?? 'unknown').trim() || 'unknown',
            kind: kind || 'unknown',
            maxMode: String(fields.maxMode ?? '').trim(),
            inputWithCacheWrite: fields.inputWithCacheWrite ?? 0,
            inputNoCache: fields.inputNoCache ?? 0,
            cacheRead: fields.cacheRead ?? 0,
            outputTokens: fields.outputTokens ?? 0,
            totalTokens: fields.totalTokens ?? 0,
            costCents: fields.costCents ?? costInfo.costCents,
            isIncluded: fields.isIncluded ?? costInfo.isIncluded,
            isChargeable: fields.isChargeable ?? (fields.costCents ?? costInfo.costCents) > 0,
            costDisplay: fields.costDisplay ?? costInfo.costDisplay,
            source: fields.source ?? 'csv',
        };
    }

    function parseUsageEventsCsv(csvText, userLabel) {
        const rows = parseCsv(csvText);
        if (rows.length < 2) {
            return [];
        }

        const header = rows[0];
        const indexOf = (name) => header.indexOf(name);

        const dateIdx = indexOf('Date');
        const kindIdx = indexOf('Kind');
        const modelIdx = indexOf('Model');
        const maxModeIdx = indexOf('Max Mode');
        const inputWithCacheIdx = indexOf('Input (w/ Cache Write)');
        const inputNoCacheIdx = indexOf('Input (w/o Cache Write)');
        const cacheReadIdx = indexOf('Cache Read');
        const outputIdx = indexOf('Output Tokens');
        const totalIdx = indexOf('Total Tokens');
        const costIdx = indexOf('Cost');

        if (
            [dateIdx, inputNoCacheIdx, cacheReadIdx, outputIdx, totalIdx].some((idx) => idx < 0)
        ) {
            throw new Error('Ungültiges CSV-Format — erwartete Spalten fehlen.');
        }

        const events = [];

        for (let i = 1; i < rows.length; i += 1) {
            const row = rows[i];
            const timestamp = new Date(row[dateIdx]);
            if (Number.isNaN(timestamp.getTime())) {
                continue;
            }

            const inputNoCache = parseIntField(row[inputNoCacheIdx]);
            const cacheRead = parseIntField(row[cacheReadIdx]);
            const outputTokens = parseIntField(row[outputIdx]);
            const totalTokens = parseIntField(row[totalIdx]);

            if (
                inputNoCache === null ||
                cacheRead === null ||
                outputTokens === null ||
                totalTokens === null
            ) {
                continue;
            }

            const inputWithCacheWrite =
                inputWithCacheIdx >= 0 ? parseIntField(row[inputWithCacheIdx]) ?? 0 : 0;

            events.push(
                normalizeEvent({
                    timestamp,
                    userLabel,
                    model: modelIdx >= 0 ? row[modelIdx] : 'unknown',
                    kind: kindIdx >= 0 ? row[kindIdx] : '',
                    maxMode: maxModeIdx >= 0 ? row[maxModeIdx] : '',
                    inputWithCacheWrite,
                    inputNoCache,
                    cacheRead,
                    outputTokens,
                    totalTokens,
                    costRaw: costIdx >= 0 ? row[costIdx] : '',
                    source: 'csv',
                })
            );
        }

        events.sort((a, b) => a.timestamp - b.timestamp);
        return events;
    }

    function normalizeApiEvent(raw, userLabel) {
        const tokenUsage = raw.tokenUsage || {};
        const timestampMs = Number.parseInt(String(raw.timestamp ?? ''), 10);
        const timestamp = Number.isFinite(timestampMs) ? new Date(timestampMs) : new Date();

        let costCents = raw.chargedCents;
        if (costCents == null && tokenUsage.totalCents != null) {
            costCents = tokenUsage.totalCents;
        }
        if (costCents == null && raw.usageBasedCosts) {
            costCents = parseCostCents(raw.usageBasedCosts, raw.kind).costCents;
        }
        costCents = Number.isFinite(Number(costCents)) ? Math.round(Number(costCents)) : 0;

        const inputTokens = tokenUsage.inputTokens ?? 0;
        const cacheWriteTokens = tokenUsage.cacheWriteTokens ?? 0;
        const cacheReadTokens = tokenUsage.cacheReadTokens ?? tokenUsage.cacheRead ?? 0;
        const outputTokens = tokenUsage.outputTokens ?? 0;

        const kind = String(raw.kind ?? '').replace(/^USAGE_EVENT_KIND_/i, '').replace(/_/g, ' ');
        const isIncluded =
            String(raw.kind ?? '').includes('INCLUDED') ||
            (costCents === 0 && !raw.isChargeable);

        return normalizeEvent({
            timestamp,
            userLabel,
            model: raw.model ?? 'unknown',
            kind: kind || 'unknown',
            maxMode: raw.maxMode ? 'Yes' : 'No',
            inputWithCacheWrite: cacheWriteTokens,
            inputNoCache: Math.max(0, inputTokens - cacheWriteTokens),
            cacheRead: cacheReadTokens,
            outputTokens,
            totalTokens: inputTokens + cacheReadTokens + outputTokens,
            costCents,
            isIncluded,
            isChargeable: Boolean(raw.isChargeable) || costCents > 0,
            costDisplay: raw.usageBasedCosts ?? `$${(costCents / 100).toFixed(2)}`,
            source: 'api',
        });
    }

    function eventDedupeKey(event) {
        return [
            event.timestamp.toISOString(),
            event.userLabel,
            event.model,
            event.totalTokens,
            event.inputNoCache,
            event.cacheRead,
            event.outputTokens,
            event.costCents,
        ].join('|');
    }

    function mergeEvents(eventLists) {
        const byKey = new Map();
        let rawCount = 0;

        for (const events of eventLists) {
            for (const event of events) {
                rawCount += 1;
                byKey.set(eventDedupeKey(event), event);
            }
        }

        const merged = [...byKey.values()].sort((a, b) => a.timestamp - b.timestamp);
        return {
            events: merged,
            rawCount,
            duplicateCount: rawCount - merged.length,
        };
    }

    function detectUserFromFilename(filename) {
        const config = getUsersConfig();
        if (config?.detectUserFromFilename) {
            return config.detectUserFromFilename(filename);
        }
        return getUserOrder()[0];
    }

    function groupEventsByUser(eventsByUser) {
        return getUserOrder().flatMap((userId) =>
            (eventsByUser[userId] || []).map((event) => ({ ...event, userLabel: userId }))
        );
    }

    global.CursorAnalytics = global.CursorAnalytics || {};
    global.CursorAnalytics.parser = {
        get USER_ORDER() {
            return getUserOrder();
        },
        get USERS() {
            return getUsers();
        },
        parseCsv,
        parseUsageEventsCsv,
        normalizeApiEvent,
        normalizeEvent,
        eventDedupeKey,
        mergeEvents,
        detectUserFromFilename,
        groupEventsByUser,
        parseCostCents,
    };
})(typeof window !== 'undefined' ? window : globalThis);
