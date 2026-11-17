declare const global: any;

declare module 'gi://St' { const St: any; export default St; }
declare module 'gi://Clutter' { const Clutter: any; export default Clutter; }
declare module 'gi://GLib' { const GLib: any; export default GLib; }
declare module 'gi://Shell' { const Shell: any; export default Shell; }
declare module 'gi://Adw' { const Adw: any; export default Adw; }
declare module 'gi://Gio' { const Gio: any; export default Gio; }
declare module 'resource:///org/gnome/shell/ui/main.js' { const Main: any; export = Main; }
declare module 'resource:///org/gnome/shell/ui/appFavorites.js' { const AppFavorites: any; export = AppFavorites; }
declare module 'resource:///org/gnome/shell/extensions/extension.js' {
    export class Extension {
        getSettings(): any;
        loadStylesheet(): void;
    }
}
declare module 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js' {
    export class ExtensionPreferences { getSettings(): any; }
}

declare module 'resource:///org/gnome/shell/ui/popupMenu.js' { const PopupMenu: any; export = PopupMenu; }

declare module 'gi://Gtk' { const Gtk: any; export default Gtk; }
declare module 'gi://Meta' { const Meta: any; export default Meta; }
