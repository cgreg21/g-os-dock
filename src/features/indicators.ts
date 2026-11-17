import St from 'gi://St?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import type { DockAppButton } from './app-item.js';

/** Updates configurable open, focused and minimized application indicators. */
export class DockIndicators {
    constructor(private settings: Gio.Settings, private isDestroyed: () => boolean) {}

    update(items: DockAppButton[]): void {
        if (this.isDestroyed())
            return;

        const focused = global.display.focus_window;
        const enabled = this.settings.get_boolean('show-running-indicator');
        const showOpen = this.settings.get_boolean('indicator-show-open');
        const showFocused = this.settings.get_boolean('indicator-show-focused');
        const showMinimized = this.settings.get_boolean('indicator-show-minimized');
        const multiple = this.settings.get_string('indicator-mode') === 'multiple';
        const shape = this.settings.get_string('indicator-shape');
        const color = this.validColor(this.settings.get_string('indicator-color'));
        const opacity = Math.max(0, Math.min(1, this.settings.get_double('indicator-opacity')));
        // Positive values move the indicator upward inside the icon; negative
        // values move it below the icon's bottom edge.
        const bottomOffset = this.settings.get_int('indicator-bottom-offset');
        const indicatorSize = this.settings.get_int('indicator-size');

        for (const item of items) {
            const app = item._gOsDockApp;
            if (!app)
                continue;

            const windows = app.get_windows();
            const running = windows.length > 0 || app.get_state() === Shell.AppState.RUNNING;
            const active = !!focused && windows.includes(focused);
            const minimized = windows.length > 0 && windows.every(window => window.minimized);
            const shouldShow = enabled && (
                (showOpen && running) ||
                (showFocused && active) ||
                (showMinimized && minimized)
            );

            if (item._gOsDockIndicator) {
                item._gOsDockIndicator.visible = shouldShow;
                item._gOsDockIndicator.set_style('spacing: 2px; width: auto; height: auto; background-color: transparent;');
                for (const child of item._gOsDockIndicator.get_children())
                    child.destroy();
                const markerCount = multiple ? Math.max(1, windows.length) : 1;
                const length = shape === 'line' ? indicatorSize * 2 : indicatorSize;
                const thickness = indicatorSize;
                const radius = shape === 'round' ? '999px' : '0px';
                for (let index = 0; index < markerCount; index++) {
                    const marker = new St.Widget();
                    marker.set_size(length, thickness);
                    marker.set_style(
                        `width: ${length}px; height: ${thickness}px; ` +
                        `border-radius: ${radius}; background-color: rgba(${color}, ${opacity});`,
                    );
                    item._gOsDockIndicator.add_child(marker);
                }
                // Clutter.FixedLayout does not infer overlay alignment: place
                // the marker row explicitly at the icon's bottom center.
                const iconContainer = item._gOsDockIndicator.get_parent();
                if (iconContainer) {
                    const spacing = 2;
                    const totalWidth = markerCount * length + Math.max(0, markerCount - 1) * spacing;
                    item._gOsDockIndicator.set_size(totalWidth, thickness);
                    item._gOsDockIndicator.set_position(
                        Math.max(0, (iconContainer.width - totalWidth) / 2),
                        iconContainer.height - thickness - bottomOffset,
                    );
                }
                item._gOsDockIndicator.remove_style_class_name('active');
                if (active)
                    item._gOsDockIndicator.add_style_class_name('active');
            }

            if (item._gOsDockBadge) {
                const count = windows.length;
                const showCount = this.settings.get_boolean('show-window-count');
                item._gOsDockBadge.text = showCount && count > 1 ? String(count) : '';
                item._gOsDockBadge.visible = showCount && count > 1;
            }

            item.remove_style_class_name('active');
            if (active)
                item.add_style_class_name('active');
        }
    }

    private validColor(value: string): string {
        if (!/^#[0-9a-fA-F]{6}$/.test(value))
            value = '#e6e6f0';
        const hex = value.slice(1);
        return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
    }
}
