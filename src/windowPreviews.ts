import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

/**
 * Owns the lifecycle and rendering of application window previews.
 * DockView remains responsible for app items and delegates preview UI here.
 */
export class WindowPreviews {
    private actor: any = null;
    private showSource = 0;
    private hideSource = 0;
    private hoverSignal = 0;

    constructor(
        private settings: any,
        private monitor: any,
        private dockActor: any,
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

    scheduleShow(app: any, item: any): void {
        if (!this.settings.get_boolean('show-window-previews'))
            return;
        if (this.previewSource)
            GLib.source_remove(this.previewSource);
        if (this.previewHideSource) {
            GLib.source_remove(this.previewHideSource);
            this.previewHideSource = 0;
        }
        this.previewSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 320, () => {
            this.previewSource = 0;
            if (!this.isDestroyed() && item.hover)
                this.showWindowPreviews(app, item);
            return GLib.SOURCE_REMOVE;
        });
    }

    scheduleHide(): void {
        if (this.previewSource) {
            GLib.source_remove(this.previewSource);
            this.previewSource = 0;
        }
        if (this.previewHideSource)
            GLib.source_remove(this.previewHideSource);
        this.previewHideSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 260, () => {
            this.previewHideSource = 0;
            if (!this.isDestroyed() && !this.actor.hover && !this.previewActor?.hover)
                this.hideWindowPreviews();
            return GLib.SOURCE_REMOVE;
        });
    }

    show(app: any, item: any, focusFirst = false): void {
        if (!this.settings.get_boolean('show-window-previews'))
            return;
        this.hideWindowPreviews();
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
        let firstPreviewButton: any = null;
        for (const [index, window] of windows.entries()) {
            const card = new St.BoxLayout({
                style_class: 'g-os-dock-preview-card',
                vertical: true,
                reactive: true,
                track_hover: true,
                x_expand: false,
                y_expand: false,
            });
            card.set_style('spacing: 5px; padding: 6px; border-radius: 9px; background-color: rgba(255,255,255,0.07);');
            const previewButton = new St.Button({
                style_class: 'g-os-dock-preview-open',
                reactive: true,
                can_focus: true,
                track_hover: true,
                x_expand: false,
                y_expand: false,
            });
            previewButton.set_style('padding: 0; background-color: transparent;');
            const content = new St.BoxLayout({ vertical: true, style: 'spacing: 5px;' });
            let compositorActor: any = null;
            try { compositorActor = window.get_compositor_private(); } catch (_error) { /* unavailable */ }
            if (compositorActor && !window.minimized) {
                const clone = new Clutter.Clone({ source: compositorActor });
                clone.set_size(176, 104);
                const thumbnail = new St.Bin({
                    style_class: 'g-os-dock-preview-thumbnail',
                    width: 176,
                    height: 104,
                    child: clone,
                });
                content.add_child(thumbnail);
            } else {
                const fallback = app.create_icon_texture(56);
                const placeholder = new St.Bin({
                    width: 176,
                    height: 104,
                    child: fallback,
                });
                content.add_child(placeholder);
            }
            let title = '';
            try { title = window.get_title() || ''; } catch (_error) { /* title unavailable */ }
            const label = new St.Label({
                text: (title.trim() || `Window ${index + 1}`).slice(0, 42),
                style: 'max-width: 176px;',
                x_align: Clutter.ActorAlign.CENTER,
            });
            content.add_child(label);

            // Show the window's workspace and provide a direct switch action.
            let workspace: any = null;
            let workspaceIndex = -1;
            let onAllWorkspaces = false;
            try {
                workspace = window.get_workspace();
                workspaceIndex = workspace?.index?.() ?? -1;
                onAllWorkspaces = window.is_on_all_workspaces();
            } catch (_error) {
                // Some special windows may not expose normal workspace metadata.
            }
            const activeWorkspaceIndex = global.workspace_manager.get_active_workspace_index();
            const workspaceText = onAllWorkspaces
                ? 'All workspaces'
                : workspaceIndex >= 0 ? `Workspace ${workspaceIndex + 1}` : 'Workspace unavailable';
            const workspaceLabel = new St.Label({
                text: workspaceText,
                style_class: 'g-os-dock-preview-workspace',
                x_align: Clutter.ActorAlign.CENTER,
            });
            content.add_child(workspaceLabel);
            previewButton.set_child(content);
            if (!firstPreviewButton)
                firstPreviewButton = previewButton;
            previewButton.accessible_name = `Activate ${title.trim() || `window ${index + 1}`}`;
            previewButton.connect('clicked', () => {
                try { app.activate_window(window, global.get_current_time()); }
                catch (_error) { window.activate(global.get_current_time()); }
                this.hideWindowPreviews();
            });
            card.add_child(previewButton);

            const actions = new St.BoxLayout({
                style_class: 'g-os-dock-preview-actions',
                x_expand: true,
                y_expand: false,
            });
            const minimize = new St.Button({
                style_class: 'g-os-dock-preview-action',
                child: new St.Icon({ icon_name: 'window-minimize-symbolic', icon_size: 14 }),
                can_focus: true,
                reactive: true,
                tooltip_text: 'Minimize window',
                accessible_name: 'Minimize window',
                x_expand: true,
            });
            minimize.connect('clicked', () => {
                window.minimize();
                this.hideWindowPreviews();
            });
            const close = new St.Button({
                style_class: 'g-os-dock-preview-action close',
                child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 14 }),
                can_focus: true,
                reactive: true,
                tooltip_text: 'Close window',
                accessible_name: 'Close window',
                x_expand: true,
            });
            close.connect('clicked', () => {
                window.delete(global.get_current_time());
                this.hideWindowPreviews();
            });
            actions.add_child(minimize);

            if (!onAllWorkspaces && workspace && workspaceIndex >= 0 &&
                workspaceIndex !== activeWorkspaceIndex) {
                const switchWorkspace = new St.Button({
                    style_class: 'g-os-dock-preview-action workspace',
                    child: new St.Label({ text: 'Go to workspace' }),
                    can_focus: true,
                    reactive: true,
                    tooltip_text: `Switch to workspace ${workspaceIndex + 1}`,
                    accessible_name: `Switch to workspace ${workspaceIndex + 1}`,
                    x_expand: true,
                });
                switchWorkspace.connect('clicked', () => {
                    const timestamp = global.get_current_time();
                    workspace.activate(timestamp);
                    try { app.activate_window(window, timestamp); }
                    catch (_error) { window.activate(timestamp); }
                    this.hideWindowPreviews();
                });
                actions.add_child(switchWorkspace);
            }

            actions.add_child(close);
            card.add_child(actions);
            previews.add_child(card);
        }

        Main.layoutManager.addChrome(previews, { affectsStruts: false, trackFullscreen: false });
        this.previewActor = previews;
        previews.connect('key-press-event', (_actor: any, event: any) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this.hideWindowPreviews();
            item.grab_key_focus();
            return Clutter.EVENT_STOP;
        });
        this.previewHoverSignal = previews.connect('notify::hover', () => {
            if (!previews.hover)
                this.scheduleHide();
            else if (this.previewHideSource) {
                GLib.source_remove(this.previewHideSource);
                this.previewHideSource = 0;
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

    hide()): void {
        if (this.previewActor) {
            if (this.previewHoverSignal) {
                try { this.previewActor.disconnect(this.previewHoverSignal); } catch (_error) { /* already destroyed */ }
            }
            Main.layoutManager.removeChrome(this.previewActor);
            this.previewActor.destroy();
            this.previewActor = null;
            this.previewHoverSignal = 0;
        }
    }


    destroy(): void {
        this.cancelPending();
        this.hide();
    }
}
