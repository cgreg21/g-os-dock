import Clutter from 'gi://Clutter?version=51';

interface DockKeyboardDependencies {
    settings: any;
    getItems: () => any[];
    showDock: () => void;
    showPreviews: (app: any, item: any, focusFirst: boolean) => void;
    hidePreviews: () => void;
    magnify: (index: number, enabled: boolean) => void;
}

/** Handles keyboard navigation between dock apps and their window previews. */
export class DockKeyboardNavigation {
    constructor(private dependencies: DockKeyboardDependencies) {}

    handle(item: any, event: any): number {
        const key = event.get_key_symbol();
        const items = this.dependencies.getItems();
        const vertical = ['left', 'right'].includes(
            this.dependencies.settings.get_string('dock-position'),
        );
        const previousKey = vertical ? Clutter.KEY_Up : Clutter.KEY_Left;
        const nextKey = vertical ? Clutter.KEY_Down : Clutter.KEY_Right;
        const index = items.indexOf(item);

        if (index < 0)
            return Clutter.EVENT_PROPAGATE;

        if (key === previousKey)
            return this.focusItem(index - 1);
        if (key === nextKey)
            return this.focusItem(index + 1);

        const inwardKey = this.getInwardKey();
        if (key === inwardKey) {
            this.dependencies.showPreviews(item._gOsDockApp, item, true);
            return Clutter.EVENT_STOP;
        }
        if (key === Clutter.KEY_Home)
            return this.focusItem(0);
        if (key === Clutter.KEY_End)
            return this.focusItem(items.length - 1);
        if (key === Clutter.KEY_Escape) {
            this.dependencies.hidePreviews();
            this.dependencies.magnify(-1, false);
            item.grab_key_focus();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    private focusItem(index: number): number {
        const items = this.dependencies.getItems();
        if (items.length === 0)
            return Clutter.EVENT_PROPAGATE;

        const normalized = (index + items.length) % items.length;
        this.dependencies.showDock();
        items[normalized].grab_key_focus();
        this.dependencies.magnify(normalized, true);
        return Clutter.EVENT_STOP;
    }

    private getInwardKey(): number {
        switch (this.dependencies.settings.get_string('dock-position')) {
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
