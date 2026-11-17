import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import type { DockAppButton } from '../app-item.js';
import GLib from 'gi://GLib?version=2.0';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

type MonitorGeometry = (typeof Main.layoutManager.monitors)[number];
import { createWindowPreviewCard } from './card.js';

/**
 * Owns the lifecycle and rendering of application window previews.
 * DockView remains responsible for app items and delegates preview UI here.
 */
export class WindowPreviews {
    private actor: St.BoxLayout | null = null;
    private showSource = 0;
    private hideSource = 0;
    private hoverSignal = 0;

    constructor(
        private settings: Gio.Settings,
        private monitor: MonitorGeometry,
        private dockActor: St.Widget,
        private isDestroyed: () => boolean,
    ) {}

    cancelPending(): void {
        if (this.showSource) {
            GLib.source_remove(this.showSource);
            this.showSource = 0;
        }
        if (this.hideSource) {
            GLib.source_remove(this.hideSource);
            this.hideSource = 0;
        }
    }

    scheduleShow(app: Shell.App, item: DockAppButton): void {
        if (!this.settings.get_boolean('show-window-previews'))
            return;
        if (this.showSource)
            GLib.source_remove(this.showSource);
        if (this.hideSource) {
            GLib.source_remove(this.hideSource);
            this.hideSource = 0;
        }
        this.showSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 320, () => {
            this.showSource = 0;
            if (!this.isDestroyed() && item.hover)
                this.show(app, item);
            return GLib.SOURCE_REMOVE;
        });
    }

    scheduleHide(): void {
        if (this.showSource) {
            GLib.source_remove(this.showSource);
            this.showSource = 0;
        }
        if (this.hideSource)
            GLib.source_remove(this.hideSource);
        this.hideSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 260, () => {
            this.hideSource = 0;
            if (!this.isDestroyed() && !this.dockActor.hover && !this.actor?.hover)
                this.hide();
            return GLib.SOURCE_REMOVE;
        });
    }

    show(app: Shell.App, item: DockAppButton, focusFirst = false): void {
        if (!this.settings.get_boolean('show-window-previews'))
            return;
        this.hide();
        const windows = app.get_windows();
        if (windows.length === 0)
            return;

        const verticalDock = ['left', 'right'].includes(this.settings.get_string('dock-position'));
        const previews = new St.BoxLayout({
            style_class: 'g-os-dock-previews',
            vertical: verticalDock,
            reactive: true,
            track_hover: true,
            x_expand: false,
            y_expand: false,
        });
        previews.set_style('spacing: 8px; padding: 8px; border-radius: 14px; background-color: rgba(24,26,33,0.96); border: 1px solid rgba(255,255,255,0.18);');
        let firstPreviewButton: St.Button | null = null;
        for (const [index, window] of windows.entries()) {
            const preview = createWindowPreviewCard(app, window, index, () => this.hide());
            if (!firstPreviewButton)
                firstPreviewButton = preview.previewButton;
            previews.add_child(preview.card);
        }

        Main.layoutManager.addChrome(previews, { affectsStruts: false, trackFullscreen: false });
        this.actor = previews;
        previews.connect('key-press-event', (_actor: St.Widget, event: Clutter.Event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this.hide();
            item.grab_key_focus();
            return Clutter.EVENT_STOP;
        });
        this.hoverSignal = previews.connect('notify::hover', () => {
            if (!previews.hover)
                this.scheduleHide();
            else if (this.hideSource) {
                GLib.source_remove(this.hideSource);
                this.hideSource = 0;
            }
        });
        const [itemX, itemY] = item.get_transformed_position();
        const itemWidth = item.width;
        const itemHeight = item.height;
        const [previewMinWidth, previewNaturalWidth] = previews.get_preferred_width(-1);
        const [previewMinHeight, previewNaturalHeight] = previews.get_preferred_height(-1);
        const previewWidth = Math.max(previewMinWidth, previewNaturalWidth);
        const previewHeight = Math.max(previewMinHeight, previewNaturalHeight);
        const position = this.settings.get_string('dock-position');
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
        if (this.actor) {
            if (this.hoverSignal) {
                try { this.actor.disconnect(this.hoverSignal); } catch (_error) { /* already destroyed */ }
            }
            Main.layoutManager.removeChrome(this.actor);
            this.actor.destroy();
            this.actor = null;
            this.hoverSignal = 0;
        }
    }


    destroy(): void {
        this.cancelPending();
        this.hide();
    }
}
