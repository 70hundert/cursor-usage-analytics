/**
 * Marker-Store: Normalisierung, Laden/Speichern (localStorage), CRUD, Server-Sync.
 */
import { generateId, readJsonStorage, writeJsonStorage, t } from './util.js';
import { normalizeComposerMode } from './composer-mode.js';

export const STORAGE_KEY = 'cursor-usage-markers-v1';
export const LEGACY_STORAGE_KEY = 'cursor-event-chart-markers-v1';
const STORE_VERSION = 1;

export function emptyStore() {
    return { version: STORE_VERSION, markers: [] };
}

export function normalizeMarker(raw) {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const project = String(raw.project ?? '').trim();
    if (!project) {
        return null;
    }
    const start = raw.start ? new Date(raw.start) : null;
    if (!start || Number.isNaN(start.getTime())) {
        return null;
    }
    let end = null;
    if (raw.end) {
        const endDate = new Date(raw.end);
        if (!Number.isNaN(endDate.getTime())) {
            end = endDate.toISOString();
        }
    }
    const user = String(raw.user ?? 'info').trim() || 'info';
    const note = String(raw.note ?? '').trim();
    const composerMode = normalizeComposerMode(raw.composerMode, note);
    const now = new Date().toISOString();
    const marker = {
        id: String(raw.id || generateId()),
        user,
        start: start.toISOString(),
        end,
        project,
        task: String(raw.task ?? '').trim(),
        note,
        createdAt: raw.createdAt || now,
        updatedAt: raw.updatedAt || now,
    };
    if (composerMode) {
        marker.composerMode = composerMode;
    }
    return marker;
}

function migrateLegacyStore(legacy) {
    if (!legacy) {
        return null;
    }
    const markers = Array.isArray(legacy.markers) ? legacy.markers : Array.isArray(legacy) ? legacy : [];
    const normalized = markers.map(normalizeMarker).filter(Boolean);
    if (!normalized.length) {
        return null;
    }
    return { version: STORE_VERSION, markers: normalized };
}

export function loadStore() {
    const current = readJsonStorage(STORAGE_KEY);
    if (current?.markers) {
        return {
            version: STORE_VERSION,
            markers: current.markers.map(normalizeMarker).filter(Boolean),
        };
    }

    const legacy = migrateLegacyStore(readJsonStorage(LEGACY_STORAGE_KEY));
    if (legacy) {
        writeJsonStorage(STORAGE_KEY, legacy);
        return legacy;
    }

    return emptyStore();
}

let memoryStore = loadStore();
let syncPromise = null;

export function getStore() {
    return memoryStore;
}

export function saveStoreLocal(store) {
    memoryStore = {
        version: STORE_VERSION,
        markers: (store.markers || []).map(normalizeMarker).filter(Boolean),
    };
    writeJsonStorage(STORAGE_KEY, memoryStore);
    return memoryStore;
}

export async function saveStore(store, proxyBase = '') {
    const saved = saveStoreLocal(store);
    if (proxyBase !== null) {
        try {
            await pushToServer(saved, proxyBase);
        } catch {
            /* localStorage fallback — caller may show status */
        }
    }
    return saved;
}

export function listMarkers({ user, from, to } = {}) {
    let markers = [...getStore().markers];
    if (user && user !== 'all') {
        markers = markers.filter((m) => m.user === user || m.user === 'all');
    }
    if (from) {
        const fromMs = new Date(from).getTime();
        markers = markers.filter((m) => new Date(m.start).getTime() >= fromMs);
    }
    if (to) {
        const toMs = new Date(to).getTime();
        markers = markers.filter((m) => new Date(m.start).getTime() <= toMs);
    }
    return markers.sort((a, b) => new Date(a.start) - new Date(b.start));
}

export function upsertMarker(markerInput) {
    const marker = normalizeMarker({
        ...markerInput,
        updatedAt: new Date().toISOString(),
        createdAt: markerInput.createdAt || new Date().toISOString(),
    });
    if (!marker) {
        throw new Error(t('markerInvalid'));
    }
    const store = getStore();
    const index = store.markers.findIndex((m) => m.id === marker.id);
    if (index >= 0) {
        marker.createdAt = store.markers[index].createdAt;
        store.markers[index] = marker;
    } else {
        store.markers.push(marker);
    }
    return marker;
}

export function removeMarker(id) {
    const store = getStore();
    store.markers = store.markers.filter((m) => m.id !== id);
    return store;
}

export function markersForUser(allMarkers, userId) {
    if (userId === 'all') {
        return [...allMarkers].sort((a, b) => new Date(a.start) - new Date(b.start));
    }
    return allMarkers
        .filter((m) => m.user === userId || m.user === 'all')
        .sort((a, b) => new Date(a.start) - new Date(b.start));
}

/** Neuester Marker ohne `end` für einen User (laufende Session). */
export function getActiveOpenMarker(userId) {
    const userMarkers = markersForUser(getStore().markers, userId);
    let active = null;
    for (const marker of userMarkers) {
        if (marker.end) {
            continue;
        }
        if (!active || new Date(marker.start) > new Date(active.start)) {
            active = marker;
        }
    }
    return active;
}

export function exportStore() {
    return {
        version: STORE_VERSION,
        markers: getStore().markers,
        exportedAt: new Date().toISOString(),
    };
}

export function importStore(payload, merge = true) {
    const incoming = Array.isArray(payload?.markers) ? payload.markers : [];
    const normalized = incoming.map(normalizeMarker).filter(Boolean);
    if (!merge) {
        return saveStoreLocal({ version: STORE_VERSION, markers: normalized });
    }

    const store = getStore();
    const byId = new Map(store.markers.map((m) => [m.id, m]));
    for (const marker of normalized) {
        byId.set(marker.id, marker);
    }
    return saveStoreLocal({ version: STORE_VERSION, markers: [...byId.values()] });
}

export async function fetchServerStore(proxyBase = '') {
    const response = await fetch(`${proxyBase}/api/markers`, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

export async function pushToServer(store, proxyBase = '') {
    const response = await fetch(`${proxyBase}/api/markers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(store),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

export function mergeStores(local, remote) {
    const byId = new Map();
    for (const marker of remote?.markers || []) {
        const normalized = normalizeMarker(marker);
        if (normalized) {
            byId.set(normalized.id, normalized);
        }
    }
    for (const marker of local?.markers || []) {
        const existing = byId.get(marker.id);
        if (!existing) {
            byId.set(marker.id, marker);
            continue;
        }
        const localUpdated = new Date(marker.updatedAt || marker.createdAt).getTime();
        const remoteUpdated = new Date(existing.updatedAt || existing.createdAt).getTime();
        if (localUpdated > remoteUpdated) {
            byId.set(marker.id, marker);
        }
    }
    return { version: STORE_VERSION, markers: [...byId.values()] };
}

export async function syncFromServer(proxyBase = '') {
    if (syncPromise) {
        return syncPromise;
    }
    syncPromise = (async () => {
        try {
            const remote = await fetchServerStore(proxyBase);
            const merged = mergeStores(getStore(), remote);
            saveStoreLocal(merged);
            return { ok: true, source: 'server' };
        } catch {
            return { ok: false, source: 'local' };
        } finally {
            syncPromise = null;
        }
    })();
    return syncPromise;
}
