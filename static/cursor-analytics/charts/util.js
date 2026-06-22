/**
 * Chart-i18n-Helfer.
 */
import { i18n } from '../i18n.js';

export function t(key) {
    return i18n?.t(key) ?? key;
}

export function tf(key, params) {
    return i18n?.tf(key, params) ?? t(key);
}
