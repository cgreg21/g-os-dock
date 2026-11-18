import Gio from 'gi://Gio?version=2.0';
import Clutter from 'gi://Clutter?version=51';
import Shell from 'gi://Shell?version=51';
import type { DockAppButton } from '../applications/app-item.js';
import { resolveDockKeyboardAction, resolveWrappedDockIndex } from './keyboard-navigation-state.js';

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
        const index = items.indexOf(item);

        if (index < 0)
            return Clutter.EVENT_PROPAGATE;

        const action = resolveDockKeyboardAction(key, position, {
            left: Clutter.KEY_Left,
            right: Clutter.KEY_Right,
            up: Clutter.KEY_Up,
            down: Clutter.KEY_Down,
            home: Clutter.KEY_Home,
            end: Clutter.KEY_End,
            escape: Clutter.KEY_Escape,
        });
        switch (action) {
        case 'previous':
            return this.focusItem(index - 1, items);
        case 'next':
            return this.focusItem(index + 1, items);
        case 'previews':
            this.dependencies.showPreviews(item._gOsDockApp, item, true);
            return Clutter.EVENT_STOP;
        case 'first':
            return this.focusItem(0, items);
        case 'last':
            return this.focusItem(items.length - 1, items);
        case 'escape':
            this.dependencies.hidePreviews();
            item.grab_key_focus();
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    private focusItem(index: number, items: DockAppButton[]): boolean {
        if (items.length === 0)
            return Clutter.EVENT_PROPAGATE;

        const normalized = resolveWrappedDockIndex(index, items.length);
        if (normalized === null)
            return Clutter.EVENT_PROPAGATE;
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
