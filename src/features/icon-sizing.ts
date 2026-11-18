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

    const separatorSpace = showFavoritesSeparator && hasFavorites && hasRunningApps
        ? separatorSize + spacing
        : 0;
    const itemCount = applicationIds.length + Math.max(0, additionalItemCount);
    const overhead = vertical ? 25 : 4;
    const fittedSize = itemCount > 0
        ? Math.floor(
            (availableSpace - separatorSpace - spacing * Math.max(0, itemCount - 1)) /
            itemCount,
        ) - overhead - iconPadding
        : configuredSize;

    return Math.min(configuredSize, Math.max(16, fittedSize));
}
