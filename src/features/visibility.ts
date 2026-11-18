import Clutter from 'gi://Clutter?version=51';
import GLib from 'gi://GLib?version=2.0';
import Meta from 'gi://Meta?version=51';
import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';

const HIDE_DELAY_MS = 650;
const SMART_HIDE_DELAY_MS = 80;
const SLIDE_DURATION_MS = 240;

/** Controls dock visibility, auto-hide and overlap-aware smart-hide. */
export class DockVisibility {
    private smartHideSource = 0;
    private hideSource = 0;
    private destroyed = false;
    private initialized = false;

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

        // Every dock starts fully offscreen, independently of its visibility
        // settings. DockView calls this after the first item/layout pass, so
        // both actors already have their measured dimensions.
        if (!this.initialized) {
            this.initialized = true;
            this.setHiddenPosition();
            this.actor.reactive = false;
            this.actor.hide();
            this.background.hide();
        }

        if (!autoHide && !smartHide) {
            this.cancelHide();
            this.actor.remove_all_transitions();
            this.background.show();
            this.actor.show();
            this.actor.opacity = 255;
            this.background.opacity = 255;
            this.actor.translation_x = 0;
            this.actor.translation_y = 0;
            this.background.translation_x = 0;
            this.background.translation_y = 0;
            this.actor.reactive = true;
        } else if (autoHide) {
            this.scheduleHide();
        } else if (smartHide) {
            // Smart-hide starts visible, then the overlap check decides whether
            // it should remain visible or slide back offscreen.
            this.show();
        }

        if (smartHide)
            this.queueSmartHideCheck();
    }

    /** Keep a hidden dock fully outside the screen after its size changes. */
    syncHiddenPosition(): void {
        if (this.isInactive() || !this.initialized || this.actor.visible)
            return;

        this.setHiddenPosition();
    }

    private setHiddenPosition(): void {
        const position = this.settings.get_string('dock-position');
        const distanceX = position === 'left'
            ? -Math.max(this.actor.width, this.background.width)
            : position === 'right'
                ? Math.max(this.actor.width, this.background.width)
                : 0;
        const distanceY = position === 'top'
            ? -Math.max(this.actor.height, this.background.height)
            : position === 'bottom'
                ? Math.max(this.actor.height, this.background.height)
                : 0;
        this.actor.translation_x = distanceX;
        this.actor.translation_y = distanceY;
        this.background.translation_x = distanceX;
        this.background.translation_y = distanceY;
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
        // Cancel an in-flight slide before returning the dock to its layout position.
        this.actor.remove_all_transitions();
        this.background.remove_all_transitions();
        this.background.show();
        this.actor.show();
        this.actor.reactive = true;

        const transition = {
            duration: SLIDE_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        };
        this.background.ease({
            translationX: 0,
            translationY: 0,
            ...transition,
        });
        this.actor.ease({
            translationX: 0,
            translationY: 0,
            ...transition,
        });
    }

    hide(): void {
        if (this.isInactive() ||
            (!this.settings.get_boolean('auto-hide') && !this.settings.get_boolean('smart-hide')))
            return;

        // Move almost completely beyond the selected screen edge, leaving a
        // narrow reveal strip. The independent edge sensor remains at the edge.
        const position = this.settings.get_string('dock-position');
        // Account for the larger of the content and background containers so
        // neither the dock nor its background/border remains visible onscreen.
        const slideWidth = Math.max(this.actor.width, this.background.width);
        const slideHeight = Math.max(this.actor.height, this.background.height);
        const distanceX = position === 'left'
            ? -slideWidth
            : position === 'right'
                ? slideWidth
                : 0;
        const distanceY = position === 'top'
            ? -slideHeight
            : position === 'bottom'
                ? slideHeight
                : 0;

        this.actor.remove_all_transitions();
        this.background.remove_all_transitions();
        const transition = {
            duration: SLIDE_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        };
        this.background.ease({
            translationX: distanceX,
            translationY: distanceY,
            ...transition,
        });
        this.actor.ease({
            translationX: distanceX,
            translationY: distanceY,
            ...transition,
            onComplete: () => {
                if (!this.isInactive()) {
                    // The dock may have changed size while the slide was
                    // running. Recalculate its final offset before hiding it.
                    this.setHiddenPosition();
                    this.actor.reactive = false;
                    this.actor.hide();
                    this.background.hide();
                }
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

        const [actorX, actorY] = this.actor.get_transformed_position();
        const [backgroundX, backgroundY] = this.background.get_transformed_position();
        // The decorative surface can be offset from the content actor when
        // horizontal padding is asymmetric. Smart-hide must cover both.
        const left = Math.min(actorX, backgroundX);
        const top = Math.min(actorY, backgroundY);
        const right = Math.max(
            actorX + this.actor.width,
            backgroundX + this.background.width,
        );
        const bottom = Math.max(
            actorY + this.actor.height,
            backgroundY + this.background.height,
        );
        const dockRect = {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
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
