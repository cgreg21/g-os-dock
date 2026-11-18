import type { WindowIndicatorState } from './window-indicator-state.js';
import { shouldShowWindowCountBadge } from './window-count-badge.js';

export interface IndicatorPresentationOptions {
    enabled: boolean;
    showOpen: boolean;
    showFocused: boolean;
    showMinimized: boolean;
    showCount: boolean;
}

export interface IndicatorPresentation {
    visible: boolean;
    active: boolean;
    iconOpacity: number;
    badgeText: string;
    badgeVisible: boolean;
}

/** Resolve indicator visibility, active styling, icon opacity and badge content. */
export function resolveIndicatorPresentation(
    state: WindowIndicatorState,
    options: IndicatorPresentationOptions,
): IndicatorPresentation {
    const visible = options.enabled && (
        (options.showOpen && state.running) ||
        (options.showFocused && state.active) ||
        (options.showMinimized && state.minimized)
    );
    const badgeText = shouldShowWindowCountBadge(state.count, options.showCount)
        ? String(state.count)
        : '';

    return {
        visible,
        active: state.active,
        iconOpacity: state.minimized ? 128 : 255,
        badgeText,
        badgeVisible: badgeText !== '',
    };
}
