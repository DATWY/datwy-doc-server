const https = require('https');

const sonTungTracks = [
  {
    title: 'Muộn Rồi Mà Sao Còn',
    artist: 'Sơn Tùng M-TP · Pop Chill',
    url: 'https://archive.org/download/muon-roi-ma-sao-con-son-tung-m-tp-top-100-nhac-tre-hay-nhat-v.-a-playlist-nhac-cua-tui/Mu%E1%BB%99n%20R%E1%BB%93i%20M%C3%A0%20Sao%20C%C3%B2n%20-%20S%C6%A1n%20T%C3%B9ng%20M-TP%20-%20Top%20100%20Nh%E1%BA%A1c%20Tr%E1%BA%BB%20Hay%20Nh%E1%BA%A5t%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Chắc Ai Đó Sẽ Về',
    artist: 'Sơn Tùng M-TP · Ballad Sâu Lắng',
    url: 'https://archive.org/download/ChacAiDoSeVeSonTungMTP/ChacAiDoSeVe-SonTungMTP.mp3'
  },
  {
    title: 'Em Của Ngày Hôm Qua',
    artist: 'Sơn Tùng M-TP · Hit Huyền Thoại',
    url: 'https://archive.org/download/EmCuaNgayHomQuaSonTungMTP/Em%20Cua%20Ngay%20Hom%20Qua%20-%20Son%20Tung%20MTP.mp3'
  },
  {
    title: 'Hãy Trao Cho Anh (ft. Snoop Dogg)',
    artist: 'Sơn Tùng M-TP · Latin Trap',
    url: 'https://archive.org/download/hay-trao-cho-anh-son-tung-m-tp-snoop-dogg-top-100-nhac-tre-hay-nhat-v.-a-playlist-nhac-cua-tui_202110/H%C3%A3y%20Trao%20Cho%20Anh%20-%20S%C6%A1n%20T%C3%B9ng%20M-TP%2C%20Snoop%20Dogg%20-%20Top%20100%20Nh%E1%BA%A1c%20Tr%E1%BA%BB%20Hay%20Nh%E1%BA%A5t%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Buông Đôi Tay Nhau Ra',
    artist: 'Sơn Tùng M-TP · Pop R&B',
    url: 'https://archive.org/download/BuongDoiTayNhauRaSonTungMTP4184408Hq/BuongDoiTayNhauRa-SonTungMTP-4184408_hq.mp3'
  },
  {
    title: 'Thái Bình Mồ Hôi Rơi',
    artist: 'Sơn Tùng M-TP · Cảm Xúc Quê Hương',
    url: 'https://archive.org/download/ThaiBinhMoHoiRoiSonTungMTP3775757Hq/ThaiBinhMoHoiRoi-SonTungMTP-3775757_hq.mp3'
  },
  {
    title: 'Cơn Mưa Ngang Qua',
    artist: 'Sơn Tùng M-TP · Siêu Phẩm Đầu Tay',
    url: 'https://archive.org/download/con-mua-ngang-qua-son-tung-m-tp-dung-khoc-duoi-mua-v.-a-playlist-nhac-cua-tui/C%C6%A1n%20M%C6%B0a%20Ngang%20Qua%20-%20S%C6%A1n%20T%C3%B9ng%20M-TP%20-%20%C4%90%E1%BB%ABng%20Kh%C3%B3c%20D%C6%B0%E1%BB%9Bi%20M%C6%B0a%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Chúng Ta Không Thuộc Về Nhau',
    artist: 'Sơn Tùng M-TP · Tropical Pop',
    url: 'https://archive.org/download/chung-ta-khong-thuoc-ve-nhau-son-tung-m-tp-manh-me-len-v.-a-playlist-nhac-cua-tui/Ch%C3%BAng%20Ta%20Kh%C3%B4ng%20Thu%E1%BB%99c%20V%E1%BB%81%20Nhau%20-%20S%C6%A1n%20T%C3%B9ng%20M-TP%20-%20M%E1%BA%A1nh%20M%E1%BA%BD%20L%C3%AAn%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Chạy Ngay Đi',
    artist: 'Sơn Tùng M-TP · Hiphop Trap',
    url: 'https://archive.org/download/sontungmtp-chayngaydi/S%C6%A1n%20T%C3%B9ng%20M-TP%20%E2%80%93%20Ch%E1%BA%A1y%20Ngay%20%C4%90i.mp3'
  },
  {
    title: 'Bình Yên Những Phút Giây',
    artist: 'Sơn Tùng M-TP · Mùa Hè Tươi Mát',
    url: 'https://archive.org/download/binh-yen-nhung-phut-giay-son-tung-m-tp/Binh%20Yen%20Nhung%20Phut%20Giay%20-%20Son%20Tung%20M%20TP.mp3'
  },
  {
    title: 'Một Năm Mới Bình An',
    artist: 'Sơn Tùng M-TP · Rộn Ràng & Vui Tươi',
    url: 'https://archive.org/download/mot-nam-moi-binh-an-son-tung-m-tp-tet-viet-nct-choice-v.-a-playlist-nhac-cua-tui_202308/M%E1%BB%99t%20N%C4%83m%20M%E1%BB%9Bi%20B%C3%ACnh%20An%20-%20S%C6%A1n%20T%C3%B9ng%20M-TP%20-%20T%E1%BA%BFt%20Vi%E1%BB%87t-%20NCT%20Choice%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Ấn Nút Nhớ... Thả Giấc Mơ',
    artist: 'Sơn Tùng M-TP · Nhẹ Nhàng & Sâu Lắng',
    url: 'https://archive.org/download/AnNutNhoThaGiacMoSonTungMTP4009508/AnNutNhoThaGiacMo-SonTungMTP-4009508.mp3'
  },
  {
    title: 'Nắng Ấm Xa Dần (Remix SlimV)',
    artist: 'Sơn Tùng M-TP · The Remix Bùng Nổ',
    url: 'https://archive.org/download/NangAmXaDanOfficialRemixSonTungMTPDJTrangMoonDJSlimV3849594Hq/NangAmXaDanOfficialRemix-SonTungMTPDJTrangMoonDJSlimV-3849594_hq.mp3'
  },
  {
    title: 'Making My Way',
    artist: 'Sơn Tùng M-TP · Electronic Dance',
    url: 'https://archive.org/download/son-tung-mtp-making-my-way/SON%20TUNG%20MTP%20MAKING%20MY%20WAY.mp3'
  }
];

async function check(t, idx) {
  return new Promise(res => {
    https.get(t.url, r => {
      res({ idx: idx + 1, title: t.title, status: r.statusCode, ok: r.statusCode === 200 || r.statusCode === 302 });
    }).on('error', e => res({ idx: idx + 1, title: t.title, ok: false, error: e.message }));
  });
}

Promise.all(sonTungTracks.map(check)).then(results => {
  console.log(JSON.stringify(results, null, 2));
  const allOk = results.every(r => r.ok);
  console.log('ALL SƠN TÙNG TRACKS OK?', allOk);
});
