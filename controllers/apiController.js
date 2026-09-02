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
  const studocuMatch = u.match(/(?:studocu\.com|studocu\.vn)\/(?:[a-z]{2}\/)?document\/[^/]+\/[^/]+\/[^/]+\/(\d+)/i) ||
                       u.match(/studocu\.[^/]+\/.*?\/(\d{5,})/i) ||
                       u.match(/(\d{6,})/);

  if (u.includes('studocu')) {
    const docId = studocuMatch ? studocuMatch[1] : null;
    return { platform: 'studocu', docId, url: u };
  }

  // Scribd match
  const scribdMatch = u.match(/scribd\.com\/(?:doc|document)\/(\d+)/i) ||
                      u.match(/scribd\.com\/embeds\/(\d+)/i);

  if (u.includes('scribd')) {
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

  // Start background worker
  processJob(jobId);
};

async function processJob(jobId) {
  const job = activeJobs.get(jobId);
  if (!job) return;

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
  } catch (err) {
    console.error(`[Job ${jobId} Error]:`, err);
    job.status = 'failed';
    notify({
      step: 0,
      percent: 0,
      status: 'failed',
      error: err.message || 'Không thể xuất file PDF cho tài liệu này.'
    });
  }
}

exports.streamProgress = (req, res) => {
  const { jobId } = req.query;
  const job = activeJobs.get(jobId);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  job.listeners.push(res);

  // Send current progress immediately
  res.write(`data: ${JSON.stringify(job.progress)}\n\n`);

  req.on('close', () => {
    job.listeners = job.listeners.filter(l => l !== res);
  });
};

exports.downloadFile = (req, res) => {
  const { docId, platform, title } = req.query;
  const filePath = path.join(CACHE_DIR, `${platform || 'document'}_${docId}.pdf`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File không tồn tại hoặc đã hết hạn.');
  }

  const rawTitle = title || `${platform}_${docId}`;
  const cleanTitle = rawTitle.replace(/[\\/:*?"<>|]/g, '_').trim();
  const safeFilename = encodeURIComponent(cleanTitle.endsWith('.pdf') ? cleanTitle : `${cleanTitle}.pdf`);

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);

  const filestream = fs.createReadStream(filePath);
  filestream.pipe(res);
};

exports.previewFile = (req, res) => {
  const { docId, platform } = req.query;
  const filePath = path.join(CACHE_DIR, `${platform || 'document'}_${docId}.pdf`);

  if (!fs.existsSync(filePath)) {
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
