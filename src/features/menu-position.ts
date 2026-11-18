import St from 'gi://St?version=51';
import { dockCache } from './cache.js';

/** Return the side where a popup should open relative to the dock. */
export function getDockMenuSide(position: string): St.Side {
    return dockCache.getOrCreate(`dock-menu-side:${position}`, () => {
        switch (position) {
        case 'top':
            return St.Side.BOTTOM;
        case 'bottom':
            return St.Side.TOP;
        case 'left':
            return St.Side.RIGHT;
        default:
            return St.Side.LEFT;
        }
    });
}
