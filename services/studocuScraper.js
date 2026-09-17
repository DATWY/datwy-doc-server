const { connect } = require('puppeteer-real-browser');
const path = require('path');
const fs = require('fs');

function ensureCacheDir(cacheDir) {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
}

function isCloudflareChallenge(title, url) {
  const t = (title || '').toLowerCase();
  const u = (url || '').toLowerCase();
  return (
    t.includes('just a moment') ||
    t.includes('bot verification') ||
    t.includes('attention required') ||
    t.includes('security check') ||
    t.includes('xác minh') ||
    u.includes('__cf_chl_') ||
    u.includes('challenge')
  );
}

/**
 * Automates Studocu document scraping, Cloudflare Turnstile auto-solve,
 * progressive loading of all pages, unblurring filters, removal of paywall banners,
 * zero-offset parent hierarchy reset, and clean 100% original PDF generation with 0% crop.
 */
async function generateStudocuPdf(docId, targetUrl, onProgress = () => {}, options = {}) {
  const cacheDir = options.cacheDir || path.join(__dirname, '../tmp/pdf_cache');
  ensureCacheDir(cacheDir);

  const outputPath = path.join(cacheDir, `studocu_${docId}.pdf`);

  const bypassCache = options.noCache === true || options.bypassCache === true || options.disableCache === true;
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
          platform: 'studocu',
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
          message: 'Tài liệu Studocu đã có sẵn trong bộ nhớ đệm!',
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
    message: 'Khởi động trình duyệt bảo mật vượt tường lửa Cloudflare Turnstile...'
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
      headless: false, // Runs seamlessly inside Xvfb virtual display
      turnstile: true,
      args: launchArgs
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      connectOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const connection = await connect(connectOptions);

    browser = connection.browser;
    page = connection.page;

    await page.setViewport({ width: 1600, height: 2200, deviceScaleFactor: 2 });

    onProgress({
      step: 2,
      percent: 20,
      status: 'connecting',
      message: 'Đang kết nối và tự động xác thực Cloudflare trên Studocu...'
    });

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Cloudflare Turnstile Auto-Solve Wait Loop (Up to 40s)
    for (let i = 0; i < 40; i++) {
      const title = await page.title();
      const currentUrl = page.url();
      const isCf = isCloudflareChallenge(title, currentUrl);

      if (!isCf) {
        const hasDocumentElements = await page.evaluate(() => {
          return !!document.querySelector('#document-wrapper, #viewer-wrapper, .pf, h1, #page-container');
        });

        if (hasDocumentElements) {
          break;
        }
      }

      onProgress({
        step: 2,
        percent: Math.min(20 + Math.floor(i * 0.5), 35),
        status: 'verifying_turnstile',
        message: `Đang tự động xác minh Cloudflare Turnstile (${i + 1}s)...`
      });

      await new Promise(r => setTimeout(r, 1000));
    }

    await new Promise(r => setTimeout(r, 3000));

    // If user provided a course URL, automatically extract the first document under this course
    const courseDocUrl = await page.evaluate(() => {
      if (window.location.href.includes('/course/')) {
        const docLink = document.querySelector('a[href*="/document/"]');
        return docLink ? docLink.href : null;
      }
      return null;
    });

    if (courseDocUrl) {
      onProgress({
        step: 2,
        percent: 35,
        status: 'navigating_document',
        message: 'Đã nhận diện khóa học, tự động chuyển vào tài liệu tiêu biểu trong khóa...'
      });
      await page.goto(courseDocUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      // Wait for Turnstile on document page
      for (let i = 0; i < 20; i++) {
        const pfCount = await page.evaluate(() => document.querySelectorAll('.pf').length);
        if (pfCount > 0) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    // Dismiss cookie banners & popups immediately to keep DOM clean
    await page.evaluate(() => {
      document.querySelectorAll(`
        #onetrust-consent-sdk, .onetrust-pc-dark-filter,
        [id*="cookie"], [class*="cookie"], [class*="Cookie"],
        [class*="paywall"], [class*="banner"], [class*="Popup"]
      `).forEach(el => {
        try { el.remove(); } catch(e) {}
      });
    });

    const checkResult = await page.evaluate(() => {
      const title = document.title || '';
      const is404 = title.startsWith('404') || document.querySelector('.error-page-404, [data-test-selector="404"]') !== null;
      const bodyText = document.body ? document.body.innerText : '';
      const isBlocked = bodyText.includes('Access Blocked') || bodyText.includes('temporarily restricted your access');
      return { is404, isBlocked };
    });

    if (checkResult.is404) {
      throw new Error(`Tài liệu Studocu không tồn tại hoặc đã bị gỡ bỏ (Mã lỗi 404).`);
    }

    if (checkResult.isBlocked) {
      throw new Error(`Studocu đã tạm thời chặn IP máy chủ này (Access Blocked). Vui lòng thử lại sau ít phút.`);
    }

    // Extract Title & Page Count
    const docMeta = await page.evaluate(() => {
      let rawTitle = document.querySelector('h1')?.innerText || document.title || 'Studocu_Document';
      rawTitle = rawTitle.replace(/\s*-\s*Studocu$/i, '').trim();

      const totalPf = document.querySelectorAll('.pf').length;
      const totalPagesEl = document.querySelector('[class*="pageCount"], [class*="totalPages"]');
      let estimatedPages = totalPf;
      if (totalPagesEl) {
        const match = totalPagesEl.innerText.match(/(\d+)/);
        if (match) estimatedPages = parseInt(match[1], 10);
      }

      return {
        title: rawTitle.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Studocu_Document',
        estimatedPages: estimatedPages > 0 ? estimatedPages : totalPf || 1
      };
    });

    onProgress({
      step: 3,
      percent: 45,
      status: 'unblurring_and_scrolling',
      message: `Tài liệu: "${docMeta.title}" (${docMeta.estimatedPages} trang). Đang unblur và tải ảnh gốc sắc nét...`,
      data: {
        title: docMeta.title,
        totalPages: docMeta.estimatedPages
      }
    });

    // Deep Progressive Hydration & Scroll for All Pages (executed from Node.js event loop)
    const totalPfCount = await page.evaluate(() => {
      const pfs = document.querySelectorAll('.pf');
      return pfs.length > 0 ? pfs.length : document.querySelectorAll('[data-page-index]').length;
    });

    for (let pageIdx = 0; pageIdx < totalPfCount; pageIdx++) {
      await page.evaluate((idx) => {
        let el = document.querySelectorAll('.pf')[idx];
        if (!el) el = document.querySelectorAll('[data-page-index]')[idx];
        if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, pageIdx);
      await new Promise(r => setTimeout(r, 300));
    }

    // Double check that 100% of pages are populated; re-scroll any missing virtual pages
    for (let retry = 0; retry < 3; retry++) {
      const missingIndices = await page.evaluate(() => {
        let pfs = Array.from(document.querySelectorAll('.pf'));
        if (pfs.length === 0) pfs = Array.from(document.querySelectorAll('[data-page-index]'));
        const missing = [];
        pfs.forEach((p, idx) => {
          if (!p.querySelector('.pc, img, .t, svg')) {
            missing.push(idx);
          }
        });
        return missing;
      });

      if (missingIndices.length === 0) break;

      for (const idx of missingIndices) {
        await page.evaluate((i) => {
          let el = document.querySelectorAll('.pf')[i];
          if (!el) el = document.querySelectorAll('[data-page-index]')[i];
          if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
        }, idx);
        await new Promise(r => setTimeout(r, 450));
      }
    }

    onProgress({
      step: 4,
      percent: 75,
      status: 'rendering_assets',
      message: 'Đang trích xuất và giải mã toàn bộ hình ảnh độ phân giải cao vào bộ nhớ...'
    });

    const pageImages = await page.evaluate(async () => {
      // Unblur
      document.querySelectorAll(`
        .blurred, .blurred-container, .blurred_page, [class*="blur"], [class*="blurred"]
      `).forEach(el => {
        el.classList.remove('blurred', 'blurred-container', 'blurred_page');
        el.style.filter = 'none';
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      });

      let pfs = Array.from(document.querySelectorAll('.pf'));
      if (pfs.length === 0) pfs = Array.from(document.querySelectorAll('[data-page-index]'));
      const results = [];

      for (let idx = 0; idx < pfs.length; idx++) {
        const pf = pfs[idx];
        pf.style.display = 'block';
        pf.style.visibility = 'visible';
        pf.style.opacity = '1';

        const img = pf.querySelector('img');
        if (!img) {
          results.push(null);
          continue;
        }

        let dataUrl = null;

        // 1. Try Canvas extraction (fastest & doesn't require extra network request if already decoded)
        try {
          if (img.complete && img.naturalWidth > 0) {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            dataUrl = canvas.toDataURL('image/png');
          }
        } catch (e) {}

        // 2. Fallback to Fetch Blob -> DataURL
        const imgSrc = img.src || img.currentSrc || img.getAttribute('src');
        if (!dataUrl && imgSrc) {
          try {
            const res = await fetch(imgSrc);
            if (res.ok) {
              const blob = await res.blob();
              dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
          } catch (e) {}
        }

        if (dataUrl && dataUrl.length > 100) {
          results.push({
            page: idx + 1,
            dataUrl
          });
        } else {
          results.push(null);
        }
      }

      return results;
    });

    const validImages = pageImages.filter(Boolean);
    let pdfBuffer;
    let actualPages = 0;

    if (validImages.length > 0) {
      onProgress({
        step: 5,
        percent: 85,
        status: 'cleaning_dom',
        message: 'Tái tạo khung trang nguyên vẹn 1:1, triệt tiêu hoàn toàn vệt cắt và méo khung hình...'
      });

      const renderPage = await browser.newPage();
      
      const firstImage = validImages[0];
      const dimensions = await renderPage.evaluate(async (dataUrl) => {
        const img = new Image();
        img.src = dataUrl;
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
      }, firstImage.dataUrl);

      const targetW = dimensions.width > 0 ? dimensions.width : 1225;
      const targetH = dimensions.height > 0 ? dimensions.height : 1585;
      actualPages = validImages.length;

      const cleanHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${docMeta.title}</title>
          <style>
            @page {
              size: ${targetW}px ${targetH}px !important;
              margin: 0 !important;
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
              width: ${targetW}px !important;
            }
            .page-wrapper {
              width: ${targetW}px !important;
              height: ${targetH}px !important;
              position: relative !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              overflow: hidden !important;
              background: #fff !important;
            }
            .page-wrapper:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
            .page-wrapper img {
              width: ${targetW}px !important;
              height: ${targetH}px !important;
              display: block !important;
              object-fit: fill !important;
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
          </style>
        </head>
        <body>
          ${validImages.map((img, i) => `
            <div class="page-wrapper" id="page-${i+1}">
              <img src="${img.dataUrl}" alt="Page ${i+1}" />
            </div>
          `).join('')}
        </body>
        </html>
      `;

      await renderPage.setContent(cleanHtml, { waitUntil: 'load' });

      // Ensure all images are decoded synchronously
      await renderPage.evaluate(async () => {
        const imgs = Array.from(document.querySelectorAll('img'));
        await Promise.all(imgs.map(img => img.decode().catch(() => {})));
      });

      onProgress({
        step: 5,
        percent: 92,
        status: 'generating_pdf',
        message: `Đang kết xuất buffer PDF sắc nét chuẩn 1:1 (${actualPages} trang)...`
      });

      await renderPage.emulateMediaType('screen');

      pdfBuffer = await renderPage.pdf({
        width: `${targetW}px`,
        height: `${targetH}px`,
        printBackground: true,
        preferCSSPageSize: true,
        pageRanges: `1-${actualPages}`,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
      });

      await renderPage.close();
    } else {
      throw new Error('Không thể trích xuất hình ảnh các trang tài liệu Studocu để kết xuất PDF nguyên vẹn.');
    }

    if (!pdfBuffer || pdfBuffer.length < 2048) {
      throw new Error('Không thể kết xuất tài liệu Studocu hoặc tài liệu bị rỗng.');
    }

    fs.writeFileSync(outputPath, pdfBuffer);
    const stats = fs.statSync(outputPath);

    await browser.close();
    browser = null;

    const result = {
      docId,
      platform: 'studocu',
      title: docMeta.title,
      totalPages: actualPages,
      fileSize: stats.size,
      fileSizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
      filePath: outputPath,
      fromCache: false
    };

    onProgress({
      step: 5,
      percent: 100,
      status: 'completed',
      message: 'Tài liệu Studocu đã sẵn sàng để tải về!',
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
  generateStudocuPdf
};
