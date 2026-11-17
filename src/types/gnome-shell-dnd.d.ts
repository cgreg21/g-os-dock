declare module 'resource:///org/gnome/shell/ui/dnd.js' {
    export enum DragMotionResult {
        NO_DROP = 0,
        COPY_DROP = 1,
        MOVE_DROP = 2,
    }

    export interface Draggable {
        connect(signal: string, callback: (...args: unknown[]) => void): number;
    }

    export function makeDraggable(
        actor: import('gi://Clutter?version=51').Actor,
        params?: { dragActorOpacity?: number },
    ): Draggable;
}
