export type DockKeyboardAction = 'previous' | 'next' | 'previews' | 'first' | 'last' | 'escape' | null;

export interface DockKeyboardKeys {
    left: number;
    right: number;
    up: number;
    down: number;
    home: number;
    end: number;
    escape: number;
}

/** Map a key press to a dock action using the dock's physical orientation. */
export function resolveDockKeyboardAction(
    key: number,
    position: string,
    keys: DockKeyboardKeys,
): DockKeyboardAction {
    const vertical = position === 'left' || position === 'right';
    const previous = vertical ? keys.up : keys.left;
    const next = vertical ? keys.down : keys.right;
    const inward = position === 'top' ? keys.down
        : position === 'bottom' ? keys.up
            : position === 'left' ? keys.right : keys.left;

    if (key === previous)
        return 'previous';
    if (key === next)
        return 'next';
    if (key === inward)
        return 'previews';
    if (key === keys.home)
        return 'first';
    if (key === keys.end)
        return 'last';
    if (key === keys.escape)
        return 'escape';
    return null;
}

/** Wrap focus movement so keyboard navigation never dead-ends at either end. */
export function resolveWrappedDockIndex(index: number, itemCount: number): number | null {
    if (!Number.isInteger(index) || !Number.isInteger(itemCount) || itemCount <= 0)
        return null;
    return ((index % itemCount) + itemCount) % itemCount;
}
