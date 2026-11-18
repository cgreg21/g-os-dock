import St from 'gi://St?version=51';
import Shell from 'gi://Shell?version=51';
import Gio from 'gi://Gio?version=2.0';
import type { DockAppButton } from '../applications/app-item.js';
import { dockCache } from '../../core/cache.js';
import { dockStyles } from '../../core/style-manager.js';
import {
    resolveWindowIndicatorState,
    type WindowIndicatorState,
} from './window-indicator-state.js';
import {
    createIndicatorMarkerSignature,
    createIndicatorMarkerStyle,
    createIndicatorMarkerStyleKey,
    resolveIndicatorColor,
} from './indicator-style.js';
import { resolveIndicatorMarkerLayout } from './indicator-layout.js';
import {
    normalizeIndicatorOpacity,
    resolveIndicatorMarkerConfiguration,
} from './indicator-configuration.js';
import { resolveIndicatorPresentation } from './indicator-presentation.js';
import { resolveActiveIndicatorTransition } from './active-indicator-state.js';

/** Updates configurable open, focused and minimized application indicators. */
export class DockIndicators {
    private markerSignatures = new WeakMap<DockAppButton, string>();
    private activeStates = new WeakMap<DockAppButton, boolean>();
    private windowStates = new WeakMap<DockAppButton, WindowIndicatorState>();

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
        const color = resolveIndicatorColor(this.settings.get_string('indicator-color'));
        const opacity = normalizeIndicatorOpacity(this.settings.get_double('indicator-opacity'));
        const bottomOffset = this.settings.get_int('indicator-bottom-offset');
        const indicatorSize = this.settings.get_int('indicator-size');
        const borderSize = this.settings.get_int('indicator-border-size');
        const borderColor = resolveIndicatorColor(this.settings.get_string('indicator-border-color'));
        const borderOpacity = normalizeIndicatorOpacity(this.settings.get_double('indicator-border-opacity'));

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
            const { active } = state;
            const presentation = resolveIndicatorPresentation(state, {
                enabled,
                showOpen,
                showFocused,
                showMinimized,
                showCount,
            });
            if (item._gOsDockIcon && item._gOsDockIcon.opacity !== presentation.iconOpacity)
                item._gOsDockIcon.opacity = presentation.iconOpacity;

            if (item._gOsDockIndicator) {
                if (item._gOsDockIndicator.visible !== presentation.visible)
                    item._gOsDockIndicator.visible = presentation.visible;
                const configuration = resolveIndicatorMarkerConfiguration({
                    count: state.count,
                    multiple,
                    shape,
                    size: indicatorSize,
                    color,
                    opacity,
                    borderSize,
                    borderColor,
                    borderOpacity,
                });
                const { count: markerCount, style: styleOptions } = configuration;
                const { length, thickness } = styleOptions;
                const signature = createIndicatorMarkerSignature(markerCount, styleOptions);
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
                            `indicator-marker-style:${createIndicatorMarkerStyleKey(styleOptions)}`,
                            () => createIndicatorMarkerStyle(styleOptions),
                        );
                        dockStyles.apply(marker, markerStyle);
                        item._gOsDockIndicator.add_child(marker);
                    }
                    this.markerSignatures.set(item, signature);
                }
                const iconContainer = item._gOsDockIndicator.get_parent();
                if (iconContainer) {
                    const layout = resolveIndicatorMarkerLayout(
                        markerCount,
                        length,
                        thickness,
                        iconContainer.width,
                        iconContainer.height,
                        bottomOffset,
                    );
                    if (item._gOsDockIndicator.width !== layout.width ||
                        item._gOsDockIndicator.height !== layout.height)
                        item._gOsDockIndicator.set_size(layout.width, layout.height);
                    const [currentX, currentY] = item._gOsDockIndicator.get_position();
                    if (currentX !== layout.x || currentY !== layout.y)
                        item._gOsDockIndicator.set_position(layout.x, layout.y);
                }
            }

            const activeTransition = resolveActiveIndicatorTransition(
                this.activeStates.get(item),
                active,
            );
            if (activeTransition.changed) {
                if (activeTransition.active) {
                    item._gOsDockIndicator?.add_style_class_name('active');
                    item.add_style_class_name('active');
                } else {
                    item._gOsDockIndicator?.remove_style_class_name('active');
                    item.remove_style_class_name('active');
                }
                this.activeStates.set(item, activeTransition.active);
            }

            if (item._gOsDockBadge) {
                if (item._gOsDockBadge.text !== presentation.badgeText)
                    item._gOsDockBadge.text = presentation.badgeText;
                if (item._gOsDockBadge.visible !== presentation.badgeVisible)
                    item._gOsDockBadge.visible = presentation.badgeVisible;
            }
        }
    }

}
