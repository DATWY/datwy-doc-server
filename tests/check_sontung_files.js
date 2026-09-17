const https = require('https');

const items = [
  'muon-roi-ma-sao-con-son-tung-m-tp-top-100-nhac-tre-hay-nhat-v.-a-playlist-nhac-cua-tui',
  'ChacAiDoSeVeSonTungMTP',
  'EmCuaNgayHomQuaSonTungMTP',
  'hay-trao-cho-anh-son-tung-m-tp-snoop-dogg-top-100-nhac-tre-hay-nhat-v.-a-playlist-nhac-cua-tui_202110',
  'BuongDoiTayNhauRaSonTungMTP4184408Hq',
  'ThaiBinhMoHoiRoiSonTungMTP3775757Hq',
  'con-mua-ngang-qua-son-tung-m-tp-dung-khoc-duoi-mua-v.-a-playlist-nhac-cua-tui',
  'chung-ta-khong-thuoc-ve-nhau-son-tung-m-tp-manh-me-len-v.-a-playlist-nhac-cua-tui',
  'sontungmtp-chayngaydi',
  'binh-yen-nhung-phut-giay-son-tung-m-tp',
  'mot-nam-moi-binh-an-son-tung-m-tp-tet-viet-nct-choice-v.-a-playlist-nhac-cua-tui_202308',
  'AnNutNhoThaGiacMoSonTungMTP4009508',
  'NangAmXaDanOfficialRemixSonTungMTPDJTrangMoonDJSlimV3849594Hq',
  'son-tung-mtp-making-my-way'
];

async function getMp3(id) {
  return new Promise(res => {
    https.get('https://archive.org/metadata/' + id + '/files', r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try {
          const j = JSON.parse(d);
          const f = j.result.find(x => x.name && x.name.endsWith('.mp3'));
          if (f) {
            const url = 'https://archive.org/download/' + id + '/' + encodeURIComponent(f.name);
            res({ id, name: f.name, size: f.size, url });
          } else {
            res({ id, error: 'No mp3 found' });
          }
        } catch(e) { res({ id, error: e.message }); }
      });
    }).on('error', e => res({ id, error: e.message }));
  });
}

Promise.all(items.map(getMp3)).then(results => {
  console.log(JSON.stringify(results, null, 2));
});
