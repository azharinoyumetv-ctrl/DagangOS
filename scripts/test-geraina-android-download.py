"""Read-only public release verification for TestSprite and local execution."""
import hashlib
import io
import json
import re
import zipfile
import requests

BASE = "https://dagangos.com"

def test_android_download_is_the_advertised_signed_package():
    listing = requests.get(BASE + "/geraina/android", timeout=30)
    assert listing.status_code == 200
    assert "Geraina untuk Android" in listing.text
    assert 'data-download-link' in listing.text
    assert '<div id="root">' not in listing.text
    metadata = requests.get(BASE + "/downloads/geraina/latest.json", timeout=30)
    assert metadata.status_code == 200
    release = metadata.json()
    assert re.fullmatch(r"\d+\.\d+\.\d+", release["version"])
    assert release["applicationId"] == "com.dagangos.geraina"
    assert release["minimumSdk"] == 34 and release["minimumAndroid"] == "14.0"
    assert set(release["supportedAbis"]) == {"arm64-v8a", "x86_64"}
    assert release["downloadUrl"] == "/downloads/geraina/Geraina-POS-" + release["version"] + ".apk"
    apk = requests.get(BASE + release["downloadUrl"], timeout=60)
    assert apk.status_code == 200
    assert apk.headers["Content-Type"].split(";")[0] == "application/vnd.android.package-archive"
    assert 'attachment;' in apk.headers["Content-Disposition"]
    assert len(apk.content) == release["bytes"]
    assert hashlib.sha256(apk.content).hexdigest() == release["sha256"]
    with zipfile.ZipFile(io.BytesIO(apk.content)) as package:
        assert "AndroidManifest.xml" in package.namelist()
        assert "classes.dex" in package.namelist()
        assert "assets/frontend/bundle-manifest.json" in package.namelist()
        assert "assets/device-features.js" in package.namelist()
        device_api = package.read("assets/device-features.js").decode("utf-8")
        assert "appInfo" in device_api and "target" in device_api and "checkForUpdates" in device_api
        assert "res/xml/update_paths.xml" in package.namelist()
        bundle = json.loads(package.read("assets/frontend/bundle-manifest.json"))
        main_scripts = [row["path"] for row in bundle["files"] if re.fullmatch(r"static/js/main\.[^/]+\.js", row["path"])]
        assert len(main_scripts) == 1
        javascript = package.read("assets/frontend/" + main_scripts[0]).decode("utf-8")
        for feature in ("about-version", "about-check-updates", "qris-integration", "qris-byok", "pf-scan-barcode", "login-password-toggle", "register-password-toggle", "GerainaRouter"):
            assert feature in javascript, "Missing Android quality fix: " + feature
        for row in bundle["files"]:
            if row["path"].endswith((".html", ".css")):
                text = package.read("assets/frontend/" + row["path"]).decode("utf-8")
                assert not any(host in text for host in ("fonts.googleapis.com", "fonts.gstatic.com", "api.fontshare.com", "posthog.init"))
        assert any("barhopper" in name for name in package.namelist())
        assert not any(name.endswith((".jks", "keystore.properties")) for name in package.namelist())
    checksum = requests.get(BASE + "/downloads/geraina/SHA256SUMS.txt", timeout=30)
    assert checksum.status_code == 200 and release["sha256"] in checksum.text
    for route, marker in [("privacy", "Kebijakan Privasi Geraina POS"), ("delete-account", "Minta penghapusan akun Geraina POS")]:
        document = requests.get(BASE + "/geraina/" + route, timeout=30)
        assert document.status_code == 200 and marker in document.text
    missing = requests.get(BASE + "/downloads/geraina/Geraina-POS-999.0.0.apk", timeout=30)
    assert missing.status_code == 404
    assert '<div id="root">' not in missing.text
    protected_sync = requests.post(BASE + "/api/offline/orders", headers={"X-DagangOS-Module": "geraina"}, json={}, timeout=30)
    assert protected_sync.status_code == 401, "Offline sale synchronization must require authentication"
    setup_status = requests.get(BASE + "/api/integrations/qris/status", timeout=30)
    assert setup_status.status_code == 401, "Merchant QRIS configuration must require authentication"
    print(json.dumps({"status": "passed", "version": release["version"], "sha256": release["sha256"], "merchantWrites": 0}))

test_android_download_is_the_advertised_signed_package()
