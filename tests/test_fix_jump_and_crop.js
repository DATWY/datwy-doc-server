const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testFixJumpAndCrop() {
  const url = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/ly-thuyet-kien-truc-may-tinh-ktmt-1-cac-van-de-co-ban-va-hieu-suat/157160979';
  const outputPath = path.join(__dirname, 'tmp/pdf_cache/test_fix_jump_and_crop.pdf');

  console.log('Testing Fix for Jump and Crop...');
  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,2000']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));

  // Progressive scroll
  await page.evaluate(async () => {
    const pages = Array.from(document.querySelectorAll('.pf'));
    for (let i = 0; i < pages.length; i++) {
      pages[i].scrollIntoView({ behavior: 'instant', block: 'center' });
      await new Promise(r => setTimeout(r, 100));
    }
  });

  // Images loaded
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('.pf img, img.bi, .bi'));
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
        setTimeout(res, 3000);
      });
    }));
  });

  // Zero-offset positioning and removal of all junk
  const info = await page.evaluate(() => {
    window.scrollTo(0, 0);

    // 1. Remove all fixed/absolute elements outside .pf (including #sidebar-toggle-button)
    document.querySelectorAll('*').forEach(el => {
      if (!el.closest('.pf')) {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed') {
          try { el.remove(); } catch(e) {}
        }
      }
    });

    // 2. Remove all headers, sidebars, banners, buttons
    document.querySelectorAll(`
      #sidebar, #sidebar-wrapper, #sidebar-toggle-button,
      header, footer, nav, aside, [class*="Sidebar"], [class*="sidebar"],
      [class*="Topbar"], [class*="Header"], [class*="header"],
      [class*="summary"], [class*="Summary"], [class*="Banner"], [class*="banner"],
      [class*="FloatingComponent"], [class*="DocumentFooter"], [class*="Metadata"],
      [class*="CourseInfo"], [class*="ClarificationBanner"], [class*="Paywall"],
      [class*="paywall"], #onetrust-consent-sdk, .adsbox
    `).forEach(el => {
      try { el.remove(); } catch(e) {}
    });

    // 3. Force page contents visible
    document.querySelectorAll('.page-content').forEach(pc => {
      pc.style.display = 'block';
      pc.style.visibility = 'visible';
      pc.style.opacity = '1';
    });

    document.querySelectorAll('.blurred, [class*="blur"]').forEach(el => {
      el.classList.remove('blurred', 'blurred-container', 'blurred_page');
      el.style.filter = 'none';
      el.style.opacity = '1';
      el.style.visibility = 'visible';
    });

    // 4. Measure pf
    const pf1 = document.querySelector('.pf');
    const comp = window.getComputedStyle(pf1);
    const w = parseFloat(comp.width) || 595.3;
    const h = parseFloat(comp.height) || 841.9;

    // 5. Inject styles: Force #page-container and wrappers to (0,0) and zero margins
    const style = document.createElement('style');
    style.id = 'zero-offset-print-style';
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
        width: ${w}px !important;
        background: #fff !important;
        overflow: visible !important;
      }
      #__next, #main-wrapper, #viewer-wrapper, #document-wrapper,
      #page-container-wrapper, #page-container, .p2hv, [class*="descaler"],
      [class*="pageContentWrapper"], [class*="wrapper"] {
        margin: 0 !important;
        padding: 0 !important;
        width: ${w}px !important;
        max-width: ${w}px !important;
        position: static !important;
        transform: none !important;
        background: transparent !important;
        border: none !important;
        overflow: visible !important;
      }
      .pf {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        width: ${w}px !important;
        height: ${h}px !important;
        position: relative !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: page !important;
        break-after: page !important;
        box-shadow: none !important;
        border: none !important;
        background: #fff !important;
        overflow: hidden !important;
      }
      .page-content {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      .pc {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      .bi, img {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        filter: none !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      .t {
        visibility: visible !important;
        opacity: 1 !important;
      }
      #sidebar-toggle-button, [class*="SidebarToggleButton"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    const pf1Rect = pf1.getBoundingClientRect();
    return {
      w,
      h,
      pf1Top: pf1Rect.top,
      pf1Left: pf1Rect.left,
      totalPages: document.querySelectorAll('.pf').length
    };
  });

  console.log('Positioning info:', info);

  await page.emulateMediaType('screen');

  const pdfBuffer = await page.pdf({
    width: `${info.w}px`,
    height: `${info.h}px`,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });

  fs.writeFileSync(outputPath, pdfBuffer);
  console.log(`Rendered ${outputPath}! Size: ${fs.statSync(outputPath).size} bytes`);

  await browser.close();
}

testFixJumpAndCrop().catch(console.error);
