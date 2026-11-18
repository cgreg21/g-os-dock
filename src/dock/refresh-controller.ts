import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import { DockLayout } from '../features/layout.js';
import { DockItemsController } from '../features/dock-items-controller.js';
import { calculateDockIconSize } from '../features/icon-sizing.js';
import { FAVORITES_SEPARATOR_MARGIN } from '../features/favorites-separator.js';
import { getIconPaddingExtent } from '../features/icon-padding.js';
import { countVisibleWindowBadges } from '../features/window-count-badge.js';

/** Coordinates item reconciliation, sizing and post-refresh layout updates. */
export interface DockRefreshCallbacks {
    getApplications(): Shell.App[];
    syncApplications(applications: Shell.App[], size: number): boolean;
    applyItemOrder(): void;
    syncFavoritesSeparator(vertical: boolean): void;
    positionDock(): void;
    updateIndicators(): void;
    queueSmartHideCheck(): void;
}

export class DockRefreshController {
    private destroyed = false;

    constructor(
        private readonly settings: Gio.Settings,
        private readonly layout: DockLayout,
        private readonly dockItems: DockItemsController,
        private readonly getFavoriteIds: () => string[],
        private readonly callbacks: DockRefreshCallbacks,
    ) {}

    refresh(syncVolumes = false): void {
        if (this.destroyed)
            return;

        const applications = this.callbacks.getApplications();
        const configuredSize = this.settings.get_int('icon-size');
        const volumeItemsChanged = syncVolumes
            ? this.dockItems.syncVolumes(configuredSize)
            : false;
        const position = this.settings.get_string('dock-position');
        const vertical = position === 'left' || position === 'right';
        const available = this.layout.availableSpace(vertical);
        const favoriteIds = new Set(this.getFavoriteIds());
        const iconPadding = getIconPaddingExtent(this.settings, vertical);
        const size = calculateDockIconSize({
            applicationIds: applications.map(app => app.get_id()),
            favoriteIds,
            availableSpace: available,
            configuredSize,
            spacing: this.settings.get_int('dock-spacing'),
            showFavoritesSeparator: this.settings.get_boolean('show-favorites-separator'),
            separatorSize: this.settings.get_int('favorites-separator-size'),
            separatorMargin: FAVORITES_SEPARATOR_MARGIN,
            additionalItemCount:
                Number(this.settings.get_boolean('show-system-icon')) +
                Number(this.settings.get_boolean('show-trash-icon')) +
                this.dockItems.volumeCount,
            windowCountBadgeCount: countVisibleWindowBadges(
                applications.map(app => app.get_windows().length),
                this.settings.get_boolean('show-window-count'),
            ),
            iconPadding,
            vertical,
        });

        const structureChanged = this.callbacks.syncApplications(applications, size);
        const dockItemsChanged = this.dockItems.sync(size);
        this.callbacks.applyItemOrder();
        this.callbacks.syncFavoritesSeparator(vertical);

        if (structureChanged || dockItemsChanged || volumeItemsChanged)
            this.callbacks.positionDock();

        this.callbacks.updateIndicators();
        this.callbacks.queueSmartHideCheck();
    }

    destroy(): void {
        this.destroyed = true;
    }

    get isDestroyed(): boolean {
        return this.destroyed;
    }
}
