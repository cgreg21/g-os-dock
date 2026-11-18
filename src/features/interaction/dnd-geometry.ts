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

/** Place a compact removal target at the edge opposite the dock. */
export function resolveDockRemovalZoneGeometry(
    monitor: DockDndMonitorGeometry,
    dockPosition: string,
    zoneWidth = 148,
    zoneHeight = 52,
    inset = 12,
): DockDndZoneGeometry {
    const safeInset = Math.max(0, inset);
    const width = Math.max(1, Math.min(zoneWidth, monitor.width - safeInset * 2));
    const height = Math.max(1, Math.min(zoneHeight, monitor.height - safeInset * 2));
    const centeredX = monitor.x + (monitor.width - width) / 2;
    const centeredY = monitor.y + (monitor.height - height) / 2;

    switch (dockPosition) {
    case 'top':
        return {
            x: centeredX,
            y: monitor.y + monitor.height - height - safeInset,
            width,
            height,
        };
    case 'left':
        return {
            x: monitor.x + monitor.width - width - safeInset,
            y: centeredY,
            width,
            height,
        };
    case 'right':
        return {
            x: monitor.x + safeInset,
            y: centeredY,
            width,
            height,
        };
    case 'bottom':
    default:
        return {
            x: centeredX,
            y: monitor.y + safeInset,
            width,
            height,
        };
    }
}
