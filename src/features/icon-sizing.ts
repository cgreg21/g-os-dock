export interface DockIconSizingOptions {
    applicationIds: readonly string[];
    favoriteIds: ReadonlySet<string>;
    availableSpace: number;
    configuredSize: number;
    spacing: number;
    showFavoritesSeparator: boolean;
    separatorSize: number;
    additionalItemCount: number;
    iconPadding: number;
    vertical: boolean;
}

export interface DockSizingMetrics {
    itemCount: number;
    separatorSpace: number;
}

/** Resolve the item count and optional favorites separator cost for dock sizing. */
export function resolveDockSizingMetrics(
    applicationIds: readonly string[],
    favoriteIds: ReadonlySet<string>,
    additionalItemCount: number,
    showFavoritesSeparator: boolean,
    separatorSize: number,
    spacing: number,
): DockSizingMetrics {
    let hasFavorites = false;
    let hasRunningApps = false;
    for (const id of applicationIds) {
        if (favoriteIds.has(id))
            hasFavorites = true;
        else
            hasRunningApps = true;
        if (hasFavorites && hasRunningApps)
            break;
    }

    return {
        itemCount: applicationIds.length + Math.max(0, additionalItemCount),
        separatorSpace: showFavoritesSeparator && hasFavorites && hasRunningApps
            ? separatorSize + spacing
            : 0,
    };
}

/** Calculate a uniform icon size that fits the current dock content. */
export function calculateDockIconSize(options: DockIconSizingOptions): number {
    const {
        applicationIds,
        favoriteIds,
        availableSpace,
        configuredSize,
        spacing,
        showFavoritesSeparator,
        separatorSize,
        additionalItemCount,
        iconPadding,
        vertical,
    } = options;

    const { itemCount, separatorSpace } = resolveDockSizingMetrics(
        applicationIds,
        favoriteIds,
        additionalItemCount,
        showFavoritesSeparator,
        separatorSize,
        spacing,
    );
    const overhead = vertical ? 25 : 4;
    const fittedSize = itemCount > 0
        ? Math.floor(
            (availableSpace - separatorSpace - spacing * Math.max(0, itemCount - 1)) /
            itemCount,
        ) - overhead - iconPadding
        : configuredSize;

    return Math.min(configuredSize, Math.max(16, fittedSize));
}

export interface DockAvailableSpaceOptions {
    monitorWidth: number;
    monitorY: number;
    monitorHeight: number;
    usableTop: number;
    edgeDistance: number;
    padding: number;
    border: number;
    vertical: boolean;
}

/** Calculate the usable length for dock items after all outer insets. */
export function calculateAvailableDockSpace(
    options: DockAvailableSpaceOptions,
): number {
    const {
        monitorWidth,
        monitorY,
        monitorHeight,
        usableTop,
        edgeDistance,
        padding,
        border,
        vertical,
    } = options;

    return vertical
        ? monitorY + monitorHeight - usableTop - edgeDistance - padding - border
        : monitorWidth - edgeDistance * 2 - padding - border;
}
