/**
 * ES-Modul-Bootstrap.
 *
 * Laedt alle Shared-Module als ES-Module. Sie registrieren ihre API zusaetzlich auf
 * window.CursorAnalytics (Bridge), damit der klassische Consumer app.js unveraendert
 * funktioniert.
 *
 * Eingebunden via <script type="module">. app.js (klassisch) wartet in ensureModules()
 * per Polling, bis alle window.CursorAnalytics.*-Namespaces bereit sind.
 */
import './users-config.js';
import './i18n.js';
import './parser.js';
import './metrics.js';
import './markers/index.js';
import './charts/index.js';
