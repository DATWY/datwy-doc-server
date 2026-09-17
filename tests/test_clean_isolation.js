const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testCleanIsolation() {
  const url = 'https://www.studocu.vn/vn/document/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/ly-thuyet-kien-truc-may-tinh-ktmt-1-cac-van-de-co-ban-va-hieu-suat/157160979';
  const outputPath = path.join(__dirname, 'tmp/pdf_cache/test_clean_isolation.pdf');

  console.log('Testing Clean Isolation for doc 157160979...');
  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,2000']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 2000 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));

  // Step 1: Scroll to load all pages and unblur
  console.log('Scrolling and unblurring...');
  await page.evaluate(async () => {
    const pages = Array.from(document.querySelectorAll('.pf'));
    for (let i = 0; i < pages.length; i++) {
      pages[i].scrollIntoView({ behavior: 'instant', block: 'center' });
      await new Promise(r => setTimeout(r, 100));
    }
  });

  // Step 2: Ensure all images are loaded
  console.log('Waiting for images...');
  await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll('.pf img, img.bi, .bi'));
    await Promise.all(images.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
        setTimeout(res, 3000);
      });
    }));
  });

  // Step 3: Pure DOM Isolation
  console.log('Isolating #page-container...');
  const docMetrics = await page.evaluate(() => {
    window.scrollTo(0, 0);

    // Find the container that holds all .pf
    let container = document.querySelector('#page-container');
    if (!container) {
      const firstPf = document.querySelector('.pf');
      container = firstPf ? firstPf.parentElement : null;
    }

    if (!container) {
      throw new Error('Container #page-container not found');
    }

    // Force all .page-content display: block and clean up
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

    // Extract native pf dimension
    const pf1 = document.querySelector('.pf');
    const comp = window.getComputedStyle(pf1);
    const w = parseFloat(comp.width) || 595.3;
    const h = parseFloat(comp.height) || 841.9;

    // Purify body: remove everything except container
    const newBody = document.createElement('body');
    newBody.appendChild(container);
    document.documentElement.replaceChild(newBody, document.body);

    // Remove any non-pf children inside container (e.g. banners, ads)
    Array.from(container.children).forEach(child => {
      if (!child.classList.contains('pf')) {
        child.remove();
      }
    });

    // Remove any non-page-content children inside pf (banners, overlay popups)
    document.querySelectorAll('.pf').forEach(pf => {
      Array.from(pf.children).forEach(child => {
        if (!child.classList.contains('page-content') && !child.classList.contains('pc')) {
          child.remove();
        }
      });
    });

    // Inject strict pixel-perfect stylesheet
    const style = document.createElement('style');
    style.id = 'pure-isolation-print-style';
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
      #page-container, .p2hv {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        width: ${w}px !important;
        background: transparent !important;
        border: none !important;
        position: static !important;
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
    `;
    document.head.appendChild(style);

    const pfCount = document.querySelectorAll('.pf').length;
    return {
      w,
      h,
      pfCount
    };
  });

  console.log('Doc metrics after isolation:', docMetrics);

  await page.emulateMediaType('screen');

  const pdfBuffer = await page.pdf({
    width: `${docMetrics.w}px`,
    height: `${docMetrics.h}px`,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });

  fs.writeFileSync(outputPath, pdfBuffer);
  console.log('Rendered test_clean_isolation.pdf! Size:', fs.statSync(outputPath).size);

  await browser.close();
}

testCleanIsolation().catch(console.error);
