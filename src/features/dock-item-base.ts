import St from 'gi://St?version=51';
import Gio from 'gi://Gio?version=2.0';
import { DockDragDrop } from './drag-and-drop.js';
import { DockTooltip } from './tooltip.js';
import { getIconPaddingStyle } from './icon-padding.js';
import { CleanupManager } from './cleanup-manager.js';

/** Shared lifecycle and presentation primitives for interactive dock buttons. */
export class DockItemBase {
    readonly cleanup = new CleanupManager();
    private tooltip: DockTooltip;
    private paddingStyle = '';
    private destroyed = false;

    constructor(
        private content: St.BoxLayout,
        readonly button: St.Button,
        tooltipText: string,
        dockPosition: () => string,
        private dragDrop: DockDragDrop,
        id: string,
    ) {
        this.tooltip = new DockTooltip(button, tooltipText, dockPosition);
        this.content.add_child(button);
        this.dragDrop.registerItem({ id, actor: button });
    }

    setTooltip(text: string): void {
        this.tooltip.setText(text);
        this.button.accessible_name = text;
    }

    setIconPadding(settings: Gio.Settings, size: number): string {
        const style = getIconPaddingStyle(settings, size);
        if (this.paddingStyle !== style) {
            this.button.set_style(style);
            this.paddingStyle = style;
        }
        return style;
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        this.cleanup.clear();
        this.dragDrop.unregisterItem(this.button);
        this.button.destroy();
    }
}
