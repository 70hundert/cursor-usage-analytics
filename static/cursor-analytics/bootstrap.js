/**
 * ES-Modul-Bootstrap.
 *
 * Laedt die konvertierten Shared-Module als ES-Module (sie registrieren ihre API
 * weiterhin auf window.CursorAnalytics, damit klassische Consumer wie app.js,
 * markers.js und charts.js unveraendert funktionieren) und laedt anschliessend die
 * noch klassischen Module (markers, charts) nach.
 *
 * Eingebunden via <script type="module">. app.js (klassisch) wartet in
 * ensureModules() per Polling, bis alle window.CursorAnalytics.*-Namespaces bereit sind.
 */
import './users-config.js';
import './i18n.js';
import './parser.js';
import './metrics.js';

const CLASSIC_MODULES = ['markers.js', 'charts.js'];
const MODULE_VERSION = 'v=21';

function loadClassicScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(src));
        document.head.appendChild(script);
    });
}

const base = new URL('.', import.meta.url);
for (const file of CLASSIC_MODULES) {
    await loadClassicScript(new URL(`${file}?${MODULE_VERSION}`, base).href);
}
