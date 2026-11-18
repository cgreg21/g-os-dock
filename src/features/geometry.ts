/** Axis-aligned rectangle geometry shared by dock visibility checks. */
export interface DockRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Validate rectangle coordinates, dimensions, and calculated edges. */
export function isValidRectangle(rectangle: DockRectangle): boolean {
    if (![rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite) ||
        rectangle.width <= 0 || rectangle.height <= 0)
        return false;

    return Number.isFinite(rectangle.x + rectangle.width) &&
        Number.isFinite(rectangle.y + rectangle.height);
}

/** Return true only when two valid rectangles share a positive-area intersection. */
export function rectanglesOverlap(first: DockRectangle, second: DockRectangle): boolean {
    if (!isValidRectangle(first) || !isValidRectangle(second))
        return false;

    const firstRight = first.x + first.width;
    const firstBottom = first.y + first.height;
    const secondRight = second.x + second.width;
    const secondBottom = second.y + second.height;

    return first.x < secondRight &&
        firstRight > second.x &&
        first.y < secondBottom &&
        firstBottom > second.y;
}
/** Return the smallest valid rectangle containing both input rectangles. */
export function unionRectangles(first: DockRectangle, second: DockRectangle): DockRectangle | null {
    if (!isValidRectangle(first) || !isValidRectangle(second))
        return null;

    const left = Math.min(first.x, second.x);
    const top = Math.min(first.y, second.y);
    const right = Math.max(first.x + first.width, second.x + second.width);
    const bottom = Math.max(first.y + first.height, second.y + second.height);
    const width = right - left;
    const height = bottom - top;

    if (![right, bottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
        return null;

    return { x: left, y: top, width, height };
}
