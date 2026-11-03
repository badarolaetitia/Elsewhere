# Invite-only web prototype

The hosted website uses the existing Expo client and a Worker that imports the same recommendation API. `worker.ts` serves the exported application and protects `/places` with `search-guard.ts`.

Discovery is available without sign-in. Guests can search and save places and plans locally. Invited Elsewhere accounts add private ratings and cloud synchronization; account self-registration stays disabled in Supabase. A supplied account session is verified server-side. ChatGPT sign-in is not required.

Shared D1 counters allow six requests per IP per minute, ten new searches per guest network per UTC day, twenty per signed-in account, and fifty new searches in total per UTC day. Filter updates reuse signed snapshots and remain subject to the IP request limit. Database failures deny new searches rather than bypassing the limits. IP addresses and account IDs are hashed before storage. The email search allow-list was removed when guest discovery was restored.

Server settings: `GEOAPIFY_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SEARCH_LIMIT_SECRET`. Configure them through hosting secrets, never source files. Browser build settings: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_INVITE_ONLY=true`.

The separate publishing checkout lives at `.publish/elsewhere-prototype/`, with its own hosting manifest and Git history. It preserves the app source under `application/`; production assets are compressed into the Worker. `hosting/build.mjs` supplies the build implementation. The hosting source repository includes its wrapper, dependency lockfile, public build settings and generated schema-only Drizzle migrations. This avoids changing the working repository's staged files during publication.

Dependency overrides update vulnerable query parsing and build-tool dependencies while retaining Expo SDK 57. The current main-app audit has seven low-severity advisories inherited through Expo's build-time `deepmerge` dependency; no high or critical advisories remain. The publisher additionally uses Drizzle's migration tooling, whose development-only transitive packages have separate moderate advisories. These tools are not included in the deployed Worker. Do not use `npm audit fix --force` to downgrade Expo or upgrade the SDK without compatibility work.

A public launch still requires a separate release decision, public email delivery and recovery setup, non-owner account testing, monitoring and broader city/venue quality testing. Neither live reservations nor live crowd data are available in this prototype.
