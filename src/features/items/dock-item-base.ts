import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import { DockDragDrop, type DockDndItem } from '../interaction/drag-and-drop.js';
import { DockTooltip } from './tooltip.js';
import { getIconPaddingStyle } from './icon-padding.js';
import { CleanupManager } from './cleanup-manager.js';
import { dockStyles } from './style-manager.js';

/** Shared lifecycle and presentation primitives for interactive dock buttons. */
export class DockItemBase {
    readonly cleanup = new CleanupManager();
    private tooltip: DockTooltip;
    private destroyed = false;

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

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cleanup.clear();
        this.dragDrop.unregisterItem(this.button);
        dockStyles.forget(this.button);
        this.button.destroy();
    }
}
