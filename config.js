// Where Mise gets its recipes.
//
// The app reads recipes.json straight from Google Drive, so editing that file
// (overwriting it in place keeps the same ID) updates the app without a deploy.
// The file must be shared as "Anyone with the link: Viewer", and the API key
// should be a browser key restricted to the Drive API and to this site's URL.
export const CONFIG = {
  driveFileId: '1ZT8OOjRZb9BdulizP7XLtBaN8HTRA6tR',
  driveApiKey: 'AIzaSyDF7CU86xTLXhghekeGj4fybcznNUMRnW0',

  // Used when no API key is set (local development). data/ is gitignored.
  localDataUrl: 'data/recipes.json',

  // How often to check Drive for a newer file while the app is open.
  pollMinutes: 5,

  // Highest recipes.json schemaVersion this build understands.
  supportedSchemaVersion: 1,
};
