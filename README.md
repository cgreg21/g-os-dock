# G-OS Dock — GNOME Shell 51

G-OS Dock is a GNOME Shell extension written in TypeScript and compiled to JavaScript. All editable source files live directly in this repository; the generated installable ZIP is a build artifact and is not committed.

## Features

- One dock view per monitor, using the same GNOME favorites and ordering.
- Favorites and running applications in the dock.
- Bottom, top, left, and right positioning.
- Per-monitor edge sensor, auto-hide, and smart-hide.
- Acrylic-like translucent styling (CSS transparency; not compositor backdrop blur).
- Running indicators, focused-app highlight, and optional window-count badges.
- Application context menu for window selection, launch, minimize/close, pin/unpin, and favorite ordering.
- Configurable icon size, spacing, theme, and hover magnification.
- Preferences through GNOME Extensions.

## Requirements

- GNOME Shell 51 (Wayland or X11; test on a real GNOME 51 session before release).
- Node.js 20+ and npm for development.
- `glib-compile-schemas` and `zip` for packaging.

## Build

```sh
npm install
npm run check
npm run pack
```

The build creates `g-os-dock@cgreg21.github.io.zip`, containing the compiled JavaScript, metadata, stylesheet, and compiled GSettings schema.

## Install locally

```sh
gnome-extensions install --force g-os-dock@cgreg21.github.io.zip
gnome-extensions enable g-os-dock@cgreg21.github.io
```

Or use `scripts/install-local.sh`. To uninstall, use `scripts/uninstall-local.sh`.

## Publish

Build and test the extension in a GNOME Shell 51 session, then upload the ZIP at https://extensions.gnome.org/upload/. Publication remains subject to GNOME Extensions review.

## Limitations

The acrylic effect currently uses translucent CSS only. GNOME Shell's public extension APIs do not expose a general backdrop-blur API for arbitrary extension actors. Window tracking, menu behavior, and monitor handling still require runtime validation on GNOME Shell 51.
