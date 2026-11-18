export interface WindowIndicatorState {
    count: number;
    running: boolean;
    active: boolean;
    minimized: boolean;
}

/** Resolve the display-independent application state used by dock indicators. */
export function resolveWindowIndicatorState<T extends { minimized: boolean }>(
    windows: readonly T[],
    focusedWindow: T | null,
    appRunning: boolean,
): WindowIndicatorState {
    return {
        count: windows.length,
        running: windows.length > 0 || appRunning,
        active: focusedWindow !== null && windows.includes(focusedWindow),
        minimized: windows.length > 0 && windows.every(window => window.minimized),
    };
}
