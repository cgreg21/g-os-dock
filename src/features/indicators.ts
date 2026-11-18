import St from 'gi://St?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import type { DockAppButton } from './app-item.js';
import { dockCache } from './cache.js';
import { dockStyles } from './style-manager.js';
import { resolveWindowIndicatorState } from './window-indicator-state.js';

/** Updates configurable open, focused and minimized application indicators. */
export class DockIndicators {
    private markerSignatures = new WeakMap<DockAppButton, string>();
    private activeStates = new WeakMap<DockAppButton, boolean>();
    private windowStates = new WeakMap<DockAppButton, {
        count: number;
        running: boolean;
        active: boolean;
        minimized: boolean;
    }>();

    constructor(private settings: Gio.Settings, private isDestroyed: () => boolean) {}

    update(items: DockAppButton[], refreshWindowState = true): void {
        if (this.isDestroyed())
            return;

        const focused = refreshWindowState ? global.display.focus_window : null;
        const enabled = this.settings.get_boolean('show-running-indicator');
        const showOpen = this.settings.get_boolean('indicator-show-open');
        const showFocused = this.settings.get_boolean('indicator-show-focused');
        const showMinimized = this.settings.get_boolean('indicator-show-minimized');
        const showCount = this.settings.get_boolean('show-window-count');
        const multiple = this.settings.get_string('indicator-mode') === 'multiple';
        const shape = this.settings.get_string('indicator-shape');
        const color = this.validColor(this.settings.get_string('indicator-color'));
        const opacity = Math.max(0, Math.min(1, this.settings.get_double('indicator-opacity')));
        const bottomOffset = this.settings.get_int('indicator-bottom-offset');
        const indicatorSize = this.settings.get_int('indicator-size');
        const borderSize = this.settings.get_int('indicator-border-size');
        const borderColor = this.validColor(this.settings.get_string('indicator-border-color'));
        const borderOpacity = Math.max(0, Math.min(1, this.settings.get_double('indicator-border-opacity')));

        for (const item of items) {
            const app = item._gOsDockApp;
            if (!app)
                continue;

            let state = this.windowStates.get(item);
            if (refreshWindowState || !state) {
                state = resolveWindowIndicatorState(
                    app.get_windows(),
                    focused,
                    app.get_state() === Shell.AppState.RUNNING,
                );
                this.windowStates.set(item, state);
            }
            const { count, running, active, minimized } = state;
            if (item._gOsDockIcon) {
                const iconOpacity = minimized ? 128 : 255;
                if (item._gOsDockIcon.opacity !== iconOpacity)
                    item._gOsDockIcon.opacity = iconOpacity;
            }
            const shouldShow = enabled && (
                (showOpen && running) ||
                (showFocused && active) ||
                (showMinimized && minimized)
            );

            if (item._gOsDockIndicator) {
                if (item._gOsDockIndicator.visible !== shouldShow)
                    item._gOsDockIndicator.visible = shouldShow;
                const markerCount = multiple ? Math.max(1, count) : 1;
                const length = shape === 'line' ? indicatorSize * 2 : indicatorSize;
                const thickness = indicatorSize;
                const radius = shape === 'round' ? '999px' : '0px';
                const signature = [markerCount, length, thickness, radius, color, opacity,
                    borderSize, borderColor, borderOpacity].join(':');
                if (this.markerSignatures.get(item) !== signature) {
                    dockStyles.apply(item._gOsDockIndicator, dockCache.getOrCreate(
                        'indicator-marker-container-style',
                        () => 'spacing: 2px; width: auto; height: auto; background-color: transparent;',
                    ));
                    for (const child of item._gOsDockIndicator.get_children())
                        child.destroy();
                    for (let index = 0; index < markerCount; index++) {
                        const marker = new St.Widget();
                        marker.set_size(length, thickness);
                        const markerStyle = dockCache.getOrCreate(
                            `indicator-marker-style:${length}:${thickness}:${radius}:${color}:${opacity}:${borderSize}:${borderColor}:${borderOpacity}`,
                            () =>
                                `width: ${length}px; height: ${thickness}px; ` +
                                `border-radius: ${radius}; background-color: rgba(${color}, ${opacity}); ` +
                                `border: ${borderSize}px solid rgba(${borderColor}, ${borderOpacity});`,
                        );
                        dockStyles.apply(marker, markerStyle);
                        item._gOsDockIndicator.add_child(marker);
                    }
                    this.markerSignatures.set(item, signature);
                }
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
        return dockCache.getOrCreate(`indicator-color:${value}`, () => {
            if (!/^#[0-9a-fA-F]{6}$/.test(value))
                value = '#e6e6f0';
            const hex = value.slice(1);
            return `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`;
        });
    }
}
