import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
const require=createRequire(import.meta.url),{chromium}=require('../DapurOS/frontend/node_modules/playwright')
const base=process.env.DAPUROS_WEBSITE_BASE_URL||'http://127.0.0.1:8799',out=resolve('tmp/dapuros-android-website')
mkdirSync(out,{recursive:true})
mkdirSync(join(out,'downloads'),{recursive:true})
const expected=JSON.parse(readFileSync('public/downloads/dapuros/latest.json','utf8')),checks=[],errors=[]
const browser=await chromium.launch({channel:'chrome',headless:true,downloadsPath:join(out,'downloads')})
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true,reducedMotion:'reduce'})
  page.on('pageerror',error=>errors.push(error.message))
  for(const width of [1440,768,393,320]){
    await page.setViewportSize({width,height:1000});await page.goto(`${base}/dapuros`)
    const android=page.locator('.dapuros-platforms a[href="/dapuros/android"]');await android.scrollIntoViewIfNeeded();await android.click()
    assert.equal(new URL(page.url()).pathname,'/dapuros/android')
    await page.waitForFunction(()=>document.querySelector('[data-download-link]').getAttribute('aria-disabled')!=='true')
    for(const img of await page.locator('main img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(image=>image.decode())}
    await page.evaluate(()=>scrollTo(0,0))
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Android listing fits ${width}px`)
    assert.match(await page.locator('[data-release-version]').textContent(),new RegExp(expected.version.replaceAll('.','\\.')))
    const links=await page.locator('[data-download-link]').evaluateAll(items=>items.map(link=>link.getAttribute('href')))
    assert.deepEqual(links,[expected.downloadUrl,expected.downloadUrl])
    assert.equal(await page.locator('.hero [data-download-link]').count(),1)
    assert.equal(await page.locator('.release-card [data-download-link]').count(),1)
    await page.screenshot({path:join(out,`listing-${width}.png`),fullPage:true})
    checks.push(`Homepage Android link reaches the verified download page and fits ${width}px`)
  }
  const downloadEvent=page.waitForEvent('download');await page.locator('[data-download-link]').first().click()
  const download=await downloadEvent,path=join(out,download.suggestedFilename());await download.saveAs(path)
  const bytes=readFileSync(path);assert.equal(bytes.length,expected.bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256)
  checks.push('Clicking Download saves the exact verified APK bytes')
  await page.route('**/downloads/dapuros/latest.json',route=>route.fulfill({status:503,body:'Unavailable'}))
  await page.reload();await page.locator('[data-download-status].error').waitFor()
  assert.equal(await page.locator('[data-download-link][aria-disabled="true"]').count(),2)
  checks.push('Unavailable release metadata leaves download buttons safely disabled')
  assert.deepEqual(errors,[])
  writeFileSync(join(out,'verification.json'),JSON.stringify({status:'passed',base,version:expected.version,checks},null,2))
  console.log(JSON.stringify({status:'passed',checks},null,2))
}finally{await browser.close()}
