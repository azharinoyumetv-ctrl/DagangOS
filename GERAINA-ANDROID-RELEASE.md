# Geraina direct Android distribution

The Android listing is `/geraina/android`; it is linked from the Geraina product page and the DagangOS footer. Google Play publication is postponed. Only the signed public APK, public release metadata and selected screenshots belong in this portal repository. Private signing files, account credentials, AABs and device logs remain outside the website assets.

## Updating the release

1. In `GerainaOS/android-app`, retain the original signing key and increment both the app version and version code. Build and verify with `scripts/Build-Release.ps1` and `scripts/Verify-Release.ps1`.
2. Run `scripts/Run-FinalVerification.ps1 -Profile <profile>` for `android14`, `android17`, `xiaomi12` and `tablet146`. Export with `node scripts/export-usability-reports.cjs android14 android17 xiaomi12 tablet146` and `node scripts/export-offline-reports.cjs`. Run the isolated MongoDB transaction tests, browser checks and native library alignment check, then record current results with `node scripts/record-usability-release.cjs`. Earlier debug-APK benches remain historical regression evidence, not results for a new APK.
3. From this portal repository, run `node scripts/stage-geraina-android.mjs`. It refuses to stage an APK whose bytes differ from the verified artifact, or an incomplete device matrix.
4. Run `npm run build`, `npm test`, and the local website verification script against a local Worker. The browser check confirms responsive layouts, the actual downloaded bytes, and the unavailable-release state.
5. Deploy the portal through its existing Cloudflare deployment workflow. Verify the live page, manifest, checksum and APK. `scripts/test-geraina-android-download.py` is a read-only public HTTP check suitable for the existing TestSprite project.

Versioned APK URLs are immutable. Keep previously published APKs available; update only `latest.json` and `SHA256SUMS.txt` to advertise the new release. Android updates must retain `com.dagangos.geraina`, the signing certificate and a higher version code. Users download and install the new APK over their existing app. A future Play release must preserve app identity and signing compatibility.

The current release requires Android 14 (API 34) or newer on a 64-bit ARM or x86 device. The local matrix includes Android 14 and 17 phone emulators and Android 16 AOSP emulators with Xiaomi Pad 6S Pro and Samsung Ultra-size screen profiles. It does not emulate HyperOS, One UI or physical hardware. Physical printer output and provider settlement require separate validation.

## QRIS callback correction 1.2.4, 25 October 2026

Version code 9 corrects both Xendit setup instructions to use `https://geraina-os.vercel.app/api/webhooks/xendit`. Live verification showed the old `api.dagangos.com` path returned 404. The documented Geraina endpoint exists and rejects an invalid callback token with 401. This correction leaves DagangOS subscription payments and merchant credentials separate. Provider payment/settlement still requires the merchant's own approved account and a controlled test; no payment has been created during this release.

APK: 17,151,370 bytes, SHA-256 `40080d6e0b43a953fcbe6d123b497a9771e2c3af549c549825b3b640fe9199fd`. The 1.2.3 download remains immutable. Source: `5a434b1`. The final 1.2.4 device, browser and package verification records are under `GerainaOS/android-app/releases/`; publication and published-to-published upgrade verification are pending.

## In-app updates and merchant-owned QRIS, 1.2.3, 25 October 2026

Version code 8 adds automatic foreground availability checks, a nonblocking update banner, the native **Periksa pembaruan** menu and an About action. A confirmed download is checked against the official manifest, exact byte length/SHA-256, package/version/OS compatibility and original installed signing certificate. Android controls source permission and installation approval. Existing versions require one website install of 1.2.3; later updates can start inside Geraina. The website APK self-updater must be replaced with Play's update mechanism before a Play submission. See `GerainaOS/android-app/IN-APP-UPDATES.md`.

Stripe, Telegram and Email SMTP configuration screens/navigation were removed at the owner's request. Both QRIS settings entry points now lead to a real setup guide for the store's own Xendit credentials. Saving an integration sends only that provider; failed loads block saving, and configuration is no longer presented as a verified connection. Integration credentials require Owner/admin access. The QRIS callback checks v3 request/capture amounts, store/request identity and duplicate/late notifications. It rejects incomplete QR responses and invalid amounts. See `GerainaOS/android-app/QRIS-BYOK.md`.

DagangOS's subscription account remains separate. Merchant customer payments use each authenticated store's saved Xendit key with no platform-key fallback, fee subsidy, shared settlement or application fee introduced by this change. The merchant is responsible for provider fees under their own agreement. No live provider payment or merchant write was performed; the supplied Geraina store has no active Xendit API key/callback token, so provider acceptance and settlement remain unverified until merchant setup and a controlled payment test.

The signed APK is 17,151,346 bytes, SHA-256 `0b5a8f2bf248e08d875750228bff2af7b63d16fe5a425a321302e958cd7c260e`. All four profiles passed 50 usability checks, 32 offline/native checks and 12 update-control checks. A separate real system-install test passed seven checks, including a signed upgrade and preservation of an isolated pending-sale record in Geraina's actual offline database. The bootstrap used the same native updater source with an older local version code and upgraded to the then-public 1.2.2; it was never published as a replacement historical APK. The final 1.2.3 checks bind to its exact checksum.

Other local validation: 21 Android unit tests, 24 QRIS/BYOK backend contract tests with fake transport/store records, 19 frontend regressions, 26 read-only screens, 12 draft-preserving rotations, 54 metadata scenarios, six offline browser scenarios, nine presentation checks, nine bridge checks and 25 portal tests. The unchanged isolated MongoDB replay/rollback and decoder instrumentation results remain the earlier baseline. Vendor firmware, physical printer output and physical optical scanning are not certified.

Release source commits: `a27170e`, `3c7b594`. The owner approved publishing after verification. Version 1.2.3 was published in [deployment 40173887206](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40173887206), release commit `b15d60c`, with all four jobs passing and six live download-page checks passing. The expanded cloud check was deferred to 1.2.4 after the live callback-address defect was discovered. The backend deployment of `3c7b594` passed; authenticated live setup status confirms merchant-store credentials, no configured key/token, and no claim of a verified payment. Version 1.2.4 corrects the callback instructions.

## Defect audit update 1.2.2, 25 October 2026

Version code 7 fixes the reported About version, loading delays, password visibility and missing product-camera entry point. About now reads the installed Android version/device metadata and the account plan. Native menu changes retain the running document, saved Android sessions render while validation runs, repeated session checks are shared, hidden dashboard requests are skipped and the Android bundle uses system fonts without remote font/analytics startup dependencies. Login, registration and integration secrets have show/hide controls. Products > Produk Baru / Edit > SKU / Barcode has a native Scan barcode button; it fills the draft and requires explicit Save.

The audit also fixes product failure/retry states, structured validation errors, repeated Save submissions, partial settings/default business details, settings save feedback, import-dialog Back/scroll handling and draft loss during orientation changes. GerainaOS source commit: `1cbd4d4`. See `GerainaOS/android-app/DEFECT-AUDIT-1.2.2.md` for causes, tests and limits.

The signed APK is 17,134,002 bytes. SHA-256: `257b55f6c3e170d6d18cc04e683e9a1c6245b366e83f79c7c0a99436c4864df1`. Install over the previous app using the retained signing identity.

The audit covers 26 screens with merchant mutations blocked, 13 isolated defect regressions, 16 Android unit tests and a 12-rotation product-draft preservation check. The signed-APK matrix passed 50 usability checks and 32 offline/native checks on Android 14/17 phones and Xiaomi/Samsung-size tablet profiles. Camera startup/cancel is exercised; decoded product return values are explicit fixtures and native routing has unit coverage. Physical optical scanning and printer output are not certified. The unchanged backend and EAN-13 decoder results remain the 1.2.0 baseline.

Synthetic startup with a two-second validation delay rendered the saved interface in 352 ms. Initial final-APK phone/tablet route checks with isolated data measured roughly 0.17–0.45 seconds, without document reload. These are controlled bench measurements, not promises of network or physical-device response times.

Portal tests passed 25/25; local and live download-page checks passed 6/6 each. The expanded [TestSprite APK verification](https://www.testsprite.com/dashboard-v3/o/7468bfad-8578-53ea-8da7-d93ac8f0989d/projects/1466ba50-a196-4dc9-a160-f14658033239/execution/30486aa4-5f38-4f9d-919e-a5c1ef77f9d9/test/f6b0ea8c-9407-4de1-a5fe-f5f30564d518) passed: run `f6b0ea8c-9407-4de1-a5fe-f5f30564d518`, code `v-a0ef212cd7dd`. It verifies the downloaded bytes and the presence of the version, password, product-camera and router fixes, plus removal of remote startup font dependencies. [Deployment](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40168612772), release commit `425adad`.

## Branding cleanup 1.2.1, 25 October 2026

Version code 6 shows the Geraina logo, wordmark and store identity once in the Android top bar. The sidebar header now contains the Suite switcher and, on narrow screens, the drawer-close control. The duplicate sidebar logo, app name and store label are hidden by the Android presentation layer.

The signed APK is 18,984,806 bytes. SHA-256: `e2c07bccd069617b6ddb9cab4d8c3f5b026d0b65123e51d322c42c18d8a9f2f5`. The original package identity and signing certificate are retained, so users install it over their existing app. Earlier versioned downloads remain available.

GerainaOS source commit: `46f9091`. The signed APK passed 50 usability checks and 24 offline/hardware checks across Android 14 and 17 phones and Xiaomi / Samsung large-tablet screen profiles. Native tablet screenshots were inspected to confirm the duplicate branding is absent in portrait and landscape. The Suite switcher remains usable on narrow and wide layouts. Android unit tests passed 14/14, browser metadata checks 54/54 and presentation checks 9/9; signing, package validation and 16 KB alignment passed. Portal tests passed 25/25 and the local download page passed 6/6 checks. The backend and barcode-decoder assertions recorded for 1.2.0 remain the unchanged baseline for this presentation-only update.

Published at https://dagangos.com/geraina/android. Live download-page checks passed 6/6, including the exact APK checksum. [TestSprite verification](https://www.testsprite.com/dashboard-v3/o/7468bfad-8578-53ea-8da7-d93ac8f0989d/projects/1466ba50-a196-4dc9-a160-f14658033239/execution/9b03ad03-b934-4159-9f28-8f0abe398bc9/test/5f88930f-e349-41b5-8c2f-8e601d301fee) passed, run `5f88930f-e349-41b5-8c2f-8e601d301fee`. [Deployment](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40118550567), release commit `939c171`.

## Offline and hardware update 1.2.0, 25 October 2026

Version code 5 retains the original app identity and signing certificate. The APK bundles the frontend and camera barcode model. After login and catalog preparation online, cash checkout and receipt recovery work without a connection, including after a cold restart. A durable local record is saved before checkout succeeds. Queued sales retry while the app is open, including from the dashboard; a server transaction commits the order, counter and stock together. Replays retain the same identifier and cannot create a second sale. Electronic payments require connectivity. Clearing app data or uninstalling can delete unsynchronized sales.

Camera scanning uses an on-device model. Native receipts target ESC/POS over Bluetooth Classic SPP, or USB printer-class bulk OUT through OTG, with 58 mm and 80 mm profiles. Settings > Printer provides device setup and a test receipt. BLE-only, proprietary vendor protocols and USB serial adapters are not claimed. No printer model or physical printer was supplied, so paper output and model-specific compatibility remain unverified.

The exact signed APK must pass both device matrices before staging. Results are retained in `GerainaOS/android-app/releases/android-usability-report/`, `android-offline-report/` and `release-verification.json`. Merchant product/sale writes and support messages remain zero during verification; backend write tests use an isolated local MongoDB replica set.

The signed 1.2.0 APK is 18,984,722 bytes. SHA-256: `d79a8fb1bc11aaeec3f223a2a244cc98da5931bde6daedb9324cd8001d9fafe2`. Application source is commit `8b2fbc0` in GerainaOS; `26b7b85` refines the test's page-ready wait without changing the APK.

- Installed signed APK: 50/50 usability checks and 24/24 offline/hardware checks across all four profiles. Offline checks disable Android connectivity, block API responses, force-stop/restart the app, exercise camera denial/preview, open native printer setup, and verify failed replay/retry without duplicate identifiers. An open receipt updates when synchronization completes.
- Isolated MongoDB: 9/9 tests, including concurrent replay, lost-response replay, rollback of stock/order/counter, and account/store validation.
- Android unit tests: 14/14, including fractional receipt amounts and both paper widths. Bundled barcode decoding: EAN-13 at two rotations on Android 14, repeated with connectivity disabled; this decoder test uses debug instrumentation. Signed release camera startup and frame processing passed the installed matrix.
- Browser checks: six offline scenarios, nine presentation checks and 54 metadata validation/recovery scenarios across three widths. Bridge checks remain 9/9.
- Signing certificate retained; APK/AAB validation, 16 KB ZIP/native ELF alignment and private-credential exclusion passed. Release lint has zero errors and 47 warnings.
- Portal tests: 25/25. Local and live download-page checks: 6/6 each, including the actual APK bytes and responsive layouts at 320/393/768/1440 px. The protected offline endpoint returns 401 without authentication.
- TestSprite public APK verification passed: run `23259860-3df5-4060-bf3f-f7ba7f233912`, code `v-d855eddf5e60`, [execution](https://www.testsprite.com/dashboard-v3/o/7468bfad-8578-53ea-8da7-d93ac8f0989d/projects/1466ba50-a196-4dc9-a160-f14658033239/execution/e20f1cdc-20c4-4fed-968c-fc8b11ba33d5/test/23259860-3df5-4060-bf3f-f7ba7f233912).
- Published APK and page: https://dagangos.com/geraina/android. [Deployment](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40117314573), release commit `84dc68d`.

## Usability update 1.1.2, 24 October 2026

Version code 4 retains the app identity and signing certificate. It fixes unreadable login input text and Suite labels, keeps the left navigation visible on wide tablets, moves the narrow-screen drawer control to the top left, and removes the extra bottom Menu tab. Category, brand and unit forms show validation, saving progress and recoverable API errors. Ordinary page text is not selectable; editable fields retain selection and copy/paste. Back dismisses the keyboard or an open panel first, then returns to the dashboard with an exit prompt; a second press within two seconds exits while retaining the login session.

Current signed-APK results are in `GerainaOS/android-app/releases/android-usability-report/`. The suite uses the prepared frontend at the production origin before deployment. Metadata writes and cashier products are intercepted fixtures; no merchant record or support message is written. A public live check verifies the advertised APK bytes and minimum Android requirement after deployment.

The update is published at https://dagangos.com/geraina/android. Its SHA-256 is `61464a4f35701232e8e2f7fcab4592fdd7dda36c0ab201914e511ecc23e4bc65` (516,417 bytes).

- Current signed-APK matrix: 50/50 checks across Android 14 and 17 phones and Xiaomi / Samsung large-tablet profiles. These are AOSP emulators.
- After deployment, the installed signed APK passed another 13/13 checks against the live frontend on the Samsung-size tablet. This includes keyboard/dialog dismissal, text selection, metadata form recovery, persistent landscape navigation, double-Back exit and retained login.
- Unit, presentation and bridge checks: 9/9 each. Login/register contrast: 12 cases. Form validation and recovery: 54 browser scenarios across three widths.
- Portal tests: 25/25; live website checks: 6/6, including an actual APK download and its exact checksum.
- TestSprite public download verification: passed, run `8d3f1596-e0ff-4095-bb13-74144deb4369`, [execution](https://www.testsprite.com/dashboard-v3/o/7468bfad-8578-53ea-8da7-d93ac8f0989d/projects/1466ba50-a196-4dc9-a160-f14658033239/execution/4c7052b6-8030-40bb-a801-bf63f61f0cab/test/8d3f1596-e0ff-4095-bb13-74144deb4369).
- [Deployment](https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40095588108), release commit `ec48b0c`: deploy, Cloudflare audit, public accessibility and Geraina end-to-end suite all passed.

## Previous published release 1.1.1

Geraina **1.1.1**, version code **3**, is published at https://dagangos.com/geraina/android. The APK SHA-256 is `37b2d7cf47f2f6cfcb43a10608d9f1be4906f7ec071ce8a89090bcb6feb0008f`.

- Android phone: 24/24 checks; large-tablet matrix: 116/116 checks.
- Android unit tests: 9/9; presentation: 9/9; bridge: 9/9; signed release installation/login smoke: passed.
- Portal tests: 25/25; live browser checks: 6/6, including the actual downloaded bytes and 320/393/768/1440 px layouts.
- TestSprite `6aeabb04-2f07-46ac-ab0e-b5d7a715ae0c`, **Official Geraina Android download matches its public checksum and metadata**: **passed**. [Run](https://www.testsprite.com/dashboard/tests/52c365d6-4b9f-4b5d-a09e-b4726079328e/test/6aeabb04-2f07-46ac-ab0e-b5d7a715ae0c).
- Deployment: https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40080523087, release commit `74046f7`.
