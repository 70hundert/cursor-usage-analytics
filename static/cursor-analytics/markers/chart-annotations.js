/**
 * Chart-Annotationen fuer Marker: Labels (mit Kollisions-Lanes), Fokus-Icons,
 * Linien/Boxen und deren Hover-/Klick-Interaktionen (chartjs-plugin-annotation).
 */
import { projectColor, buildProjectColorMap } from './colors.js';
import { markerIntervalMs } from './stats.js';
import { categoryAnnotationRange } from './buckets.js';
import { filterChartMarkers } from './display-prefs.js';
import {
    showChartPopover,
    hideChartPopover,
    scheduleHidePopover,
    popoverPinned,
    popoverMarkerId,
} from './popover.js';

const CHART_LABEL_MAX_LEN = 28;
const CHART_LABEL_LANE_HEIGHT = 22;
const CHART_LABEL_OFFSET_LEFT = 6;
const CHART_LABEL_OFFSET_TOP = 4;
const CHART_LABEL_COLLISION_GAP = 0.12;
const CHART_FOCUS_ICON = '🔍';
const CHART_FOCUS_ICON_ACTIVE = '◉';
const CHART_FOCUS_ICON_SLOT_PX = 26;
const MARKER_FOCUS_COLOR = '#3ecf8e';

function defaultHitWidthMs(chartContext) {
    if (chartContext.hitWidthMs) {
        return chartContext.hitWidthMs;
    }
    return 20 * 60 * 1000;
}

function compactChartLabelText(marker) {
    const task = String(marker.task ?? '').trim();
    const project = String(marker.project ?? '').trim();
    let text = task || project;
    if (!text) {
        return '';
    }

    const parts = text.split(/\s*[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) {
        const shortest = parts.reduce((a, b) => (a.length <= b.length ? a : b));
        const last = parts[parts.length - 1];
        if (shortest.length >= 4 && shortest.length <= CHART_LABEL_MAX_LEN) {
            text = shortest;
        } else if (last.length >= 4 && last.length <= CHART_LABEL_MAX_LEN) {
            text = last;
        }
    }

    if (text.length <= CHART_LABEL_MAX_LEN) {
        return text;
    }
    const splitAt = text.lastIndexOf(' ', CHART_LABEL_MAX_LEN);
    if (splitAt > 8) {
        return `${text.slice(0, splitAt)}…`;
    }
    return `${text.slice(0, CHART_LABEL_MAX_LEN - 1)}…`;
}

/** Einzeiliger Chart-Text — vollständige Details im Popover und per Hover. */
function chartLabelContent(marker) {
    const text = compactChartLabelText(marker);
    return text ? [text] : [];
}

function labelTextFromContent(content) {
    if (Array.isArray(content)) {
        return content.join(' ').trim();
    }
    return String(content ?? '').trim();
}

function estimateLabelWidthUnits(content, mode) {
    const len = labelTextFromContent(content).length;
    if (mode === 'category') {
        return Math.max(2.4, len * 0.17);
    }
    return Math.max(25 * 60 * 1000, len * 3 * 60 * 1000);
}

function focusIconWidthUnits(mode) {
    return mode === 'category' ? 0.5 : 18 * 60 * 1000;
}

function computeCollisionLabelLanes(placements) {
    const lanes = new Map();
    if (!placements.length) {
        return { lanes, maxLane: -1 };
    }

    const sorted = [...placements].sort((a, b) => a.x - b.x || String(a.id).localeCompare(String(b.id)));
    const laneEnds = [];

    for (const item of sorted) {
        let lane = 0;
        while (lane < laneEnds.length && item.x < laneEnds[lane] - CHART_LABEL_COLLISION_GAP) {
            lane += 1;
        }
        laneEnds[lane] = item.x + item.width;
        lanes.set(item.id, lane);
    }

    return { lanes, maxLane: laneEnds.length - 1 };
}

function collectMarkerLabelPlacements(visible, chartContext) {
    const { mode = 'time', buckets, markers, filterEndMs } = chartContext;
    const showLabels = chartContext.showLabels !== false;
    const canEdit = Boolean(chartContext.onEditMarker);
    const canFocus = Boolean(chartContext.onFocusMarker);
    const placements = [];

    for (const marker of visible) {
        let content = [];
        if (showLabels) {
            content = chartLabelContent(marker);
        } else if (canEdit) {
            content = ['✎'];
        }
        if (!content.length) {
            continue;
        }

        const focusExtra = canFocus ? focusIconWidthUnits(mode) : 0;

        if (mode === 'category' && buckets?.length) {
            const { startMs, endMs } = markerIntervalMs(marker, markers, filterEndMs);
            const range = categoryAnnotationRange(
                buckets,
                startMs,
                endMs,
                chartContext.events,
                marker
            );
            if (!range) {
                continue;
            }
            placements.push({
                id: marker.id,
                x: range.xMin,
                width: estimateLabelWidthUnits(content, 'category') + focusExtra,
                content,
            });
            continue;
        }

        placements.push({
            id: marker.id,
            x: new Date(marker.start).getTime(),
            width: estimateLabelWidthUnits(content, 'time') + focusExtra,
            content,
        });
    }

    return placements;
}

export function chartMarkerLabelTopPadding(markers, chartContext = {}) {
    return 0;
}

function chartMarkerLabelAnnotation({
    content,
    laneIndex,
    color,
    xValue,
    labelInteraction = {},
    hasFocusIcon = false,
}) {
    const text = labelTextFromContent(content);
    if (!text) {
        return null;
    }
    const laneOffset = CHART_LABEL_OFFSET_TOP + laneIndex * CHART_LABEL_LANE_HEIGHT;
    const iconSlot = hasFocusIcon ? CHART_FOCUS_ICON_SLOT_PX : 0;
    return {
        type: 'label',
        xScaleID: 'x',
        yScaleID: 'y',
        xValue,
        yValue: (ctx) => ctx.chart.scales.y?.max ?? 0,
        content: text,
        color,
        backgroundColor: 'rgba(11, 17, 26, 0.94)',
        borderColor: `${color}66`,
        borderWidth: 1,
        font: { size: 10, weight: '600', lineHeight: 1.2 },
        padding: { top: 5, bottom: 3, left: 9, right: 6 },
        rotation: 0,
        textAlign: 'start',
        clip: false,
        borderRadius: 3,
        position: { x: 'start', y: 'start' },
        xAdjust: CHART_LABEL_OFFSET_LEFT + iconSlot,
        yAdjust: laneOffset,
        drawTime: 'afterDatasetsDraw',
        ...labelInteraction,
    };
}

function chartMarkerFocusIconAnnotation({ marker, laneIndex, color, xValue, chartContext }) {
    if (!chartContext.onFocusMarker) {
        return null;
    }
    const isFocused = chartContext.focusedMarkerId === marker.id;
    const laneOffset = CHART_LABEL_OFFSET_TOP + laneIndex * CHART_LABEL_LANE_HEIGHT;
    const focusInteraction = createLabelFocusInteraction(marker, chartContext);
    return {
        type: 'label',
        xScaleID: 'x',
        yScaleID: 'y',
        xValue,
        yValue: (ctx) => ctx.chart.scales.y?.max ?? 0,
        content: isFocused ? CHART_FOCUS_ICON_ACTIVE : CHART_FOCUS_ICON,
        color: isFocused ? MARKER_FOCUS_COLOR : color,
        backgroundColor: isFocused ? 'rgba(62, 207, 142, 0.2)' : 'rgba(11, 17, 26, 0.94)',
        borderColor: isFocused ? `${MARKER_FOCUS_COLOR}aa` : `${color}66`,
        borderWidth: 1,
        font: { size: 10, weight: '700', lineHeight: 1.2 },
        padding: { top: 4, bottom: 2, left: 4, right: 4 },
        rotation: 0,
        textAlign: 'center',
        clip: false,
        borderRadius: 3,
        position: { x: 'start', y: 'start' },
        xAdjust: CHART_LABEL_OFFSET_LEFT,
        yAdjust: laneOffset,
        drawTime: 'afterDatasetsDraw',
        ...focusInteraction,
    };
}

function addMarkerLabelAnnotations(
    annotations,
    key,
    { marker, labelContent, laneIndex, color, xValue, chartContext, labelInteraction }
) {
    if (!labelContent) {
        return;
    }
    const hasFocusIcon = Boolean(chartContext.onFocusMarker);
    const labelAnn = chartMarkerLabelAnnotation({
        content: labelContent,
        laneIndex,
        color,
        xValue,
        labelInteraction,
        hasFocusIcon,
    });
    if (labelAnn) {
        annotations[`${key}-label`] = labelAnn;
    }
    if (hasFocusIcon) {
        const focusAnn = chartMarkerFocusIconAnnotation({
            marker,
            laneIndex,
            color,
            xValue,
            chartContext,
        });
        if (focusAnn) {
            annotations[`${key}-focus`] = focusAnn;
        }
    }
}

function createLabelFocusInteraction(marker, chartContext) {
    return {
        click(ctx, event) {
            if (chartContext.onFocusMarker) {
                chartContext.onFocusMarker(marker);
                hideChartPopover(true);
            }
        },
        enter(ctx, event) {
            showChartPopover(marker, event, chartContext, ctx);
        },
        leave() {
            if (popoverPinned && popoverMarkerId === marker.id) {
                scheduleHidePopover(450);
                return;
            }
            scheduleHidePopover(300);
        },
    };
}

function createLabelEditInteraction(marker, chartContext) {
    const canEdit = Boolean(chartContext.onEditMarker);
    return {
        click(ctx, event) {
            if (canEdit) {
                chartContext.onEditMarker(marker);
                hideChartPopover(true);
                return;
            }
            showChartPopover(marker, event, chartContext, ctx);
        },
        enter(ctx, event) {
            showChartPopover(marker, event, chartContext, ctx);
        },
        leave() {
            if (popoverPinned && popoverMarkerId === marker.id) {
                scheduleHidePopover(450);
                return;
            }
            scheduleHidePopover(300);
        },
    };
}

function highlightTimeLineAnnotation(chart, markerId, borderWidth) {
    const lineKey = `marker-${markerId}`;
    const annotations = chart?.options?.plugins?.annotation?.annotations;
    if (annotations?.[lineKey]) {
        annotations[lineKey].borderWidth = borderWidth;
        return true;
    }
    return false;
}

function markerBoxBorderWidth(marker, chartContext, hovered = false) {
    const isFocused = chartContext.focusedMarkerId === marker.id;
    if (hovered) {
        return isFocused ? 3.5 : 3;
    }
    return isFocused ? 2.5 : 1;
}

function markerBoxBackground(marker, color, chartContext) {
    const isFocused = chartContext.focusedMarkerId === marker.id;
    const isDimmed = chartContext.focusedMarkerId && chartContext.focusedMarkerId !== marker.id;
    if (isFocused) {
        return 'rgba(62, 207, 142, 0.14)';
    }
    if (isDimmed) {
        return `${color}08`;
    }
    return `${color}18`;
}

function markerBoxBorderColor(marker, color, chartContext) {
    return chartContext.focusedMarkerId === marker.id ? MARKER_FOCUS_COLOR : color;
}

function createAnnotationInteraction(marker, chartContext, role, colorMap) {
    return {
        enter(ctx, event) {
            showChartPopover(marker, event, chartContext, ctx);
            if (role === 'line-label' || role === 'hit') {
                highlightTimeLineAnnotation(ctx.chart, marker.id, 4);
            } else if (role === 'box') {
                const options = ctx.element?.options;
                if (options) {
                    if (options.borderWidth != null) {
                        options.borderWidth = markerBoxBorderWidth(marker, chartContext, true);
                    }
                    if (!chartContext.focusedMarkerId || chartContext.focusedMarkerId === marker.id) {
                        const accent = markerBoxBorderColor(marker, projectColor(marker.project, colorMap), chartContext);
                        if (options.backgroundColor && String(options.backgroundColor).includes('18')) {
                            options.backgroundColor = `${accent}33`;
                        } else if (options.backgroundColor && String(options.backgroundColor).includes('14')) {
                            options.backgroundColor = 'rgba(62, 207, 142, 0.22)';
                        }
                    }
                }
            }
        },
        leave(ctx) {
            if (role === 'line-label' || role === 'hit') {
                highlightTimeLineAnnotation(ctx.chart, marker.id, 2);
            } else if (role === 'box') {
                const options = ctx.element?.options;
                const accent = projectColor(marker.project, colorMap);
                if (options) {
                    if (options.borderWidth != null) {
                        options.borderWidth = markerBoxBorderWidth(marker, chartContext, false);
                    }
                    options.backgroundColor = markerBoxBackground(marker, accent, chartContext);
                    options.borderColor = markerBoxBorderColor(marker, accent, chartContext);
                }
            }
            if (popoverPinned && popoverMarkerId === marker.id) {
                scheduleHidePopover(450);
                return;
            }
            scheduleHidePopover(300);
        },
        click(ctx, event) {
            showChartPopover(marker, event, chartContext, ctx);
        },
    };
}

export function toChartAnnotations(markers, chartContext = {}) {
    if (chartContext.showMarkers === false) {
        return {};
    }
    const { mode = 'time', buckets, filterEndMs } = chartContext;
    const visible = filterChartMarkers(markers, chartContext);
    const colorMap = buildProjectColorMap(markers.map((marker) => marker.project));
    const interactive = Boolean(
        chartContext.onFocusMarker || chartContext.onEditMarker || chartContext.showPopover
    );
    const placements = collectMarkerLabelPlacements(visible, chartContext);
    const { lanes: labelLanes } = computeCollisionLabelLanes(placements);
    const contentById = new Map(placements.map((item) => [item.id, item.content]));
    const annotations = {};

    visible.forEach((marker, index) => {
        const color = projectColor(marker.project, colorMap);
        const laneIndex = labelLanes.get(marker.id) ?? 0;
        const labelContent = contentById.get(marker.id);
        const key = `marker-${marker.id || index}`;
        const interaction = interactive
            ? createAnnotationInteraction(marker, chartContext, 'box', colorMap)
            : {};
        const labelInteraction = interactive
            ? createLabelEditInteraction(marker, chartContext)
            : {};

        if (mode === 'category' && buckets?.length) {
            const { startMs, endMs } = markerIntervalMs(marker, markers, filterEndMs);
            const range = categoryAnnotationRange(
                buckets,
                startMs,
                endMs,
                chartContext.events,
                marker
            );
            if (!range) {
                return;
            }
            const { xMin, xMax } = range;
            const isFocused = chartContext.focusedMarkerId === marker.id;

            annotations[key] = {
                type: 'box',
                xMin,
                xMax,
                backgroundColor: markerBoxBackground(marker, color, chartContext),
                borderColor: markerBoxBorderColor(marker, color, chartContext),
                borderWidth: markerBoxBorderWidth(marker, chartContext, false),
                ...interaction,
                label: { display: false },
            };

            if (labelContent) {
                addMarkerLabelAnnotations(annotations, key, {
                    marker,
                    labelContent,
                    laneIndex,
                    color,
                    xValue: xMin,
                    chartContext,
                    labelInteraction,
                });
            }

            annotations[`${key}-line`] = {
                type: 'line',
                xMin,
                xMax: xMin,
                borderColor: isFocused ? MARKER_FOCUS_COLOR : color,
                borderWidth: isFocused ? 3 : 2,
                label: { display: false },
            };
            return;
        }

        const xValue = new Date(marker.start).getTime();
        const hitWidth = defaultHitWidthMs(chartContext);
        const lineInteraction = interactive
            ? createAnnotationInteraction(marker, chartContext, 'hit', colorMap)
            : {};

        if (interactive) {
            annotations[`${key}-hit`] = {
                type: 'box',
                xScaleID: 'x',
                yScaleID: 'y',
                xMin: xValue - hitWidth,
                xMax: xValue + hitWidth,
                yMin: (ctx) => ctx.chart.scales.y?.min ?? 0,
                yMax: (ctx) => ctx.chart.scales.y?.max ?? 1,
                backgroundColor: 'transparent',
                borderWidth: 0,
                drawTime: 'beforeDatasetsDraw',
                ...lineInteraction,
                label: { display: false },
            };
        }

        annotations[key] = {
            type: 'line',
            scaleID: 'x',
            value: xValue,
            borderColor: color,
            borderWidth: 2,
            borderDash: [4, 4],
            label: { display: false },
        };

        if (labelContent) {
            addMarkerLabelAnnotations(annotations, key, {
                marker,
                labelContent,
                laneIndex,
                color,
                xValue,
                chartContext,
                labelInteraction,
            });
        }
    });

    return annotations;
}

export function annotationPluginOptions(markers, chartContext = {}) {
    const annotations = toChartAnnotations(markers, chartContext);
    if (!Object.keys(annotations).length) {
        return { annotations: {} };
    }
    return {
        interaction: {
            mode: 'nearest',
            axis: 'x',
        },
        annotations,
    };
}
