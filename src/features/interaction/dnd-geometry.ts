/**
 * Resolve the insertion slot from item midpoints measured on the dock's main
 * axis. The same calculation serves horizontal and vertical dock orientations.
 *
 * Return null when any item lacks usable geometry: accepting a drop with a
 * partial set of midpoints could silently insert it at the wrong index.
 */
export function resolveDockDndInsertionIndex(
    midpoints: readonly (number | null)[],
    coordinate: number,
): number | null {
    if (!Number.isFinite(coordinate) ||
        midpoints.some(midpoint => midpoint === null || !Number.isFinite(midpoint)))
        return null;

    let index = 0;
    for (const midpoint of midpoints) {
        if (midpoint !== null && coordinate > midpoint)
            index++;
    }
    return index;
}

/** Keep pinned applications inside the pinned section while allowing new pins. */
export function canDropDockItemAtIndex(
    draggedIsFavorite: boolean,
    applicationsBefore: number,
    favoriteCount: number,
): boolean {
    return !draggedIsFavorite || applicationsBefore <= favoriteCount;
}
