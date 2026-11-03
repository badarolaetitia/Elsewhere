# Elsewhere: prototype guide and roadmap

Prototype website: https://elsewhere-discover.readylime71.chatgpt.site

The search home page is deployed and works without signing in. Accounts remain invitation-only for cloud saves and private ratings. Public account registration is disabled. Hosted sign-in and cloud-data isolation still need verification with a second real tester account.

Elsewhere helps someone find alternatives to a place they already like or want to visit. A search can focus on what the place offers, its atmosphere, or the overall experience. The goal is to find a suitable alternative when the original choice is inconvenient, too busy, or difficult to book. The prototype cannot verify queues or reservation availability.

This guide separates the current experience from future features. It is an owner and tester reference, not text intended to appear throughout the app.

## 1. Using Elsewhere

Search and browse as a guest. Sign in only when you want private ratings and cloud synchronization. Guest saves and plans stay on the device. During this pilot, accounts are created for invited testers; they are Elsewhere email/password accounts, not ChatGPT accounts.

1. **Search for a place and city.** A specific name and location reduce confusion between branches and businesses with similar names.
2. **Choose your priorities in order.** Select Food & products, Atmosphere, or Experience in the order that matters for this search. For example, someone seeking a particular kind of pasta should put food first; someone planning an evening out may put atmosphere first.
3. **Add a specific preference when useful.** Examples include handmade pasta, fruit-shaped pastries, a quiet setting, or a creative book selection. A specific request takes priority over general preferences learned from past visits.
4. **Review alternatives.** Change the distance or recommendation preferences, then apply the filters. Check the address and supporting details before deciding.
5. **Save places.** Saved is a shortlist for later. Saving a place does not mean that you visited it or liked it.
6. **Rate a visit after going.** Sign in, choose a star rating, select what you enjoyed, and optionally add a note. Profile contains your preferences and visit history.
7. **Plan a restaurant visit.** Choose a date, time, and party size, save a plan, or open booking options. A saved plan is not a reservation. Complete and confirm any booking on the destination site.

## 2. Accounts and private ratings

Discovery is public and does not require an account. If a session is supplied, the server verifies it with Supabase. Account registration remains invitation-only; account data stays private through row-level security. There is no ChatGPT sign-in requirement.

Signing in enables cloud storage for saved places, ratings, and plans. The account screen offers an explicit import of any existing device-local guest data, synchronization, password changes, sign-out, and account deletion. Previously saved guest information remains local until imported; that does not grant guest access to the hosted search API.

There is no public account registration or email password-reset flow in this pilot. Approved testers receive an initial password privately and change it in Account after signing in. Password sign-in to an existing, manually confirmed account does not need an SMTP email to be sent. [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [changing a signed-in user's password](https://supabase.com/docs/reference/javascript/auth-updateuser)

Existing email-link sign-in remains useful only for approved recipients who can actually receive email through the project's configured sender. It does not remove the API allow-list requirement.

Ratings and notes are private account information, not public restaurant reviews or aggregate star scores. Removing a saved place does not remove its visit history. Users can edit or delete their ratings separately.

Personalization currently uses explicit preferences from ratings. It is not a full understanding of someone's taste, and it should not infer a detailed preference from a free-text note without a clear implementation and user control. Matching should favor a person's current request and use their history as secondary guidance. More nuanced learning from dislikes and repeat visits is a development target, not a guarantee of the first prototype.

## 3. How recommendations work

The app looks up the original venue, retrieves real candidate places, interprets the requested experience, and ranks the alternatives. Geoapify currently supplies place records. Research may provide evidence for more specific claims, such as a particular product or setting.

When no specific preference is selected, the app can show broad venue-type alternatives with details marked unverified. When preferences are selected, every selected preference must have positive, cited evidence; otherwise the venue is excluded. An empty result means no match was confirmed among the researched candidates, not that none exists in the city. It must not turn a guess into a verified menu item, invent a venue, or treat missing search evidence as proof that something is unavailable.

Searches are accepted worldwide rather than through a fixed country list. Coverage and response time depend on the provider's records and service availability. This is not a promise that every venue exists in the data or every request will succeed. There is no bundled Paris directory or fixed city-by-city backup.

The results form a shortlist, not a complete inventory of every business in a city. Returning a manageable selection is different from restricting the app to a fixed list of places.

## 4. What the first prototype does not provide

- Live queues, footfall, or proof that an alternative is less crowded.
- Live table availability, confirmed bookings, cancellations, or a restaurant reservation system.
- Verified current menus, prices, and opening hours for every result.
- Public reviews or a complete recommendation model based on a large history of visits.
- Paid restaurant placements or a restaurant management dashboard.

Do not advertise these as working features. Booking options currently open an external search. A restaurant's own website or booking provider remains the source of confirmation.

## 5. Launching the invite-only prototype

Starting on free service plans is reasonable for a limited trial. It is not a promise of unlimited free operation. Measure usage before deciding which paid service would improve the experience most.

The deployment target is the existing Expo web interface with its server search handler hosted on a Cloudflare Worker through Sites. Shared D1 counters protect search usage across server instances; personal account data remains in Supabase. Publicly reachable pages do not mean anonymous visitors can use the search API: approved Elsewhere accounts are required for this pilot. A deployment is only confirmed when the hosting service returns a successful production URL and live checks pass. Publishing a GitHub repository alone does not run the search backend.

Before inviting testers:

1. **Finish the search checks.** Test named venues in several cities and categories. Confirm name and location matches, distance filtering, failure messages, and the handling of research quota limits.
2. **Verify the pilot usage limits.** The configured policy is six search requests per minute per IP, 20 new searches per day per approved user, and 50 new searches per day across the whole prototype. These are conservative trial limits, not a service-level promise. Filtering a valid existing signed result does not spend another new-search allowance, but request throttling still applies. Failed new-search attempts can consume allowance because they may already have contacted a provider. Reaching a cap should stop new expensive work with a clear message. Check that the D1 counters are enforced across instances, not just inside one server process.
3. **Configure production secrets.** Keep Geoapify and research keys on the server. Only the Supabase project URL and publishable key belong in browser configuration. Do not publish `.env`, private API keys, or Supabase secret/service-role keys.
4. **Configure Supabase URLs.** In Authentication → URL Configuration, set Site URL to the deployed HTTPS origin and add the exact production `/account` callback. Keep localhost redirects only if still needed for development. Supabase requires requested sign-in redirects to match its allow-list. [Redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls)
5. **Create and approve pilot accounts.** Follow the procedure below for each explicitly approved tester. Keep public self-registration disabled. Do not use email invitations or password-reset emails as a substitute for the manually confirmed password flow before SMTP is configured. Do not enable a social provider until its configuration and callback work.
6. **Test two real accounts.** Save and rate different places in each account. Confirm that one cannot read or change the other's records, including after refresh, sign-out, and switching accounts. Automated mock tests do not replace this deployed check.
7. **Check dependencies and recovery.** Assess the security audit, apply compatible repairs, test the production bundle, and retain a way to roll back a bad release. Test deletion only with a disposable account.
8. **Invite a small group first.** Ask whether alternatives match the requested food and atmosphere, whether anything is confusing, and whether search failures prevent completing the task. Increase access after reviewing actual results and usage.

### Adding an approved tester without SMTP

The owner performs these steps; testers do not need access to Supabase's dashboard or organization.

1. Agree which person's email address is being invited and verify it with that person directly. Do not automatically approve an address merely because someone submits it on the site.
2. In the Supabase project, open **Authentication → Users → Add user → Create user**. Create the Elsewhere account with the person's approved email and a unique, strong initial password. This is the create-user flow, not **Invite user**, which sends email.
3. For that explicitly approved account, set **Email Confirmed** to true (also described as auto-confirm email in some interfaces). Supabase's administrative API documents the equivalent `email_confirm: true` option. Administrative creation belongs in the owner's dashboard or trusted server tools, never the browser. [Supabase create-user reference](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
4. Keep public account self-registration disabled during the pilot. No hosting email allow-list is needed for discovery: anyone can search as a guest.
5. Share the website address, login email, and initial password privately through an agreed channel. Do not put credentials in GitHub, source files, screenshots, this guide, a public invitation page, or the API allow-list. Do not give the tester a Supabase organization role or dashboard access.
6. Ask the tester to sign in with email/password and immediately change the password in **Account**. Verify that the new password works after signing out. The owner's initial password should no longer work.
7. Check that the approved account can search and save its own data. Separately verify that a signed-out visitor can search and save locally without seeing private account data.

To revoke an account's login access, use Supabase's account-administration controls. Guest discovery remains public. Follow the agreed account-deletion process separately. If a tester loses the password before email recovery is configured, the owner must handle recovery through trusted administration and private communication.

### Before opening self-registration

Public registration and email-based password resets are deferred. Supabase's default email sender restricts recipients to project-team addresses and has a very small sending allowance; adding testers to the app does not change those email restrictions. Configure custom SMTP and its sender identity, then test sign-up, confirmation, reset, expiration, and delivery to non-team email addresses before enabling those flows. Ordinary password login to an already confirmed account is the pilot route that avoids this delivery dependency. [Supabase email delivery](https://supabase.com/docs/guides/auth/auth-smtp)

Opening discovery to everyone is a separate launch decision: revise the server access policy deliberately, retain usage controls, verify support and recovery flows, and measure capacity. Do not simply remove the allow-list to make an individual tester's login error disappear.

## 6. When to start paying

Review the provider dashboards for successful searches, timeouts, rate-limit responses, daily credits, research quota, email delivery, and hosting/database usage. A single Elsewhere search can make several provider requests. Geoapify credits are not the same as user searches. [Geoapify credit rules](https://www.geoapify.com/pricing-details/)

Use quotas, request limits, and spending controls appropriate to each service. A budget alert is a notification; do not assume it is a hard spending cap. Upgrade after identifying a real constraint, such as repeated quota exhaustion, poor data coverage, email volume, or a hosting limit. Do not wait until a growing audience has already lost access, and do not enable billing without agreeing on a budget.

### Google Places: a possible later data upgrade

Google Places can supply venue search and details. It does not supply a general-purpose restaurant reservation inventory. Its API requires billing to be enabled, and charges depend on the endpoints and fields requested. Free allowances depend on the applicable service SKU, so estimate costs using measured traffic before integrating it. Request only needed fields, restrict the server key, and set suitable quotas. [Google Places billing and quotas](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)

Decide on Google Places after comparing the current prototype's failures and missing data against the expected benefit. Do not add it solely because one lookup timed out.

### Reservation providers: a separate integration

A later booking flow needs authorized access to a reservation provider and its inventory. Partner access, permitted uses, fees, and restaurant coverage must be confirmed directly; none of the following is an automatically available free worldwide booking API.

| Provider | What to investigate |
| --- | --- |
| OpenTable | Its partner application and Directory API for restaurant data and reservation links; confirm separate access for availability and booking capabilities. [Partner FAQ](https://www.opentable.com/restaurant-solutions/api-partners/faqs/) |
| TheFork | Partner booking funnels, real-time availability, reservation lifecycle, and webhooks, subject to the agreement. [B2B API introduction](https://docs.thefork.io/B2B-API/introduction) |
| Eat App | Partner availability and reservation endpoints, with credentials and region/restaurant activation. [Partner integration guide](https://restaurant.eatapp.co/knowledge/using-the-eat-app-partner-api-to-get-and-post-availability) |

Begin with accurate external booking links. When access is approved, add availability for an exact date, time, and party size, then booking confirmation and cancellation handling. Use the provider's booking reference and status; do not call a saved local plan a confirmed reservation.

## 7. Sponsored restaurants with space tonight

This is a future business feature, not part of the current prototype. A restaurant could pay for a clearly labeled Sponsored placement when it fits a diner's request and has relevant availability.

A suitable later flow would be:

1. Match the requested cuisine or product, atmosphere, location, and other preferences first. Payment must not make an irrelevant restaurant look like the best match.
2. Check availability for the diner's exact date, time, and party size. Store its source, when it was checked, and when it expires.
3. Distinguish a restaurant's manually reported opening from provider-confirmed inventory. A restaurant report should say that it is reported availability and still needs confirmation.
4. Display a clear Sponsored label. Do not present paid placement as an independent review or hide the sponsorship inside an unexplained ranking score.
5. Recheck before booking. Expired or withdrawn slots should disappear. Never generate fictional table times, discounts, queue lengths, or booking confirmations.
6. Track useful outcomes: relevant views, booking-link clicks, and provider-confirmed bookings where the agreement permits. Review user satisfaction as well as restaurant revenue.

Before implementing this, decide how restaurants verify ownership, update availability, resolve incorrect information, and pay. Obtain the necessary provider permissions and define the commercial terms. No sponsorship payment system or restaurant dashboard has been implemented merely by documenting this roadmap.

## 8. Suggested development order

1. Reliable venue lookup, clear failures, accurate evidence, and search usage protection.
2. Hosted invite-only access, manually confirmed Elsewhere accounts, and a small tester group; later, SMTP-backed public registration and recovery.
3. Better personalization, especially explicit dislikes and useful controls for editing taste history.
4. A measured decision on paid place-data or research capacity.
5. Authorized reservation availability and confirmation.
6. A restaurant pilot for relevant, transparently sponsored same-night placements.

Update this guide as features are verified. Keep the distinction between implemented behavior, successful live tests, and future plans visible to the project owner.

## Latest verification

The main application passes 49 automated tests and TypeScript checking. Production export and Worker checks pass for HTML, client JavaScript, routing, and rejecting unauthenticated search. Live local API checks passed for Cédric Grolet Opéra in Paris (18 seconds) and Lilia in New York (11 seconds), including preference and distance updates. Both runs used broad venue metadata because research quota was unavailable; specific menu and atmosphere claims remained unverified. These results do not establish worldwide coverage or guaranteed uptime.

Dependency updates removed the high and critical findings in the main application audit; seven low-severity findings remain through Expo build tooling. The publisher has additional development-only migration-tool advisories. The search API and assets do not include those tools. Two-account hosted testing and provider-quota monitoring remain required before widening the pilot.

### Guest-first update

The home page is the search page. Desktop screens use a two-column layout; smaller screens stack the same controls. Guests can search, save places locally and create device-local plans. Ratings and cloud sync require sign-in. Search is limited to ten new searches per guest network per UTC day, twenty per signed-in account, and fifty across the prototype. The old search email allow-list is no longer used. Supabase account self-registration remains disabled for the pilot; adding an invited account does not require granting dashboard access.


## Preference verification update

The verification pass now runs two candidate batches concurrently within a shared 90-second research budget, with a 30-second limit per provider attempt. Website URLs supplied by place metadata are passed to the existing Gemini URL Context tool alongside Google Search. Only source-linked evidence is accepted; successful website retrieval alone is insufficient. Inaccessible sites and provider quota failures remain unknown and never satisfy a selected preference. This is a bounded prototype search across at most 30 researched candidates, not a complete city inventory. Google Search attribution remains required when its grounding is used. No custom scraper, paid provider, or booking availability connection was added.
