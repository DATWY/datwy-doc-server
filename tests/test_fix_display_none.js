const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testFixDisplayNone() {
  const docUrl = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/bai-tap-kien-truc-may-tinh-phan-tich-ky-thuat-pipeline-va-tuan-tu/127066594';
  const outputPath = path.join(__dirname, 'tmp/pdf_cache/all_pages_visible.pdf');

  console.log('Connecting to Studocu to test all-pages visibility fix...');
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

  console.log('Scrolling all pages to hydrate images and unblurring...');
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

    // 3. Scroll through all pages
    const pages = Array.from(document.querySelectorAll('.pf'));
    for (let i = 0; i < pages.length; i++) {
      pages[i].scrollIntoView({ behavior: 'instant', block: 'center' });
      await new Promise(r => setTimeout(r, 200));
    }
  });

  // Ensure all images are loaded
  console.log('Awaiting all 25 images to load...');
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

  // Inject CSS that forces .page-content, .pc, .pf, img to be DISPLAY BLOCK !important!
  console.log('Injecting CSS with .page-content DISPLAY: BLOCK !important...');
  const metrics = await page.evaluate(() => {
    // Force every .page-content inline style
    document.querySelectorAll('.page-content').forEach(pc => {
      pc.style.display = 'block';
      pc.style.visibility = 'visible';
      pc.style.opacity = '1';
    });

    const pf1 = document.querySelector('.pf');
    const comp = window.getComputedStyle(pf1);
    const w = parseFloat(comp.width) || 612;
    const h = parseFloat(comp.height) || 792;

    const style = document.createElement('style');
    style.id = 'full-visibility-style';
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
      .page-content {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        width: 100% !important;
        height: 100% !important;
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
        visibility: visible !important;
        opacity: 1 !important;
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

    // Verify how many .page-content are visible
    const pages = Array.from(document.querySelectorAll('.pf'));
    const visReport = pages.map((p, idx) => {
      const pc = p.querySelector('.page-content');
      const img = p.querySelector('img');
      return {
        p: idx + 1,
        pcDisplay: pc ? window.getComputedStyle(pc).display : 'none',
        imgW: img ? img.naturalWidth : 0
      };
    });

    return {
      w,
      h,
      total: pages.length,
      visReport
    };
  });

  console.log('Visibility Report (pages 1-10):', metrics.visReport.slice(0, 10));
  console.log('Visibility Report (pages 11-25):', metrics.visReport.slice(10, 25));

  console.log('Generating PDF...');
  await page.emulateMediaType('screen');

  const pdfBuffer = await page.pdf({
    width: `${metrics.w}px`,
    height: `${metrics.h}px`,
    printBackground: true,
    preferCSSPageSize: true,
    pageRanges: `1-${metrics.total}`,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });

  fs.writeFileSync(outputPath, pdfBuffer);
  const stats = fs.statSync(outputPath);
  console.log(`Rendered all_pages_visible.pdf! Size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  await browser.close();
}

testFixDisplayNone().catch(console.error);
