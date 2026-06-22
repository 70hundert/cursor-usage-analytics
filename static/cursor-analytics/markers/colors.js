/**
 * Projekt-Farbzuordnung fuer Marker (Tabellen, Badges, Chart-Annotationen).
 */

/** 10 Standard-Farben für Projekt-Marker (gut unterscheidbar auf dunklem Chart-Hintergrund). */
export const PROJECT_COLORS = [
    '#f0b429', // Gold
    '#3ecf8e', // Grün
    '#58a6ff', // Blau
    '#e8783a', // Orange
    '#a78bfa', // Violett
    '#f472b6', // Pink
    '#22d3ee', // Cyan
    '#f87171', // Koralle
    '#a3e635', // Limette
    '#818cf8', // Indigo
];

export function buildProjectColorMap(projects) {
    const unique = [...new Set(projects.filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'de', { sensitivity: 'base' }),
    );
    return new Map(unique.map((name, index) => [name, PROJECT_COLORS[index % PROJECT_COLORS.length]]));
}

export function projectColor(project, colorMapOrMarkers) {
    let colorMap = colorMapOrMarkers;
    if (Array.isArray(colorMapOrMarkers)) {
        colorMap = buildProjectColorMap(
            colorMapOrMarkers.map((entry) => (typeof entry === 'string' ? entry : entry?.project)),
        );
    }
    if (colorMap instanceof Map && colorMap.has(project)) {
        return colorMap.get(project);
    }
    return PROJECT_COLORS[0];
}
