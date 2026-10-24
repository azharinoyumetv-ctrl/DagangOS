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
        assert not any(name.endswith((".jks", "keystore.properties")) for name in package.namelist())
    checksum = requests.get(BASE + "/downloads/geraina/SHA256SUMS.txt", timeout=30)
    assert checksum.status_code == 200 and release["sha256"] in checksum.text
    for route, marker in [("privacy", "Kebijakan Privasi Geraina POS"), ("delete-account", "Minta penghapusan akun Geraina POS")]:
        document = requests.get(BASE + "/geraina/" + route, timeout=30)
        assert document.status_code == 200 and marker in document.text
    missing = requests.get(BASE + "/downloads/geraina/Geraina-POS-999.0.0.apk", timeout=30)
    assert missing.status_code == 404
    assert '<div id="root">' not in missing.text
    print(json.dumps({"status": "passed", "version": release["version"], "sha256": release["sha256"], "merchantWrites": 0}))

test_android_download_is_the_advertised_signed_package()
