import Gio from 'gi://Gio?version=2.0';
import { SettingsObserver } from '../../features/settings-observer.js';

export interface DockSettingsCallbacks {
    applyAppearance(): void;
    queueLayoutUpdate(): void;
    refresh(syncVolumes?: boolean): void;
    positionDock(): void;
    getItemSize(): number;
    getDockPosition(): string;
    syncFavoritesSeparator(vertical: boolean): void;
    applyVisibilitySettings(): void;
    syncEdgeSensor(): void;
    applyDevelopmentStyle(): void;
    updateIndicators(): void;
}

/** Owns the dock's GSettings subscriptions and their shared lifecycle. */
export class DockSettingsController {
    private readonly observer = new SettingsObserver();
    private destroyed = false;

    constructor(
        private readonly settings: Gio.Settings,
        private readonly desktopSettings: Gio.Settings,
        private readonly callbacks: DockSettingsCallbacks,
    ) {}

    connectTheme(): void {
        this.observer.watch(this.desktopSettings, 'color-scheme', () => {
            if (this.destroyed)
                return;
            this.callbacks.applyAppearance();
            this.callbacks.queueLayoutUpdate();
        });
    }

    connectSettings(): void {
        const watch = this.observer.watchMany.bind(this.observer);
        const { settings, callbacks } = this;

        watch(settings, [
            'theme',
            'acrylic-enabled',
            'background-color',
            'background-opacity',
            'border-color',
            'border-opacity',
            'border-size',
            'radius-top-left',
            'radius-top-right',
            'radius-bottom-right',
            'radius-bottom-left',
            'background-padding-top',
            'background-padding-right',
            'background-padding-bottom',
            'background-padding-left',
            'dock-spacing',
            'background-shadow-enabled',
            'background-shadow-color',
            'background-shadow-opacity',
            'background-shadow-offset-x',
            'background-shadow-offset-y',
            'background-shadow-blur',
            'background-shadow-spread',
        ], () => callbacks.applyAppearance());

        watch(settings, [
            'show-system-icon',
            'show-trash-icon',
            'dock-position',
            'icon-size',
            'dock-spacing',
            'border-size',
            'background-padding-top',
            'background-padding-right',
            'background-padding-bottom',
            'background-padding-left',
            'edge-distance',
            'icon-padding-top',
            'icon-padding-right',
            'icon-padding-bottom',
            'icon-padding-left',
            'dock-item-order',
            'dock-folders',
            'show-favorites-separator',
            'favorites-separator-size',
            'hover-animation',
            'hover-animation-intensity',
            'hover-animation-duration',
            'dock-magnification-enabled',
            'dock-magnification-scale',
        ], () => {
            callbacks.refresh();
            callbacks.positionDock();
        });

        watch(settings, [
            'show-network-drives',
            'show-system-drives',
            'show-usb-drives',
        ], () => {
            callbacks.refresh(true);
            callbacks.positionDock();
        });

        watch(settings, [
            'favorites-separator-color',
            'favorites-separator-opacity',
            'favorites-separator-length',
        ], () => {
            if (callbacks.getItemSize() === 0)
                return;
            const position = callbacks.getDockPosition();
            callbacks.syncFavoritesSeparator(position === 'left' || position === 'right');
            callbacks.positionDock();
        });

        watch(settings, [
            'auto-hide',
            'smart-hide',
        ], () => {
            callbacks.applyVisibilitySettings();
            callbacks.syncEdgeSensor();
        });

        this.observer.watch(settings, 'dev-mode', () => callbacks.applyDevelopmentStyle());

        watch(settings, [
            'show-running-indicator',
            'indicator-show-open',
            'indicator-show-focused',
            'indicator-show-minimized',
            'show-window-count',
            'indicator-mode',
            'indicator-shape',
            'indicator-color',
            'indicator-opacity',
            'indicator-bottom-offset',
            'indicator-size',
            'indicator-border-size',
            'indicator-border-color',
            'indicator-border-opacity',
        ], () => callbacks.updateIndicators());
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.observer.destroy();
    }

    get isDestroyed(): boolean {
        return this.destroyed;
    }
}
