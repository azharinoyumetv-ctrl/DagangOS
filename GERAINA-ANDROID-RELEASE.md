# Geraina direct Android distribution

The Android listing is `/geraina/android`; it is linked from the Geraina product page and the DagangOS footer. Google Play publication is postponed. Only the signed public APK, public release metadata and selected screenshots belong in this portal repository. Private signing files, account credentials, AABs and device logs remain outside the website assets.

## Updating the release

1. In `GerainaOS/android-app`, retain the original signing key and increment both the app version and version code. Build and verify with `scripts/Build-Release.ps1` and `scripts/Verify-Release.ps1`.
2. Run the phone bench and the `xiaomi12` / `tablet146` tablet benches in portrait and landscape. Export the phone report and run `node scripts/export-tablet-reports.cjs`. Record the passing results and signed APK SHA-256 in `releases/release-verification.json`.
3. From this portal repository, run `node scripts/stage-geraina-android.mjs`. It refuses to stage an APK whose bytes differ from the verified artifact, or an incomplete device matrix.
4. Run `npm run build`, `npm test`, and the local website verification script against a local Worker. The browser check confirms responsive layouts, the actual downloaded bytes, and the unavailable-release state.
5. Deploy the portal through its existing Cloudflare deployment workflow. Verify the live page, manifest, checksum and APK. `scripts/test-geraina-android-download.py` is a read-only public HTTP check suitable for the existing TestSprite project.

Versioned APK URLs are immutable. Keep previously published APKs available; update only `latest.json` and `SHA256SUMS.txt` to advertise the new release. Android updates must retain `com.dagangos.geraina`, the signing certificate and a higher version code. Users download and install the new APK over their existing app. A future Play release must preserve app identity and signing compatibility.

The local Android matrix uses Android 16 AOSP emulators with Xiaomi Pad 6S Pro and Samsung Ultra-size screen profiles. It does not emulate HyperOS, One UI or physical hardware. Physical printer output, provider settlement and older Android versions require separate validation.
