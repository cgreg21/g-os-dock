/** Minimal actor contract keeps style management independent of GNOME APIs. */
export interface StyledActor {
    set_style(style: string): void;
}

/** Avoids redundant GTK/Clutter style recalculation for unchanged styles. */
export class DockStyleManager {
    private styles = new WeakMap<StyledActor, string>();

    apply(actor: StyledActor, style: string): boolean {
        if (this.styles.get(actor) === style)
            return false;
        actor.set_style(style);
        this.styles.set(actor, style);
        return true;
    }

    forget(actor: StyledActor): void {
        this.styles.delete(actor);
    }
}

/** Shared style manager for dock actors. */
export const dockStyles = new DockStyleManager();
