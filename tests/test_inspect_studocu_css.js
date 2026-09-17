const { connect } = require('puppeteer-real-browser');

async function inspectStudocuCss() {
  const docUrl = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/bai-tap-kien-truc-may-tinh-phan-tich-ky-thuat-pipeline-va-tuan-tu/127066594';
  console.log('Inspecting native Studocu styles and dimensions...');

  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 1800 });
  await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  for (let i = 0; i < 30; i++) {
    const pfCount = await page.evaluate(() => document.querySelectorAll('.pf').length);
    if (pfCount > 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  await new Promise(r => setTimeout(r, 2000));

  const styles = await page.evaluate(() => {
    const pf = document.querySelector('.pf');
    const pc = document.querySelector('.pc');
    const bi = document.querySelector('.bi, .pf img');
    const t = document.querySelector('.t');

    const getStyles = (el) => {
      if (!el) return null;
      const s = window.getComputedStyle(el);
      return {
        width: s.width,
        height: s.height,
        position: s.position,
        transform: s.transform,
        display: s.display,
        overflow: s.overflow,
        margin: s.margin,
        padding: s.padding,
        top: s.top,
        left: s.left
      };
    };

    return {
      pfClass: pf ? pf.className : '',
      pfStyles: getStyles(pf),
      pcClass: pc ? pc.className : '',
      pcStyles: getStyles(pc),
      biStyles: getStyles(bi),
      tStyles: getStyles(t),
      naturalImgWidth: bi ? bi.naturalWidth : 0,
      naturalImgHeight: bi ? bi.naturalHeight : 0,
      imgSrc: bi ? bi.src : ''
    };
  });

  console.log('Native Studocu Structure:', JSON.stringify(styles, null, 2));
  await browser.close();
}

inspectStudocuCss().catch(console.error);
