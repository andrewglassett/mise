# Mise

A cooking app: find a recipe, then walk through it one step at a time. Built for an iPad in landscape, and works on a phone in portrait. Plain HTML, CSS and JavaScript with no build step, hosted on GitHub Pages.

## How recipes get into the app

The recipes are not in this repo. The app downloads `recipes.json` from Google Drive with the Drive API each time it opens, so adding or editing recipes never needs a deploy.

1. On open, it shows the copy it saved last time, so it starts instantly and works offline.
2. It asks Drive for the file's `modifiedTime` and downloads the file only when that has changed.
3. It checks again when you come back to the app, and every 5 minutes while it is open. A "Recipes updated" message appears when new data arrives.

Keep overwriting the same Drive file (same file ID) and the app keeps working. If `schemaVersion` goes above what the app supports, it shows a notice.

### One-time setup

1. **Share the file.** In Google Drive, set `recipes.json` to *Anyone with the link: Viewer*. The API key can only read files shared this way.
2. **Create an API key.** In [Google Cloud Console](https://console.cloud.google.com/): create a project, enable the **Google Drive API**, then *APIs & Services → Credentials → Create credentials → API key*. Restrict it:
   - *Application restrictions*: Websites, add `https://andrewglassett.github.io/*` and `http://localhost:8765/*`.
   - *API restrictions*: Google Drive API only.
3. Put the key in `driveApiKey` in [`config.js`](config.js) and push.

The key is visible in the page source, which is normal for a browser key; the referrer and API restrictions are what protect it.

## Running locally

```bash
ln -s "$HOME/Library/CloudStorage/GoogleDrive-andrewglassett@gmail.com/My Drive/Projects : Files/mise/recipes.json" data/recipes.json
python3 -m http.server 8765
```

With no API key in `config.js`, the app reads `data/recipes.json` (gitignored) instead of Drive.

## On the iPad

Open the site in Safari, then *Share → Add to Home Screen*. It opens full screen like an app, and the screen stays awake while you cook.

## Cook mode

- **Library**: search by recipe name or ingredient; filter by category, tag and total time.
- **Ingredients**: grouped as in the recipe, tap to check off, scale ½× to 3×, preheat callout, notes.
- **Steps**: one per screen with phase name and progress. Swipe or use the Back/Next buttons (arrow keys on a keyboard). Each step lists the ingredients it uses.
- **Timers**: tap a time in the step text, or the timer button, to start one. Timers keep running across steps and reloads, chime when the minimum time is up, and show how much of the range is left.
