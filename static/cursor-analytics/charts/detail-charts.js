/**
 * Detail-Charts (Top-Modelle, Token-Typen, Modellfamilien, Stunden/Wochentage,
 * Cache-Effizienz, Max-Mode, Input/Output, kumulative Kosten).
 */
import { COLORS } from './theme.js';
import { t, tf } from './util.js';
import {
    renderHorizontalBar,
    renderDoughnut,
    renderLine,
    renderBar,
    destroyChart,
} from './registry.js';
import { renderCumulativeBuckets } from './cumulative.js';

export function renderAll(instances, data, formatters) {
    const { numberFmt, currencyFmt, dateFmt } = formatters;
    const { models, tokenTypes, byHour, byDayOfWeek, cumulative, families, cache } = data;
    const safeNumberTick = (value) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return value;
        }
        return numberFmt.format(value);
    };
    const safeCurrencyTick = (value) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return value;
        }
        return currencyFmt.format(value);
    };

    renderHorizontalBar(
        data.canvases.topCost,
        instances,
        'topCost',
        models.byCost.map((m) => m.model),
        models.byCost.map((m) => m.costCents / 100),
        t('chartCostUsd'),
        COLORS.accent,
        safeCurrencyTick,
        'chartCostUsd'
    );

    renderHorizontalBar(
        data.canvases.topTokens,
        instances,
        'topTokens',
        models.byTokens.map((m) => m.model),
        models.byTokens.map((m) => m.tokens),
        t('tokens'),
        COLORS.blue,
        safeNumberTick,
        'tokens'
    );

    renderDoughnut(
        data.canvases.tokenTypes,
        instances,
        'tokenTypes',
        [
            { legendKey: 'inputNoCache', label: t('chartTokenInputNoCache') },
            { legendKey: 'cacheWrite', label: t('chartCacheWrite') },
            { legendKey: 'cacheRead', label: t('cacheRead') },
            { legendKey: 'output', label: t('output') },
        ],
        [
            tokenTypes.inputNoCache,
            tokenTypes.inputWithCacheWrite,
            tokenTypes.cacheRead,
            tokenTypes.outputTokens,
        ],
        null
    );

    renderBar(
        data.canvases.modelFamily,
        instances,
        'modelFamily',
        families.map((f) => f.family),
        [
            {
                label: t('chartCostUsd'),
                legendKey: 'chartCostUsd',
                data: families.map((f) => f.costCents / 100),
                backgroundColor: `${COLORS.gold}99`,
                borderColor: COLORS.gold,
            },
        ],
        null,
        safeCurrencyTick
    );

    renderBar(
        data.canvases.byHour,
        instances,
        'byHour',
        byHour.map((b) => `${String(b.hour).padStart(2, '0')}:00`),
        [
            {
                label: t('chartCalls'),
                legendKey: 'calls',
                data: byHour.map((b) => b.calls),
                backgroundColor: `${COLORS.blue}88`,
                borderColor: COLORS.blue,
            },
        ],
        null,
        safeNumberTick
    );

    if (data.cumulativeBuckets?.length) {
        renderCumulativeBuckets(
            data.canvases.cumulative,
            instances,
            'cumulative',
            data.cumulativeBuckets,
            data.granularity || 'day',
            formatters,
            data.markerContext || null
        );
    } else {
        renderLine(
            data.canvases.cumulative,
            instances,
            'cumulative',
            cumulative.map((d) => dateFmt.format(new Date(`${d.dayKey}T12:00:00Z`))),
            [
                {
                    label: t('chartCumulativeCostUsd'),
                    legendKey: 'chartCumulativeCostUsd',
                    data: cumulative.map((d) => d.cumulativeCost / 100),
                    borderColor: COLORS.accent,
                    backgroundColor: `${COLORS.accent}22`,
                    fill: true,
                    tension: 0.2,
                },
            ],
            null,
            safeCurrencyTick
        );
    }

    renderBar(
        data.canvases.inputOutput,
        instances,
        'inputOutput',
        [t('chartInput'), t('output'), t('cacheRead')],
        [
            {
                label: t('tokens'),
                legendKey: 'tokens',
                data: [
                    tokenTypes.inputNoCache + tokenTypes.inputWithCacheWrite,
                    tokenTypes.outputTokens,
                    tokenTypes.cacheRead,
                ],
                backgroundColor: [COLORS.blue, COLORS.orange, COLORS.gold].map(
                    (c) => `${c}99`
                ),
                borderColor: [COLORS.blue, COLORS.orange, COLORS.gold],
            },
        ],
        null,
        safeNumberTick
    );

    renderDoughnut(
        data.canvases.cacheEfficiency,
        instances,
        'cacheEfficiency',
        [
            { legendKey: 'cacheRead', label: t('cacheRead') },
            { legendKey: 'otherInput', label: t('chartOtherInput') },
        ],
        [cache.cacheRead, Math.max(0, cache.totalInput - cache.cacheRead)],
        tf('chartCacheHit', { pct: cache.hitRate.toFixed(1) })
    );

    renderBar(
        data.canvases.byWeekday,
        instances,
        'byWeekday',
        byDayOfWeek.map((b) => b.label),
        [
            {
                label: t('tokens'),
                legendKey: 'tokens',
                data: byDayOfWeek.map((b) => b.tokens),
                backgroundColor: `${COLORS.purple}88`,
                borderColor: COLORS.purple,
            },
        ],
        null,
        safeNumberTick
    );

    if (data.maxMode?.length && data.canvases.maxMode) {
        renderBar(
            data.canvases.maxMode,
            instances,
            'maxMode',
            data.maxMode.map((entry) =>
                entry.mode === 'Yes' ? t('maxModeYes') : t('maxModeNo')
            ),
            [
                {
                    label: t('tokens'),
                    legendKey: 'tokens',
                    data: data.maxMode.map((entry) => entry.tokens),
                    backgroundColor: `${COLORS.blue}88`,
                    borderColor: COLORS.blue,
                },
                {
                    label: t('chartCostUsd'),
                    legendKey: 'chartCostUsd',
                    data: data.maxMode.map((entry) => entry.costCents / 100),
                    backgroundColor: `${COLORS.gold}99`,
                    borderColor: COLORS.gold,
                },
            ],
            null,
            safeNumberTick
        );
    } else {
        destroyChart(instances, 'maxMode');
    }
}
