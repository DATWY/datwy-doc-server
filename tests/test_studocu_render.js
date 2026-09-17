const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testStudocuRender() {
  const docUrl = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/bai-tap-kien-truc-may-tinh-phan-tich-ky-thuat-pipeline-va-tuan-tu/127066594';
  const outputPath = path.join(__dirname, 'tmp/pdf_cache/test_studocu.pdf');

  console.log('Connecting to Studocu document:', docUrl);
  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,2000']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000, deviceScaleFactor: 2 });

  await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for Cloudflare Turnstile to solve and document to load
  console.log('Waiting for Cloudflare Turnstile & document to hydrate...');
  for (let i = 0; i < 30; i++) {
    const title = await page.title();
    const pfCount = await page.evaluate(() => document.querySelectorAll('.pf, #document-wrapper, #viewer-wrapper').length);
    console.log(`[Wait ${i + 1}s] Title: "${title}" | Elements found: ${pfCount}`);

    if (!title.includes('Just a moment') && !title.includes('Security') && pfCount > 0) {
      console.log('Turnstile passed and document wrapper found!');
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  await new Promise(r => setTimeout(r, 3000));

  // Inspect document
  const docInfo = await page.evaluate(() => {
    const pfList = Array.from(document.querySelectorAll('.pf'));
    return {
      title: document.title,
      pfCount: pfList.length,
      firstPfHtml: pfList[0] ? pfList[0].outerHTML.substring(0, 400) : 'none'
    };
  });

  console.log('Document Info:', docInfo);

  await browser.close();
}

testStudocuRender().catch(console.error);
