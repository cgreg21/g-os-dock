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

/**
 * Resolve the visual ghost slot while preserving the favorites separator.
 */
export function resolveDockDndPreviewChildIndex(
    referenceIndex: number,
    separatorIndex: number,
    fallbackIndex: number,
    isFavoriteBoundary: boolean,
): number {
    if (isFavoriteBoundary && separatorIndex >= 0 && separatorIndex < referenceIndex)
        return separatorIndex;
    return referenceIndex >= 0 ? referenceIndex : fallbackIndex;
}

/** Only a favorite dragged to the end of the remaining favorites crosses this boundary. */
export function isDockDndFavoriteBoundaryInsertion(
    draggedIsFavorite: boolean,
    referenceIsFavorite: boolean,
    applicationsBefore: number,
    favoriteCount: number,
): boolean {
    return draggedIsFavorite && !referenceIsFavorite &&
        applicationsBefore === favoriteCount;
}

export interface DockDndMonitorGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DockDndZoneGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Restore the large two-thirds-screen removal drop area opposite the dock. */
export function resolveDockRemovalZoneGeometry(
    monitor: DockDndMonitorGeometry,
    dockPosition: string,
    topInset?: number,
): DockDndZoneGeometry {
    const verticalDock = dockPosition === 'left' || dockPosition === 'right';
    const extent = Math.floor(
        (verticalDock ? monitor.width : monitor.height) * 2 / 3,
    );
    const safeTopInset = Math.max(0, topInset ?? 32);
    let x = monitor.x;
    let y = monitor.y;
    let width = monitor.width;
    let height = monitor.height;

    switch (dockPosition) {
    case 'top':
        y += monitor.height - extent;
        height = extent;
        break;
    case 'left':
        x += monitor.width - extent;
        width = extent;
        break;
    case 'right':
        width = extent;
        break;
    case 'bottom':
    default:
        y += safeTopInset;
        height = Math.max(1, extent - (topInset === undefined ? 0 : safeTopInset));
        break;
    }

    return { x, y, width, height };
}

/** Keep the preview slot stable near boundaries to prevent pointer jitter. */
export function resolveDockDndInsertionIndexWithHysteresis(
    midpoints: readonly (number | null)[],
    coordinate: number,
    currentIndex: number | null,
    hysteresis = 10,
): number | null {
    if (!Number.isFinite(coordinate) || !Number.isFinite(hysteresis) || hysteresis < 0 ||
        midpoints.some(midpoint => midpoint === null || !Number.isFinite(midpoint)))
        return null;

    if (currentIndex === null || !Number.isInteger(currentIndex) ||
        currentIndex < 0 || currentIndex > midpoints.length)
        return resolveDockDndInsertionIndex(midpoints, coordinate);

    let index = currentIndex;
    while (index < midpoints.length && coordinate > midpoints[index]! + hysteresis)
        index++;
    while (index > 0 && coordinate < midpoints[index - 1]! - hysteresis)
        index--;
    return index;
}
