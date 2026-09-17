const { connect } = require('puppeteer-real-browser');

async function inspectOriginalPages() {
  const url = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/ly-thuyet-kien-truc-may-tinh-ktmt-1-cac-van-de-co-ban-va-hieu-suat/157160979';
  const connection = await connect({ headless: false, turnstile: true });
  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));

  const info = await page.evaluate(() => {
    const pfList = Array.from(document.querySelectorAll('.pf'));
    const pf1 = pfList[0];
    const pf2 = pfList[1];

    // Check what is at the top left of the page (around x: 200-400, y: 0-300)
    const elementsAtTop = Array.from(document.querySelectorAll('*')).filter(el => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < 300 && r.left > 200 && r.left < 500 && r.width > 10 && r.width < 100;
    }).map(el => ({
      tag: el.tagName,
      className: el.className,
      rect: el.getBoundingClientRect(),
      text: el.innerText
    }));

    return {
      pf1TextStart: pf1 ? pf1.innerText.substring(0, 200) : '',
      pf1TextEnd: pf1 ? pf1.innerText.slice(-200) : '',
      pf2TextStart: pf2 ? pf2.innerText.substring(0, 200) : '',
      pf1Rect: pf1 ? pf1.getBoundingClientRect() : null,
      pf2Rect: pf2 ? pf2.getBoundingClientRect() : null,
      elementsAtTop
    };
  });

  console.log('Original Studocu info:', JSON.stringify(info, null, 2));
  await browser.close();
}

inspectOriginalPages().catch(console.error);
