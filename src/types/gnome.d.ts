import '@girs/gjs';
import '@girs/st-51';
import '@girs/clutter-51';
import '@girs/shell-51';
import '@girs/meta-51';
import '@girs/gio-2.0';
import '@girs/glib-2.0';
import '@girs/gtk-4.0';
import '@girs/adw-1';

// GNOME Shell runtime global (not part of the standalone GI namespaces).
declare const global: any;

// GNOME Shell JavaScript modules do not all expose GIR metadata.
declare module 'resource:///org/gnome/shell/ui/main.js' {
    const Main: any;
    export = Main;
}
declare module 'resource:///org/gnome/shell/ui/appFavorites.js' {
    const AppFavorites: any;
    export = AppFavorites;
}
declare module 'resource:///org/gnome/shell/extensions/extension.js' {
    export class Extension {
        getSettings(): any;
    }
}
declare module 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js' {
    export class ExtensionPreferences {
        getSettings(): any;
    }
}
declare module 'resource:///org/gnome/shell/ui/popupMenu.js' {
    const PopupMenu: any;
    export = PopupMenu;
}
