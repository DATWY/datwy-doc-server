const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testFixMargins() {
  const docUrl = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/bai-tap-kien-truc-may-tinh-phan-tich-ky-thuat-pipeline-va-tuan-tu/127066594';
  const outputPath = path.join(__dirname, 'tmp/pdf_cache/fixed_margins.pdf');

  console.log('Connecting to Studocu...');
  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,2000']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000, deviceScaleFactor: 2 });
  await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  for (let i = 0; i < 30; i++) {
    const pfCount = await page.evaluate(() => document.querySelectorAll('.pf').length);
    if (pfCount > 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  await new Promise(r => setTimeout(r, 2000));

  console.log('Unblurring and scrolling all pages...');
  await page.evaluate(async () => {
    // 1. Remove non-document elements
    document.querySelectorAll(`
      header, footer, nav, aside, #sidebar, [class*="DocumentFooter"],
      [class*="FloatingComponent"], [class*="GetMoreAiStudyHelp"],
      [class*="MobileAppBanner"], #onetrust-consent-sdk, .banner-wrapper,
      [class*="ClarificationBanner"], [class*="Paywall"], [class*="paywall"]
    `).forEach(el => {
      try { el.remove(); } catch(e) {}
    });

    // 2. Unblur all elements
    document.querySelectorAll('.blurred, .blurred-container, .blurred_page, [class*="blur"], [class*="blurred"]').forEach(el => {
      el.classList.remove('blurred', 'blurred-container', 'blurred_page');
      el.style.filter = 'none';
      el.style.opacity = '1';
      el.style.visibility = 'visible';
    });

    // 3. Scroll each page to trigger image load
    const pages = Array.from(document.querySelectorAll('.pf'));
    for (let i = 0; i < pages.length; i++) {
      pages[i].scrollIntoView({ behavior: 'instant', block: 'center' });
      await new Promise(r => setTimeout(r, 200));
    }
    window.scrollTo(0, 0);
  });

  // Ensure images are loaded
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('.pf img, img.bi, .bi'));
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
        setTimeout(res, 4000);
      });
    }));
  });

  // Inject exact zero-margin, zero-overflow stylesheet
  console.log('Injecting ZERO-MARGIN exact size stylesheet...');
  const pageCount = await page.evaluate(() => {
    // Remove all siblings of #document-wrapper or outside page-container
    const pf1 = document.querySelector('.pf');
    const comp = window.getComputedStyle(pf1);
    const w = parseFloat(comp.width) || 612;
    const h = parseFloat(comp.height) || 792;

    const style = document.createElement('style');
    style.id = 'zero-margin-print-style';
    style.innerHTML = `
      @page {
        size: ${w}px ${h}px;
        margin: 0;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        width: ${w}px !important;
        overflow: visible !important;
      }
      #__next, #main-wrapper, #viewer-wrapper, #document-wrapper, #page-container-wrapper, #page-container {
        display: block !important;
        width: ${w}px !important;
        max-width: ${w}px !important;
        margin: 0 !important;
        padding: 0 !important;
        position: static !important;
        overflow: visible !important;
        background: transparent !important;
        border: none !important;
      }
      .pf {
        display: block !important;
        width: ${w}px !important;
        height: ${h}px !important;
        margin: 0 !important;
        padding: 0 !important;
        position: relative !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: page !important;
        break-after: page !important;
        box-shadow: none !important;
        border: none !important;
        outline: none !important;
        background: #fff !important;
        overflow: hidden !important;
      }
      .pc {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .bi, img {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        filter: none !important;
        opacity: 1 !important;
        visibility: visible !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .t {
        visibility: visible !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);

    return document.querySelectorAll('.pf').length;
  });

  console.log('Rendering PDF for', pageCount, 'pages...');
  await page.emulateMediaType('screen');

  const pfDimensions = await page.evaluate(() => {
    const pf1 = document.querySelector('.pf');
    return {
      w: pf1.offsetWidth,
      h: pf1.offsetHeight
    };
  });

  const pdfBuffer = await page.pdf({
    width: `${pfDimensions.w}px`,
    height: `${pfDimensions.h}px`,
    printBackground: true,
    preferCSSPageSize: true,
    pageRanges: `1-${pageCount}`,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });

  fs.writeFileSync(outputPath, pdfBuffer);
  const stats = fs.statSync(outputPath);
  console.log(`Rendered! Size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  await browser.close();
}

testFixMargins().catch(console.error);
