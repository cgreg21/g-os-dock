import St from 'gi://St?version=51';
import Clutter from 'gi://Clutter?version=51';
import Gio from 'gi://Gio?version=2.0';
import { DockDragDrop, type DockDndItem } from '../interaction/drag-and-drop.js';
import { DockTooltip } from '../interaction/tooltip.js';
import { getIconPaddingStyle } from '../layout/icon-padding.js';
import { CleanupManager } from '../../core/cleanup-manager.js';
import { AnimationManager, type AnimationTarget } from '../../core/animation-manager.js';
import { dockStyles } from '../../core/style-manager.js';

/** Shared lifecycle and presentation primitives for interactive dock buttons. */
export class DockItemBase {
    readonly cleanup = new CleanupManager();
    private tooltip: DockTooltip;
    private destroyed = false;
    private animations = new AnimationManager();
    private focused = false;

    constructor(
        private content: St.BoxLayout | null,
        readonly button: St.Button,
        tooltipText: string,
        dockPosition: () => string,
        private dragDrop: DockDragDrop,
        id: string,
        registration?: Omit<DockDndItem, 'id' | 'actor'>,
        onDragStart?: () => void,
    ) {
        this.tooltip = new DockTooltip(button, tooltipText, dockPosition);
        this.cleanup.add(() => this.tooltip.destroy());
        this.content?.add_child(button);
        this.cleanup.addSignal(button, button.connect('notify::hover', () => this.updateInteractionAnimation()));
        this.cleanup.addSignal(button, button.connect('key-focus-in', () => {
            this.focused = true;
            this.updateInteractionAnimation();
        }));
        this.cleanup.addSignal(button, button.connect('key-focus-out', () => {
            this.focused = false;
            this.updateInteractionAnimation();
        }));
        this.dragDrop.registerItem({ id, actor: button, ...registration }, onDragStart);
    }

    setTooltip(text: string): void {
        this.tooltip.setText(text);
        this.button.accessible_name = text;
    }

    setIconPadding(settings: Gio.Settings, size: number): string {
        const style = getIconPaddingStyle(settings, size);
        dockStyles.apply(this.button, style);
        return style;
    }

    private updateInteractionAnimation(): void {
        if (this.destroyed)
            return;
        const scale = this.button.hover || this.focused ? 1.045 : 1;
        this.animations.animate('item-interaction', this.button as unknown as AnimationTarget, {
            scaleX: scale,
            scaleY: scale,
        }, {
            durationMs: 130,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.animations.destroy();
        this.button.scale_x = 1;
        this.button.scale_y = 1;
        this.cleanup.clear();
        this.dragDrop.unregisterItem(this.button);
        dockStyles.forget(this.button);
        this.button.destroy();
    }
}
