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

    const firstRight = first.x + first.width;
    const firstBottom = first.y + first.height;
    const secondRight = second.x + second.width;
    const secondBottom = second.y + second.height;

    if (![firstRight, firstBottom, secondRight, secondBottom].every(Number.isFinite))
        return false;

    return first.x < secondRight &&
        firstRight > second.x &&
        first.y < secondBottom &&
        firstBottom > second.y;
}
