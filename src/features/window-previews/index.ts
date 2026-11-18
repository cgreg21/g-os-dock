import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import type { DockAppButton } from '../app-item.js';
import GLib from 'gi://GLib?version=2.0';
import Gio from 'gi://Gio?version=2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

type MonitorGeometry = (typeof Main.layoutManager.monitors)[number];
import { createWindowPreviewCard } from './card.js';
import { dockCache } from '../cache.js';
import { SettingsObserver } from '../settings-observer.js';
import { TaskScheduler } from '../task-scheduler.js';
import { ChromeActorManager } from '../chrome-actor-manager.js';

/**
 * Owns the lifecycle and rendering of application window previews.
 * DockView remains responsible for app items and delegates preview UI here.
 */
export class WindowPreviews {
    private actor: St.BoxLayout | null = null;
    private chromeActors = new ChromeActorManager<St.Widget>(
        (actor, options) => Main.layoutManager.addChrome(actor, options),
        actor => Main.layoutManager.removeChrome(actor),
    );
    private scheduler = new TaskScheduler({
        timeout: (delay, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, callback),
        idle: callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, callback),
        remove: sourceId => GLib.Source.remove(sourceId),
    });
    private hoverSignal = 0;
    private keySignal = 0;
    private destroyed = false;
    private settingsObserver = new SettingsObserver();
    private windowManagerSettings = new Gio.Settings({
        schema_id: 'org.gnome.desktop.wm.preferences',
    });

    constructor(
        private settings: Gio.Settings,
        private monitor: MonitorGeometry,
        private dockActor: St.Widget,
        private isDestroyed: () => boolean,
    ) {
        this.settingsObserver.watch(this.settings, 'show-window-previews', () => {
            if (!this.settings.get_boolean('show-window-previews'))
                this.hide();
        });
    }

    cancelPending(): void {
        this.scheduler.cancel('show');
        this.scheduler.cancel('hide');
    }

    scheduleShow(app: Shell.App, item: DockAppButton): void {
        if (this.isInactive() || !this.settings.get_boolean('show-window-previews'))
            return;
        this.scheduler.cancel('hide');
        this.scheduler.timeout('show', 320, () => {
            if (!this.isInactive() && item.hover)
                this.show(app, item);
        });
    }

    scheduleHide(): void {
        if (this.isInactive())
            return;
        this.scheduler.cancel('show');
        this.scheduler.timeout('hide', 260, () => {
            if (!this.isInactive() && !this.dockActor.hover && !this.actor?.hover)
                this.hide();
        });
    }

    show(app: Shell.App, item: DockAppButton, focusFirst = false): void {
        if (this.isInactive() || !this.settings.get_boolean('show-window-previews'))
            return;
        this.hide();
        const windows = app.get_windows();
        if (windows.length === 0)
            return;

        const dockPosition = this.settings.get_string('dock-position');
        const verticalDock = dockCache.getOrCreate(
            `preview-vertical-dock:${dockPosition}`,
            () => dockPosition === 'left' || dockPosition === 'right',
        );
        const previews = new St.BoxLayout({
            style_class: 'g-os-dock-previews',
            orientation: verticalDock
                ? Clutter.Orientation.VERTICAL
                : Clutter.Orientation.HORIZONTAL,
            reactive: true,
            track_hover: true,
            x_expand: false,
            y_expand: false,
        });
        previews.set_style(dockCache.getOrCreate(
            'preview-container-style',
            () => 'spacing: 8px; padding: 8px; border-radius: 14px; background-color: rgba(24,26,33,0.96); border: 1px solid rgba(255,255,255,0.18);',
        ));
        if (this.settings.get_boolean('dev-mode'))
            previews.add_style_class_name('g-os-dock-dev');
        const buttonLayout = this.windowManagerSettings.get_string('button-layout');
        const closeOnLeft = dockCache.getOrCreate(
            `preview-close-button-left:${buttonLayout}`,
            () => (buttonLayout.split(':')[0] ?? '').split(',').includes('close'),
        );
        let firstPreviewButton: St.Button | null = null;
        for (const [index, window] of windows.entries()) {
            const preview = createWindowPreviewCard(
                app, window, index, () => this.hide(), closeOnLeft,
            );
            if (!firstPreviewButton)
                firstPreviewButton = preview.previewButton;
            previews.add_child(preview.card);
        }

        this.chromeActors.add(previews, { affectsStruts: false, trackFullscreen: false });
        this.actor = previews;
        this.keySignal = previews.connect('key-press-event', (_actor: St.Widget, event: Clutter.Event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this.hide();
            item.grab_key_focus();
            return Clutter.EVENT_STOP;
        });
        this.hoverSignal = previews.connect('notify::hover', () => {
            if (!previews.hover)
                this.scheduleHide();
            else
                this.scheduler.cancel('hide');
        });
        const [itemX, itemY] = item.get_transformed_position();
        const itemWidth = item.width;
        const itemHeight = item.height;
        const [previewMinWidth, previewNaturalWidth] = previews.get_preferred_width(-1);
        const [previewMinHeight, previewNaturalHeight] = previews.get_preferred_height(-1);
        const previewWidth = Math.max(previewMinWidth, previewNaturalWidth);
        const previewHeight = Math.max(previewMinHeight, previewNaturalHeight);
        const position = dockPosition;
        let x = itemX + itemWidth / 2 - previewWidth / 2;
        let y = itemY - previewHeight - 12;
        if (position === 'top')
            y = itemY + itemHeight + 12;
        else if (position === 'left') {
            x = itemX + itemWidth + 12;
            y = itemY + itemHeight / 2 - previewHeight / 2;
        } else if (position === 'right') {
            x = itemX - previewWidth - 12;
            y = itemY + itemHeight / 2 - previewHeight / 2;
        }
        x = Math.max(this.monitor.x + 8, Math.min(x, this.monitor.x + this.monitor.width - previewWidth - 8));
        y = Math.max(this.monitor.y + 8, Math.min(y, this.monitor.y + this.monitor.height - previewHeight - 8));
        previews.set_position(Math.round(x), Math.round(y));
        previews.show();
        if (focusFirst)
            firstPreviewButton?.grab_key_focus();
    }

    hide(): void {
        this.cancelPending();
        if (this.actor) {
            if (this.hoverSignal) {
                try { this.actor.disconnect(this.hoverSignal); } catch (_error) { /* already destroyed */ }
            }
            if (this.keySignal) {
                try { this.actor.disconnect(this.keySignal); } catch (_error) { /* already destroyed */ }
            }
            this.chromeActors.remove(this.actor);
            this.actor.destroy();
            this.actor = null;
            this.hoverSignal = 0;
            this.keySignal = 0;
        }
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.settingsObserver.destroy();
        this.scheduler.destroy();
        this.chromeActors.destroy();
        this.hide();
    }

    private isInactive(): boolean {
        return this.destroyed || this.isDestroyed();
    }
}
