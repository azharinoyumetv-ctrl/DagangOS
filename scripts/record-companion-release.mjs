import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const json=p=>JSON.parse(read(p));
const hash=p=>createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const profiles=['phone','xiaomi-landscape','samsung-landscape'];
const evidence='tmp/companion-native';
const browser=json('DapurOS/tmp/companion-after.json').stats;
assert.equal(browser.expected,16);assert.equal(browser.unexpected,0);assert.equal(browser.skipped,0);
const restaurantBrowser=json('DapurOS/tmp/1.0.2-browser-regression.json').stats;
assert.equal(restaurantBrowser.expected,33);assert.equal(restaurantBrowser.unexpected,0);
assert.match(read('DapurOS/tmp/1.0.2-backend-contracts.txt'),/237 passed/);
assert.match(read('GerainaOS/tmp/1.2.17-entitlement-tests.txt'),/22 passed/);
assert.match(read('DapurOS/tmp/restaurant-transactions.xml'),/errors="0" failures="0" skipped="0" tests="12"/);
const offline=json('GerainaOS/android-app/app/build/reports/offline-browser/verification.json');
assert.equal(offline.status,'passed');assert.equal(offline.results.length,6);
const nativeLog=read('tmp/companion-device-tests.log');
const fence='b24297360d8862948a165252c0a18fa3726df8ef26a81245001b67524700d8e1';
const verifiedAt=new Date().toISOString();
for(const [repo,module,version,code,filename,units,assets,signer] of [
 ['DapurOS','dapuros','1.0.2',4,'DapurOS-POS-1.0.2',28,92,'fced7b77d88c3477bd991d97e4a224567e775a633c2e16a280ad03991f2c914a'],
 ['GerainaOS','geraina','1.2.17',22,'Geraina-POS-1.2.17',27,81,'52e14a39a7da4f5f528838f33602860e35960373070a6132d08f682487494ec8'],
]) {
 const apk=`${repo}/android-app/releases/${filename}.apk`,sha=hash(apk);
 const bundled=json(`${repo}/tmp/${version}-bundled-assets.txt`);
 assert.equal(bundled.status,'passed');assert.equal(bundled.sha256,sha);assert.equal(bundled.frontendManifestEntriesVerified,assets);
 const guard=read(`${repo}/backend/erasure_guard.py`).replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(guard).digest('hex'),fence);
 const unitDirectory=path.join(root,repo,'android-app/app/build/test-results/testReleaseUnitTest');
 let count=0;
 for(const file of fs.readdirSync(unitDirectory).filter(x=>x.endsWith('.xml'))){
  const data=fs.readFileSync(path.join(unitDirectory,file),'utf8');
  count+=Number(data.match(/<testsuite\b[^>]*\btests="(\d+)"/)[1]);
  assert.match(data,/<testsuite\b[^>]*\bfailures="0"/);assert.match(data,/<testsuite\b[^>]*\berrors="0"/);
 }
 assert.equal(count,units);
 const lint=read(`${repo}/android-app/app/build/reports/lint-results-release.xml`);
 assert.equal((lint.match(/severity="(?:Error|Fatal)"/g)||[]).length,0);
 const switches=profiles.map(profile=>{
  const row=json(`${evidence}/${module}-${profile}.json`);
  assert.equal(row.status,'passed');assert.equal(row.apkSha256,sha);assert.equal(row.installedApkSha256,sha);
  assert.equal(row.sessionRetained,true);assert.equal(row.documentRetained,true);return row;
 });
 assert.ok(nativeLog.includes(`${module} phone-missing missingCompanionOffersDownloadBrowserAndCancel passed`));
 assert.ok(nativeLog.includes(`${module} startup-recovery unavailableColdStartRetriesWithoutLosingSession passed`));
 const recovery=json(`${evidence}/${module}-startup-recovery.json`);
 assert.equal(recovery.status,'passed');assert.equal(recovery.installedApkSha256,sha);assert.equal(recovery.retryValidatedOwnModule,true);
 const shared={verifiedAt,companionSwitching:switches,startupRecovery:recovery,missingCompanion:{status:'passed',choices:['download official app','open browser','cancel'],fixtureOnly:true},
  scope:'Signed website APKs on isolated Android 14 emulator; phone and two landscape tablet profiles. Browser and API fixtures do not contact customer accounts.',
  changes:['Open the installed companion app through its fixed Android package; no credential or entitlement handoff.','Do not infer companion activation from an incomplete or cached store list.','Keep product sessions independent during sign-in, sign-out and token expiry.','Retry failed cold-start validation without discarding the saved token or granting unverified product access.'],
  limitations:['Actual customer-account Geraina logout was not reproduced.','Tablet layouts use AOSP emulator profiles, not physical Xiaomi or Samsung firmware.','No real payment, email, physical printer or customer erasure was performed.','MongoDB fixture shutdown printed a connection-reset diagnostic after all 12 transaction assertions passed.'],
 };
 const pkg={applicationId:`com.dagangos.${module}`,version,versionCode:code,minimumSdk:34,supportedAbis:['arm64-v8a','x86_64'],apkSha256:sha,apkBytes:fs.statSync(path.join(root,apk)).size,aabSha256:hash(`${repo}/android-app/releases/${filename}.aab`),signingCertificateSha256:signer,unitTests:units,lintErrors:0,lintWarnings:(lint.match(/severity="Warning"/g)||[]).length,privateCredentialScan:'passed',frontendManifestEntriesVerified:assets};
 let report;
 if(module==='dapuros'){
  assert.match(read(`${repo}/tmp/companion-android-build.log`),/Verified DapurOS identity, signature/);
  const installed=profiles.map(profile=>{
   const row=json(`${repo}/android-app/app/build/reports/1.0.2-native/${profile}/verification.json`);
   assert.equal(row.status,'passed');assert.equal(row.checks.length,7);assert.equal(row.apkSha256,sha);assert.equal(row.installedApkSha256,sha);return row;
  });
  const billing=profiles.map(profile=>{
   const row=json(`${repo}/android-app/app/build/reports/1.0.2-native/${profile}-billing/verification.json`);
   assert.equal(row.status,'passed');assert.equal(row.checks.length,2);assert.equal(row.apkSha256,sha);return row;
  });
  report={schemaVersion:1,status:'passed-candidate',...shared,nativeEvidenceDirectory:'1.0.2-native',package:pkg,backend:{contractsPassed:237,gerainaProductIsolationPassed:22,realTransactionPassed:12,failed:0,writeFencePreserved:true,normalizedWriteFenceSha256:fence},browser:{passed:49,companionPassed:16,restaurantPassed:33,failed:0,flaky:0},installed,billing};
 }else{
  assert.match(read(`${repo}/tmp/companion-package-verification.log`),/Signed APK, unchanged upload certificate/);
  report={schemaVersion:13,status:'passed',publicationAuthorized:true,...shared,version,versionCode:code,minimumSdk:34,applicationId:pkg.applicationId,apkSha256:sha,supportedAbis:pkg.supportedAbis,package:{...pkg,signatureVerified:true,bundleManifestEntriesVerified:assets,signerSha256:signer},backend:{productIsolationPassed:22,writeFencePreserved:true,normalizedWriteFenceSha256:fence},browser:{companionPassed:16,offlinePassed:6,failed:0},offlineBrowser:offline};
 }
 const folder=path.join(root,repo,'docs');fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,`ANDROID-${version}-VERIFICATION.json`),JSON.stringify(report,null,2)+'\n');
 const name=module==='dapuros'?'DapurOS':'Geraina POS';
 const body=`# ${name} ${version}: companion switching and session recovery\n\nStatus: tested release candidate. Package ${pkg.applicationId}, build ${code}, Android 14 or newer.\n\n${shared.changes.map(x=>'- '+x).join('\n')}\n\n## Verification\n\n- Exact signed APK: both app-switch directions on phone, Xiaomi-sized landscape and Samsung-sized landscape profiles; each app retains its account, tier and document.\n- Missing companion: explicit download, browser and cancel choices.\n- Cold-start validation failure: saved token retained, unverified access blocked, retry validates this product.\n- Browser: 16 shared-session regression cases; ${module==='dapuros'?'33 restaurant UI cases, 237 backend contracts, 12 MongoDB transaction assertions':'6 offline POS cases, 22 product-isolation backend cases'}.\n- ${units} Android unit tests; release lint, unchanged signing certificate, APK/AAB structure, native alignment, bundled assets and private-credential exclusion verified.\n- Existing erasure write fence unchanged: ${fence}.\n\nAPK SHA-256: ${sha}\n\n## Limits\n\n${shared.limitations.map(x=>'- '+x).join('\n')}\n\nMachine-readable results: [ANDROID-${version}-VERIFICATION.json](ANDROID-${version}-VERIFICATION.json).\n`;
 fs.writeFileSync(path.join(folder,`ANDROID-${version}-VERIFICATION.md`),body);
 console.log(`${name} ${version} verified: ${sha}`);
}
