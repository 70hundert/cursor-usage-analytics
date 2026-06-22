/**
 * Cursor-Composer-Modus (Agents / Editor / Chat) — Normalisierung und Labels.
 */
import { t } from './util.js';

export const COMPOSER_MODES = Object.freeze({
    agent: 'markerModeAgents',
    edit: 'markerModeEditor',
});

const LEGACY_MODE_NOTE_RE = /^Modus:\s*(Agent|Edit)\b/i;

export function normalizeComposerMode(raw, note = '') {
    const mode = String(raw ?? '').trim().toLowerCase();
    if (mode === 'agent' || mode === 'edit' || mode === 'chat') {
        return mode;
    }
    const noteMatch = String(note ?? '').trim().match(LEGACY_MODE_NOTE_RE);
    if (noteMatch) {
        return noteMatch[1].toLowerCase() === 'edit' ? 'edit' : 'agent';
    }
    return null;
}

export function resolveComposerMode(marker) {
    if (!marker || typeof marker !== 'object') {
        return 'edit';
    }
    const mode = normalizeComposerMode(marker.composerMode, marker.note);
    return mode === 'edit' ? 'edit' : 'agent';
}

export function composerModeLabel(mode) {
    const normalized = normalizeComposerMode(mode);
    if (normalized === 'edit') {
        return t(COMPOSER_MODES.edit);
    }
    if (normalized === 'agent' || normalized === 'chat') {
        return t(COMPOSER_MODES.agent);
    }
    return '—';
}
