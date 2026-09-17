const { connect } = require('puppeteer-real-browser');
const path = require('path');
const fs = require('fs');

function ensureCacheDir(cacheDir) {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

/**
 * Automates Scribd document scraping and clean PDF rendering
 */
async function generateScribdPdf(docId, targetUrl, onProgress = () => {}, options = {}) {
  const cacheDir = options.cacheDir || path.join(__dirname, '../tmp/pdf_cache');
  ensureCacheDir(cacheDir);

  const outputPath = path.join(cacheDir, `scribd_${docId}.pdf`);

  const bypassCache = options.noCache === true || options.bypassCache === true;
  if (!bypassCache && fs.existsSync(outputPath)) {
    try {
      const stats = fs.statSync(outputPath);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < 15 * 60 * 1000 && stats.size > 30 * 1024) {
        let cachedPages = 0;
        try {
          const buf = fs.readFileSync(outputPath);
          const matches = buf.toString('latin1').match(/\/Type\s*\/Page\b/g);
          cachedPages = matches ? matches.length : 0;
        } catch (e) {}

        const cachedResult = {
          docId,
          platform: 'scribd',
          totalPages: cachedPages || 1,
          filePath: outputPath,
          fileSize: stats.size,
          fileSizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
          fromCache: true
        };

        onProgress({
          step: 5,
          percent: 100,
          status: 'completed',
          message: 'Tài liệu Scribd đã có sẵn trong bộ nhớ đệm!',
          data: cachedResult
        });
        return cachedResult;
      }
    } catch (e) {}
  }

  onProgress({
    step: 1,
    percent: 10,
    status: 'initializing',
    message: 'Khởi tạo môi trường tải tài liệu Scribd...'
  });

  let browser;
  let page;
  try {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,1800'
    ];

    const connectOptions = {
      headless: false,
      turnstile: true,
      args: launchArgs
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      connectOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const connection = await connect(connectOptions);

    browser = connection.browser;
    page = connection.page;

    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 1.5 });

    const embedUrl = `https://www.scribd.com/embeds/${docId}/content?start_page=1&view_mode=scroll`;

    onProgress({
      step: 2,
      percent: 20,
      status: 'connecting',
      message: 'Đang kết nối vào viewer tài liệu Scribd...'
    });

    await page.goto(embedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await new Promise(r => setTimeout(r, 3000));

    onProgress({
      step: 3,
      percent: 45,
      status: 'scrolling_pages',
      message: 'Đang tự động cuộn và tải trọn vẹn toàn bộ các trang tài liệu...'
    });

    // Progressively scroll .document_scroller to force load every single page and asset
    await page.evaluate(async () => {
      const scroller = document.querySelector('.document_scroller') || document.documentElement || document.body;
      const totalHeight = scroller.scrollHeight || 45000;
      let curr = 0;
      const step = 900;

      while (curr < totalHeight) {
        curr += step;
        scroller.scrollTo(0, curr);
        await new Promise(r => setTimeout(r, 60));
      }

      // Return to top
      scroller.scrollTo(0, 0);
    });

    await new Promise(r => setTimeout(r, 3000));

    onProgress({
      step: 4,
      percent: 75,
      status: 'cleaning_dom',
      message: 'Đang gỡ bỏ trang mờ (unblur) và chuẩn hóa bố cục in đa trang...'
    });

    const pageCount = await page.evaluate(() => {
      // Remove toolbars, banners, ads, footers, and dividers
      document.querySelectorAll(`
        .toolbar_top, .toolbar_bottom, .header, .footer, .scribd_header,
        .between_page_portal_root, .between_page_ads, .mobile_banner,
        .wrapper__bottom_banner, .wrapper__between_pages_ad, .document_cell_separator,
        [class*="paywall"], [class*="banner"], [class*="ad_"],
        [class*="feedback"], [class*="Feedback"], [class*="Rating"], [class*="rating"],
        [class*="EndOfDocument"], [class*="end_of_document"]
      `).forEach(el => el.remove());

      // Unblur all pages
      document.querySelectorAll('.blurred_page, .page_missing, [class*="blur"]').forEach(el => {
        el.classList.remove('blurred_page', 'page_missing');
        el.style.filter = 'none';
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      });

      let pages = Array.from(document.querySelectorAll('.outer_page, .newpage, [id^="outer_page"]'));
      if (pages.length === 0) {
        pages = Array.from(document.querySelectorAll('.document_cell, [data-page-id]'));
      }
      if (pages.length === 0) {
        throw new Error('Không tìm thấy trang tài liệu Scribd nào hợp lệ.');
      }

      // Purge everything after the last page container
      const lastPage = pages[pages.length - 1];
      const lastCell = lastPage.closest('.document_cell') || lastPage;
      let sib = lastCell.nextElementSibling;
      while (sib) {
        const next = sib.nextElementSibling;
        sib.remove();
        sib = next;
      }

      let current = lastCell.parentElement;
      while (current && current !== document.body && current !== document.documentElement) {
        let parentSib = current.nextElementSibling;
        while (parentSib) {
          const next = parentSib.nextElementSibling;
          parentSib.remove();
          parentSib = next;
        }
        current.style.paddingBottom = '0px';
        current.style.marginBottom = '0px';
        current.style.borderBottom = 'none';
        current = current.parentElement;
      }

      document.body.style.paddingBottom = '0px';
      document.body.style.marginBottom = '0px';
      document.documentElement.style.paddingBottom = '0px';
      document.documentElement.style.marginBottom = '0px';

      // Set page break only between pages, avoid after the last page
      pages.forEach((p, idx) => {
        const isLast = (idx === pages.length - 1);
        const cell = p.closest('.document_cell');
        if (isLast) {
          p.style.setProperty('break-after', 'avoid', 'important');
          p.style.setProperty('page-break-after', 'avoid', 'important');
          if (cell) {
            cell.style.setProperty('break-after', 'avoid', 'important');
            cell.style.setProperty('page-break-after', 'avoid', 'important');
          }
        } else {
          p.style.setProperty('break-after', 'page', 'important');
          p.style.setProperty('page-break-after', 'always', 'important');
          if (cell) {
            cell.style.setProperty('break-after', 'page', 'important');
            cell.style.setProperty('page-break-after', 'always', 'important');
          }
        }
      });

      // Inject full-page print stylesheet
      const style = document.createElement('style');
      style.id = 'full-document-print-style';
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
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          margin: 0 auto !important;
          box-shadow: none !important;
          border: none !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        .outer_page:last-child,
        .outer_page:last-of-type,
        .document_cell:last-child,
        .document_cell:last-of-type {
          page-break-after: avoid !important;
          break-after: avoid !important;
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

      return pages.length;
    });

    onProgress({
      step: 5,
      percent: 90,
      status: 'generating_pdf',
      message: `Đang kết xuất tệp PDF hoàn chỉnh (${pageCount} trang)...`
    });

    await page.emulateMediaType('screen');
    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      pageRanges: `1-${pageCount}`,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });

    fs.writeFileSync(outputPath, pdfBuffer);
    const stats = fs.statSync(outputPath);

    await browser.close();
    browser = null;

    const result = {
      docId,
      platform: 'scribd',
      title: `scribd_document_${docId}`,
      totalPages: pageCount,
      fileSize: stats.size,
      fileSizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
      filePath: outputPath,
      fromCache: false
    };

    onProgress({
      step: 5,
      percent: 100,
      status: 'completed',
      message: `Tài liệu Scribd (${pageCount} trang) đã sẵn sàng!`,
      data: result
    });

    return result;
  } catch (err) {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    throw err;
  }
}

module.exports = {
  generateScribdPdf
};
