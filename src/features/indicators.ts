import St from 'gi://St?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import type { DockAppButton } from './app-item.js';

/** Updates configurable open, focused and minimized application indicators. */
export class DockIndicators {
    private markerSignatures = new WeakMap<DockAppButton, string>();
    private activeStates = new WeakMap<DockAppButton, boolean>();

    constructor(private settings: Gio.Settings, private isDestroyed: () => boolean) {}

    update(items: DockAppButton[]): void {
        if (this.isDestroyed())
            return;

        const focused = global.display.focus_window;
        const enabled = this.settings.get_boolean('show-running-indicator');
        const showOpen = this.settings.get_boolean('indicator-show-open');
        const showFocused = this.settings.get_boolean('indicator-show-focused');
        const showMinimized = this.settings.get_boolean('indicator-show-minimized');
        const showCount = this.settings.get_boolean('show-window-count');
        const multiple = this.settings.get_string('indicator-mode') === 'multiple';
        const shape = this.settings.get_string('indicator-shape');
        const color = this.validColor(this.settings.get_string('indicator-color'));
        const opacity = Math.max(0, Math.min(1, this.settings.get_double('indicator-opacity')));
        // Positive values move the indicator upward inside the icon; negative
        // values move it below the icon's bottom edge.
        const bottomOffset = this.settings.get_int('indicator-bottom-offset');
        const indicatorSize = this.settings.get_int('indicator-size');
        const borderSize = this.settings.get_int('indicator-border-size');
        const borderColor = this.validColor(this.settings.get_string('indicator-border-color'));
        const borderOpacity = Math.max(0, Math.min(1, this.settings.get_double('indicator-border-opacity')));

        for (const item of items) {
            const app = item._gOsDockApp;
            if (!app)
                continue;

            const windows = app.get_windows();
            const running = windows.length > 0 || app.get_state() === Shell.AppState.RUNNING;
            const active = !!focused && windows.includes(focused);
            const minimized = windows.length > 0 && windows.every(window => window.minimized);
            // Dim the application icon itself when all of its windows are minimized.
            if (item._gOsDockIcon) {
                const opacity = minimized ? 128 : 255;
                if (item._gOsDockIcon.opacity !== opacity)
                    item._gOsDockIcon.opacity = opacity;
            }
            const shouldShow = enabled && (
                (showOpen && running) ||
                (showFocused && active) ||
                (showMinimized && minimized)
            );

            if (item._gOsDockIndicator) {
                if (item._gOsDockIndicator.visible !== shouldShow)
                    item._gOsDockIndicator.visible = shouldShow;
                const markerCount = multiple ? Math.max(1, windows.length) : 1;
                const length = shape === 'line' ? indicatorSize * 2 : indicatorSize;
                const thickness = indicatorSize;
                const radius = shape === 'round' ? '999px' : '0px';
                const signature = [markerCount, length, thickness, radius, color, opacity,
                    borderSize, borderColor, borderOpacity].join(':');
                if (this.markerSignatures.get(item) !== signature) {
                    item._gOsDockIndicator.set_style('spacing: 2px; width: auto; height: auto; background-color: transparent;');
                    for (const child of item._gOsDockIndicator.get_children())
                        child.destroy();
                    for (let index = 0; index < markerCount; index++) {
                        const marker = new St.Widget();
                        marker.set_size(length, thickness);
                        marker.set_style(
                            `width: ${length}px; height: ${thickness}px; ` +
                            `border-radius: ${radius}; background-color: rgba(${color}, ${opacity}); ` +
                            `border: ${borderSize}px solid rgba(${borderColor}, ${borderOpacity});`,
                        );
                        item._gOsDockIndicator.add_child(marker);
                    }
                    this.markerSignatures.set(item, signature);
                }
                // Clutter.FixedLayout does not infer overlay alignment: place
                // the marker row explicitly at the icon's bottom center.
                const iconContainer = item._gOsDockIndicator.get_parent();
                if (iconContainer) {
                    const spacing = 2;
                    const totalWidth = markerCount * length + Math.max(0, markerCount - 1) * spacing;
                    if (item._gOsDockIndicator.width !== totalWidth ||
                        item._gOsDockIndicator.height !== thickness)
                        item._gOsDockIndicator.set_size(totalWidth, thickness);
                    const x = Math.max(0, (iconContainer.width - totalWidth) / 2);
                    const y = iconContainer.height - thickness - bottomOffset;
                    const [currentX, currentY] = item._gOsDockIndicator.get_position();
                    if (currentX !== x || currentY !== y)
                        item._gOsDockIndicator.set_position(x, y);
                }
            }

            if (this.activeStates.get(item) !== active) {
                if (active) {
                    item._gOsDockIndicator?.add_style_class_name('active');
                    item.add_style_class_name('active');
                } else {
                    item._gOsDockIndicator?.remove_style_class_name('active');
                    item.remove_style_class_name('active');
                }
                this.activeStates.set(item, active);
            }

            if (item._gOsDockBadge) {
                const count = windows.length;
                const badgeText = showCount && count > 1 ? String(count) : '';
                if (item._gOsDockBadge.text !== badgeText)
                    item._gOsDockBadge.text = badgeText;
                const badgeVisible = badgeText !== '';
                if (item._gOsDockBadge.visible !== badgeVisible)
                    item._gOsDockBadge.visible = badgeVisible;
            }

        }
    }

    private validColor(value: string): string {
        if (!/^#[0-9a-fA-F]{6}$/.test(value))
            value = '#e6e6f0';
        const hex = value.slice(1);
        return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
    }
}
