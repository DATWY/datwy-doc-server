const https = require('https');

const url = 'https://archive.org/advancedsearch.php?q=mediatype%3Aaudio+AND+(%22son+tung%22+OR+%22s%C6%A1n+t%C3%B9ng%22+OR+%22m-tp%22)&fl[]=identifier,title&rows=50&sort[]=downloads+desc&output=json';

https.get(url, r => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    try {
      const j = JSON.parse(d);
      console.log('Results count:', j.response.docs.length);
      console.log(JSON.stringify(j.response.docs, null, 2));
    } catch(e) { console.error(e); }
  });
}).on('error', console.error);
