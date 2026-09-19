<div align="center">

# PinGlide

### A fast, keyboard-first gallery for Pinterest

Browse Pinterest images with the arrow keys—without opening a new page for every Pin.

`←` Previous &nbsp;&nbsp; `→` Next &nbsp;&nbsp; `Enter` Open Pin &nbsp;&nbsp; `M` Save to mymind &nbsp;&nbsp; `Esc` Close

</div>

---

PinGlide is a lightweight Chrome extension that turns Pinterest boards, search results, Home feeds, and related Pins into a smooth image gallery. Click a Pin once, then glide through the collection with your keyboard.

It is designed to feel like a natural part of Pinterest: no bulky controls, no page-by-page waiting, no tracking. Images leave your browser only when you explicitly save them to mymind.

## Why PinGlide?

Pinterest is excellent for discovering visual ideas, but comparing several images can mean repeatedly opening and closing individual Pin pages. PinGlide keeps the visual context intact and makes browsing feel immediate.

- **Arrow-key navigation** through Pinterest images
- **Fast gallery overlay** with decoded-image caching, adjacent preloading, and gentle transitions
- **Always on** across Pinterest tabs and Chrome restarts
- **Save to mymind with M** using an optional connection to your existing account
- **Automatic context handling** for boards, searches, Home, and related Pins
- **Native-feeling interaction** with a quiet, minimal interface
- **Lazy-load support** that continues discovering Pins as you browse
- **Private by design**—no analytics, accounts, remote code, or Pinterest API access
- **Build-free** Manifest V3 extension with no dependencies

## Install in Chrome

PinGlide is currently installed as an unpacked extension:

1. Download this repository with **Code → Download ZIP**, then unzip it. Alternatively, clone it with Git.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** in the upper-right corner.
4. Click **Load unpacked**.
5. Select the folder containing `manifest.json`.
6. Open Pinterest. PinGlide is already on, including after Chrome restarts.

> After updating PinGlide, click **Reload** on its card in `chrome://extensions`, then refresh any open Pinterest tabs.

## How to use it

1. Visit Pinterest Home, a search result, a board, or a Pin's recommendations.
2. PinGlide starts automatically. Its toolbar switch can pause it across all Pinterest tabs.
3. Click any regular Pin image.
4. Browse with your keyboard.

| Action | Keyboard / mouse |
| --- | --- |
| Previous image | `←` |
| Next image | `→` |
| Open the real Pin page | `Enter` or click the image |
| Save the enlarged image to mymind | `M` or **Save to mymind** |
| Close the gallery | `Esc`, the close button, or the backdrop |

Normal browser and Pinterest interactions remain untouched. Modified clicks, middle-clicks, context menus, Save, Favorite, Edit, and other Pin controls continue to work normally.

## One way to browse

Navigation is automatic: PinGlide follows the current collection and resets naturally when you open a new Pin. There are no navigation modes to configure.

The popup has an On/Off switch, a Settings button, and four keyboard hints. Its rounded glass surface follows your system’s light or dark appearance. Switch and view animations respect reduced motion. Chrome draws an opaque native window behind toolbar popups, so the glass treatment is inside the popup; it does not blur the webpage underneath.

Your enabled setting is saved across tabs and browser restarts. A deliberate pause stays paused until you turn it back on. Image queues remain in page memory and rebuild for the current browsing context.

## Save to mymind

1. Reload the extension and refresh Pinterest after updating.
2. Open the PinGlide toolbar popup, choose **Settings** (the gear), then **Connect**. Chrome asks for optional access to `access.mymind.com` and its sign-in cookie.
3. If prompted, sign in to your existing mymind account. Return to Settings to check the connection.
4. Open a gallery image and press **M**. PinGlide saves the displayed image with the individual Pin URL as its source. A confirmation appears only after mymind responds successfully.

The connection uses the image-save request implemented by mymind's Chrome extension v3.3 (`POST /objects`, media type). This is an unofficial integration, not a published stable API, and may need updating if mymind changes it. Chrome cannot invoke another extension's context-menu action, and mymind v3.3 has no external-message handler. Your normal mymind right-click menu remains available.

Saving is optional. Use **Disconnect** in Settings to revoke access. Held or repeated M presses do not duplicate in-flight requests. Unconfirmed network requests are never retried automatically; check mymind before retrying. Saving from incognito tabs is not supported.

## Privacy

- No analytics, telemetry, ads, or remote code
- No Pinterest API interception
- Only `storage` permission is required for browsing
- mymind access is optional and restricted to `https://access.mymind.com/*`
- Saving sends the image URL, image description, and source Pin URL directly to mymind
- Your mymind session is read only inside the extension's service worker; it is never logged, stored by PinGlide, or sent to Pinterest/content scripts
- Disconnecting revokes optional permissions; it does not delete images you already saved

Preferences use Chrome's synced extension storage. Gallery queues and the bounded image cache live only in the page's memory.

## Development

There is no build step and no package installation is required. The source files loaded by Chrome are the files in this repository.

```sh
npm test
npm run check
```

The tests use Node's built-in test runner and cover Pin URL parsing, context detection, queue boundaries, deduplication, image selection, settings migration, save request validation, permission checks, duplicate saves, error handling, and navigation behavior.

### Project structure

```text
manifest.json        Chrome extension manifest
icons/               Glass arrow icon, SVG source and Chrome PNG sizes
popup/               Glass popup and mymind Settings
src/core.js          Shared parsing and queue logic
src/content.js       Pinterest integration and gallery UI
src/background.js    Persistent defaults and optional mymind saving
tests/               Dependency-free unit tests
```

## Current limitations

- PinGlide focuses on still images; video-only Pins are skipped.
- Navigation stops at the beginning and end of a collection instead of wrapping.
- Pinterest can change its page structure. PinGlide uses semantic Pin links and accessibility labels to reduce breakage, and leaves the site untouched if it cannot confidently find a usable image grid.
- Chrome Web Store publication is not included yet; installation is currently manual.

## Troubleshooting

**The popup says no usable Pin grid was found**  
Wait for Pinterest to finish loading, scroll until several Pins are visible, then reopen the popup. Also confirm that the current page is a Pinterest Home feed, search, board, or Pin page.

**Clicking a Pin still opens Pinterest normally**  
Check the **On** switch in the popup. This preference applies to all Pinterest tabs and survives relaunches. After an extension update, reload the extension and refresh existing Pinterest tabs.

**The extension stopped responding after an update**  
Reload PinGlide from `chrome://extensions`, then refresh the Pinterest tab.

## Contributing

Bug reports, ideas, and pull requests are welcome. When reporting a problem, include the type of Pinterest page you were viewing, the selected navigation mode, and the steps that reproduce the issue. Please avoid including private board content or personal account information.

## Disclaimer

PinGlide is an independent, unofficial browser extension. It is not affiliated with, endorsed by, or sponsored by Pinterest. Pinterest is a trademark of its respective owner.

---

<div align="center">

Made with care by [Serif](https://serif.at)

</div>
