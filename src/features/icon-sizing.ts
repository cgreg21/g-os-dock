import {
    calculateFavoritesSeparatorSpace,
    hasFavoritesSeparatorTarget,
} from './favorites-separator.js';

export interface UniformItemSizingOptions {
    availableSpace: number;
    itemCount: number;
    spacing: number;
    additionalSpace: number;
    overhead: number;
    itemPadding: number;
    configuredSize: number;
    minimumSize: number;
}

/** Calculate a uniform item size after subtracting all non-item space. */
export function calculateUniformItemSize(options: UniformItemSizingOptions): number {
    const {
        availableSpace,
        itemCount,
        spacing,
        additionalSpace,
        overhead,
        itemPadding,
        configuredSize,
        minimumSize,
    } = options;

    const fittedSize = itemCount > 0
        ? Math.floor(
            (availableSpace - additionalSpace - spacing * Math.max(0, itemCount - 1)) /
            itemCount,
        ) - overhead - itemPadding
        : configuredSize;

    return Math.min(configuredSize, Math.max(minimumSize, fittedSize));
}

export const WINDOW_COUNT_BADGE_SPACE = 25;

export interface DockIconSizingOptions {
    applicationIds: readonly string[];
    favoriteIds: ReadonlySet<string>;
    availableSpace: number;
    configuredSize: number;
    spacing: number;
    showFavoritesSeparator: boolean;
    separatorSize: number;
    separatorMargin: number;
    additionalItemCount: number;
    windowCountBadgeCount: number;
    iconPadding: number;
    vertical: boolean;
}

export interface DockSizingMetrics {
    itemCount: number;
    separatorSpace: number;
}

export interface DockSizingMetricsOptions {
    applicationIds: readonly string[];
    favoriteIds: ReadonlySet<string>;
    additionalItemCount: number;
    showFavoritesSeparator: boolean;
    separatorSize: number;
    separatorMargin: number;
    spacing: number;
}

/** Resolve the item count and optional favorites separator cost for dock sizing. */
export function resolveDockSizingMetrics(
    options: DockSizingMetricsOptions,
): DockSizingMetrics {
    const {
        applicationIds,
        favoriteIds,
        additionalItemCount,
        showFavoritesSeparator,
        separatorSize,
        separatorMargin,
        spacing,
    } = options;
    const hasSeparatorTarget = hasFavoritesSeparatorTarget(applicationIds, favoriteIds);

    return {
        itemCount: applicationIds.length + Math.max(0, additionalItemCount),
        separatorSpace: calculateFavoritesSeparatorSpace(
            showFavoritesSeparator && hasSeparatorTarget,
            separatorSize,
            separatorMargin,
            spacing,
        ),
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
        separatorMargin,
        additionalItemCount,
        windowCountBadgeCount,
        iconPadding,
        vertical,
    } = options;

    const { itemCount, separatorSpace } = resolveDockSizingMetrics({
        applicationIds,
        favoriteIds,
        additionalItemCount,
        showFavoritesSeparator,
        separatorSize,
        separatorMargin,
        spacing,
    });

    return calculateUniformItemSize({
        availableSpace,
        itemCount,
        spacing,
        additionalSpace: separatorSpace + (vertical
            ? Math.max(0, windowCountBadgeCount) * WINDOW_COUNT_BADGE_SPACE
            : 0),
        overhead: vertical ? 0 : 4,
        itemPadding: iconPadding,
        configuredSize,
        minimumSize: 16,
    });
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
