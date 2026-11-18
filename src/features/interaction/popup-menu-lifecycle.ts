import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

/** Owns popup menu registration and guarantees each menu is disposed once. */
export class PopupMenuLifecycle {
    private menus = new Set<PopupMenu.PopupMenu>();
    private destroyed = false;

    constructor(private manager: PopupMenu.PopupMenuManager) {}

    track(menu: PopupMenu.PopupMenu): boolean {
        if (this.destroyed) {
            this.runCleanup(() => menu.destroy());
            return false;
        }
        if (this.menus.has(menu))
            return true;

        let registered = false;
        try {
            this.manager.addMenu(menu);
            registered = true;
            this.menus.add(menu);
            menu.connect('open-state-changed', (_menu, open) => {
                if (!open)
                    this.dispose(menu);
            });
            return true;
        } catch (error) {
            this.menus.delete(menu);
            if (registered)
                this.runCleanup(() => this.manager.removeMenu(menu));
            this.runCleanup(() => menu.destroy());
            throw error;
        }
    }

    dispose(menu: PopupMenu.PopupMenu): void {
        if (!this.menus.delete(menu))
            return;
        this.runCleanup(() => this.manager.removeMenu(menu));
        this.runCleanup(() => menu.close());
        this.runCleanup(() => menu.destroy());
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

    private runCleanup(cleanup: () => void): void {
        try {
            cleanup();
        } catch (error) {
            logError(error as Error, 'Unable to release dock popup menu');
        }
    }
}
