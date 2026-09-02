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
        onProgress({
          step: 5,
          percent: 100,
          status: 'completed',
          message: 'Tài liệu Scribd đã có sẵn trong bộ nhớ đệm!',
          data: {
            docId,
            platform: 'scribd',
            filePath: outputPath,
            fileSize: stats.size,
            fileSizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
            fromCache: true
          }
        });
        return {
          docId,
          platform: 'scribd',
          filePath: outputPath,
          fileSize: stats.size,
          fileSizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
          fromCache: true
        };
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
      headless: true,
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

    const embedUrl = `https://www.scribd.com/embeds/${docId}/content?start_page=1&view_mode=scroll&access_key=key-f contextos`;

    onProgress({
      step: 2,
      percent: 25,
      status: 'connecting',
      message: 'Đang kết nối vào viewer tài liệu Scribd...'
    });

    await page.goto(embedUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.evaluate(async () => {
      await new Promise(resolve => {
        let current = 0;
        const step = 800;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          current += step;
          const total = document.body ? document.body.scrollHeight : 50000;
          if (current >= total + 5000) {
            clearInterval(timer);
            resolve();
          }
        }, 50);
      });
    });

    onProgress({
      step: 3,
      percent: 60,
      status: 'rendering_assets',
      message: 'Đang tải hình ảnh và định dạng vector của tài liệu Scribd...'
    });

    await new Promise(r => setTimeout(r, 3000));

    onProgress({
      step: 4,
      percent: 85,
      status: 'cleaning_dom',
      message: 'Đang chuẩn hóa bố cục in...'
    });

    const pageCount = await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll('.between_page_ads, .banner_wrapper, .between_page_portal_root, .mobile_banner, .document_cell_separator').forEach(el => el.remove());
      const pages = document.querySelectorAll('.page_missing, .outer_page');
      return pages.length || 1;
    });

    onProgress({
      step: 5,
      percent: 90,
      status: 'generating_pdf',
      message: `Đang kết xuất buffer PDF (${pageCount} trang)...`
    });

    await page.emulateMediaType('print');
    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
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
      message: 'Tài liệu Scribd đã sẵn sàng để tải về!',
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
