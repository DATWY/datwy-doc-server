const https = require('https');
const fs = require('fs');

const content = fs.readFileSync('src/context/MusicContext.jsx', 'utf8');
const urls = [];
const regex = /url:\s*'([^']+)'/g;
let m;
while ((m = regex.exec(content)) !== null) {
  urls.push(m[1]);
}

console.log('Found', urls.length, 'URLs in MusicContext.jsx');

async function check(url, idx) {
  return new Promise(res => {
    https.get(url, r => {
      res({ idx: idx + 1, status: r.statusCode, url: url.substring(0, 70) });
    }).on('error', e => res({ idx: idx + 1, error: e.message }));
  });
}

Promise.all(urls.map((u, i) => check(u, i))).then(results => {
  console.log(JSON.stringify(results, null, 2));
});
