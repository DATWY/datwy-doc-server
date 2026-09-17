const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testPerfectStudocu() {
  const docUrl = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/bai-tap-kien-truc-may-tinh-phan-tich-ky-thuat-pipeline-va-tuan-tu/127066594';
  const outputPath = path.join(__dirname, 'tmp/pdf_cache/perfect_studocu.pdf');

  console.log('Connecting to Studocu for exact 1:1 original PDF export...');
  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,2000']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000, deviceScaleFactor: 2 });

  await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for Turnstile
  for (let i = 0; i < 30; i++) {
    const pfCount = await page.evaluate(() => document.querySelectorAll('.pf').length);
    if (pfCount > 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  await new Promise(r => setTimeout(r, 2000));

  console.log('Progressively unblurring and scrolling each page into view...');
  const pageMetrics = await page.evaluate(async () => {
    // 1. Remove all overlay banners and unblur classes
    const unblurAll = () => {
      document.querySelectorAll(`
        .blurred, .blurred-container, .blurred_page, [class*="blur"], [class*="blurred"],
        [class*="paywall"], [class*="banner"], [class*="PremiumPageClarificationBanner"],
        [class*="ClarificationBanner"], [class*="Paywall"], [class*="FloatingComponent"],
        [class*="GetMoreAiStudyHelp"], [class*="MobileAppBanner"], #onetrust-consent-sdk,
        header, footer, nav, aside, #sidebar, [class*="DocumentFooter"], [class*="Rating"],
        [class*="Feedback"], .banner-wrapper
      `).forEach(el => {
        if (el.matches('.blurred, .blurred-container, .blurred_page, [class*="blur"], [class*="blurred"]')) {
          el.classList.remove('blurred', 'blurred-container', 'blurred_page');
          el.style.filter = 'none';
          el.style.opacity = '1';
          el.style.visibility = 'visible';
        } else {
          try { el.remove(); } catch (e) {}
        }
      });

      document.querySelectorAll('.pf, .page-content, .pc, .bi, img').forEach(el => {
        el.style.filter = 'none';
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      });
    };

    unblurAll();

    // 2. Scroll through every page
    const pages = Array.from(document.querySelectorAll('.pf'));
    for (let i = 0; i < pages.length; i++) {
      pages[i].scrollIntoView({ behavior: 'instant', block: 'center' });
      unblurAll();
      await new Promise(r => setTimeout(r, 250));
    }

    window.scrollTo(0, 0);

    // 3. Get exact native page dimension from first page
    const pf1 = document.querySelector('.pf');
    const comp = window.getComputedStyle(pf1);
    const nativeWidth = parseFloat(comp.width) || 612;
    const nativeHeight = parseFloat(comp.height) || 792;

    return {
      count: pages.length,
      nativeWidth,
      nativeHeight
    };
  });

  console.log('Page Metrics:', pageMetrics);

  // 4. Ensure all images are 100% loaded
  console.log('Verifying all 25 images are fully loaded...');
  const imagesReady = await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('.pf img, img.bi, .bi'));
    let ready = 0;
    await Promise.all(imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) {
        ready++;
        return Promise.resolve();
      }
      return new Promise(res => {
        img.onload = () => { ready++; res(); };
        img.onerror = () => res();
        setTimeout(res, 4000);
      });
    }));
    return { total: imgs.length, ready };
  });

  console.log('Images ready:', imagesReady);
  await new Promise(r => setTimeout(r, 1500));

  // 5. Inject exact 1:1 native print stylesheet matching pageMetrics (612px x 792px)
  const nw = pageMetrics.nativeWidth;
  const nh = pageMetrics.nativeHeight;

  console.log(`Injecting exact 1:1 print CSS (${nw}px x ${nh}px)...`);
  await page.evaluate((w, h) => {
    const style = document.createElement('style');
    style.id = 'perfect-1to1-print-style';
    style.innerHTML = `
      @page {
        size: ${w}px ${h}px !important;
        margin: 0mm !important;
      }
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        width: ${w}px !important;
        height: auto !important;
        overflow: visible !important;
      }
      #__next, #main-wrapper, #viewer-wrapper, #document-wrapper, #page-container-wrapper, #page-container, .p2hv {
        display: block !important;
        width: ${w}px !important;
        max-width: ${w}px !important;
        margin: 0 auto !important;
        padding: 0 !important;
        height: auto !important;
        position: static !important;
        overflow: visible !important;
        background: transparent !important;
        transform: none !important;
      }
      .pf {
        display: block !important;
        width: ${w}px !important;
        height: ${h}px !important;
        margin: 0 auto !important;
        padding: 0 !important;
        position: relative !important;
        page-break-after: always !important;
        page-break-inside: avoid !important;
        break-after: page !important;
        break-inside: avoid !important;
        box-shadow: none !important;
        border: none !important;
        background: #fff !important;
        overflow: hidden !important;
      }
      .pc {
        display: block !important;
        width: ${w}px !important;
        height: ${h}px !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        overflow: hidden !important;
      }
      .bi, img {
        display: block !important;
        width: ${w}px !important;
        height: ${h}px !important;
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
      header, footer, nav, aside, #sidebar, [class*="DocumentFooter"], [class*="FloatingComponent"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }, nw, nh);

  console.log('Generating perfect PDF with exact width/height matching native page size...');
  await page.emulateMediaType('screen');

  const pdfBuffer = await page.pdf({
    width: `${nw}px`,
    height: `${nh}px`,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });

  fs.writeFileSync(outputPath, pdfBuffer);
  const stats = fs.statSync(outputPath);
  console.log(`SUCCESS! Perfect PDF Generated! Size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  await browser.close();
}

testPerfectStudocu().catch(console.error);
