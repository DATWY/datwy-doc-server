const { connect } = require('puppeteer-real-browser');
const path = require('path');

async function inspectUrl() {
  const { page, browser } = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,1000']
  });

  const url = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/bai-tap-kien-truc-may-tinh-phan-tich-ky-thuat-pipeline-va-tuan-tu/127066594?sid=626803181789525922';
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));

  const state = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      pfs: document.querySelectorAll('.pf').length,
      pageIndex: document.querySelectorAll('[data-page-index]').length,
      allImages: Array.from(document.querySelectorAll('img')).map(i => ({
        src: i.src.substring(0, 70),
        className: i.className,
        w: i.naturalWidth,
        h: i.naturalHeight
      })).slice(0, 10),
      documentWrapper: !!document.querySelector('#document-wrapper'),
      viewerWrapper: !!document.querySelector('#viewer-wrapper'),
      bodySnippet: document.body ? document.body.innerText.substring(0, 400) : ''
    };
  });

  console.log('PAGE STATE:', JSON.stringify(state, null, 2));
  await page.screenshot({ path: path.join(__dirname, '../tmp/pdf_cache/actual_page_screenshot.png') });
  console.log('Screenshot saved to server/tmp/pdf_cache/actual_page_screenshot.png');

  await browser.close();
}

inspectUrl().catch(console.error);
