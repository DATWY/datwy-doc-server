const { connect } = require('puppeteer-real-browser');

async function inspectDoc157160979() {
  const url = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/ly-thuyet-kien-truc-may-tinh-ktmt-1-cac-van-de-co-ban-va-hieu-suat/157160979';
  console.log('Inspecting doc 157160979 dimensions and structure...');

  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,2000']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));

  const docInfo = await page.evaluate(() => {
    const pfList = Array.from(document.querySelectorAll('.pf'));
    const pf1 = pfList[0];
    const compPf1 = pf1 ? window.getComputedStyle(pf1) : null;
    const pc1 = pf1 ? pf1.querySelector('.pc') : null;
    const compPc1 = pc1 ? window.getComputedStyle(pc1) : null;
    const img1 = pf1 ? pf1.querySelector('img') : null;

    // Check all pf dimensions to see if any differ
    const dimensions = pfList.slice(0, 5).map((p, idx) => {
      const c = window.getComputedStyle(p);
      const img = p.querySelector('img');
      return {
        page: idx + 1,
        className: p.className,
        offsetWidth: p.offsetWidth,
        offsetHeight: p.offsetHeight,
        computedW: c.width,
        computedH: c.height,
        naturalImgW: img ? img.naturalWidth : 0,
        naturalImgH: img ? img.naturalHeight : 0,
        imgSrc: img ? img.src.substring(0, 60) : 'none'
      };
    });

    return {
      totalPf: pfList.length,
      dimensions,
      // Check document stylesheets for .w0, .h0 or similar classes
      pfClasses: pf1 ? pf1.className : '',
      pcClasses: pc1 ? pc1.className : ''
    };
  });

  console.log('Doc 157160979 Info:', JSON.stringify(docInfo, null, 2));

  await browser.close();
}

inspectDoc157160979().catch(console.error);
