import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import type { DockAppButton } from './app-item.js';

/** Updates running dots, active state and per-app window-count badges. */
export class DockIndicators {
    constructor(private settings: Gio.Settings, private isDestroyed: () => boolean) {}

    update(items: DockAppButton[]): void {
        if (this.isDestroyed())
            return;

        const focused = global.display.focus_window;
        const showRunning = this.settings.get_boolean('show-running-indicator');
        const showCount = this.settings.get_boolean('show-window-count');

        for (const item of items) {
            const app = item._gOsDockApp;
            if (!app)
                continue;

            const windows = app.get_windows();
            const running = windows.length > 0 || app.get_state() === Shell.AppState.RUNNING;
            const active = !!focused && windows.includes(focused);

            if (item._gOsDockIndicator) {
                item._gOsDockIndicator.visible = showRunning && running;
                item._gOsDockIndicator.remove_style_class_name('active');
                if (active)
                    item._gOsDockIndicator.add_style_class_name('active');
            }

            if (item._gOsDockBadge) {
                const count = windows.length;
                item._gOsDockBadge.text = showCount && count > 1 ? String(count) : '';
                item._gOsDockBadge.visible = showCount && count > 1;
            }

            item.remove_style_class_name('active');
            if (active)
                item.add_style_class_name('active');
        }
    }
}
