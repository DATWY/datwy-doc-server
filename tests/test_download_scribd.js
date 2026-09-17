const { generateScribdPdf } = require('./services/scribdScraper');
const path = require('path');
const fs = require('fs');

async function testDownload() {
  const docId = '878092523';
  const url = 'https://www.scribd.com/document/878092523/600-T%E1%BB%AB-V%E1%BB%B1ng-TOEIC-B%E1%BA%A3n-Ti%E1%BA%BFng-Vi%E1%BB%87t';
  const cacheDir = path.join(__dirname, 'tmp/pdf_cache');

  console.log('Starting automated test download for Scribd doc:', docId);
  try {
    const result = await generateScribdPdf(docId, url, (progress) => {
      console.log(`[Progress ${progress.percent}%] ${progress.message}`);
    }, { cacheDir, noCache: true });

    console.log('Download Result:', result);
    if (fs.existsSync(result.filePath)) {
      const stats = fs.statSync(result.filePath);
      console.log(`SUCCESS! Generated PDF size: ${stats.size} bytes (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    } else {
      console.error('File does not exist at:', result.filePath);
    }
  } catch (err) {
    console.error('Test download failed:', err);
  }
}

testDownload();
