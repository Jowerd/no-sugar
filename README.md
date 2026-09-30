# NO SUGAR

A mobile-first shared no-sugar challenge with a Georgian interface. Friends join with a name, check in once per local calendar day, and see each other's progress. There are no accounts or passwords.

## 1. Install and run locally

Install [Node.js](https://nodejs.org/) 20.9 or newer. In a terminal opened in this project folder, run:

```bash
npm install
```

Set up Supabase and `.env.local` using the steps below, then run:

```bash
npm run dev
```

Open `http://localhost:3000`. If environment variables are missing, the app shows setup instructions.

## 2. Create the Supabase database

1. At [supabase.com](https://supabase.com/), create an account and a new project. Save the database password somewhere safe.
2. In the project dashboard, open **SQL Editor** and create a new query.
3. Open [`supabase/setup.sql`](supabase/setup.sql). Near its bottom is the challenge configuration: 90 successful check-ins between October 1 and December 31, 2026. This is a 92-calendar-day period with a goal of 90 checked-in days. Edit that row if you want different dates or a different goal.
4. Paste the **entire** SQL file into SQL Editor and click **Run**. This creates the tables, duplicate prevention, RLS, and the three functions the app uses.

The SQL file is safe to run again and preserves participants and check-ins. Running it again updates the challenge configuration row to the values in the file. If you already ran an older version, run the entire updated SQL file again so the 90-day goal and dates take effect.

```sql
update public.challenge_config set name = '90-დღიანი გამოწვევა', app_title = 'უშაქროდ', start_date = '2026-10-01', duration_days = 92, goal_days = 90 where id = 1;
```

The `challenge_config` row is the central source for challenge name, start date, calendar duration, successful-day goal, and displayed title. The browser tab and installable app name are set in `src/lib/config.ts` and `public/manifest.webmanifest`; update those too if you rename the app.

## 3. Connect the app

In Supabase, open **Project Settings → API** (or **Connect** in the dashboard). Copy the **Project URL** and the **publishable/anon** key. Never use the service-role or secret key in this app.

Copy `.env.example` to `.env.local`, then replace the placeholders:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Restart `npm run dev` after editing `.env.local`. The `NEXT_PUBLIC_` prefix intentionally makes these public browser values. `.env.local` is ignored by Git.

## 4. Deploy with GitHub and Vercel

1. Create an empty repository on [GitHub](https://github.com/new). Do not add a README there because this project has one.
2. In this project folder, run the following commands, replacing the URL with your new repository URL:

```bash
git init
git add .
git commit -m "Build NO SUGAR challenge"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

3. Sign in to [Vercel](https://vercel.com/), choose **Add New → Project**, import the GitHub repository, and keep the detected Next.js settings.
4. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the same values used locally. Add them for Production (and Preview if wanted).
5. Click **Deploy**. If you added or changed the variables after a deployment, open the project in Vercel, choose **Deployments**, open the latest deployment's menu, and click **Redeploy**. Environment values are embedded into the browser bundle during build.
6. Share the deployed URL with your friends. Each browser joins independently.

## How identity and access work

The browser creates a random UUID and stores it in localStorage. Supabase stores only its SHA-256 hash. A device presenting the token can check in for that participant and read their own dates. If browser storage is cleared, the old identity cannot be recovered unless the token was backed up separately. Names must be unique: letter case and leading/trailing/repeated whitespace do not create a new name. Names are not authentication: entering an existing name never gives access to that participant. After browser storage is cleared, its previous name remains reserved until the owner renames or deletes that participant.

## Manage participants and enable unique names on an existing database

1. In Supabase SQL Editor, run `supabase/find-duplicate-names.sql`. It only lists duplicate names, participant IDs, and successful-day counts.
2. In **Table Editor → participants**, locate each unwanted participant by its exact `id`. Select that row and choose Delete. Confirm/Save the change if the editor asks. Deleting a participant also permanently deletes their check-ins through the foreign key's `ON DELETE CASCADE`. To preserve history, edit their name instead (for example, add a surname).
3. Run the full `supabase/unique-participant-names.sql` file in SQL Editor. It adds the unique name index and updates registration, without changing challenge dates or deleting records. If duplicates remain, the migration stops and rolls back; resolve those rows and run it again.
4. Publish the updated frontend to Vercel. The database index is authoritative, including simultaneous registration attempts. The frontend provides an early check and a Georgian name-taken message.

After an owner deletes a participant, refreshing the app on that participant's device returns them to the name-entry screen. Admin deletion is available through the Supabase dashboard. Visitors can delete only their own participant through the token-scoped RPC; direct table deletion remains forbidden.

### Delete your own profile

For an existing database, run `supabase/delete-own-participant.sql` in Supabase SQL Editor before deploying the updated app. This migration installs the function without deleting records or changing challenge settings. New installations include it in `supabase/setup.sql`.

Open History and choose **ჩემი პროფილის წაშლა**, then confirm. The `challenge_delete_me` RPC matches the SHA-256 hash of the current device token and deletes that participant. Check-ins are removed by the existing cascading foreign key. Other participants are unaffected; the deleted name becomes available again. The app clears its local identity only after the server confirms success. Retrying deletion is safe. This requires the original device token; a name alone cannot authorize deletion.

Row Level Security is enabled on all tables, with no direct table permissions or policies for anonymous users. The browser's anon key can call only the three narrow `SECURITY DEFINER` functions. These functions verify the token and expose the shared crew names, streaks, and today's status. Anyone with this project's public URL and anon key can join or read the crew; this is a small private group, not an invitation-only system. There is no server-side account authentication. The database enforces one check-in per participant and date with a unique constraint. The browser supplies its local calendar date; the database limits it to within one day of the server date, so local time zones work while large date changes are rejected. A person able to manipulate their own device clock near a date boundary can still affect their own check-in date.

## Add to Home Screen

On the first mobile browser visit, an install invitation appears. On supported Android browsers, its button opens the browser's native install confirmation. On iPhone/iPad, Safari does not provide a programmatic install prompt, so the invitation shows the Share → Add to Home Screen steps. The site must be served over HTTPS (as on Vercel) or `localhost` for service worker and native PWA install features; a plain `http://192.168.x.x` development URL will not provide the full install flow. The service worker displays a simple offline page when a navigation cannot connect, but check-ins still require a network connection. An iOS Home Screen app may have separate browser storage, so users should add it before entering their name there.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```
