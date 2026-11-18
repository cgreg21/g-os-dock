/** Whether an application's window-count badge should be rendered. */
export function shouldShowWindowCountBadge(windowCount: number, enabled: boolean): boolean {
    return enabled && windowCount > 1;
}

/** Count applications that will render a window-count badge. */
export function countVisibleWindowBadges(
    windowCounts: readonly number[],
    enabled: boolean,
): number {
    return enabled
        ? windowCounts.filter(count => shouldShowWindowCountBadge(count, true)).length
        : 0;
}
