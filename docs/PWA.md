# Himmah installed app

Himmah is a progressive web app on the existing Cloudflare HTTPS URL. It uses the same accounts and organization workspaces as the browser app.

## Installation

- Android: select **Install Himmah**, then **Install app** when the browser exposes its native prompt. Otherwise use the browser’s Install app/Add to Home Screen menu.
- iPhone/iPad: open Himmah in Safari, choose Share → Add to Home Screen → Add. The in-app install dialog gives these steps in the selected language.
- Installed windows hide the install control. Browser/OS support determines installation and splash presentation; this is not an App Store or Play Store package.

## Starting page

All localized manifests use `start_url: /hub`, retaining the stable `id: /` so the installed app identity does not change. The old `/app` entry redirects to `/hub` for existing links/installations. The entry checks the account and one bounded organization page: a verified single-organization organizer or volunteer opens Activities; a participant opens My progress; multiple/partial membership pages open the organization chooser; no memberships open setup. Signed-out and unverified accounts enter sign-in/verification. Route replacement avoids a Back loop to the launcher. No private account/workspace data is persisted in local storage for this behavior. Existing installations adopt manifest updates according to their browser/OS update schedule.

## Launch assets and localization

`public/pwa/icon.svg` is the Himmah forest/lime leaf artwork. `npm run pwa:assets` uses sharp to generate opaque 192/512px icons, a 512px maskable icon with safe-zone artwork, 180px Apple touch icon and 32px favicon. Android uses manifest icon/background/theme colors for its system splash.

The generator creates 44 portrait/landscape startup PNGs covering common iPhone/iPad viewport sizes and device-pixel ratios, plus src/pwa/splash-screens.ts media links for the root head. Additional devices can be added to the generator. Unsupported dimensions fall back to the OS presentation.

English/Dutch/Turkish manifests are generated from the catalogs. The selected locale updates the manifest link. The static offline notice chooses the Himmah language cookie. Build regenerates all outputs; commit regenerated public files and startup metadata whenever the artwork, device list or offline text changes. CI verifies icon/splash dimensions and catalog values.

## Offline and updates

`public/sw.js` installs only public icons and an offline notice initially. Hashed `/assets/*` resources are cached on demand with a bounded cache. Navigation always uses the network; a failed network request displays the static offline notice. It never stores organizer HTML, account records, API responses, passwords, verification codes or queued mutations.

Registration is production-only and optional: failure cannot block login. Service-worker updates wait for normal activation; no forced reload interrupts forms. Cache names use a Himmah-specific prefix. No Kermes Pay resources or service-worker state are changed.

## Verification boundaries

Automated checks exercise native install event handling, translated instructions, asset dimensions, generated manifests and private-data cache exclusion. Local production HTTP checks verify assets/metadata/MIME types and removed demo routes. Actual installation and splash display on physical iOS/Android devices, live email delivery and hosted sign-up remain unverified in this environment.

## Opt-in push notifications

Profile now offers per-device push permission and confirmed device/all-device disable. iOS/iPadOS users need a compatible installed Home Screen app; in-app notifications remain available without push. Lock-screen alerts contain generic localized text only. Notification clicks open the private notification centre without replacing another window's unfinished form. See [Notifications](NOTIFICATIONS.md) for supported providers, delivery retries and credential maintenance.

Android push notifications use a separate 96px white leaf badge on a transparent background for the status bar. The full-color app icon remains the larger notification icon. The badge is generated from `public/pwa/notification-badge.svg` by `npm run pwa:assets` and included in the public service-worker cache. New notifications adopt the badge after the updated service worker activates; existing displayed notifications may keep the previous icon.

## Separate Futsal installation

Himmah Futsal now has its own manifest identity, icon family and `/futsal` launcher, retaining Hub identity and `/hub`. See [Futsal app](FUTSAL_APP.md) for scope, navigation and installation boundaries. Both use the existing public-only service worker.
