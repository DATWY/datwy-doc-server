const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testStudocuHd() {
  const docUrl = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/bai-tap-kien-truc-may-tinh-phan-tich-ky-thuat-pipeline-va-tuan-tu/127066594?sid=626803181789525922';
  const outputPath = path.join(__dirname, '../tmp/pdf_cache/test_studocu_hd.pdf');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log('Connecting to Studocu for HD extraction test...');
  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,2200']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1600, height: 2200, deviceScaleFactor: 2 });

  await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for Turnstile
  console.log('Waiting for Turnstile & initial page load...');
  for (let i = 0; i < 30; i++) {
    const pfCount = await page.evaluate(() => document.querySelectorAll('.pf').length);
    if (pfCount > 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  await new Promise(r => setTimeout(r, 2000));

  console.log('Thoroughly unblurring and scrolling through all pages to load full HD assets...');
  const scrollResult = await page.evaluate(async () => {
    const unblur = () => {
      document.querySelectorAll(`
        .blurred, .blurred-container, .blurred_page, [class*="blur"], [class*="blurred"],
        [class*="paywall"], [class*="banner"], [class*="PremiumPageClarificationBanner"],
        [class*="ClarificationBanner"], [class*="Paywall"], [class*="FloatingComponent"],
        [class*="GetMoreAiStudyHelp"], [class*="MobileAppBanner"], #onetrust-consent-sdk,
        header, footer, nav, aside, #sidebar, [class*="DocumentFooter"]
      `).forEach(el => {
        if (el.matches('.blurred, .blurred-container, .blurred_page, [class*="blur"], [class*="blurred"]')) {
          el.classList.remove('blurred', 'blurred-container', 'blurred_page');
          el.style.filter = 'none';
          el.style.opacity = '1';
          el.style.visibility = 'visible';
        } else {
          try { el.remove(); } catch(e) {}
        }
      });

      document.querySelectorAll('.pf, .page-content, .pc, .bi, img').forEach(el => {
        el.style.filter = 'none';
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      });
    };

    unblur();

    const pages = Array.from(document.querySelectorAll('.pf'));
    // Scroll each page into view with adequate pause to trigger high-res asset loading
    for (let i = 0; i < pages.length; i++) {
      pages[i].scrollIntoView({ behavior: 'instant', block: 'center' });
      unblur();
      await new Promise(r => setTimeout(r, 250));
    }

    // Scroll back to top
    window.scrollTo(0, 0);
    return pages.length;
  });

  console.log(`Scrolled through ${scrollResult} pages. Waiting for all high-res images to complete loading...`);

  const imagesLoaded = await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll('.pf img, img.bi, .bi'));
    let loaded = 0;
    await Promise.all(images.map(img => {
      if (img.complete && img.naturalWidth > 0) {
        loaded++;
        return Promise.resolve();
      }
      return new Promise(resolve => {
        img.onload = () => { loaded++; resolve(); };
        img.onerror = () => resolve();
        setTimeout(resolve, 4000);
      });
    }));
    return { total: images.length, loaded };
  });

  console.log('Image load status:', imagesLoaded);
  await new Promise(r => setTimeout(r, 2000));

  console.log('Injecting high-fidelity print CSS (preserving native fonts, glyph positions, and vector scales)...');
  await page.evaluate(() => {
    // Get natural page width and height
    const pf1 = document.querySelector('.pf');
    const computed = window.getComputedStyle(pf1);
    const w = pf1 ? (parseFloat(computed.width) || 794) : 794;
    const h = pf1 ? (parseFloat(computed.height) || 1123) : 1123;

    const style = document.createElement('style');
    style.id = 'studocu-hd-print-style';
    style.innerHTML = `
      @page {
        size: A4 portrait;
        margin: 0;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        overflow: visible !important;
        height: auto !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      #__next, #main-wrapper, #viewer-wrapper, #document-wrapper, #page-container-wrapper, #page-container {
        display: block !important;
        margin: 0 auto !important;
        padding: 0 !important;
        overflow: visible !important;
        height: auto !important;
        position: static !important;
        background: #fff !important;
      }
      .pf {
        display: block !important;
        position: relative !important;
        page-break-after: always !important;
        page-break-inside: avoid !important;
        break-after: page !important;
        break-inside: avoid !important;
        margin: 0 auto !important;
        box-shadow: none !important;
        border: none !important;
        background: #fff !important;
        overflow: hidden !important;
        /* Preserve natural proportions */
        width: 100% !important;
        max-width: 210mm !important;
        height: 297mm !important;
      }
      .page-content, .pc {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      .bi, img {
        display: block !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        height: 100% !important;
        object-fit: fill !important;
        visibility: visible !important;
        opacity: 1 !important;
        filter: none !important;
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
  });

  console.log('Rendering high-resolution PDF...');
  await page.emulateMediaType('screen');

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });

  fs.writeFileSync(outputPath, pdfBuffer);
  const stats = fs.statSync(outputPath);
  console.log(`HD PDF Generated! Size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  await browser.close();
}

testStudocuHd().catch(console.error);
