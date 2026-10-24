# Geraina direct Android distribution

The Android listing is `/geraina/android`; it is linked from the Geraina product page and the DagangOS footer. Google Play publication is postponed. Only the signed public APK, public release metadata and selected screenshots belong in this portal repository. Private signing files, account credentials, AABs and device logs remain outside the website assets.

## Updating the release

1. In `GerainaOS/android-app`, retain the original signing key and increment both the app version and version code. Build and verify with `scripts/Build-Release.ps1` and `scripts/Verify-Release.ps1`.
2. Run the signed-APK usability suite on `android14`, `android17`, `xiaomi12` and `tablet146`. Export with `node scripts/export-usability-reports.cjs android14 android17 xiaomi12 tablet146`. Record current results and the exact APK SHA-256 in `releases/release-verification.json`. Earlier debug-APK benches remain historical regression evidence, not results for a new APK.
3. From this portal repository, run `node scripts/stage-geraina-android.mjs`. It refuses to stage an APK whose bytes differ from the verified artifact, or an incomplete device matrix.
4. Run `npm run build`, `npm test`, and the local website verification script against a local Worker. The browser check confirms responsive layouts, the actual downloaded bytes, and the unavailable-release state.
5. Deploy the portal through its existing Cloudflare deployment workflow. Verify the live page, manifest, checksum and APK. `scripts/test-geraina-android-download.py` is a read-only public HTTP check suitable for the existing TestSprite project.

Versioned APK URLs are immutable. Keep previously published APKs available; update only `latest.json` and `SHA256SUMS.txt` to advertise the new release. Android updates must retain `com.dagangos.geraina`, the signing certificate and a higher version code. Users download and install the new APK over their existing app. A future Play release must preserve app identity and signing compatibility.

The current release requires Android 14 (API 34) or newer. The local matrix includes Android 14 and 17 phone emulators and Android 16 AOSP emulators with Xiaomi Pad 6S Pro and Samsung Ultra-size screen profiles. It does not emulate HyperOS, One UI or physical hardware. Physical printer output and provider settlement require separate validation.

## Usability update 1.1.2, 24 October 2026

Version code 4 retains the app identity and signing certificate. It fixes unreadable login input text and Suite labels, keeps the left navigation visible on wide tablets, moves the narrow-screen drawer control to the top left, and removes the extra bottom Menu tab. Category, brand and unit forms show validation, saving progress and recoverable API errors. Ordinary page text is not selectable; editable fields retain selection and copy/paste. Back dismisses the keyboard or an open panel first, then returns to the dashboard with an exit prompt; a second press within two seconds exits while retaining the login session.

Current signed-APK results are in `GerainaOS/android-app/releases/android-usability-report/`. The suite uses the prepared frontend at the production origin before deployment. Metadata writes and cashier products are intercepted fixtures; no merchant record or support message is written. A public live check verifies the advertised APK bytes and minimum Android requirement after deployment.

## Previous published release 1.1.1

Geraina **1.1.1**, version code **3**, is published at https://dagangos.com/geraina/android. The APK SHA-256 is `37b2d7cf47f2f6cfcb43a10608d9f1be4906f7ec071ce8a89090bcb6feb0008f`.

- Android phone: 24/24 checks; large-tablet matrix: 116/116 checks.
- Android unit tests: 9/9; presentation: 9/9; bridge: 9/9; signed release installation/login smoke: passed.
- Portal tests: 25/25; live browser checks: 6/6, including the actual downloaded bytes and 320/393/768/1440 px layouts.
- TestSprite `6aeabb04-2f07-46ac-ab0e-b5d7a715ae0c`, **Official Geraina Android download matches its public checksum and metadata**: **passed**. [Run](https://www.testsprite.com/dashboard/tests/52c365d6-4b9f-4b5d-a09e-b4726079328e/test/6aeabb04-2f07-46ac-ab0e-b5d7a715ae0c).
- Deployment: https://github.com/azharinoyumetv-ctrl/DagangOS/actions/runs/40080523087, release commit `74046f7`.
