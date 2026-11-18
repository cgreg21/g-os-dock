import St from 'gi://St?version=51';
import { dockCache } from './cache.js';
import { resolveOppositeDockEdge } from './dock-positioner.js';

/** Return the side where a popup should open relative to the dock. */
export function getDockMenuSide(position: string): St.Side {
    return dockCache.getOrCreate(`dock-menu-side:${position}`, () => {
        switch (resolveOppositeDockEdge(position)) {
            case 'top': return St.Side.TOP;
            case 'bottom': return St.Side.BOTTOM;
            case 'right': return St.Side.RIGHT;
            case 'left': return St.Side.LEFT;
        }
    });
}
