```text
                ▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄
    ▀  ▀  ▀    █████████ █████████     a recipe app for the kitchen
   ▀  ▀  ▀    █████████ █████████     ███╗   ███╗██╗███████╗███████╗
             ▀▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀     ████╗ ████║██║██╔════╝██╔════╝
            ▄▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄▄       ██╔████╔██║██║███████╗█████╗
  ▀  ▀  ▀  █████████ █████████       ██║╚██╔╝██║██║╚════██║██╔══╝
 ▀  ▀  ▀  █████████ █████████        ██║ ╚═╝ ██║██║███████║███████╗
          ▀▀▀▀▀▀▀▀▀ ▀▀▀▀▀▀▀▀▀        ╚═╝     ╚═╝╚═╝╚══════╝╚══════╝ 95
```

# Mise

A recipe app built for cooking. Search or filter your recipes, tap one, and it walks you through it: ingredients first, with check boxes and scaling, then one step per screen with tappable timers and a list of what you need for that step. It's made for an iPad in landscape on the counter, and it works on a phone too.

See it running with Andrew's recipes: **https://andrewglassett.github.io/mise/**

The app is plain HTML, CSS and JavaScript with no build step. Your recipes live in a single JSON file, kept separate from the app, so you can add recipes without touching the code.

## Set up your own copy

You need a free GitHub account. This takes about 10 minutes.

1. **Copy the app.** On this repo's GitHub page, click **Fork**. You now have your own copy at `github.com/<you>/mise`.
2. **Add your recipes file.** In your fork, click **Add file → Create new file**, name it `recipes.json`, and paste in the contents of [`docs/example-recipes.json`](docs/example-recipes.json) to start with. Commit it.
3. **Point the app at it.** Open [`config.js`](config.js), click the pencil to edit, and change these lines:
   ```js
   driveFileId: '',
   driveApiKey: '',
   recipesUrl: 'recipes.json',
   ```
   The values that are there now belong to Andrew's Google Drive. With them cleared, the app reads `recipes.json` from your repo instead.
4. **Publish it.** Go to **Settings → Pages**, set *Source* to **Deploy from a branch**, pick `main` and `/ (root)`, and save. After a minute or two your app is at `https://<you>.github.io/mise/`.
5. **Put it on your iPad.** Open that address in Safari, tap **Share → Add to Home Screen**. It opens full screen like an app and keeps the screen awake while you cook.

From then on, to add or change recipes, edit `recipes.json` in your repo. The site updates a minute or so after each commit. The app checks for changes when you open it, every 5 minutes, and when you switch back to it.

## Getting your recipes into the file

The file format is described in [`docs/recipe-format.md`](docs/recipe-format.md). Only a few fields are required (`id`, `title`, `category`, the ingredient lines and the step text). The others make cook mode nicer: timers, temperatures, scaling, and which ingredients each step uses.

Writing that JSON by hand is tedious. Some ways to get there:

### Ask an AI assistant to convert recipes (recommended)

Claude, ChatGPT and similar assistants are good at this, and they can read a photo of a recipe card, a cookbook page, a screenshot, a link or pasted text. Attach [`docs/recipe-format.md`](docs/recipe-format.md) and [`docs/example-recipes.json`](docs/example-recipes.json), then use a prompt like:

> Convert this recipe into one recipe object for my Mise recipes.json, following the attached format doc and example. Keep each ingredient's original wording in `raw` and split out quantity, unit, item and preparation. Number the steps straight through and add `timers`, `temperatures` and `ingredientRefs` where the text mentions them. Use the category "Desserts". Return only the JSON object.

Paste the result into the `recipes` array in your `recipes.json`, with a comma between recipes. To convert a batch in one go, ask for the whole file instead.

If you use an assistant that keeps project files (a Claude Project, a custom GPT), store the format doc and your current `recipes.json` there. Then you can say "add this recipe" each time without re-explaining.

### Start from what you already have

If your recipes are in a document, notes app or spreadsheet, export or paste them in batches into an AI assistant with the prompt above. Check a few results against the originals before converting everything.

### Edit by hand

Copy a recipe in `docs/example-recipes.json` and change it. GitHub's web editor shows JSON errors as you type. A recipe needs only `id`, `title`, `category`, `ingredientGroups` and `stepGroups` (with `raw` for each ingredient and `text` for each step). Add the other fields later if you like.

## Where to keep the recipes file

| Option | Good for | How |
|---|---|---|
| **In your repo** (above) | Most people | Edit `recipes.json` on GitHub. Each change is a commit and goes live in about a minute. |
| **Google Drive** | Updating from anywhere without GitHub, or letting an AI assistant with Drive access edit the file directly | See [Reading from Google Drive](#reading-from-google-drive). The app reads the file from Drive and notices edits within minutes. |
| **Any public URL** | A GitHub Gist or another host | Set `recipesUrl` to the full address. The host must allow cross-site requests, which GitHub Gist "raw" links do. |

Whichever you pick, the recipes are public: GitHub Pages sites are public, and anyone with the app's address can see them.

### Reading from Google Drive

1. Upload `recipes.json` to Google Drive. Share it as **Anyone with the link: Viewer**. The file ID is the long code in its share link: `drive.google.com/file/d/<file ID>/view`.
2. In [Google Cloud Console](https://console.cloud.google.com/), create a project. Don't add billing to it.
3. Go to **APIs & Services → Library**, find **Google Drive API**, and click **Enable**.
4. Go to **APIs & Services → Credentials → Create credentials → API key**, then edit the key:
   - *Application restrictions*: **Websites**, and add `https://<you>.github.io/*`.
   - *API restrictions*: **Restrict key**, and pick **Google Drive API**.
5. Put the file ID and key in `driveFileId` and `driveApiKey` in [`config.js`](config.js).

Always update the file in place: upload a new version or edit it, rather than deleting it and uploading a new one. That keeps the same file ID, so the app keeps working.

The key is visible to anyone who opens your site. That's expected for a browser key, and the two restrictions are what protect it: it only works from your site, and only for reading publicly shared Drive files. GitHub may email you a "secret detected" alert for it; you can close the alert as *Won't fix*.

## Syncing favorites between devices (optional)

With a Google OAuth client ID in `config.js`, an Account section with a sign-in button appears under the filters. Signed in, your favorites and recently opened recipes follow you between devices. They're saved in your Google Drive's hidden app-data folder, which only Mise can see. Signed out, everything stays on the device as before.

1. In [Google Cloud Console](https://console.cloud.google.com/) (the same project as the API key), go to **Google Auth Platform → Branding** (or **OAuth consent screen**), choose **External**, and fill in the app name and your email. Under **Audience**, add your Google account as a test user.
2. Go to **Clients → Create client**, choose **Web application**, and add:
   - *Authorized JavaScript origins*: `https://<you>.github.io`
   - *Authorized redirect URIs*: `https://<you>.github.io/mise/`, exactly, with the trailing slash
3. Put the client ID in `googleClientId` in [`config.js`](config.js).

To use it on your computer as well, add `http://localhost:8765` as an origin and `http://localhost:8765/` as a redirect URI.

While the app is in "Testing", only the test users you list can sign in.

## Adding recipes from the app (optional)

With this set up, a **+** button appears next to the Mise logotype once you're signed in. Paste a link to a recipe, or paste the recipe itself, and Mise converts it with Claude, shows you a preview, and saves it to `recipes.json` in your Drive when you tap Save. Only your Google account can add recipes.

It needs a small server, because the Claude key and the key that can write to your Drive can't sit in a web page. The server is a Cloudflare Worker in [`worker/`](worker/). Cloudflare's free plan is plenty. Each recipe costs a few cents of Claude usage.

It needs sign-in (above) and the Drive setup (recipes.json in Google Drive).

1. **A Claude API key.** At [console.anthropic.com](https://console.anthropic.com), add some credit and create an API key. Under **Limits**, set a monthly spend limit.
2. **A service account that can edit recipes.json.** In [Google Cloud Console](https://console.cloud.google.com/) (the same project), go to **IAM & Admin → Service Accounts → Create service account**. Give it a name and skip the optional steps. Open it, go to **Keys → Add key → Create new key → JSON**, and keep the downloaded file somewhere safe. Then share `recipes.json` in Google Drive with the service account's email address (it ends in `iam.gserviceaccount.com`) as **Editor**.
3. **Deploy the Worker.** You need [Node.js](https://nodejs.org) and a free [Cloudflare](https://dash.cloudflare.com/sign-up) account. In `worker/wrangler.toml`, change `GOOGLE_CLIENT_ID`, `DRIVE_FILE_ID` and `ALLOWED_ORIGINS` to yours. Then, in the `worker` folder:
   ```bash
   npm install
   npx wrangler login
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put OWNER_EMAIL
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT < path/to/service-account-key.json
   npx wrangler deploy
   ```
   Each `secret put` asks for the value: paste your Claude key, then type your Google email. The last line prints the Worker's address, like `https://mise-add.<you>.workers.dev`.
4. Put that address in `addRecipeUrl` in [`config.js`](config.js).

Recipes you add go after the others in their category, and get the drawn placeholder until you give them a photo.

### Sharing recipes to Mise from other apps

With Add recipe set up, you can send a recipe to Mise from another app's **Share** button, such as a web page in Safari. Mise opens its Add screen with the link and starts reading it. Instagram doesn't let other apps read its posts, so sharing an Instagram post or story opens **From a photo** instead. For Instagram it's quicker to skip sharing: screenshot the recipe, then open Mise, tap **+** and choose **From a photo**.

**iPhone, iPad and Mac:** Apple doesn't let home-screen web apps receive shares, so a Shortcut does it. In the Shortcuts app:

1. Tap **+** to make a new shortcut, and name it **Add to Mise**.
2. Open its details (the **ⓘ** button, or the settings at the top) and turn on **Show in Share Sheet**. Set what it receives to **URLs** and **Text**.
3. Add the action **URL Encode**, encoding the **Shortcut Input**.
4. Add the action **Text** and type `https://<you>.github.io/mise/#/add?url=`, then insert the **URL Encoded Text** variable right after the `=`.
5. Add the action **Open URLs** with that Text.

Now **Add to Mise** appears when you tap Share. It opens Mise in Safari rather than the home-screen app, so sign in to Mise in Safari once.

**Android:** add Mise to your home screen from Chrome and it appears in the share sheet by itself.

## Running it on your computer

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. With `recipesUrl` set and no Drive key, it reads that file. To read from Drive locally, add `http://localhost:8765/*` to the key's website restrictions.

## Features

- **Library:** search by recipe name or ingredient; filter by category, tag and total time.
- **Ingredients screen:** grouped like the recipe, tap to check off, scale ½× to 3×, preheat callout, notes.
- **Short recipes:** recipes with only a few short steps show the method as a list on the ingredients screen, with no walkthrough. Set `cookMode` on a recipe to override this.
- **Cook mode:** one step per screen with the phase name and progress bar. Swipe, tap Back/Next, or use the arrow keys. Each step lists the ingredients it uses.
- **Timers:** tap a time in the step text to start one. Timers keep running across steps and reloads, chime when done, and show how much of a range ("12–18 minutes") is left. Tap −1 or +1 to change a running timer by a minute; +1 on a finished timer starts it again with a minute. The timer button at the top of the library starts a 5-minute timer that isn't tied to a recipe.
- **Pictures:** add a photo to any recipe with `image` (a Google Drive file or a URL). Recipes without one get a drawn placeholder in their category's colour.
- **Add recipes:** paste a link or a recipe, or choose photos of one, check the preview, and save it to your recipe file. Share links to Mise from Safari and other apps (optional; needs the Worker).
- **Sync:** sign in with Google to keep favorites and recent recipes the same on every device (optional).
- **Works offline:** after the first visit, the app opens with your last-loaded recipes even without a connection.
- **Themes:** the Theme switch under the filters picks light, dark or "Mise 95", a 1990s Windows look. Tap the Mise logotype to clear every filter and go back to the home shelves.
