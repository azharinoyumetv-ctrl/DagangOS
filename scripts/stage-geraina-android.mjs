import assert from 'node:assert/strict'
import { readFileSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
const root=resolve(import.meta.dirname,'..'),android=join(root,'GerainaOS/android-app'),releases=join(android,'releases')
const verification=JSON.parse(readFileSync(join(releases,'release-verification.json'),'utf8'))
assert.match(verification.version,/^\d+\.\d+\.\d+$/)
assert.equal(verification.applicationId,'com.dagangos.geraina')
assert.equal(verification.androidEmulator.passed,24)
const tablets=JSON.parse(readFileSync(join(releases,'android-tablet-report/matrix.json'),'utf8'))
assert.equal(tablets.status,'passed');assert.equal(tablets.matrix.length,4)
assert.ok(tablets.matrix.every(row=>row.passed===29))
const filename=`Geraina-POS-${verification.version}.apk`,source=join(releases,filename),bytes=readFileSync(source)
const hash=createHash('sha256').update(bytes).digest('hex')
assert.equal(hash,verification.apkSha256,'Only the verified signed APK can be staged')
const destination=join(root,'public/downloads/geraina'),images=join(root,'public/assets/geraina-android')
mkdirSync(destination,{recursive:true});mkdirSync(images,{recursive:true})
copyFileSync(source,join(destination,filename))
copyFileSync(join(releases,'android-test-report/modern-dashboard-matches-live-data-and-fits-the-phone.png'),join(images,'phone-dashboard.png'))
const tablet=tablets.matrix.find(row=>row.profile==='xiaomi12'&&row.orientation==='landscape')
copyFileSync(join(releases,'android-tablet-report',tablet.screenshot),join(images,'tablet-landscape.png'))
const manifest={version:verification.version,versionCode:verification.versionCode,applicationId:verification.applicationId,downloadUrl:`/downloads/geraina/${filename}`,bytes:bytes.length,sha256:hash,minimumAndroid:'7.0',minimumSdk:24,verifiedAt:verification.verifiedAt,signingCertificateSha256:'52e14a39a7da4f5f528838f33602860e35960373070a6132d08f682487494ec8'}
writeFileSync(join(destination,'latest.json'),JSON.stringify(manifest,null,2)+'\n')
writeFileSync(join(destination,'SHA256SUMS.txt'),`${hash}  ${filename}\n`)
console.log(`Staged verified Geraina ${manifest.version}: ${bytes.length} bytes, SHA-256 ${hash}`)
