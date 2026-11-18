import Gio from 'gi://Gio?version=2.0';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import type { DockAppButton } from './app-item.js';

interface DockKeyboardDependencies {
    settings: Gio.Settings;
    getItems: () => DockAppButton[];
    showDock: () => void;
    showPreviews: (app: Shell.App, item: DockAppButton, focusFirst: boolean) => void;
    hidePreviews: () => void;
}

/** Handles keyboard navigation between dock apps and their window previews. */
export class DockKeyboardNavigation {
    constructor(private dependencies: DockKeyboardDependencies) {}

    handle(item: DockAppButton, event: Clutter.Event): boolean {
        const key = event.get_key_symbol();
        const items = this.dependencies.getItems();
        const position = this.dependencies.settings.get_string('dock-position');
        const vertical = position === 'left' || position === 'right';
        const previousKey = vertical ? Clutter.KEY_Up : Clutter.KEY_Left;
        const nextKey = vertical ? Clutter.KEY_Down : Clutter.KEY_Right;
        const index = items.indexOf(item);

        if (index < 0)
            return Clutter.EVENT_PROPAGATE;

        if (key === previousKey)
            return this.focusItem(index - 1, items);
        if (key === nextKey)
            return this.focusItem(index + 1, items);

        if (key === this.getInwardKey(position)) {
            this.dependencies.showPreviews(item._gOsDockApp, item, true);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Home)
            return this.focusItem(0, items);
        if (key === Clutter.KEY_End)
            return this.focusItem(items.length - 1, items);
        if (key === Clutter.KEY_Escape) {
            this.dependencies.hidePreviews();
            item.grab_key_focus();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    private focusItem(index: number, items: DockAppButton[]): boolean {
        if (items.length === 0)
            return Clutter.EVENT_PROPAGATE;

        const normalized = (index + items.length) % items.length;
        this.dependencies.showDock();
        const target = items[normalized];
        if (!target)
            return Clutter.EVENT_PROPAGATE;

        target.grab_key_focus();
        return Clutter.EVENT_STOP;
    }

    private getInwardKey(position: string): number {
        switch (position) {
        case 'top':
            return Clutter.KEY_Down;
        case 'bottom':
            return Clutter.KEY_Up;
        case 'left':
            return Clutter.KEY_Right;
        default:
            return Clutter.KEY_Left;
        }
    }
}
