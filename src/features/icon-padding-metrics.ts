export interface IconPadding {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/** Resolve the padding extent along the dock's item axis. */
export function resolveIconPaddingExtent(padding: IconPadding, vertical: boolean): number {
    return vertical ? padding.top + padding.bottom : padding.left + padding.right;
}
