import Gio from 'gi://Gio?version=2.0';
import { dockCache } from './cache.js';
import { resolveIconPaddingExtent, type IconPadding } from './icon-padding-metrics.js';

/** Read the four user-configurable icon padding values. */
export function getIconPadding(settings: Gio.Settings): IconPadding {
    return {
        top: settings.get_int('icon-padding-top'),
        right: settings.get_int('icon-padding-right'),
        bottom: settings.get_int('icon-padding-bottom'),
        left: settings.get_int('icon-padding-left'),
    };
}

/** Return the padding consumed along the dock's main axis. */
export function getIconPaddingExtent(settings: Gio.Settings, vertical: boolean): number {
    return resolveIconPaddingExtent(getIconPadding(settings), vertical);
}

/** Build the shared icon box style from the four dock padding preferences. */
export function getIconPaddingStyle(settings: Gio.Settings, size: number): string {
    const { top, right, bottom, left } = getIconPadding(settings);
    const key = `icon-padding:${size}:${top}:${right}:${bottom}:${left}`;

    return dockCache.getOrCreate(key, () =>
        `padding: ${top}px ${right}px ${bottom}px ${left}px; ` +
        `min-width: ${size + left + right}px; ` +
        `min-height: ${size + top + bottom}px;`,
    );
}
