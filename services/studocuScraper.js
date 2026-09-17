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
      message: 'Đang unblur, chuẩn hóa khung trang và triệt tiêu hoàn toàn trang trắng...'
    });

    const renderMeta = await page.evaluate(() => {
      // 1. Remove all non-document overlays, banners, headers, footers, sidebars
      document.querySelectorAll(`
        header, footer, nav, aside, #sidebar, [class*="DocumentFooter"],
        [class*="FloatingComponent"], [class*="banner"], [class*="Banner"],
        [class*="paywall"], [class*="Paywall"], [class*="Rating"], [class*="Feedback"],
        [class*="Toolbar"], [class*="toolbar"], [class*="recommendation"],
        #onetrust-consent-sdk, .onetrust-pc-dark-filter
      `).forEach(el => {
        try { el.remove(); } catch (e) {}
      });

      const pfs = Array.from(document.querySelectorAll('.pf'));
      if (pfs.length === 0) return null;

      // 2. Unblur all elements inside all pages
      pfs.forEach(pf => {
        pf.querySelectorAll('*').forEach(el => {
          el.classList.remove('blurred', 'blurred-container', 'blurred_page');
          if (el.style) {
            el.style.filter = 'none';
            el.style.opacity = '1';
            el.style.visibility = 'visible';
          }
        });
      });

      // 3. Exact native dimensions from first page
      const pf1 = pfs[0];
      const comp = window.getComputedStyle(pf1);
      const w = parseFloat(comp.width) || 612;
      const h = parseFloat(comp.height) || 792;

      // 4. Find page-container or parent and isolate
      let container = document.querySelector('#page-container');
      if (!container) container = pf1.parentElement;

      // Remove all siblings of container up the tree
      let cur = container;
      while (cur && cur !== document.body) {
        if (cur.parentElement) {
          Array.from(cur.parentElement.children).forEach(sibling => {
            if (sibling !== cur && sibling.tagName !== 'STYLE' && sibling.tagName !== 'LINK') {
              try { sibling.remove(); } catch (e) {}
            }
          });
        }
        cur = cur.parentElement;
      }

      // 5. Re-populate container strictly with .pf children only
      container.innerHTML = '';
      pfs.forEach((pf, i) => {
        pf.style.setProperty('display', 'block', 'important');
        pf.style.setProperty('width', `${w}px`, 'important');
        pf.style.setProperty('height', `${h}px`, 'important');
        pf.style.setProperty('margin', '0 auto', 'important');
        pf.style.setProperty('padding', '0', 'important');
        pf.style.setProperty('position', 'relative', 'important');
        pf.style.setProperty('overflow', 'hidden', 'important');
        pf.style.setProperty('background', '#ffffff', 'important');
        pf.style.setProperty('border', 'none', 'important');
        pf.style.setProperty('box-shadow', 'none', 'important');
        pf.style.setProperty('transform', 'none', 'important');
        if (i < pfs.length - 1) {
          pf.style.setProperty('page-break-after', 'always', 'important');
          pf.style.setProperty('break-after', 'page', 'important');
        } else {
          pf.style.setProperty('page-break-after', 'avoid', 'important');
          pf.style.setProperty('break-after', 'avoid', 'important');
        }
        pf.style.setProperty('page-break-inside', 'avoid', 'important');
        pf.style.setProperty('break-inside', 'avoid', 'important');

        // Ensure page content has exact size
        const pc = pf.querySelector('.page-content, .pc');
        if (pc) {
          pc.style.setProperty('display', 'block', 'important');
          pc.style.setProperty('width', `${w}px`, 'important');
          pc.style.setProperty('height', `${h}px`, 'important');
          pc.style.setProperty('position', 'absolute', 'important');
          pc.style.setProperty('top', '0', 'important');
          pc.style.setProperty('left', '0', 'important');
          pc.style.setProperty('overflow', 'hidden', 'important');
        }

        container.appendChild(pf);
      });

      // 6. Inject clean print stylesheet
      const style = document.createElement('style');
      style.id = 'zero-blank-print-css';
      style.innerHTML = `
        @page {
          size: ${w}px ${h}px !important;
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
          background: #ffffff !important;
          width: ${w}px !important;
          height: auto !important;
          overflow: visible !important;
        }
        #__next, #main-wrapper, #viewer-wrapper, #document-wrapper, #page-container-wrapper, #page-container, .p2hv, [class*="descaler"] {
          display: block !important;
          width: ${w}px !important;
          max-width: ${w}px !important;
          min-width: 0 !important;
          margin: 0 auto !important;
          padding: 0 !important;
          position: static !important;
          transform: none !important;
          zoom: 1 !important;
          background: transparent !important;
          overflow: visible !important;
        }
        .pf {
          display: block !important;
          width: ${w}px !important;
          height: ${h}px !important;
          margin: 0 auto !important;
          padding: 0 !important;
          position: relative !important;
          overflow: hidden !important;
          background: #ffffff !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .bi, img {
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

      return { totalPages: pfs.length, w, h };
    });

    if (!renderMeta || renderMeta.totalPages === 0) {
      throw new Error('Không thể tìm thấy các trang tài liệu Studocu để kết xuất PDF.');
    }

    const actualPages = renderMeta.totalPages;

    // Wait for all images to decode
    await page.evaluate(async () => {
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(imgs.map(img => img.decode().catch(() => {})));
    });

    onProgress({
      step: 5,
      percent: 90,
      status: 'generating_pdf',
      message: `Đang kết xuất buffer PDF sắc nét chuẩn 1:1 (${actualPages} trang, không trang trắng)...`
    });

    await page.emulateMediaType('screen');
    await new Promise(r => setTimeout(r, 1000));

    const pdfBuffer = await page.pdf({
      width: `${renderMeta.w}px`,
      height: `${renderMeta.h}px`,
      printBackground: true,
      preferCSSPageSize: true,
      pageRanges: `1-${actualPages}`,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });


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
