# Quicklist setup: Firebase free tier + GitHub Pages

Follow these steps in order. You need **one Google account** for Firebase, **one GitHub account**, and the email addresses of the people who may use Quicklist. Firebase does not require a separate kind of account: you sign in to Firebase with your Google account.

This guide assumes that **the contents of `source_new/` become the root of a new GitHub repository**. Do **not** upload the old `source/quicklist/` project or put `source_new/` inside another repository unless you also change the workflow paths. The existing `.github/workflows/deploy.yml` expects `package.json`, `firestore.rules`, and `src/` directly at the repository root.

This guide uses your GitHub owner **`quicklist-shopping`** and its repository **`quicklist-shopping.github.io`** as examples. Replace `YOUR_PROJECT_ID` and the example emails below with your actual values.

## 1. Use the root GitHub Pages repository

For a **main page**, the repository name must exactly match `<owner>.github.io`. Your repository name is already correct:

```text
GitHub owner:      quicklist-shopping
GitHub repository: quicklist-shopping.github.io
Website:           https://quicklist-shopping.github.io/
```

The existing `.github/workflows/deploy.yml` recognizes this special repository name and automatically sets Vite's base path to `/`. You do **not** need to edit `vite.config.ts` or set `VITE_BASE_PATH` yourself. A normal repository such as `quicklist` would instead have a `/quicklist/` path; the same workflow also handles that case.

> **Free GitHub Pages:** GitHub Free supports Pages in **public** repositories. The site and its JavaScript are publicly downloadable, but Firestore Security Rules will restrict list data. If publishing the list of approved email addresses in the repository is unacceptable, stop and choose a different access-control design before going further.

## 2. Create a Firebase project on the free Spark plan

1. Open the [Firebase console](https://console.firebase.google.com/) and sign in with your Google account.
2. Click **Create a project** / **Add project**.
3. Name it, for example `Quicklist`. Firebase also gives it a **Project ID**, such as `my-quicklist-12345`. Write down the **Project ID**; you will need it later. The ID is not the same as the display name.
4. If asked about Gemini or Google Analytics, you may decline/disable them. The app does not need either.
5. Finish creating the project.
6. In the Firebase console, check **Usage and billing** / **Plan** and verify that the project says **Spark (no cost)**. **Do not upgrade to Blaze or attach a billing account** if you want to stay on the no-billing plan.

The app uses normal Google sign-in and Cloud Firestore. It does **not** need Firebase Hosting, Cloud Functions, Cloud Scheduler, Storage, or TTL. GitHub Pages hosts the website instead of Firebase Hosting.

## 3. Register the web app and copy its config

1. In the Firebase project overview, click the **Web** icon (`</>`) to add an app. If you do not see it, use **Project settings → Your apps → Add app → Web**.
2. Give the app a nickname, for example `Quicklist web`.
3. **Do not** select **Also set up Firebase Hosting**. Click **Register app**.
4. Firebase displays a JavaScript `firebaseConfig` block. Keep that page open or find the block later in **Project settings → Your apps → SDK setup and configuration → Config**.

You need these fields from the block:

| Firebase `firebaseConfig` field | GitHub Actions variable to create later |
| --- | --- |
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` (if present) |

**Copy the values only**, without JavaScript quotes or commas. Keep `authDomain` as Firebase supplied it (normally `YOUR_PROJECT_ID.firebaseapp.com`); do **not** change it to `quicklist-shopping.github.io`. The code is already set up to read these values; do not paste the `firebaseConfig` snippet into a source file. You can ignore other fields like `measurementId` and `storageBucket`.

These web-config values are **not secret keys**. They will be visible in the published app. The actual data protection comes from Firestore Security Rules.

## 4. Turn on Google sign-in

1. In Firebase, open **Build → Authentication** (in some console layouts, **Security → Authentication**).
2. Click **Get started**, then open the **Sign-in method** tab.
3. Open the **Google** provider, switch it **on**, select the requested **project support email**, and click **Save**.
4. Leave other sign-in providers off; this app requires Google sign-in.
5. Open Authentication's **Settings → Authorized domains**. Add **`quicklist-shopping.github.io`**. Enter just the hostname: **no** `https://`, path, or `#/`.
6. If you later use a custom site domain, add that hostname as well. If you want to test with the *real* Firebase project on your own computer, also authorize your local hostname as needed (such as `localhost` or `127.0.0.1`). You do **not** need this for emulator-only local testing.

The sign-in button uses a Google **popup**. Allow popups for your site if your browser blocks it. An unauthorized user might still sign in to Firebase Authentication, but the Firestore rules must reject all of their list reads and writes.

## 5. Create a Firestore database (locked down initially)

1. In Firebase, open **Build → Firestore Database** (sometimes **Databases & Storage → Firestore**).
2. Click **Create database**.
3. Choose **Standard edition** / **Firestore Native mode**, the **default** database, and a location close to your users. The database location is difficult to change later.
4. Choose **Production mode** for the initial Security Rules, **not Test mode**. Production mode denies access until you deploy this repository's rules in step 8.
5. Finish creating the database. Do not manually add lists or items; Quicklist will create them.

Firebase documents a free quota for **one database per project** on Spark. Currently the Firestore free quota includes 1 GiB stored data, 50,000 document reads/day, 20,000 writes/day, and 20,000 deletes/day; confirm the current numbers in the [official quota page](https://firebase.google.com/docs/firestore/quotas). The app is small, but live listeners and reconnects use reads. If a quota is exhausted on Spark, the app can stop working until the quota resets; you do not automatically move to a paid plan.

## 6. Put your approved emails in the repository's Firestore Rules

Open **`source_new/firestore.rules`** on your computer. Near the top, find:

```text
&& request.auth.token.email in [];
```

Replace that line with your exact, verified Google-account email addresses, for example:

```text
&& request.auth.token.email in [
  'me@gmail.com',
  'friend@example.com'
];
```

Use the *actual addresses* of everyone allowed to read/edit lists. Google accounts can have non-Gmail email addresses. Use lowercase addresses where possible and ensure the Firebase token's email matches exactly; the rules comparison is case-sensitive. Keep the rest of the rules unchanged. **A link does not grant access to someone who is not on this list.** Any approved person who has a list URL can edit that list.

This file, **not the frontend**, is the security boundary. Never deploy `firestore.emulator.rules`: those rules are intentionally permissive for local-only development. Never switch the production database to Test mode just to get past a permission error.

> The approved addresses are visible to anyone who can read this public GitHub repository. Changing the allowlist later requires committing the edited `firestore.rules`, deploying those rules again, and updating `VITE_ALLOWED_EMAILS` in GitHub (step 9).

## 7. Optionally run the Security Rules tests locally

From a terminal:

```sh
cd /path/to/your/quicklist/source_new
npm ci
npm run test:rules
```

The tests temporarily substitute a test-only approved email into a copy of `firestore.rules`, so they do not change your production allowlist or your Firebase project. This command starts the **local Firestore emulator**; it needs **Java 21 or newer**. If you cannot run it locally, the GitHub Actions workflow runs it before publishing (and stops the deployment if it fails).

## 8. Deploy the restrictive rules to Firebase

In a terminal, from **`source_new/`**:

```sh
npm ci
npx firebase login
npx firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

Sign in with the Google account that owns your Firebase project when the browser opens. Replace `YOUR_PROJECT_ID` with the Firebase Project ID from step 2. The CLI should print **Deploy complete**. Check **Firebase console → Firestore Database → Rules**: the published rules should contain your approved emails and deny list discovery to everyone else.

**Deploy rules before sharing/deploying the website.** `firebase.json` points the Firebase CLI to `firestore.rules`. This step deploys **rules only**, not the frontend. GitHub Pages deployment will not deploy Firestore rules for you.

If the CLI reports that you are not authorized, check the Google account selected by `npx firebase login`. If it cannot find the database, make sure step 5 is complete and the project ID is correct.

## 9. Create an empty GitHub repository and set its Actions variables

1. On [GitHub](https://github.com/new), create a **public** repository named `quicklist-shopping.github.io`, owned by `quicklist-shopping`. **If you have already created it, use that repository and skip creation.**
2. Make it **empty**: do not generate a README, `.gitignore`, or license in the GitHub creation wizard. `source_new/` already has its own files.
3. In the new GitHub repository, open **Settings → Secrets and variables → Actions → Variables** (the **Variables** tab, not **Secrets**). Click **New repository variable** once for each name below:

```text
VITE_FIREBASE_API_KEY             = value of apiKey
VITE_FIREBASE_AUTH_DOMAIN         = value of authDomain
VITE_FIREBASE_PROJECT_ID          = value of projectId
VITE_FIREBASE_APP_ID               = value of appId
VITE_FIREBASE_MESSAGING_SENDER_ID  = value of messagingSenderId, if provided
VITE_ALLOWED_EMAILS               = me@gmail.com,friend@example.com
```

Use the *same emails* as `firestore.rules`, separated by commas and **without quotes or square brackets**. For one account, simply use one address. Use plain variable **values**, e.g. `my-quicklist-12345.firebaseapp.com`, not `authDomain: '...'`. The workflow checks that `VITE_ALLOWED_EMAILS` matches the rules; a mismatch **fails deployment** rather than silently changing who can access data.

4. Go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**. Do **not** choose **Deploy from a branch**; this repository already includes a Pages workflow.

## 10. Push `source_new/` as the root of that GitHub repository

From your terminal, in **`source_new/`**, run:

```sh
cd /path/to/your/quicklist/source_new
git init -b main
git add .
git status --short  # Check what will be uploaded before committing.
git commit -m "Initial Quicklist app"
git remote add origin https://github.com/quicklist-shopping/quicklist-shopping.github.io.git
git push -u origin main
```

If you have already initialized the repository or set its remote, skip those commands; check with `git remote -v`. Authenticate with GitHub if prompted. The workflow runs on pushes to **`main`**. If you use another default branch, update `branches: [main]` in `.github/workflows/deploy.yml` first.

**Before committing**, verify that `git status --short` does **not** include `.env.local`, `node_modules/`, `dist/`, Firebase logs, or any service-account file. `.gitignore` excludes these generated files. Never upload private credentials or an Admin SDK service-account JSON file.

> If you have already placed `source_new/` inside an existing GitHub repository, the workflow needs editing to run npm commands from that directory and to upload `source_new/dist`. The commands above intentionally create a separate repository so the supplied workflow works **unchanged**.

## 11. Wait for GitHub Pages to publish

1. In your GitHub repository, open the **Actions** tab and select **Build and deploy Quicklist**.
2. Wait for the green check. The workflow installs packages, checks email/config settings, runs TypeScript and tests (including the Java-based rules tests), builds the SPA, and publishes `dist/` to Pages.
3. Return to **Settings → Pages**, and click **Visit site**. Your root Pages URL should be:

   ```text
   https://quicklist-shopping.github.io/
   ```

4. Sign in with an approved Google account. Click the new-list icon, add an item, and copy the full URL (including the `#/LIST_ID` part). Open that URL in a second browser or private window and verify that an approved account can access it. Check that an unapproved account cannot.

**Share the full list URL**, for example `https://quicklist-shopping.github.io/#/a1b2c3`. The `#` part is deliberate: it lets a shared list URL survive a refresh on GitHub Pages without a web server or reverse proxy.

## 12. Later changes and useful checks

- **Add or remove a person:** Edit `firestore.rules`, run `npm run test:rules`, deploy rules again with the command in step 8, edit the `VITE_ALLOWED_EMAILS` GitHub variable to match, then push the rules change or manually rerun the GitHub workflow. Deploy the new rules promptly: the frontend list is only a convenience check, not the protection. The old Firebase Auth session may remain signed in, but rules should deny future list operations after removal.
- **Local emulators (not production):** Keep `.env.local` based on `env.example` with `VITE_USE_FIREBASE_EMULATORS=true`, then run `npm run dev:emulator`. The local emulator's lists and Google accounts are unrelated to production Firebase.
- **Optional local test against real Firebase:** In your ignored `.env.local`, set the five `VITE_FIREBASE_*` fields from step 3, `VITE_ALLOWED_EMAILS` from step 6, and `VITE_USE_FIREBASE_EMULATORS=false`, then run `npm run dev`. Remember to authorize the local hostname in Authentication (step 4). Change the emulator flag back to `true` afterwards to avoid using production data by accident.
- **Cannot sign in / `auth/unauthorized-domain`:** Check the GitHub Pages hostname in Firebase Authentication → Authorized domains. The hostname is `quicklist-shopping.github.io`, without protocol, path, or hash. Make sure you copied Firebase's original `authDomain` into the GitHub variable.
- **“Access denied” after sign-in:** Confirm you used the same Google email in `firestore.rules` and the GitHub variable, deployed the rules, and rebuilt Pages. Only an email verified through Google is accepted.
- **“Permission denied” when editing:** Inspect the published Firestore Rules and GitHub Actions test run; never solve this by changing production to Test mode.
- **Blank page with `application/octet-stream` for `/src/main.tsx`:** GitHub Pages is serving the unbuilt source files, not the Vite build. In **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions** instead of **Deploy from a branch**. Check **Actions → Build and deploy Quicklist** for a successful run. The deployed page should load `/assets/index-*.js`, not `/src/main.tsx`. Make sure the latest `.github/workflows/deploy.yml` includes the `github-pages` environment so `deploy-pages` can finish.
- **Blank page or missing CSS/JS after the Actions workflow succeeds:** Make sure `package.json` and `.github/workflows/deploy.yml` are at the repository root. For this special `<owner>.github.io` repository, the workflow builds with `VITE_BASE_PATH=/`. Check that the site is `https://quicklist-shopping.github.io/`, without a repository subpath.
- **No unexpected costs:** Stay on **Spark**, do not link a billing account, and monitor usage in Firebase console → **Usage and billing** and **Firestore Database → Usage**. This version does **not** automatically delete lists after 24 hours. Firestore TTL deletes require billing and are **not** enabled here.

## Official references

- [Create a Firebase project and register a web app](https://firebase.google.com/docs/web/setup)
- [Enable Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- [Create Firestore in Standard edition](https://firebase.google.com/docs/firestore/quickstart)
- [Spark plan vs. Blaze plan](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firestore free quotas and TTL billing requirement](https://firebase.google.com/docs/firestore/quotas)
- [GitHub Pages and free public repositories](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
