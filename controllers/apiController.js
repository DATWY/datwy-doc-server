const path = require('path');
const fs = require('fs');
const { generateStudocuPdf } = require('../services/studocuScraper');
const { generateScribdPdf } = require('../services/scribdScraper');

const activeJobs = new Map();
const CACHE_DIR = path.join(__dirname, '../tmp/pdf_cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function parseDocumentUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const u = rawUrl.trim();

  // Studocu match
  if (u.includes('studocu')) {
    const studocuMatch = u.match(/(?:studocu\.com|studocu\.vn)\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?document\/.*?(\d{4,})/i) ||
                         u.match(/document\/.*?(\d{4,})/i) ||
                         u.match(/studocu\.[^/]+\/.*?(\d{4,})/i) ||
                         u.match(/(\d{5,})/);
    const docId = studocuMatch ? studocuMatch[1] : null;
    return { platform: 'studocu', docId, url: u };
  }

  // Scribd match
  if (u.includes('scribd')) {
    const scribdMatch = u.match(/scribd\.com\/(?:doc|document|embeds)\/(\d+)/i) ||
                        u.match(/scribd\.com\/.*?(\d{6,})/i) ||
                        u.match(/(\d{6,})/);
    const docId = scribdMatch ? scribdMatch[1] : null;
    return { platform: 'scribd', docId, url: u };
  }

  return null;
}

exports.healthCheck = (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeJobs: activeJobs.size,
    uptime: process.uptime()
  });
};

exports.parseDoc = async (req, res) => {
  const { url, noCache } = req.body || {};
  const parsed = parseDocumentUrl(url);

  if (!parsed || !parsed.docId) {
    return res.status(400).json({
      success: false,
      error: 'Đường dẫn tài liệu không hợp lệ. Vui lòng nhập đúng link Studocu hoặc Scribd.'
    });
  }

  const { platform, docId } = parsed;
  const jobId = `${platform}_${docId}_${Date.now()}`;

  // Check if cache bypass requested
  if (noCache) {
    const cachedFile = path.join(CACHE_DIR, `${platform}_${docId}.pdf`);
    if (fs.existsSync(cachedFile)) {
      try {
        fs.unlinkSync(cachedFile);
        console.log(`[Cache Bypassed] Removed existing cache for ${platform}_${docId}`);
      } catch (e) {}
    }
  }

  activeJobs.set(jobId, {
    jobId,
    docId,
    platform,
    url: parsed.url,
    noCache: !!noCache,
    createdAt: Date.now(),
    progress: { step: 1, percent: 10, message: 'Đã nhận yêu cầu xuất tài liệu...' },
    status: 'queued',
    listeners: []
  });

  res.json({
    success: true,
    jobId,
    docId,
    platform
  });

  // Enqueue job with concurrency control
  enqueueJob(jobId);
};

// ──────────────── CONCURRENCY QUEUE & WORKER POOL ────────────────
const MAX_CONCURRENT_SCRAPING = 1;
let runningJobsCount = 0;
const waitingQueue = [];

function enqueueJob(jobId) {
  if (runningJobsCount < MAX_CONCURRENT_SCRAPING) {
    processJob(jobId);
  } else {
    waitingQueue.push(jobId);
    const job = activeJobs.get(jobId);
    if (job) {
      job.progress = {
        step: 1,
        percent: 15,
        message: `Đang chờ trong hàng đợi (Vị trí #${waitingQueue.length})...`
      };
      const sseData = `data: ${JSON.stringify(job.progress)}\n\n`;
      job.listeners.forEach(res => {
        try { res.write(sseData); } catch (e) {}
      });
    }
  }
}

function finishJobSlot() {
  runningJobsCount = Math.max(0, runningJobsCount - 1);
  if (waitingQueue.length > 0) {
    const nextJobId = waitingQueue.shift();
    processJob(nextJobId);
  }
}

// Auto cleanup activeJobs to prevent memory leaks (TTL 15 minutes)
const JOB_TTL_MS = 15 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of activeJobs.entries()) {
    if (job.createdAt && (now - job.createdAt > JOB_TTL_MS)) {
      activeJobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Auto cleanup old cached PDFs older than 24 hours to prevent disk exhaustion
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(CACHE_DIR);
    for (const f of files) {
      if (f.endsWith('.pdf')) {
        const fullPath = path.join(CACHE_DIR, f);
        const stats = fs.statSync(fullPath);
        if (now - stats.mtimeMs > CACHE_TTL_MS) {
          fs.unlinkSync(fullPath);
          console.log(`[Cache Cleanup] Removed old cached PDF: ${f}`);
        }
      }
    }
  } catch (err) {
    console.warn('[Cache Cleanup Error]:', err.message);
  }
}, 60 * 60 * 1000);

async function processJob(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) {
    finishJobSlot();
    return;
  }

  runningJobsCount++;

  const notify = (progressUpdate) => {
    job.progress = progressUpdate;
    const sseData = `data: ${JSON.stringify(progressUpdate)}\n\n`;
    job.listeners.forEach(res => {
      try { res.write(sseData); } catch (e) {}
    });
  };

  try {
    let result;
    if (job.platform === 'studocu') {
      result = await generateStudocuPdf(job.docId, job.url, notify, { cacheDir: CACHE_DIR, noCache: job.noCache });
    } else {
      result = await generateScribdPdf(job.docId, job.url, notify, { cacheDir: CACHE_DIR, noCache: job.noCache });
    }

    job.status = 'completed';
    job.result = result;

    // Send final completed event to SSE listeners and close them cleanly
    const finalEvent = `data: ${JSON.stringify({ percent: 100, status: 'completed', message: 'Tài liệu đã xuất thành công!', data: result })}\n\n`;
    job.listeners.forEach(res => {
      try {
        res.write(finalEvent);
        res.end();
      } catch (e) {}
    });
    job.listeners = [];

    // Schedule cleanup after completion
    setTimeout(() => {
      activeJobs.delete(jobId);
    }, JOB_TTL_MS);
  } catch (err) {
    console.error(`[Job ${jobId} Error]:`, err);
    job.status = 'failed';
    notify({
      step: 0,
      percent: 0,
      status: 'failed',
      error: err.message || 'Không thể xuất file PDF cho tài liệu này.'
    });

    job.listeners.forEach(res => {
      try { res.end(); } catch (e) {}
    });
    job.listeners = [];

    // Schedule cleanup after failure
    setTimeout(() => {
      activeJobs.delete(jobId);
    }, JOB_TTL_MS);
  } finally {
    finishJobSlot();
  }
}

exports.getJobStatus = (req, res) => {
  const { jobId } = req.query;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Tiến trình không tồn tại hoặc đã hết hạn.' });
  }

  res.json({
    success: true,
    jobId: job.jobId,
    docId: job.docId,
    platform: job.platform,
    status: job.status,
    progress: job.progress,
    result: job.result || null
  });
};

exports.streamProgress = (req, res) => {
  const { jobId } = req.query;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Bypass Cloudflare proxy buffer by sending 2KB padding comment immediately
  res.write(`: ${' '.repeat(2048)}\n\n`);

  // Send current progress immediately
  res.write(`data: ${JSON.stringify(job.progress)}\n\n`);

  if (job.status === 'completed' || job.status === 'failed') {
    res.end();
    return;
  }

  job.listeners.push(res);

  req.on('close', () => {
    job.listeners = job.listeners.filter(l => l !== res);
  });
};

exports.downloadFile = (req, res) => {
  const { docId, platform, title } = req.query;

  // Sanitize input to prevent Path Traversal
  const safeDocId = String(docId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const safePlatform = ['studocu', 'scribd'].includes(platform) ? platform : 'document';
  const filePath = path.join(CACHE_DIR, `${safePlatform}_${safeDocId}.pdf`);

  if (!safeDocId || !fs.existsSync(filePath)) {
    return res.status(404).send('File không tồn tại hoặc đã hết hạn.');
  }

  const rawTitle = title || `${safePlatform}_${safeDocId}`;
  const cleanTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '_').trim();
  const safeFilename = encodeURIComponent(cleanTitle.endsWith('.pdf') ? cleanTitle : `${cleanTitle}.pdf`);
  const stats = fs.statSync(filePath);

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);

  const filestream = fs.createReadStream(filePath);
  filestream.pipe(res);
};

exports.previewFile = (req, res) => {
  const { docId, platform } = req.query;

  // Sanitize input to prevent Path Traversal
  const safeDocId = String(docId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const safePlatform = ['studocu', 'scribd'].includes(platform) ? platform : 'document';
  const filePath = path.join(CACHE_DIR, `${safePlatform}_${safeDocId}.pdf`);

  if (!safeDocId || !fs.existsSync(filePath)) {
    return res.status(404).send('File không tồn tại để xem trước.');
  }

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');

  const filestream = fs.createReadStream(filePath);
  filestream.pipe(res);
};
