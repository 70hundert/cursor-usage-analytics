/**
 * Collapse/expand all rows in grouped usage tables (events + markers).
 */
import { collapsedEventGroups, collapsedMarkerGroups } from './state.js';
import { t } from './services.js';

function getTableGroupHeaderKeys(tableSelector, keyAttr) {
    return [...document.querySelectorAll(`${tableSelector} .usage-table__group-header--toggle[${keyAttr}]`)]
        .map((row) => row.getAttribute(keyAttr))
        .filter(Boolean);
}

function setAllTableGroupsCollapsed({ tableSelector, keyAttr, memberAttr, collapsedSet }) {
    const keys = getTableGroupHeaderKeys(tableSelector, keyAttr);
    if (!keys.length) {
        return;
    }
    const collapse = !keys.every((key) => collapsedSet.has(key));
    for (const key of keys) {
        if (collapse) {
            collapsedSet.add(key);
        } else {
            collapsedSet.delete(key);
        }
        const header = document.querySelector(
            `${tableSelector} .usage-table__group-header--toggle[${keyAttr}="${CSS.escape(key)}"]`
        );
        header?.classList.toggle('usage-table__group-header--collapsed', collapse);
        document
            .querySelectorAll(`${tableSelector} [${memberAttr}="${CSS.escape(key)}"]`)
            .forEach((member) => {
                member.hidden = collapse;
            });
    }
}

function syncTableGroupsToggleButton(btn, tableSelector, keyAttr, collapsedSet) {
    if (!btn) {
        return;
    }
    const keys = getTableGroupHeaderKeys(tableSelector, keyAttr);
    btn.disabled = keys.length === 0;
    if (!keys.length) {
        return;
    }
    const allCollapsed = keys.every((key) => collapsedSet.has(key));
    btn.textContent = allCollapsed ? t('expandAllGroups') : t('collapseAllGroups');
    btn.setAttribute('aria-pressed', allCollapsed ? 'true' : 'false');
}

export function syncEventGroupsToggleButton() {
    syncTableGroupsToggleButton(
        document.getElementById('events-groups-toggle-all'),
        '.usage-table--events',
        'data-group-key',
        collapsedEventGroups
    );
}

export function syncMarkerGroupsToggleButton() {
    syncTableGroupsToggleButton(
        document.getElementById('marker-groups-toggle-all'),
        '.usage-table--markers',
        'data-marker-group-key',
        collapsedMarkerGroups
    );
}

export function toggleAllEventGroups() {
    setAllTableGroupsCollapsed({
        tableSelector: '.usage-table--events',
        keyAttr: 'data-group-key',
        memberAttr: 'data-group-member',
        collapsedSet: collapsedEventGroups,
    });
    syncEventGroupsToggleButton();
}

export function toggleAllMarkerGroups() {
    setAllTableGroupsCollapsed({
        tableSelector: '.usage-table--markers',
        keyAttr: 'data-marker-group-key',
        memberAttr: 'data-marker-group-member',
        collapsedSet: collapsedMarkerGroups,
    });
    syncMarkerGroupsToggleButton();
}
