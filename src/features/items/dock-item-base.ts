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
    private settings: Gio.Settings | null = null;
    private observedSettings: Gio.Settings | null = null;

    constructor(
        private content: St.BoxLayout | null,
        readonly button: St.Button,
        tooltipText: string,
        private readonly dockPosition: () => string,
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
        this.settings = settings;
        if (this.observedSettings !== settings) {
            this.observedSettings = settings;
            for (const key of ['hover-animation', 'hover-animation-intensity', 'hover-animation-duration']) {
                const signal = settings.connect(`changed::${key}`, () => this.updateInteractionAnimation());
                this.cleanup.addSignal(settings, signal);
            }
        }
        this.updateInteractionAnimation();
        return style;
    }

    private updateInteractionAnimation(): void {
        if (this.destroyed)
            return;
        const active = this.button.hover || this.focused;
        const settings = this.settings;
        const mode = settings?.get_string('hover-animation') ?? 'scale';
        const intensity = settings?.get_int('hover-animation-intensity') ?? 5;
        const duration = settings?.get_int('hover-animation-duration') ?? 130;
        const strength = Math.max(1, Math.min(8, intensity));
        const scale = active && (mode === 'scale' || mode === 'bounce')
            ? 1 + Math.min(0.045, strength * 0.009)
            : 1;
        const properties: Record<string, number> = {
            scaleX: scale,
            scaleY: scale,
            translationX: 0,
            translationY: 0,
        };
        const inward = strength * (mode === 'lift' ? 1.5 : 0.8);
        if (active && (mode === 'lift' || mode === 'bounce')) {
            switch (this.dockPosition()) {
            case 'top':
                properties.translationY = inward;
                break;
            case 'left':
                properties.translationX = inward;
                break;
            case 'right':
                properties.translationX = -inward;
                break;
            default:
                properties.translationY = -inward;
                break;
            }
        }

        const glow = active && mode === 'glow';
        if (glow)
            this.button.add_style_class_name('g-os-dock-item-hover-glow');
        else
            this.button.remove_style_class_name('g-os-dock-item-hover-glow');

        this.animations.animate('item-interaction', this.button as unknown as AnimationTarget,
            properties, {
                durationMs: Math.max(80, Math.min(300, duration)),
                mode: active && mode === 'bounce'
                    ? Clutter.AnimationMode.EASE_OUT_BACK
                    : Clutter.AnimationMode.EASE_OUT_QUAD,
            });
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.animations.destroy();
        this.button.scale_x = 1;
        this.button.scale_y = 1;
        this.button.translation_x = 0;
        this.button.translation_y = 0;
        this.button.remove_style_class_name('g-os-dock-item-hover-glow');
        this.cleanup.clear();
        this.dragDrop.unregisterItem(this.button);
        dockStyles.forget(this.button);
        this.button.destroy();
    }
}
