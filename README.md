# Elsewhere

The current prototype is limited to **96 identity-matched venues in West Village, Manhattan (NYC boundary MN0203)**. Choose a listed venue on Discover. Search uses the bundled dataset without live Geoapify or Gemini requests. Identity, address and coordinates agree across the two datasets. NYC registry cuisine categories support broad comparisons; specific offerings require separate venue sources. Unsupported fields are omitted.

**Everyone’s going there. Find somewhere better.**

Find alternatives to places you want to visit, based on the food, style,
atmosphere or experience that caught your eye.

For dinner, choose a supported restaurant, date, time and party size to explore
similar options and look for reservations. Live table availability and queue
times are not connected yet.

## Development

Use Node 22.13 or newer. Install dependencies with `npm install` and add
`GEMINI_API_KEY` and `GEOAPIFY_API_KEY` to a root `.env` file. Do not commit secrets.

```sh
npm run web
```

## Checks

```sh
npm run typecheck
npm test
```

## Accounts and private sync

Create a Supabase project on the Free plan. In its SQL Editor, run
`supabase/migrations/202611020001_private_items.sql` once. The migration enables
row-level security for saved places, visits and dinner plans; each user can access
only their own records. It also adds a self-only account deletion function.

Copy `.env.example` to a local `.env` without overwriting your existing provider
keys. Add the project URL and its publishable key as
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. These two
values are intended for the client. Never use a service-role or secret key there.
Restart Expo after changing environment variables.

In Supabase Authentication → URL Configuration, set the public site's URL and add
`http://localhost:8086/account` for local development, your deployed `/account`
URL for web, and `elsewhere://account` for a native development build. Email links
must be opened in the same browser/device because sign-in uses PKCE. To support
manual codes, include `{{ .Token }}` in the Supabase sign-in email template.
Configure a production email sender before opening signups to arbitrary users;
the default sender is for development and has recipient/rate restrictions.

Google and Apple sign-in are supported only after configuring those providers in
Supabase. Then set `EXPO_PUBLIC_AUTH_PROVIDERS=google,apple` (or just the enabled
provider). Leave it empty to use email only. Provider secrets belong in Supabase,
not in this repository.

Guests can search and save locally. Ratings require sign-in. After signing in,
users choose whether to import this device's guest records. Existing account
records take precedence. Saves, visits and plans are scoped to the current user;
failed uploads remain pending locally. Signed-in records are removed from this
device on sign-out. Account deletion removes the auth user and cascades to private
records. Multi-device edits use the last successfully uploaded change per record;
there is no collaborative editing or real-time subscription yet.

## Public hosting

GitHub hosts the source code. The working web app needs a server-capable host for
Expo Router API routes; GitHub Pages alone cannot run `/places`. Configure provider
secrets on the host, never in browser-exposed variables. Verify login, email
callbacks and isolation with two real test accounts after connecting Supabase.
The local tests mock the cloud service; they do not prove a deployed database's
RLS configuration or email delivery.

Before a public launch, configure distributed search rate limits and provider
spending limits, resolve remaining dependency advisories, and restore web-search
quota for verified recommendation quality. The app is not deployed by adding a
Supabase project or making the repository public.

## Hosted prototype and guide

The invite-only prototype is available at https://elsewhere-discover.readylime71.chatgpt.site. Search and local saves work without signing in; invited accounts add private ratings and cloud sync. Public self-registration is disabled. The owner is initially the only approved tester. See [the app guide and roadmap](docs/ELSEWHERE_GUIDE.md) for creating tester accounts, current limitations, Google Places, reservations, and sponsorship plans. See [hosting notes](hosting/README.md) for deployment and usage controls.


## Matched dataset pilot

See [the matching report](docs/NYC_MATCHING_REPORT.md) and [the checked pilot JSON](src/data/nyc-pilot-venues.json). The previous provider-based search is retained in `src/lib/live-place-search.ts` for comparison and its regression tests, but the public `/places` route calls only the dataset search. Request interpretation currently accepts the listed feature labels rather than using a live language model.
