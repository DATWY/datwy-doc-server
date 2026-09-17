const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testRenderAllPages() {
  const docId = '878092523';
  const url = `https://www.scribd.com/embeds/${docId}/content?start_page=1&view_mode=scroll`;
  const outputPath = path.join(__dirname, 'tmp/pdf_cache/test_31_pages.pdf');

  console.log('Connecting to browser for full 31-page extraction...');
  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1800']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1280, height: 1800 });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('Progressively scrolling .document_scroller to load all 31 pages...');
  const scrollResult = await page.evaluate(async () => {
    const scroller = document.querySelector('.document_scroller') || document.documentElement || document.body;
    const totalHeight = scroller.scrollHeight || 45000;
    let curr = 0;
    const step = 900;

    while (curr < totalHeight) {
      curr += step;
      scroller.scrollTo(0, curr);
      await new Promise(r => setTimeout(r, 60));
    }

    // Scroll back to top
    scroller.scrollTo(0, 0);

    const pages = document.querySelectorAll('.outer_page');
    return {
      totalHeight,
      pagesFound: pages.length
    };
  });

  console.log('Scroll finished:', scrollResult);
  await new Promise(r => setTimeout(r, 3000));

  console.log('Injecting full-page print stylesheet and cleaning DOM...');
  await page.evaluate(() => {
    // Remove bars and ads
    document.querySelectorAll(`
      .toolbar_top, .toolbar_bottom, .header, .footer, .scribd_header,
      .between_page_portal_root, .between_page_ads, .mobile_banner,
      .wrapper__bottom_banner, .wrapper__between_pages_ad,
      [class*="paywall"], [class*="banner"], [class*="ad_"]
    `).forEach(el => el.remove());

    // Make all blurred pages crystal clear
    document.querySelectorAll('.blurred_page, .page_missing').forEach(el => {
      el.classList.remove('blurred_page', 'page_missing');
    });

    const style = document.createElement('style');
    style.id = 'print-fix-style';
    style.innerHTML = `
      @page {
        size: auto;
        margin: 0mm;
      }
      html, body {
        height: auto !important;
        overflow: visible !important;
        background: #fff !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .document_scroller, .autoscroll_wrapper, .document_column, #document_scroller, .content, .document_cell {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        position: static !important;
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        transform: none !important;
      }
      .outer_page {
        display: block !important;
        position: relative !important;
        page-break-after: always !important;
        page-break-inside: avoid !important;
        break-after: page !important;
        break-inside: avoid !important;
        margin: 0 auto !important;
        box-shadow: none !important;
        border: none !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      .outer_page .text_layer, .outer_page .text_layer span, .outer_page .text_layer div {
        color: #000 !important;
        text-shadow: none !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      .outer_page .image_layer img, .image_layer img {
        opacity: 1 !important;
        filter: none !important;
        visibility: visible !important;
      }
      .toolbar_top, .toolbar_bottom, .document_cell_separator {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  });

  console.log('Generating full multi-page PDF...');
  await page.emulateMediaType('screen'); // or print with injected styles

  const pdfBuffer = await page.pdf({
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
  });

  fs.writeFileSync(outputPath, pdfBuffer);
  const stats = fs.statSync(outputPath);
  console.log(`PDF Generated! File size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  await browser.close();
}

testRenderAllPages().catch(console.error);
