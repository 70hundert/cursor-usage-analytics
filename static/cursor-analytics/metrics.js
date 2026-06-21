/**
 * Aggregationen und KPIs für Cursor Usage Analytics
 */
(function initCursorAnalyticsMetrics(global) {
    const DAY_NAMES = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    /** JavaScript getDay(): 0=So … 6=Sa → Index 0=Mo … 6=So */
    function mondayBasedDayIndex(date) {
        const day = date.getDay();
        return day === 0 ? 6 : day - 1;
    }

    function startOfLocalDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    }

    function endOfLocalDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    }

    function parseDateInputValue(value) {
        if (!value) {
            return null;
        }
        const [year, month, day] = value.split('-').map(Number);
        if (!year || !month || !day) {
            return null;
        }
        return new Date(year, month - 1, day);
    }

    function parseDateTimeLocalValue(value) {
        if (!value) {
            return null;
        }
        if (String(value).includes('T')) {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        }
        return parseDateInputValue(value);
    }

    function customRangeBoundsMs(customFrom, customTo) {
        const fromDate = parseDateTimeLocalValue(customFrom);
        const toDate = parseDateTimeLocalValue(customTo);
        if (!fromDate || !toDate) {
            return null;
        }

        const fromMs = String(customFrom).includes('T')
            ? fromDate.getTime()
            : startOfLocalDay(fromDate).getTime();
        const toMs = String(customTo).includes('T')
            ? toDate.getTime()
            : endOfLocalDay(toDate).getTime();
        return fromMs <= toMs ? [fromMs, toMs] : [toMs, fromMs];
    }

    function countFetchHours(countRange) {
        const { mode, count, countFrom, countTo } = countRange;
        if (mode === 'all') {
            return null;
        }

        let n = 50;
        if (mode === 'countRange') {
            n = Math.max(
                Number(countFrom) || 1,
                Number(countTo) || 50
            );
        } else {
            n = Number(count) || 50;
        }

        if (n <= 10) {
            return 48;
        }
        if (n <= 25) {
            return 120;
        }
        if (n <= 50) {
            return 168;
        }
        if (n <= 100) {
            return 336;
        }
        if (n <= 250) {
            return 720;
        }
        if (n <= 500) {
            return 2160;
        }
        if (n <= 1000) {
            return 4320;
        }
        return 8760;
    }

    function liveFetchBoundsMs(range, referenceEndMs = Date.now(), selectionMode = 'time') {
        if (selectionMode === 'count') {
            const hours = countFetchHours(range);
            if (hours == null) {
                return null;
            }
            const endMs = referenceEndMs;
            return { startMs: endMs - hours * 60 * 60 * 1000, endMs };
        }

        const { mode, hours, customFrom, customTo } = range;

        if (mode === 'all') {
            return null;
        }

        if (mode === 'custom') {
            const bounds = customRangeBoundsMs(customFrom, customTo);
            if (!bounds) {
                return null;
            }
            const [startMs, endMs] = bounds;
            return { startMs, endMs };
        }

        const endMs = referenceEndMs;
        const startMs = endMs - hours * 60 * 60 * 1000;
        return { startMs, endMs };
    }

    function liveBoundsContains(loadedBounds, desiredBounds) {
        if (!desiredBounds) {
            return !loadedBounds;
        }
        if (!loadedBounds) {
            return true;
        }
        return (
            loadedBounds.startMs <= desiredBounds.startMs &&
            loadedBounds.endMs >= desiredBounds.endMs
        );
    }

    function mergeLiveBounds(existingBounds, fetchedBounds) {
        if (!fetchedBounds) {
            return null;
        }
        if (!existingBounds) {
            return { ...fetchedBounds };
        }
        return {
            startMs: Math.min(existingBounds.startMs, fetchedBounds.startMs),
            endMs: Math.max(existingBounds.endMs, fetchedBounds.endMs),
        };
    }

    function getEventTimeBoundsMs(events) {
        if (!events.length) {
            return null;
        }
        let minMs = events[0].timestamp.getTime();
        let maxMs = minMs;
        for (const event of events) {
            const ms = event.timestamp.getTime();
            if (ms < minMs) {
                minMs = ms;
            }
            if (ms > maxMs) {
                maxMs = ms;
            }
        }
        return { minMs, maxMs };
    }

    function getReferenceEndMs(events) {
        const bounds = getEventTimeBoundsMs(events);
        return bounds ? bounds.maxMs : Date.now();
    }

    function filterEventsByCount(events, countRange) {
        if (!events.length) {
            return events;
        }

        const sorted = [...events].sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );
        const { mode, count, countFrom, countTo } = countRange;

        if (mode === 'all') {
            return sorted;
        }

        if (mode === 'countRange') {
            const total = sorted.length;
            let fromNewest = Math.max(1, Math.floor(Number(countFrom) || 1));
            let toNewest = Math.max(fromNewest, Math.floor(Number(countTo) || 50));
            toNewest = Math.min(toNewest, total);
            fromNewest = Math.min(fromNewest, toNewest);
            const startIdx = total - toNewest;
            const endIdx = total - fromNewest + 1;
            return sorted.slice(startIdx, endIdx);
        }

        const n = Number(count);
        if (!Number.isFinite(n) || n <= 0) {
            return sorted;
        }

        return sorted.slice(-n);
    }

    function filterEvents(events, range) {
        if (!events.length) {
            return events;
        }

        const { mode, hours, customFrom, customTo } = range;

        if (mode === 'all') {
            return events;
        }

        if (mode === 'custom') {
            const bounds = customRangeBoundsMs(customFrom, customTo);
            if (!bounds) {
                return events;
            }
            const [startMs, endMs] = bounds;
            return events.filter((event) => {
                const time = event.timestamp.getTime();
                return time >= startMs && time <= endMs;
            });
        }

        const referenceEnd = getReferenceEndMs(events);
        const cutoff = referenceEnd - hours * 60 * 60 * 1000;
        return events.filter((event) => {
            const time = event.timestamp.getTime();
            return time >= cutoff && time <= referenceEnd;
        });
    }

    function filterByUser(events, userFilter) {
        if (userFilter === 'all') {
            return events;
        }
        return events.filter((event) => event.userLabel === userFilter);
    }

    function sumField(events, key) {
        return events.reduce((acc, event) => acc + (event[key] ?? 0), 0);
    }

    function computeKpis(events, range) {
        const totalTokens = sumField(events, 'totalTokens');
        const costCents = sumField(events, 'costCents');
        const billableEvents = events.filter((e) => e.isChargeable || e.costCents > 0).length;
        const includedEvents = events.filter((e) => e.isIncluded).length;

        const daySpanMs = events.length
            ? Math.max(
                  1,
                  events[events.length - 1].timestamp.getTime() -
                      events[0].timestamp.getTime()
              )
            : 1;
        const dayCount = Math.max(1, daySpanMs / (24 * 60 * 60 * 1000));
        const dailyAvgCents = costCents / dayCount;
        const projectedMonthlyCents = dailyAvgCents * 30;

        let trendPercent = 0;
        let trendLabel = 'stable';
        if (events.length >= 2 && range.mode === 'hours') {
            const midpoint = events[0].timestamp.getTime() + daySpanMs / 2;
            const firstHalf = events.filter((e) => e.timestamp.getTime() < midpoint);
            const secondHalf = events.filter((e) => e.timestamp.getTime() >= midpoint);
            const firstCost = sumField(firstHalf, 'costCents');
            const secondCost = sumField(secondHalf, 'costCents');
            if (firstCost > 0) {
                trendPercent = ((secondCost - firstCost) / firstCost) * 100;
            } else if (secondCost > 0) {
                trendPercent = 100;
            }
            trendLabel = trendPercent > 5 ? 'up' : trendPercent < -5 ? 'down' : 'stable';
        }

        return {
            totalTokens,
            costCents,
            billableEvents,
            includedEvents,
            totalCalls: events.length,
            dailyAvgCents,
            projectedMonthlyCents,
            trendPercent,
            trendLabel,
        };
    }

    function aggregateByModel(events, limit = 5) {
        const byModel = new Map();

        for (const event of events) {
            const existing = byModel.get(event.model) || {
                model: event.model,
                tokens: 0,
                costCents: 0,
                calls: 0,
            };
            existing.tokens += event.totalTokens;
            existing.costCents += event.costCents;
            existing.calls += 1;
            byModel.set(event.model, existing);
        }

        const all = [...byModel.values()];
        return {
            byCost: [...all].sort((a, b) => b.costCents - a.costCents).slice(0, limit),
            byTokens: [...all].sort((a, b) => b.tokens - a.tokens).slice(0, limit),
            all,
        };
    }

    function aggregateTokenTypes(events) {
        return {
            inputNoCache: sumField(events, 'inputNoCache'),
            inputWithCacheWrite: sumField(events, 'inputWithCacheWrite'),
            cacheRead: sumField(events, 'cacheRead'),
            outputTokens: sumField(events, 'outputTokens'),
        };
    }

    function startOfWeekLocal(date) {
        const d = startOfLocalDay(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d;
    }

    function startOfMonthLocal(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
    }

    const GRANULARITY_LABELS = {
        event: 'Pro Anfrage',
        quarter: '15 Minuten',
        hour: 'Stündlich',
        day: 'Täglich',
        week: 'Wöchentlich',
        month: 'Monatlich',
    };

    const GRANULARITY_OVERVIEW_TITLES = {
        event: 'Übersicht — Tokens & Kosten pro Anfrage',
        quarter: 'Übersicht — Tokens & Kosten (15 Min.)',
        hour: 'Übersicht — Tokens & Kosten pro Stunde',
        day: 'Übersicht — Tokens & Kosten pro Tag',
        week: 'Übersicht — Tokens & Kosten pro Woche',
        month: 'Übersicht — Tokens & Kosten pro Monat',
    };

    function aggregateByEvent(events, formatters) {
        const { dateTimeFmt } = formatters;
        return events.map((event, index) => ({
            key: `${event.timestamp.getTime()}-${index}`,
            sortKey: event.timestamp.getTime() + index * 0.001,
            bucketStart: event.timestamp,
            label: dateTimeFmt.format(event.timestamp),
            tokens: event.totalTokens,
            inputWithCacheWrite: event.inputWithCacheWrite,
            inputNoCache: event.inputNoCache,
            cacheRead: event.cacheRead,
            outputTokens: event.outputTokens,
            costCents: event.costCents,
            calls: 1,
        }));
    }

    function bucketMetaForEvent(event, granularity) {
        const ts = event.timestamp;
        if (granularity === 'quarter') {
            const quarterMinute = Math.floor(ts.getMinutes() / 15) * 15;
            const bucketStart = new Date(
                ts.getFullYear(),
                ts.getMonth(),
                ts.getDate(),
                ts.getHours(),
                quarterMinute,
                0,
                0
            );
            return {
                key: bucketStart.toISOString(),
                sortKey: bucketStart.getTime(),
                bucketStart,
            };
        }
        if (granularity === 'hour') {
            const bucketStart = new Date(
                ts.getFullYear(),
                ts.getMonth(),
                ts.getDate(),
                ts.getHours(),
                0,
                0,
                0
            );
            return {
                key: bucketStart.toISOString(),
                sortKey: bucketStart.getTime(),
                bucketStart,
            };
        }
        if (granularity === 'week') {
            const bucketStart = startOfWeekLocal(ts);
            return {
                key: toDateInputValue(bucketStart),
                sortKey: bucketStart.getTime(),
                bucketStart,
            };
        }
        if (granularity === 'month') {
            const bucketStart = startOfMonthLocal(ts);
            const key = `${bucketStart.getFullYear()}-${String(bucketStart.getMonth() + 1).padStart(2, '0')}`;
            return {
                key,
                sortKey: bucketStart.getTime(),
                bucketStart,
            };
        }
        const bucketStart = startOfLocalDay(ts);
        return {
            key: event.dayKey,
            sortKey: bucketStart.getTime(),
            bucketStart,
        };
    }

    function toDateInputValue(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatBucketLabel(bucketStart, granularity, formatters) {
        const { dateFmt, dateTimeFmt, monthFmt } = formatters;
        if (granularity === 'event' || granularity === 'quarter' || granularity === 'hour') {
            return dateTimeFmt.format(bucketStart);
        }
        if (granularity === 'month') {
            return monthFmt.format(bucketStart);
        }
        if (granularity === 'week') {
            const end = new Date(bucketStart);
            end.setDate(end.getDate() + 6);
            return `${dateFmt.format(bucketStart)} – ${dateFmt.format(end)}`;
        }
        return dateFmt.format(bucketStart);
    }

    function aggregateByGranularity(events, granularity, formatters) {
        if (granularity === 'event') {
            return aggregateByEvent(events, formatters);
        }

        const byKey = new Map();

        for (const event of events) {
            const { key, sortKey, bucketStart } = bucketMetaForEvent(event, granularity);
            const existing = byKey.get(key) || {
                key,
                sortKey,
                bucketStart,
                label: formatBucketLabel(bucketStart, granularity, formatters),
                tokens: 0,
                inputWithCacheWrite: 0,
                inputNoCache: 0,
                cacheRead: 0,
                outputTokens: 0,
                costCents: 0,
                calls: 0,
            };
            existing.tokens += event.totalTokens;
            existing.inputWithCacheWrite += event.inputWithCacheWrite;
            existing.inputNoCache += event.inputNoCache;
            existing.cacheRead += event.cacheRead;
            existing.outputTokens += event.outputTokens;
            existing.costCents += event.costCents;
            existing.calls += 1;
            byKey.set(key, existing);
        }

        return [...byKey.values()].sort((a, b) => a.sortKey - b.sortKey);
    }

    function cumulativeByGranularity(events, granularity, formatters) {
        const buckets = aggregateByGranularity(events, granularity, formatters);
        let cumulativeCost = 0;
        let cumulativeTokens = 0;

        return buckets.map((bucket) => {
            cumulativeCost += bucket.costCents;
            cumulativeTokens += bucket.tokens;
            return {
                ...bucket,
                cumulativeCost,
                cumulativeTokens,
            };
        });
    }

    function aggregateByHour(events) {
        const buckets = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            calls: 0,
            tokens: 0,
            costCents: 0,
        }));

        for (const event of events) {
            const hour = event.timestamp.getHours();
            buckets[hour].calls += 1;
            buckets[hour].tokens += event.totalTokens;
            buckets[hour].costCents += event.costCents;
        }

        return buckets;
    }

    function aggregateByDayOfWeek(events) {
        const buckets = DAY_NAMES.map((label, day) => ({
            day,
            label,
            calls: 0,
            tokens: 0,
            costCents: 0,
        }));

        for (const event of events) {
            const dayIndex = mondayBasedDayIndex(event.timestamp);
            buckets[dayIndex].calls += 1;
            buckets[dayIndex].tokens += event.totalTokens;
            buckets[dayIndex].costCents += event.costCents;
        }

        return buckets;
    }

    function cumulativeCostByDay(events) {
        const byDay = new Map();

        for (const event of events) {
            const existing = byDay.get(event.dayKey) || {
                dayKey: event.dayKey,
                costCents: 0,
                tokens: 0,
                calls: 0,
            };
            existing.costCents += event.costCents;
            existing.tokens += event.totalTokens;
            existing.calls += 1;
            byDay.set(event.dayKey, existing);
        }

        const days = [...byDay.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
        let cumulativeCost = 0;
        let cumulativeTokens = 0;

        return days.map((day) => {
            cumulativeCost += day.costCents;
            cumulativeTokens += day.tokens;
            return {
                ...day,
                cumulativeCost,
                cumulativeTokens,
            };
        });
    }

    function aggregateDailyTable(events) {
        const byDayUser = new Map();

        for (const event of events) {
            const key = `${event.dayKey}|${event.userLabel}`;
            const existing = byDayUser.get(key) || {
                dayKey: event.dayKey,
                userLabel: event.userLabel,
                events: 0,
                totalTokens: 0,
                costCents: 0,
                modelCounts: new Map(),
            };

            existing.events += 1;
            existing.totalTokens += event.totalTokens;
            existing.costCents += event.costCents;
            existing.modelCounts.set(
                event.model,
                (existing.modelCounts.get(event.model) || 0) + 1
            );
            byDayUser.set(key, existing);
        }

        return [...byDayUser.values()]
            .map((row) => {
                let topModel = '—';
                let topCount = 0;
                for (const [model, count] of row.modelCounts) {
                    if (count > topCount) {
                        topModel = model;
                        topCount = count;
                    }
                }
                return {
                    dayKey: row.dayKey,
                    userLabel: row.userLabel,
                    events: row.events,
                    totalTokens: row.totalTokens,
                    costCents: row.costCents,
                    topModel,
                };
            })
            .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
    }

    function topExpensiveEvents(events, limit = 15) {
        return [...events]
            .sort((a, b) => b.costCents - a.costCents || b.totalTokens - a.totalTokens)
            .slice(0, limit);
    }

    function modelFamily(model) {
        const lower = model.toLowerCase();
        if (lower.includes('opus')) return 'Opus';
        if (lower.includes('sonnet')) return 'Sonnet';
        if (lower.includes('haiku')) return 'Haiku';
        if (lower.includes('composer')) return 'Composer';
        if (lower.includes('gpt')) return 'GPT';
        if (lower.includes('gemini')) return 'Gemini';
        if (lower === 'auto') return 'Auto';
        return 'Other';
    }

    function aggregateByModelFamily(events) {
        const byFamily = new Map();

        for (const event of events) {
            const family = modelFamily(event.model);
            const existing = byFamily.get(family) || {
                family,
                tokens: 0,
                costCents: 0,
                calls: 0,
            };
            existing.tokens += event.totalTokens;
            existing.costCents += event.costCents;
            existing.calls += 1;
            byFamily.set(family, existing);
        }

        return [...byFamily.values()].sort((a, b) => b.costCents - a.costCents);
    }

    function cacheEfficiency(events) {
        const cacheRead = sumField(events, 'cacheRead');
        const inputNoCache = sumField(events, 'inputNoCache');
        const inputWithCacheWrite = sumField(events, 'inputWithCacheWrite');
        const totalInput = inputNoCache + inputWithCacheWrite + cacheRead;
        const hitRate = totalInput > 0 ? (cacheRead / totalInput) * 100 : 0;
        return { cacheRead, inputNoCache, inputWithCacheWrite, totalInput, hitRate };
    }

    global.CursorAnalytics = global.CursorAnalytics || {};
    global.CursorAnalytics.metrics = {
        DAY_NAMES,
        GRANULARITY_LABELS,
        GRANULARITY_OVERVIEW_TITLES,
        filterEvents,
        filterEventsByCount,
        filterByUser,
        liveFetchBoundsMs,
        liveBoundsContains,
        mergeLiveBounds,
        computeKpis,
        aggregateByModel,
        aggregateTokenTypes,
        aggregateByGranularity,
        cumulativeByGranularity,
        aggregateByHour,
        aggregateByDayOfWeek,
        cumulativeCostByDay,
        aggregateDailyTable,
        topExpensiveEvents,
        aggregateByModelFamily,
        cacheEfficiency,
        sumField,
    };
})(typeof window !== 'undefined' ? window : globalThis);
