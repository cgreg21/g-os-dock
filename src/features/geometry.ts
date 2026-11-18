/** Axis-aligned rectangle geometry shared by dock visibility checks. */
export interface DockRectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Return true only when two rectangles share a positive-area intersection. */
export function rectanglesOverlap(first: DockRectangle, second: DockRectangle): boolean {
    return first.x < second.x + second.width &&
        first.x + first.width > second.x &&
        first.y < second.y + second.height &&
        first.y + first.height > second.y;
}
