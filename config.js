// Where Mise gets its recipes. Setting up your own copy? See README.md.
//
// Option 1, Google Drive: fill in driveFileId and driveApiKey. The app reads
// the file straight from Drive, so editing it updates the app without a
// deploy. The file must be shared as "Anyone with the link: Viewer", and the
// key should be restricted to the Drive API and to your site's address.
//
// Option 2, any URL: leave driveApiKey empty and point recipesUrl at a
// recipes.json file, such as one committed to this repo.
export const CONFIG = {
  driveFileId: '1ZT8OOjRZb9BdulizP7XLtBaN8HTRA6tR',
  driveApiKey: 'AIzaSyDF7CU86xTLXhghekeGj4fybcznNUMRnW0',

  // Used when driveApiKey is empty. A path in this repo or a full URL.
  recipesUrl: 'data/recipes.json',

  // Optional: a Google OAuth client ID turns on "Sign in with Google", which
  // keeps favorites and recent recipes in step across devices. Leave it empty
  // to hide sign-in. See README.md.
  googleClientId: '562155838307-71nbi31vf5m5vqcvo9qibmb7kdrt05km.apps.googleusercontent.com',

  // Optional: the address of the Worker in worker/ turns on "Add recipe"
  // (from a link or pasted text) for the owner. Leave it empty to hide it.
  // See README.md.
  addRecipeUrl: 'https://mise-add.mise-add.workers.dev',

  // How often to check for newer recipes while the app is open.
  pollMinutes: 5,

  // Highest recipes.json schemaVersion this build understands.
  supportedSchemaVersion: 1,
};
