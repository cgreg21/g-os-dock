import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { DockManager } from './dock/manager.js';

export default class GOSDockExtension extends Extension {
    private manager: DockManager | null = null;

    enable(): void {
        // GNOME Shell automatically loads stylesheet.css before enable() and
        // unloads it when the extension is disabled.
        this.manager = new DockManager(this.getSettings());
        this.manager.enable();
    }

    disable(): void {
        this.manager?.disable();
        this.manager = null;
    }
}
