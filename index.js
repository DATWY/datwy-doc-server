const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiController = require('./controllers/apiController');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for public web clients
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'Expires']
}));

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
app.get('/api/stream-progress', apiController.streamProgress);
app.get('/api/download-file', apiController.downloadFile);
app.get('/api/preview-file', apiController.previewFile);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'DatWY Doc Downloader API Server',
    status: 'online',
    version: '2.0.0',
    endpoints: {
      health: 'GET /api/health',
      parse: 'POST /api/parse-doc',
      stream: 'GET /api/stream-progress',
      download: 'GET /api/download-file',
      preview: 'GET /api/preview-file'
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`🚀 Doc-Downloader Server running on port: ${PORT}`);
  console.log(`📁 PDF Cache Directory: ${cacheDir}`);
  console.log('====================================================');
});
