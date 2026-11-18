import Clutter from 'gi://Clutter?version=51';
import GLib from 'gi://GLib?version=2.0';
import Meta from 'gi://Meta?version=51';
import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import { rectanglesOverlap, unionRectangles } from '../../core/geometry.js';
import { resolveHiddenTranslation, type DockEdge } from './dock-positioner.js';
import { TaskScheduler } from '../../core/task-scheduler.js';
import { AnimationManager, type AnimationTarget } from '../../core/animation-manager.js';

const HIDE_DELAY_MS = 650;
const SMART_HIDE_DELAY_MS = 80;
const SLIDE_DURATION_MS = 240;

/** Controls dock visibility, auto-hide and overlap-aware smart-hide. */
export class DockVisibility {
    private scheduler = new TaskScheduler({
        timeout: (delay, callback) => GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, callback),
        idle: callback => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, callback),
        remove: sourceId => GLib.Source.remove(sourceId),
    });
    private destroyed = false;
    private initialized = false;
    private animations = new AnimationManager();

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
        const firstInitialization = !this.initialized;
        if (firstInitialization) {
            this.initialized = true;
            // Measure and place both layers before revealing either one. The
            // first visible frame therefore starts beyond the selected monitor
            // edge instead of flashing at the dock's final position.
            this.setHiddenPosition();
            this.actor.reactive = false;
            this.actor.hide();
            this.background.hide();
            // Reveal only after the layout pass has supplied real dimensions.
            // This also runs with auto-hide enabled; its normal delay below
            // starts after the entrance animation has begun.
            this.show();
        }

        if (!autoHide && !smartHide) {
            this.cancelHide();
            if (!firstInitialization) {
                this.animations.cancel('dock-content');
                this.animations.cancel('dock-background');
                this.background.show();
                this.actor.show();
                this.actor.opacity = 255;
                this.background.opacity = 255;
                this.actor.translation_x = 0;
                this.actor.translation_y = 0;
                this.background.translation_x = 0;
                this.background.translation_y = 0;
                this.actor.reactive = true;
            }
        } else if (autoHide) {
            this.scheduleHide();
        } else if (smartHide && !firstInitialization) {
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

    private getHiddenOffset(): { x: number; y: number } {
        const position = this.settings.get_string('dock-position');
        const width = Math.max(this.actor.width, this.background.width);
        const height = Math.max(this.actor.height, this.background.height);

        return resolveHiddenTranslation(position as DockEdge, { width, height });
    }

    private setHiddenPosition(): void {
        const { x, y } = this.getHiddenOffset();
        this.actor.translation_x = x;
        this.actor.translation_y = y;
        this.background.translation_x = x;
        this.background.translation_y = y;
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
        this.scheduler.timeout('smart-hide-check', SMART_HIDE_DELAY_MS, () => {
            this.checkWindowOverlap();
        });
    }

    scheduleHide(): void {
        if (this.isInactive())
            return;

        this.cancelHide();
        if (!this.settings.get_boolean('auto-hide') || this.actor.hover || this.edgeSensor.hover)
            return;

        this.scheduler.timeout('auto-hide', HIDE_DELAY_MS, () => {
            if (!this.isInactive() && !this.actor.hover && !this.edgeSensor.hover)
                this.hide();
        });
    }

    cancelHide(): void {
        this.scheduler.cancel('auto-hide');
    }

    show(): void {
        if (this.isInactive())
            return;

        this.cancelHide();
        // The animation manager replaces any in-flight slide on each layer.
        this.background.show();
        this.actor.show();
        this.actor.reactive = true;

        const transition = {
            durationMs: SLIDE_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        };
        this.animations.animate('dock-background', this.background as unknown as AnimationTarget, {
            translationX: 0,
            translationY: 0,
        }, transition);
        this.animations.animate('dock-content', this.actor as unknown as AnimationTarget, {
            translationX: 0,
            translationY: 0,
        }, transition);
    }

    hide(): void {
        if (this.isInactive() ||
            (!this.settings.get_boolean('auto-hide') && !this.settings.get_boolean('smart-hide')))
            return;

        // Move almost completely beyond the selected screen edge, leaving a
        // narrow reveal strip. The independent edge sensor remains at the edge.
        // Use the same measured offset as initialization and resize handling.
        const { x: distanceX, y: distanceY } = this.getHiddenOffset();

        const transition = {
            durationMs: SLIDE_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        };
        this.animations.animate('dock-background', this.background as unknown as AnimationTarget, {
            translationX: distanceX,
            translationY: distanceY,
        }, transition);
        this.animations.animate('dock-content', this.actor as unknown as AnimationTarget, {
            translationX: distanceX,
            translationY: distanceY,
        }, {
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
        this.scheduler.destroy();
        this.animations.destroy();
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
        const dockRect = unionRectangles(
            {
                x: actorX,
                y: actorY,
                width: this.actor.width,
                height: this.actor.height,
            },
            {
                x: backgroundX,
                y: backgroundY,
                width: this.background.width,
                height: this.background.height,
            },
        );
        if (!dockRect)
            return;
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
            return rectanglesOverlap(rect, dockRect);
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
