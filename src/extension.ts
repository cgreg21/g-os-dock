import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { DockManager } from './dockManager.js';

export default class RustDockExtension extends Extension {
    private manager: DockManager | null = null;

    enable(): void {
        this.loadStylesheet();
        this.manager = new DockManager(this.getSettings());
        this.manager.enable();
    }

    disable(): void {
        this.manager?.disable();
        this.manager = null;
    }
}
