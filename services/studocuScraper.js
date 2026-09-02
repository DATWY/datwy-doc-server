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
        onProgress({
          step: 5,
          percent: 100,
          status: 'completed',
          message: 'Tài liệu Studocu đã có sẵn trong bộ nhớ đệm!',
          data: {
            docId,
            platform: 'studocu',
            filePath: outputPath,
            fileSize: stats.size,
            fileSizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
            fromCache: true
          }
        });
        return {
          docId,
          platform: 'studocu',
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
      headless: true, // Headless on Linux Render server
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

    const is404 = await page.evaluate(() => {
      const title = document.title || '';
      return title.startsWith('404') || document.querySelector('.error-page-404, [data-test-selector="404"]') !== null;
    });

    if (is404) {
      throw new Error(`Tài liệu Studocu không tồn tại hoặc đã bị gỡ bỏ (Mã lỗi 404).`);
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
      percent: 40,
      status: 'unblurring_and_scrolling',
      message: `Tài liệu: "${docMeta.title}" (${docMeta.estimatedPages} trang). Đang nạp và mở khóa toàn bộ trang & ảnh gốc...`,
      data: {
        title: docMeta.title,
        totalPages: docMeta.estimatedPages
      }
    });

    // Deep Progressive Unblurring and Hydration for All Pages
    await page.evaluate(async () => {
      const unblurAll = () => {
        document.querySelectorAll(
          '.blurred, .blurred-container, .blurred_page, [class*="blur"], [class*="blurred"], [class*="blurredImageWrapper"]'
        ).forEach((el) => {
          el.classList.remove('blurred', 'blurred-container', 'blurred_page');
          el.style.filter = 'none';
          el.style.opacity = '1';
          el.style.visibility = 'visible';
          el.style.userSelect = 'text';
        });

        document.querySelectorAll('.page-content, [class*="page-content"], .pc').forEach(el => {
          el.style.display = 'block';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el.style.filter = 'none';
        });

        document.querySelectorAll('.pf img, img.bi, .page-content img').forEach(img => {
          img.style.filter = 'none';
          img.style.opacity = '1';
          img.style.visibility = 'visible';
          img.style.display = 'block';
        });

        document.querySelectorAll(
          '.paywall, .premium-overlay, .document-viewer-banner, [data-test-selector="document-viewer-banner"], #preview-banner, .blurred-page-cover, [class*="PremiumPageClarificationBanner"], [class*="ClarificationBanner"], [class*="Paywall"], [class*="FloatingComponent"], [class*="GetMoreAiStudyHelp"], [class*="MobileAppBanner"], [class*="AppBanner"], [class*="Prompt"]'
        ).forEach(el => {
          try { el.remove(); } catch (e) {}
        });
      };

      unblurAll();

      await new Promise((resolve) => {
        let pos = 0;
        const step = 600;
        const timer = setInterval(() => {
          window.scrollBy(0, step);
          pos += step;
          unblurAll();

          const totalHeight = document.body ? (document.body.scrollHeight || document.documentElement.scrollHeight || 60000) : 60000;
          if (pos >= totalHeight + 6000) {
            clearInterval(timer);
            resolve();
          }
        }, 40);
      });
    });

    onProgress({
      step: 3,
      percent: 70,
      status: 'rendering_assets',
      message: 'Đang đảm bảo 100% hình ảnh độ nét cao và phông chữ vector đã tải xong...'
    });

    // Ensure all images are loaded
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('#document-wrapper img, .pf img, img.bi, .page-content img'));
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 3000);
        });
      }));
    });

    await new Promise((r) => setTimeout(r, 2000));

    onProgress({
      step: 4,
      percent: 85,
      status: 'cleaning_dom',
      message: 'Căn chỉnh chuẩn khổ in A4, triệt tiêu hoàn toàn độ lệch (0% Misalignment, 0% Crop)...'
    });

    // Reset parent hierarchy to (0,0) flush margin while preserving all scoped CSS classes
    const processedStats = await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      const unwanted = [
        '#header-position-wrapper',
        'header',
        'nav',
        'footer',
        'aside',
        '#sidebar',
        '#onetrust-consent-sdk',
        '#onetrust-banner-sdk',
        '.ot-sdk-container',
        '[class*="TopFloatingComponent"]',
        '[class*="FloatingComponent"]',
        '[class*="GetMoreAiStudyHelp"]',
        '[class*="MobileAppBanner"]',
        '[class*="AppBanner"]',
        '[class*="DocumentFooter"]',
        '[class*="Rating"]',
        '[class*="Feedback"]',
        '[class*="banner"]',
        '#document-preview-text',
        '.paywall',
        '.premium-overlay',
        '[class*="PremiumPageClarificationBanner"]',
        '[class*="ClarificationBanner"]',
        '.blurred-container'
      ];
      unwanted.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!el.closest('.pf')) {
            try { el.remove(); } catch (e) {}
          }
        });
      });

      const pf1 = document.querySelector('.pf');
      const w = pf1 ? (pf1.offsetWidth || parseFloat(getComputedStyle(pf1).width) || 612) : 612;
      const h = pf1 ? (pf1.offsetHeight || parseFloat(getComputedStyle(pf1).height) || 792) : 792;

      let current = pf1 ? pf1.parentElement : null;
      while (current && current !== document.documentElement) {
        current.style.margin = '0';
        current.style.padding = '0';
        current.style.transform = 'none';
        current.style.webkitTransform = 'none';
        current.style.top = '0';
        current.style.left = '0';
        current.style.position = 'static';
        current.style.overflow = 'visible';
        current.style.minHeight = '0';
        current.scrollTop = 0;
        current.scrollLeft = 0;
        current = current.parentElement;
      }

      const pfPages = document.querySelectorAll('.pf');
      pfPages.forEach(pf => {
        pf.style.display = 'block';
        pf.style.visibility = 'visible';
        pf.style.opacity = '1';
        pf.style.filter = 'none';
        pf.style.transform = 'none';
        pf.style.margin = '0 auto';
        pf.style.padding = '0';
        pf.style.left = '0';
        pf.style.top = '0';
        pf.style.width = `${w}px`;
        pf.style.height = `${h}px`;
        pf.style.boxShadow = 'none';
        pf.style.border = 'none';
        pf.style.position = 'relative';
        pf.style.pageBreakAfter = 'always';
        pf.style.breakAfter = 'page';

        pf.querySelectorAll('.page-content, [class*="page-content"]').forEach(pcWrap => {
          pcWrap.style.display = 'block';
          pcWrap.style.visibility = 'visible';
          pcWrap.style.opacity = '1';
          pcWrap.style.filter = 'none';
          pcWrap.style.width = '100%';
          pcWrap.style.height = '100%';
        });

        pf.querySelectorAll('.pc').forEach(pc => {
          pc.style.display = 'block';
          pc.style.visibility = 'visible';
          pc.style.opacity = '1';
          pc.style.left = '0';
          pc.style.top = '0';
          pc.style.width = '100%';
          pc.style.height = '100%';
          pc.style.transform = 'none';
        });

        pf.querySelectorAll('.bi, img').forEach(bi => {
          bi.style.display = 'block';
          bi.style.position = 'absolute';
          bi.style.left = '0';
          bi.style.top = '0';
          bi.style.width = '100%';
          bi.style.height = '100%';
          bi.style.visibility = 'visible';
          bi.style.opacity = '1';
          bi.style.filter = 'none';
        });

        pf.querySelectorAll('.t').forEach(t => {
          t.style.visibility = 'visible';
          t.style.opacity = '1';
        });
      });

      const style = document.createElement('style');
      style.id = 'pure-flawless-print-css';
      style.innerHTML = `
        @page {
          size: ${w}px ${h}px !important;
          margin: 0 !important;
        }
        *, *::before, *::after {
          box-sizing: border-box !important;
        }
        html, body {
          width: ${w}px !important;
          height: auto !important;
          background: #ffffff !important;
          margin: 0 !important;
          padding: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #__next, #main-wrapper, #viewer-wrapper, #document-wrapper, [class*="descaler"], #page-container-wrapper, #page-container, .p2hv {
          display: block !important;
          width: ${w}px !important;
          max-width: ${w}px !important;
          min-width: 0 !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          position: static !important;
          transform: none !important;
          overflow: visible !important;
          background: #ffffff !important;
        }
        .pf {
          display: block !important;
          position: relative !important;
          width: ${w}px !important;
          height: ${h}px !important;
          page-break-after: always !important;
          page-break-inside: avoid !important;
          break-after: page !important;
          margin: 0 !important;
          padding: 0 !important;
          left: 0 !important;
          top: 0 !important;
          background: #ffffff !important;
          overflow: hidden !important;
          box-shadow: none !important;
          border: none !important;
        }
        .pc {
          display: block !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
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
          visibility: visible !important;
          opacity: 1 !important;
        }
        .t {
          visibility: visible !important;
          opacity: 1 !important;
        }
        header, footer, nav, aside, #sidebar, [class*="DocumentFooter"], #onetrust-consent-sdk, [class*="FloatingComponent"], [class*="GetMoreAiStudyHelp"] {
          display: none !important;
        }
      `;
      document.head.appendChild(style);

      const title = document.querySelector('h1')?.innerText?.trim() || 
                    document.querySelector('meta[property="og:title"]')?.content?.trim() || 
                    'document';

      return {
        title,
        actualPages: pfPages.length || 1
      };
    });

    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1000));

    onProgress({
      step: 5,
      percent: 90,
      status: 'generating_pdf',
      message: `Đang kết xuất buffer PDF chất lượng cao (${processedStats.actualPages} trang)...`
    });

    await page.emulateMediaType('print');

    const pdfBuffer = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      pageRanges: `1-${processedStats.actualPages || 1}`,
      margin: {
        top: '0px',
        right: '0px',
        bottom: '0px',
        left: '0px'
      }
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
      title: docMeta.title || `studocu_document_${docId}`,
      totalPages: processedStats.actualPages,
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
