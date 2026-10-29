import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..');
const app=join(root,'DapurOS'),release=JSON.parse(readFileSync(join(app,'docs/ANDROID-RELEASE-VERIFICATION.json'),'utf8'));
assert.equal(release.status,'passed-candidate');
assert.equal(release.package.applicationId,'com.dagangos.dapuros');
assert.equal(release.package.version,'1.0.0');
assert.equal(release.package.minimumSdk,34);
assert.notEqual(release.package.signingCertificateSha256,'52e14a39a7da4f5f528838f33602860e35960373070a6132d08f682487494ec8');
assert.equal(release.browser.failed,0);assert.ok(release.browser.passed>=24);
assert.equal(release.backend.failed,0);assert.ok(release.backend.contractsPassed>=215);assert.ok(release.backend.realTransactionPassed>=12);
assert.equal(release.package.lintErrors,0);assert.equal(release.package.privateCredentialScan,'passed');
for(const profile of ['phone','xiaomi-landscape','samsung-landscape']){
  const row=release.installed.find(row=>row.profile===profile);assert.equal(row?.status,'passed');assert.equal(row.apkSha256,release.package.apkSha256);assert.equal(row.checks.length,7);
}
const filename=`DapurOS-POS-${release.package.version}.apk`,source=join(app,'android-app/releases',filename),bytes=readFileSync(source);
const sha256=createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,release.package.apkSha256);
const destination=join(root,'public/downloads/dapuros');mkdirSync(destination,{recursive:true});
const target=join(destination,filename);if(existsSync(target))assert.equal(createHash('sha256').update(readFileSync(target)).digest('hex'),sha256,'Versioned APKs are immutable');
copyFileSync(source,target);
const metadata={version:release.package.version,versionCode:release.package.versionCode,applicationId:release.package.applicationId,
downloadUrl:`/downloads/dapuros/${filename}`,bytes:bytes.length,sha256,minimumAndroid:'14.0',minimumSdk:34,supportedAbis:['arm64-v8a','x86_64'],verifiedAt:release.verifiedAt,signingCertificateSha256:release.package.signingCertificateSha256};
writeFileSync(join(destination,'latest.json'),JSON.stringify(metadata,null,2)+'\n');writeFileSync(join(destination,'SHA256SUMS.txt'),`${sha256}  ${filename}\n`);
const images=join(root,'public/screenshots/dapuros');mkdirSync(images,{recursive:true});
for(const [profile,name,output] of [
['phone','Cash-takeaway-saved-durably-before-receipt-with-tax.png','phone-checkout.png'],
['xiaomi-landscape','Cash-takeaway-saved-durably-before-receipt-with-tax.png','tablet-checkout.png'],
['samsung-landscape','Installed-identity-subscription-expiry-and-support-entry-agree.png','tablet-about.png']]){
 copyFileSync(join(app,'android-app/app/build/reports/final-native',profile,'screenshots',name),join(images,output));
}
console.log(`Staged DapurOS ${metadata.version}: ${bytes.length} bytes, SHA-256 ${sha256}. Publication remains a separate action.`);
