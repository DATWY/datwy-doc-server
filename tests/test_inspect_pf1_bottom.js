const { connect } = require('puppeteer-real-browser');

async function inspectPf1Bottom() {
  const url = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/ly-thuyet-kien-truc-may-tinh-ktmt-1-cac-van-de-co-ban-va-hieu-suat/157160979';
  const connection = await connect({ headless: false, turnstile: true });
  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));

  const info = await page.evaluate(() => {
    const pf1 = document.querySelector('.pf:nth-of-type(1)');
    const pf1Comp = window.getComputedStyle(pf1);
    const pf1Height = parseFloat(pf1Comp.height);

    // Get all text lines inside pf1
    const texts = Array.from(pf1.querySelectorAll('.t')).map(t => {
      const r = t.getBoundingClientRect();
      const pfr = pf1.getBoundingClientRect();
      return {
        text: t.innerText.substring(0, 40),
        topRelToPf: r.top - pfr.top,
        bottomRelToPf: r.bottom - pfr.top,
        isOutsidePf: (r.bottom - pfr.top) > pf1Height
      };
    });

    const outsideTexts = texts.filter(t => t.isOutsidePf);
    const last3Texts = texts.slice(-5);

    return {
      pf1Height,
      totalLines: texts.length,
      last3Texts,
      outsideCount: outsideTexts.length,
      outsideTexts
    };
  });

  console.log('Pf1 text bounds:', JSON.stringify(info, null, 2));
  await browser.close();
}

inspectPf1Bottom().catch(console.error);
