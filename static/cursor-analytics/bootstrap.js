/**
 * ES-Modul-Bootstrap.
 *
 * Laedt alle Shared-Module als ES-Module. Sie registrieren ihre API zusaetzlich auf
 * window.CursorAnalytics (Bridge), solange main.js diese Namespaces noch nutzt.
 *
 * Wird per `import './bootstrap.js'` von main.js eingebunden; da dies ein statischer
 * Import ist, sind alle Module fertig geladen, bevor der main.js-Code laeuft.
 */
import './users-config.js';
import './i18n.js';
import './parser.js';
import './metrics.js';
import './markers/index.js';
import './charts/index.js';
