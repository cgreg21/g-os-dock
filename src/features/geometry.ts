/** Axis-aligned rectangle geometry shared by dock visibility checks. */
export interface DockRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Return true only when two valid rectangles share a positive-area intersection. */
export function rectanglesOverlap(first: DockRectangle, second: DockRectangle): boolean {
    if (![first.x, first.y, first.width, first.height,
        second.x, second.y, second.width, second.height].every(Number.isFinite))
        return false;

    if (first.width <= 0 || first.height <= 0 ||
        second.width <= 0 || second.height <= 0)
        return false;

    return first.x < second.x + second.width &&
        first.x + first.width > second.x &&
        first.y < second.y + second.height &&
        first.y + first.height > second.y;
}
