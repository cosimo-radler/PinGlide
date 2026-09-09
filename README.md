<div align="center">

# PinGlide

### A fast, keyboard-first gallery for Pinterest

Browse Pinterest images with the arrow keys—without opening a new page for every Pin.

`←` Previous &nbsp;&nbsp; `→` Next &nbsp;&nbsp; `Enter` Open Pin &nbsp;&nbsp; `Esc` Close

</div>

---

PinGlide is a lightweight Chrome extension that turns Pinterest boards, search results, Home feeds, and related Pins into a smooth image gallery. Click a Pin once, then glide through the collection with your keyboard.

It is designed to feel like a natural part of Pinterest: no bulky controls, no page-by-page waiting, no tracking, and no data leaving your browser.

## Why PinGlide?

Pinterest is excellent for discovering visual ideas, but comparing several images can mean repeatedly opening and closing individual Pin pages. PinGlide keeps the visual context intact and makes browsing feel immediate.

- **Arrow-key navigation** through Pinterest images
- **Fast gallery overlay** with adjacent-image preloading
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
6. Open Pinterest, click the PinGlide toolbar icon, and enable it for that tab.

> After updating PinGlide, click **Reload** on its card in `chrome://extensions`, then refresh any open Pinterest tabs.

## How to use it

1. Visit Pinterest Home, a search result, a board, or a Pin's recommendations.
2. Open PinGlide from the Chrome toolbar and switch on **Enable on this tab**.
3. Click any regular Pin image.
4. Browse with your keyboard.

| Action | Keyboard / mouse |
| --- | --- |
| Previous image | `←` |
| Next image | `→` |
| Open the real Pin page | `Enter` or click the image |
| Close the gallery | `Esc`, the close button, or the backdrop |

Normal browser and Pinterest interactions remain untouched. Modified clicks, middle-clicks, context menus, Save, Favorite, Edit, and other Pin controls continue to work normally.

## Navigation modes

| Mode | Best for | Behavior |
| --- | --- | --- |
| **Automatic** | Everyday browsing | Follows the current collection and resets naturally when you commit to a new Pin. Recommended. |
| **Current grid** | Comparing one board or search | Stays within the board, search, Home feed, or related grid currently on screen. |
| **Related only** | Exploring one idea | Opens the selected Pin and builds a fresh gallery from its recommendations. |

PinGlide deliberately remembers only what helps the current tab. Your enabled setting survives a page reload, while image queues are rebuilt when the Pinterest route or browsing context changes. This prevents recommendations from an older Pin from leaking into a new collection.

## Privacy

PinGlide runs entirely inside your browser.

- No analytics or telemetry
- No account or sign-in
- No external servers
- No ads
- No content uploads
- No Pinterest API interception

The extension requests only Chrome's `storage` permission and access to Pinterest pages. Preferences are stored with Chrome extension storage; temporary gallery queues live only in session storage.

## Development

There is no build step and no package installation is required. The source files loaded by Chrome are the files in this repository.

```sh
npm test
npm run check
```

The tests use Node's built-in test runner and cover Pin URL parsing, context detection, queue boundaries, deduplication, image selection, session restoration, and navigation behavior.

### Project structure

```text
manifest.json        Chrome extension manifest
popup/               Toolbar popup UI
src/core.js          Shared parsing and queue logic
src/content.js       Pinterest integration and gallery UI
src/background.js    Per-tab session lifecycle
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
Make sure PinGlide is enabled for that tab. Activation is intentionally per-tab, so opening Pinterest in another tab requires enabling it there too.

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
# PinGlide
