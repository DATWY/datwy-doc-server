const { connect } = require('puppeteer-real-browser');

async function inspectText() {
  const url = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/ly-thuyet-kien-truc-may-tinh-ktmt-1-cac-van-de-co-ban-va-hieu-suat/157160979';
  const connection = await connect({ headless: false, turnstile: true });
  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));

  const textInfo = await page.evaluate(() => {
    const pf1 = document.querySelector('.pf');
    const pc1 = pf1 ? pf1.querySelector('.pc') : null;
    const topElements = Array.from(pf1.children).map(c => ({
      tagName: c.tagName,
      className: c.className,
      style: c.getAttribute('style'),
      rect: c.getBoundingClientRect()
    }));

    // Find any banners
    const allBanners = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.innerText || '';
      return text.includes('Tài liệu này trình bày') && el.children.length === 0;
    }).map(el => ({
      tagName: el.tagName,
      className: el.className,
      parentClass: el.parentElement ? el.parentElement.className : '',
      rect: el.getBoundingClientRect()
    }));

    // Find text positions
    const texts = Array.from(pf1.querySelectorAll('.t'));
    const textPositions = texts.slice(0, 8).map(t => {
      const rect = t.getBoundingClientRect();
      const comp = window.getComputedStyle(t);
      return {
        text: t.innerText.substring(0, 30),
        rect: { left: rect.left, right: rect.right, width: rect.width, top: rect.top, bottom: rect.bottom },
        transform: comp.transform,
        fontSize: comp.fontSize
      };
    });

    return {
      pfRect: pf1.getBoundingClientRect(),
      topElements,
      allBanners,
      textPositions
    };
  });

  console.log('Inspection:', JSON.stringify(textInfo, null, 2));
  await browser.close();
}

inspectText().catch(console.error);
