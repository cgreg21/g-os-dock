import type { DockRectangle } from '../../core/geometry.js';

export type DockEdge = 'top' | 'right' | 'bottom' | 'left';

/** Share the edge-to-orientation rule across dock layout and UI features. */
export function isVerticalDockPosition(position: string): boolean {
    return position === 'left' || position === 'right';
}

/** Resolve the side opposite the dock edge for popup placement. */
export function resolveOppositeDockEdge(position: string): DockEdge {
    switch (position) {
        case 'top': return 'bottom';
        case 'bottom': return 'top';
        case 'left': return 'right';
        default: return 'left';
    }
}

export interface DockSize {
    width: number;
    height: number;
}

export interface DockPoint {
    x: number;
    y: number;
}

export interface DockEdgeSensorOptions {
    monitor: DockRectangle;
    edge: DockEdge;
    thickness: number;
    topInset?: number;
    topEdgeOffset?: number;
}

/** Resolve the screen-space rectangle of the dock's edge reveal sensor. */
export function resolveDockEdgeSensor(options: DockEdgeSensorOptions): DockRectangle {
    const { monitor, edge, thickness } = options;
    const safeTopInset = Math.min(
        Math.max(0, options.topInset ?? 0),
        Math.max(0, monitor.height - thickness),
    );
    const top = monitor.y + safeTopInset;
    const height = Math.max(thickness, monitor.y + monitor.height - top);

    switch (edge) {
        case 'top':
            return { x: monitor.x, y: top, width: monitor.width, height: thickness };
        case 'left':
            return { x: monitor.x, y: top, width: thickness, height };
        case 'right':
            return {
                x: monitor.x + monitor.width - thickness,
                y: top,
                width: thickness,
                height,
            };
        case 'bottom':
            return {
                x: monitor.x,
                y: monitor.y + monitor.height - thickness,
                width: monitor.width,
                height: thickness,
            };
    }
}

/** Resolve the dock surface origin inside its monitor and edge constraints. */
export function resolveDockSurfacePosition(
    monitor: DockRectangle,
    size: DockSize,
    edge: DockEdge,
    edgeDistance: number,
    usableTop = monitor.y,
): DockPoint {
    const minX = monitor.x + edgeDistance;
    const maxX = Math.max(
        minX,
        monitor.x + monitor.width - size.width - edgeDistance,
    );
    const minY = usableTop;
    const maxY = Math.max(
        minY,
        monitor.y + monitor.height - size.height - edgeDistance,
    );

    let x = monitor.x + Math.round((monitor.width - size.width) / 2);
    let y = monitor.y + monitor.height - size.height - edgeDistance;
    if (edge === 'top') {
        y = usableTop;
    } else if (edge === 'left' || edge === 'right') {
        x = edge === 'left'
            ? minX
            : monitor.x + monitor.width - size.width - edgeDistance;
        y = usableTop + Math.round(
            (monitor.y + monitor.height - usableTop - size.height - edgeDistance) / 2,
        );
    }

    return DockPositioner.clamp(
        { x, y },
        size,
        {
            x: minX,
            y: minY,
            width: maxX - minX + size.width,
            height: maxY - minY + size.height,
        },
    );
}

/** Resolve the translation needed to move a dock completely beyond one edge. */
export function resolveHiddenTranslation(edge: DockEdge, size: DockSize): DockPoint {
    return {
        x: edge === 'left' ? -size.width : edge === 'right' ? size.width : 0,
        y: edge === 'top' ? -size.height : edge === 'bottom' ? size.height : 0,
    };
}

/** Shared monitor-bounded placement for dock surfaces and floating UI. */
export class DockPositioner {
    static clamp(
        point: DockPoint,
        size: DockSize,
        bounds: DockRectangle,
        padding = 0,
    ): DockPoint {
        const minX = bounds.x + padding;
        const minY = bounds.y + padding;
        const maxX = Math.max(minX, bounds.x + bounds.width - size.width - padding);
        const maxY = Math.max(minY, bounds.y + bounds.height - size.height - padding);
        return {
            x: Math.round(Math.max(minX, Math.min(point.x, maxX))),
            y: Math.round(Math.max(minY, Math.min(point.y, maxY))),
        };
    }

    /** Place a popup beside an anchor according to the dock's screen edge. */
    static placeFloating(
        anchor: DockRectangle,
        size: DockSize,
        dockEdge: DockEdge,
        gap: number,
        bounds: DockRectangle,
        padding = 0,
    ): DockPoint {
        let x = anchor.x + (anchor.width - size.width) / 2;
        let y = anchor.y + (anchor.height - size.height) / 2;

        switch (resolveOppositeDockEdge(dockEdge)) {
            case 'top':
                y = anchor.y - size.height - gap;
                break;
            case 'bottom':
                y = anchor.y + anchor.height + gap;
                break;
            case 'left':
                x = anchor.x - size.width - gap;
                break;
            case 'right':
                x = anchor.x + anchor.width + gap;
                break;
        }

        return this.clamp({ x, y }, size, bounds, padding);
    }
}
