import St from 'gi://St?version=51';

/** Return the side where a popup should open relative to the dock. */
export function getDockMenuSide(position: string): St.Side {
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
}
