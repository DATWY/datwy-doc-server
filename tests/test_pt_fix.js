const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testFinalPixelPerfect() {
  const url = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/ly-thuyet-kien-truc-may-tinh-ktmt-1-cac-van-de-co-ban-va-hieu-suat/157160979';
  const outputPath = path.join(__dirname, 'tmp/pdf_cache/test_pt_fix.pdf');

  console.log('Testing Final Pixel Perfect Render for doc 157160979...');
  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,2000']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));

  const result = await page.evaluate(async () => {
    // 1. Remove all junk, sidebars, toggle buttons, banners, popups
    document.querySelectorAll(`
      header, footer, nav, aside, #sidebar, #sidebar-wrapper, #sidebar-toggle-button,
      [class*="Sidebar"], [class*="sidebar"], [class*="DocumentFooter"],
      [class*="FloatingComponent"], [class*="GetMoreAiStudyHelp"],
      [class*="MobileAppBanner"], #onetrust-consent-sdk, .banner-wrapper,
      [class*="ClarificationBanner"], [class*="Paywall"], [class*="paywall"],
      [class*="summaryWrapper"], [class*="AiSummary"], [class*="aiSummary"],
      [class*="Summary"], .document-viewer-banner, [class*="Metadata"],
      [class*="CourseInfo"], [class*="Topbar"], .adsbox
    `).forEach(el => {
      try { el.remove(); } catch(e) {}
    });

    // Remove any remaining fixed elements outside .pf
    document.querySelectorAll('*').forEach(el => {
      if (!el.closest('.pf')) {
        const comp = window.getComputedStyle(el);
        if (comp.position === 'fixed') {
          try { el.remove(); } catch(e) {}
        }
      }
    });

    // 2. Unblur all elements
    const unblur = () => {
      document.querySelectorAll('.blurred, .blurred-container, .blurred_page, [class*="blur"], [class*="blurred"]').forEach(el => {
        el.classList.remove('blurred', 'blurred-container', 'blurred_page');
        el.style.filter = 'none';
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      });

      document.querySelectorAll('.pf, .page-content, .pc, .bi, img').forEach(el => {
        el.style.filter = 'none';
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      });
    };

    unblur();

    // 3. Scroll all pages
    const pages = Array.from(document.querySelectorAll('.pf'));
    for (let i = 0; i < pages.length; i++) {
      pages[i].scrollIntoView({ behavior: 'instant', block: 'center' });
      unblur();
      await new Promise(r => setTimeout(r, 120));
    }

    window.scrollTo(0, 0);

    // 4. Force .page-content display: block
    document.querySelectorAll('.page-content').forEach(pc => {
      pc.style.display = 'block';
      pc.style.visibility = 'visible';
      pc.style.opacity = '1';
    });

    // 5. Get native dimensions
    const pf1 = document.querySelector('.pf');
    const comp = window.getComputedStyle(pf1);
    const w = parseFloat(comp.width) || 595.3;
    const h = parseFloat(comp.height) || 841.9;

    const style = document.createElement('style');
    style.id = 'perfect-pixel-style';
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
      #sidebar-toggle-button, [class*="SidebarToggleButton"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    return {
      pagesCount: pages.length,
      w,
      h
    };
  });

  console.log('Result from page:', result);

  // Await images to load
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

  await page.emulateMediaType('screen');

  const pdfBuffer = await page.pdf({
    width: `${result.w}px`,
    height: `${result.h}px`,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });

  fs.writeFileSync(outputPath, pdfBuffer);
  const stats = fs.statSync(outputPath);
  console.log(`Rendered ${outputPath}! Size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  await browser.close();
}

testFinalPixelPerfect().catch(console.error);
