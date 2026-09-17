const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiController = require('./controllers/apiController');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for public web clients
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'Expires', 'X-Requested-With']
}));
app.options('*', cors());

app.use(express.json());

// PDF Cache Directory
const cacheDir = path.join(__dirname, 'tmp/pdf_cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// API Routes
app.get('/api/health', apiController.healthCheck);
app.post('/api/parse-doc', apiController.parseDoc);
app.get('/api/job-status', apiController.getJobStatus);
app.get('/api/stream-progress', apiController.streamProgress);
app.get('/api/download-file', apiController.downloadFile);
app.get('/api/preview-file', apiController.previewFile);

// Serve frontend static build if available
const https = require('https');
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Fallback root API info
  app.get('/', (req, res) => {
    res.json({
      name: 'DatWY Doc Downloader API Server',
      status: 'online',
      version: '2.0.0',
      cloudPublicUrl: detectedCloudUrl || null,
      endpoints: {
        health: 'GET /api/health',
        parse: 'POST /api/parse-doc',
        stream: 'GET /api/stream-progress',
        download: 'GET /api/download-file',
        preview: 'GET /api/preview-file'
      }
    });
  });
}

// ── Cloud Environment Auto-Sync to Firebase RTDB ──
const FIREBASE_RTDB_URL = 'https://chat-wywy-default-rtdb.firebaseio.com/system/downloader_config.json';

function getCloudPublicUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  if (process.env.SPACE_HOST) return `https://${process.env.SPACE_HOST}`.replace(/\/+$/, '');
  if (process.env.SPACE_ID) {
    // Hugging Face Space ID: "DATWY/datwy-doc-server" -> "https://datwy-datwy-doc-server.hf.space"
    const formatted = process.env.SPACE_ID.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `https://${formatted}.hf.space`;
  }
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  return null;
}

let detectedCloudUrl = getCloudPublicUrl();

function syncToFirebase(url, status = 'online') {
  if (!url) return Promise.resolve(false);
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      apiUrl: url.replace(/\/+$/, ''),
      status,
      updatedAt: Date.now(),
      platform: 'cloud-247'
    });

    const req = https.request(FIREBASE_RTDB_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 8000
    }, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        console.warn(`[Firebase Sync] Response: ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on('error', (err) => {
      console.warn('[Firebase Sync Error]:', err.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

// Manual trigger API for sync (useful for webhook or cron wakeups)
app.all('/api/sync-firebase', async (req, res) => {
  const customUrl = req.query.url || req.body?.url || detectedCloudUrl;
  if (!customUrl) {
    return res.status(400).json({ success: false, message: 'Missing URL to sync. Provide ?url=https://...' });
  }
  detectedCloudUrl = customUrl;
  const ok = await syncToFirebase(customUrl, 'online');
  res.json({ success: ok, apiUrl: customUrl, updatedAt: Date.now() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`🚀 Doc-Downloader Server running on port: ${PORT}`);
  console.log(`📁 PDF Cache Directory: ${cacheDir}`);
  if (detectedCloudUrl) {
    console.log(`🌐 Cloud Public URL: ${detectedCloudUrl}`);
    console.log('📡 Starting auto-sync heartbeat with Firebase RTDB...');
    syncToFirebase(detectedCloudUrl, 'online').then(() => {
      console.log('✅ Initial Firebase RTDB sync complete!');
    });
    // Maintain 25s heartbeat to keep status online and fresh
    setInterval(() => {
      syncToFirebase(detectedCloudUrl, 'online');
    }, 25000);
  }
  console.log('====================================================');
});

// Graceful shutdown
function handleShutdown() {
  console.log('[*] Server shutting down...');
  if (detectedCloudUrl) {
    syncToFirebase(detectedCloudUrl, 'offline').finally(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

