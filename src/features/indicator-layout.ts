export interface IndicatorMarkerLayout {
    width: number;
    height: number;
    x: number;
    y: number;
}

/** Resolve marker dimensions and centered bottom placement in an icon container. */
export function resolveIndicatorMarkerLayout(
    markerCount: number,
    markerLength: number,
    markerThickness: number,
    containerWidth: number,
    containerHeight: number,
    bottomOffset: number,
    spacing = 2,
): IndicatorMarkerLayout {
    const width = markerCount * markerLength + Math.max(0, markerCount - 1) * spacing;
    return {
        width,
        height: markerThickness,
        x: Math.max(0, (containerWidth - width) / 2),
        y: containerHeight - markerThickness - bottomOffset,
    };
}
