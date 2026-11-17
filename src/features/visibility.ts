import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

const HIDE_DELAY_MS = 650;
const SMART_HIDE_DELAY_MS = 80;

/** Controls dock visibility, auto-hide and overlap-aware smart-hide. */
export class DockVisibility {
    private smartHideSource = 0;
    private hideSource = 0;

    constructor(
        private actor: any,
        private edgeSensor: any,
        private settings: any,
        private monitorIndex: number,
        private isDestroyed: () => boolean,
    ) {}

    applySettings(): void {
        if (this.isDestroyed())
            return;

        const autoHide = this.settings.get_boolean('auto-hide');
        const smartHide = this.settings.get_boolean('smart-hide');

        if (!autoHide && !smartHide) {
            this.cancelHide();
            this.actor.show();
            this.actor.opacity = 255;
        } else if (autoHide) {
            this.scheduleHide();
        }

        if (smartHide)
            this.queueSmartHideCheck();
    }

    onPointerChanged(): void {
        if (this.actor.hover) {
            this.cancelHide();
            this.show();
        } else if (this.settings.get_boolean('auto-hide')) {
            this.scheduleHide();
        }
    }

    queueSmartHideCheck(): void {
        if (this.isDestroyed() || !this.settings.get_boolean('smart-hide'))
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
        this.cancelHide();
        if (!this.settings.get_boolean('auto-hide') || this.actor.hover || this.edgeSensor.hover)
            return;

        this.hideSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY_MS, () => {
            this.hideSource = 0;
            if (!this.actor.hover && !this.edgeSensor.hover)
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
        this.cancelHide();
        this.actor.show();
        this.actor.ease({
            opacity: 255,
            duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.actor.reactive = true;
    }

    hide(): void {
        if (!this.settings.get_boolean('auto-hide') && !this.settings.get_boolean('smart-hide'))
            return;
        this.actor.ease({
            opacity: 0,
            duration: 160,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!this.isDestroyed())
                    this.actor.reactive = false;
            },
        });
    }

    destroy(): void {
        this.cancelHide();
        if (this.smartHideSource)
            GLib.source_remove(this.smartHideSource);
        this.smartHideSource = 0;
    }

    private checkWindowOverlap(): void {
        if (this.isDestroyed() || !this.settings.get_boolean('smart-hide'))
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
        const overlaps = windows.some((window: any) => {
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
