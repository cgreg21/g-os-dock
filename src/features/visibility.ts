import Clutter from 'gi://Clutter?version=51';
import GLib from 'gi://GLib?version=2.0';
import Meta from 'gi://Meta?version=51';
import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';

const HIDE_DELAY_MS = 650;
const SMART_HIDE_DELAY_MS = 80;

/** Controls dock visibility, auto-hide and overlap-aware smart-hide. */
export class DockVisibility {
    private smartHideSource = 0;
    private hideSource = 0;
    private destroyed = false;

    constructor(
        private actor: St.Widget,
        private background: St.Widget,
        private edgeSensor: St.Widget,
        private settings: Gio.Settings,
        private monitorIndex: number,
        private isDestroyed: () => boolean,
    ) {}

    applySettings(): void {
        if (this.isInactive())
            return;

        const autoHide = this.settings.get_boolean('auto-hide');
        const smartHide = this.settings.get_boolean('smart-hide');

        if (!autoHide && !smartHide) {
            this.cancelHide();
            this.actor.remove_all_transitions();
            this.actor.show();
            this.actor.opacity = 255;
            this.background.opacity = 255;
            this.actor.reactive = true;
        } else if (autoHide) {
            this.scheduleHide();
        }

        if (smartHide)
            this.queueSmartHideCheck();
    }

    onPointerChanged(): void {
        if (this.isInactive())
            return;

        if (this.actor.hover) {
            this.cancelHide();
            this.show();
        } else if (this.settings.get_boolean('auto-hide')) {
            this.scheduleHide();
        }
    }

    queueSmartHideCheck(): void {
        if (this.isInactive() || !this.settings.get_boolean('smart-hide'))
            return;
        if (this.smartHideSource)
            GLib.source_remove(this.smartHideSource);

        this.smartHideSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SMART_HIDE_DELAY_MS, () => {
            this.smartHideSource = 0;
            this.checkWindowOverlap();
            return GLib.SOURCE_REMOVE;
        });
    }

    scheduleHide(): void {
        if (this.isInactive())
            return;

        this.cancelHide();
        if (!this.settings.get_boolean('auto-hide') || this.actor.hover || this.edgeSensor.hover)
            return;

        this.hideSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY_MS, () => {
            this.hideSource = 0;
            if (!this.isInactive() && !this.actor.hover && !this.edgeSensor.hover)
                this.hide();
            return GLib.SOURCE_REMOVE;
        });
    }

    cancelHide(): void {
        if (!this.hideSource)
            return;
        GLib.source_remove(this.hideSource);
        this.hideSource = 0;
    }

    show(): void {
        if (this.isInactive())
            return;

        this.cancelHide();
        // A previous hide completion must not make a newly shown dock inert.
        this.actor.remove_all_transitions();
        this.background.remove_all_transitions();
        this.background.show();
        this.background.ease({
            opacity: 255,
            duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.actor.show();
        this.actor.ease({
            opacity: 255,
            duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.actor.reactive = true;
    }

    hide(): void {
        if (this.isInactive() ||
            (!this.settings.get_boolean('auto-hide') && !this.settings.get_boolean('smart-hide')))
            return;

        // Replace any in-flight show/hide transition before starting this one.
        this.actor.remove_all_transitions();
        this.background.remove_all_transitions();
        this.background.ease({
            opacity: 0,
            duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.actor.ease({
            opacity: 0,
            duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!this.isInactive())
                    this.actor.reactive = false;
            },
        });
    }

    destroy(): void {
        if (this.destroyed)
            return;

        this.destroyed = true;
        this.cancelHide();
        if (this.smartHideSource)
            GLib.source_remove(this.smartHideSource);
        this.smartHideSource = 0;
        this.actor.remove_all_transitions();
        this.background.remove_all_transitions();
    }

    private isInactive(): boolean {
        return this.destroyed || this.isDestroyed();
    }

    private checkWindowOverlap(): void {
        if (this.isInactive() || !this.settings.get_boolean('smart-hide'))
            return;

        const [dockX, dockY] = this.actor.get_transformed_position();
        const dockRect = {
            x: dockX,
            y: dockY,
            width: this.actor.width,
            height: this.actor.height,
        };
        // Only windows on the active workspace may hide this dock. NORMAL_ALL
        // incorrectly lets a window on another virtual desktop hide it here.
        const activeWorkspace = global.workspace_manager.get_active_workspace();
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, activeWorkspace);
        const overlaps = windows.some((window: Meta.Window) => {
            if (!window || window.minimized || window.get_monitor() !== this.monitorIndex)
                return false;

            const type = window.get_window_type();
            if (type !== Meta.WindowType.NORMAL &&
                type !== Meta.WindowType.DIALOG &&
                type !== Meta.WindowType.MODAL_DIALOG)
                return false;

            const rect = window.get_frame_rect();
            return rect.x < dockRect.x + dockRect.width &&
                rect.x + rect.width > dockRect.x &&
                rect.y < dockRect.y + dockRect.height &&
                rect.y + rect.height > dockRect.y;
        });

        if (overlaps) {
            this.cancelHide();
            this.hide();
        } else if (!this.actor.hover && !this.edgeSensor.hover) {
            if (this.settings.get_boolean('auto-hide'))
                this.scheduleHide();
            else
                this.show();
        }
    }
}
