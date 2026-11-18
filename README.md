# Quicklist

A collaborative shopping-list SPA built with React, TypeScript, Vite, Firebase Authentication, and Cloud Firestore. The static site is designed for GitHub Pages; Firestore snapshot listeners provide live updates between approved users.

## Run locally (no deployment or production Firebase project required)

Requirements: Node.js 20+ and Java 21+ (the Firestore emulator runs on Java).

```sh
npm ci
cp env.example .env.local
# Edit VITE_ALLOWED_EMAILS to include the email you will use in the Auth emulator.
npm run dev:emulator
```

Open the Vite URL printed in the terminal (normally `http://127.0.0.1:5173`). The local Auth and Firestore emulators run on ports 9099 and 8080; the Emulator UI is at `http://127.0.0.1:4000`.

The emulator uses the separate `firestore.emulator.rules` file, which intentionally allows any signed-in local user to work with data. It is for local development only. The normal deploy command reads `firestore.rules`, not the emulator rules. Never deploy with `firebase.emulator.json`.

Google popup sign-in runs against the Auth emulator's mock Google provider; it does not contact Google or authenticate to the production Firebase project. The Auth Emulator UI can inspect local test users, while sign-in should be initiated from the app's Google button. Do not turn off the production allowlist to work around local setup.

### Run tests

```sh
npm test
npm run typecheck
npm run test:rules
```

`test:rules` starts the local emulator and exercises the production rules with a test-only approved email. Rules start with an empty allowlist and deny all users until the real approved emails are added.

## Firebase project setup

1. Create a Firebase project and a Cloud Firestore database in the location closest to its users.
2. Enable Google as a Firebase Authentication provider.
3. Add the production GitHub Pages hostname (for example, `OWNER.github.io`) to Firebase Authentication's authorized domains. Add `localhost` for local browser testing against a real project, if needed.
4. Add each exact, verified Google account email to the allowlist in `firestore.rules`. Keep email strings lowercase and compare the rule list with the frontend configuration:

   ```rules
   && request.auth.token.email in [
     'first-person@example.com',
     'second-person@gmail.com'
   ];
   ```

5. Set `VITE_ALLOWED_EMAILS` to the same comma-separated emails. The GitHub Actions workflow checks that the frontend and rules allowlists match before it builds/deploys.
6. Run the emulator rules tests, inspect the production rules, then deploy only those rules from this project directory:

   ```sh
   npx firebase-tools deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
   ```

The repository begins with a fail-closed empty allowlist because no approved account addresses have been supplied. The UI also needs those addresses configured. Do not deploy until both match. An email check in JavaScript is only a user-experience guard: **Firestore Security Rules are the actual access-control boundary.**

## GitHub Pages setup

1. Add these repository **Actions variables** under **Settings → Secrets and variables → Actions → Variables**:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID` (optional if unused by the Firebase project)
   - `VITE_ALLOWED_EMAILS`
2. Confirm the deployment branch in `.github/workflows/deploy.yml` (`main` by default).
3. In **Settings → Pages**, set the source to **GitHub Actions**.
4. Push to `main` or manually run the workflow. It sets the Vite base path for project Pages sites and publishes `dist/`.

Firebase web configuration is public and will be present in the generated JavaScript; it is not a secret. Do not put service account credentials, Admin SDK keys, or privileged deployment tokens in `VITE_*` variables or in the SPA.

## Routes and sharing

Hash routing avoids server-side SPA rewrites on GitHub Pages:

```text
https://OWNER.github.io/REPOSITORY/#/          Create a list (project site)
https://OWNER.github.io/REPOSITORY/#/LIST_ID   Open/share a list (project site)

# If the repository is named OWNER.github.io, there is no /REPOSITORY/ path:
https://OWNER.github.io/#/                     Create a list (root site)
https://OWNER.github.io/#/LIST_ID              Open/share a list (root site)
```

The URL fragment stays in the browser, so refreshing a shared list loads the published `index.html` rather than requesting an unavailable server route. Anyone with a list URL who is on the Firebase allowlist can read and edit it; a URL alone does not grant access.

## Data and retention

Lists live at `lists/{listId}` and each list's items live in `lists/{listId}/items/{itemId}`. Each item is an independent document so simultaneous edits to different items do not overwrite one another. Item state changes use a Firestore transaction; add/remove operations update the item and list activity timestamp atomically.

There is no automatic deletion in this first implementation. The previous 24-hour cleanup behavior is deferred; Firestore TTL is asynchronous, does not recursively delete item subcollections, and may add cost. Decide on a trusted cleanup mechanism before promising expiry.

## Important security and deployment notes

- Firebase Auth can allow an unapproved account to complete Google sign-in; Firestore Rules still deny it all list access. The SPA displays an access-denied screen. Blocking sign-in itself needs a separate Identity Platform/blocking-function decision.
- Production rules allow exact list-document reads and item reads/writes, but deny collection-wide list discovery and parent-list deletion.
- The local emulator rules are deliberately more permissive and must never be deployed.
- GitHub Actions' Firebase variables are available to the public build. They contain public web config and the UI allowlist only; rules enforce access.
- Quotas and pricing can change. Snapshot listener reads, reconnects, and rule lookups consume Firestore usage; review Firebase's current limits before production use.
