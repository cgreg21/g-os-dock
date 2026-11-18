import type { DockRectangle } from './geometry.js';

export type DockEdge = 'top' | 'right' | 'bottom' | 'left';

export interface DockSize {
    width: number;
    height: number;
}

export interface DockPoint {
    x: number;
    y: number;
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
        let y = anchor.y - size.height - gap;

        switch (dockEdge) {
            case 'top':
                y = anchor.y + anchor.height + gap;
                break;
            case 'bottom':
                y = anchor.y - size.height - gap;
                break;
            case 'left':
                x = anchor.x + anchor.width + gap;
                y = anchor.y + (anchor.height - size.height) / 2;
                break;
            case 'right':
                x = anchor.x - size.width - gap;
                y = anchor.y + (anchor.height - size.height) / 2;
                break;
        }

        return this.clamp({ x, y }, size, bounds, padding);
    }
}
