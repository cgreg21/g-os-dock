/**
 * Resolve the insertion slot from item midpoints measured on the dock's main
 * axis. The same calculation serves horizontal and vertical dock orientations.
 */
export function resolveDockDndInsertionIndex(
    midpoints: readonly (number | null)[],
    coordinate: number,
): number {
    let index = 0;
    for (const midpoint of midpoints) {
        if (midpoint !== null && Number.isFinite(midpoint) && coordinate > midpoint)
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
