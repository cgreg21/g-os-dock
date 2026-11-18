import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/** Owns popup menu registration and guarantees each menu is disposed once. */
export class PopupMenuLifecycle {
    private menus = new Set<PopupMenu.PopupMenu>();
    private destroyed = false;

    constructor(private manager: PopupMenu.PopupMenuManager) {}

    track(menu: PopupMenu.PopupMenu): boolean {
        if (this.destroyed) {
            menu.destroy();
            return false;
        }
        this.menus.add(menu);
        this.manager.addMenu(menu);
        menu.connect('open-state-changed', (_menu, open) => {
            if (!open)
                this.dispose(menu);
        });
        return true;
    }

    dispose(menu: PopupMenu.PopupMenu): void {
        if (!this.menus.delete(menu))
            return;
        this.manager.removeMenu(menu);
        menu.close();
        menu.destroy();
    }

    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        for (const menu of [...this.menus])
            this.dispose(menu);
    }

    get size(): number {
        return this.menus.size;
    }
}
