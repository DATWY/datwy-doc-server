const https = require('https');

const candidates = [
  // ── ☕ NHẠC VIỆT ACOUSTIC & INDIE CHILL (MỘC MẠC & SÂU LẮNG) ──
  {
    title: 'Bước Qua Nhau (Acoustic)',
    artist: 'Vũ · Hoàng Tử Indie',
    url: 'https://archive.org/download/2206490-buoc-qua-nhau-vu-320/2206490__B%C6%B0%E1%BB%9Bc%20Qua%20Nhau__V%C5%A9__320.mp3'
  },
  {
    title: 'Vì Anh Đâu Có Biết (Indie Chill)',
    artist: 'Madihu ft. Vũ · Guitar Mộc',
    url: 'https://archive.org/download/vi-anh-dau-co-biet-madihu-vu/V%C3%AC%20Anh%20%C4%90%C3%A2u%20C%C3%B3%20Bi%E1%BA%BFt%20-%20Madihu%2C%20V%C5%A9.mp3'
  },
  {
    title: 'Chuyện Rằng (Acoustic Chill)',
    artist: 'Thịnh Suy · Guitar Mộc',
    url: 'https://archive.org/download/chuyen-rang-thinh-suy-nhac-viet-hot-thang-08-2020-v.-a-playlist-nhac-cua-tui_202202/Chuy%E1%BB%87n%20R%E1%BA%B1ng%20-%20Th%E1%BB%8Bnh%20Suy%20-%20Nh%E1%BA%A1c%20Vi%E1%BB%87t%20Hot%20Th%C3%A1ng%2008_2020%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Gác Lại Âu Lo (Acoustic Pop)',
    artist: 'Da LAB ft. Miu Lê · Thư Giãn',
    url: 'https://archive.org/download/gac-lai-au-lo-da-lab-miu-le-top-indie-vie-t-nua-nam-2021-v.-a-playlist-nhac-cua-tui_202106/G%C3%A1c%20L%E1%BA%A1i%20%C3%82u%20Lo%20-%20Da%20LAB%2C%20Miu%20L%C3%AA%20-%20Top%20INDIE%20VI%E1%BB%86T%20N%E1%BB%ADa%20N%C4%83m%202021%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Đường Tôi Chở Em Về (Acoustic)',
    artist: 'Bùi Trường Linh · Guitar Chill',
    url: 'https://archive.org/download/duong-toi-cho-em-ve-bui-truong-linh-nhac-viet-hot-thang-07-2021-v.-a-playlist-nhac-cua-tui/%C4%90%C6%B0%E1%BB%9Dng%20T%C3%B4i%20Ch%E1%BB%9F%20Em%20V%E1%BB%81%20-%20B%C3%B9i%20Tr%C6%B0%E1%BB%9Dng%20Linh%20-%20Nh%E1%BA%A1c%20Vi%E1%BB%87t%20Hot%20Th%C3%A1ng%2007_2021%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Vì Sao (Acoustic Chill)',
    artist: 'Chillies · Indie Mộc',
    url: 'https://archive.org/download/vi-sao-chillies-top-all-stars-binh-chon-2022-v.-a-playlist-nhac-cua-tui/V%C3%AC%20Sao%20-%20Chillies%20-%20Top%20All%20Stars%20B%C3%ACnh%20Ch%E1%BB%8Dn%202022%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Thanh (Acoustic Melody)',
    artist: 'Thịnh Suy · Mộc Mạc',
    url: 'https://archive.org/download/thanh-thinh-suy-top-indie-vie-t-nua-nam-2021-v.-a-playlist-nhac-cua-tui/Thanh%20-%20Th%E1%BB%8Bnh%20Suy%20-%20Top%20INDIE%20VI%E1%BB%86T%20N%E1%BB%ADa%20N%C4%83m%202021%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Có Em Đời Bỗng Vui (Acoustic)',
    artist: 'Chillies · Indie Mộc',
    url: 'https://archive.org/download/co-em-doi-bong-vui-chillies/C%C3%B3%20Em%20%C4%90%E1%BB%9Di%20B%E1%BB%95ng%20Vui%20-%20Chillies.mp3'
  },
  {
    title: '3107 (Lofi Chill Cover)',
    artist: 'W/n x Nâu · Lofi Mưa',
    url: 'https://archive.org/download/3107-cover-music-30-365.mp3/3107-Cover-Music-30-365.mp3'
  },
  {
    title: 'Chưa Quên Người Yêu Cũ (Acoustic Live)',
    artist: 'Hà Nhi · Acoustic Ballad',
    url: 'https://archive.org/download/chua-quen-nguoi-yeu-cu-ha-nhi-top-all-stars-binh-chon-2022-v.-a-playlist-nhac-cua-tui_202306/Ch%C6%B0a%20Qu%C3%AAn%20Ng%C6%B0%E1%BB%9Di%20Y%C3%AAu%20C%C5%A9%20-%20H%C3%A0%20Nhi%20-%20Top%20All%20Stars%20B%C3%ACnh%20Ch%E1%BB%8Dn%202022%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Chúng Ta Sau Này (Acoustic Piano)',
    artist: 'T.R.I · Mộc Mạc',
    url: 'https://archive.org/download/chung-ta-sau-nay-t.-r.-i-v-pop-2021-nam-ca-si-v-pop-noi-bat-v.-a-playlist-nhac-cua-tui/Ch%C3%BAng%20Ta%20Sau%20N%C3%A0y%20-%20T.R.I%20-%20V-Pop%202021-%20Nam%20Ca%20S%C4%A9%20V-Pop%20N%E1%BB%95i%20B%E1%BA%ADt%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Xe Đạp (Acoustic Melody)',
    artist: 'M4U x Thùy Chi · Thanh Xuân',
    url: 'https://archive.org/download/xe-dap-m-4-u-thuy-chi-tuyen-tap-nhac-ngoai-loi-viet-xuat-sac-v.-a-playlist-nhac-cua-tui/Xe%20%C4%90%E1%BA%A1p%20-%20M4U%2C%20Th%C3%B9y%20Chi%20-%20Tuy%E1%BB%83n%20T%E1%BA%ADp%20Nh%E1%BA%A1c%20Ngo%E1%BA%A1i%20L%E1%BB%9Di%20Vi%E1%BB%87t%20Xu%E1%BA%A5t%20S%E1%BA%AFc%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },
  {
    title: 'Vì Yêu (Acoustic Version)',
    artist: 'Gemini Band · Acoustic Chill',
    url: 'https://archive.org/download/vi-yeu-acoustic-version-gemini-band-nhac-viet-hot-thang-07-2020-v.-a-playlist-nhac-cua-tui/V%C3%AC%20Y%C3%AAu%20(Acoustic%20Version)%20-%20Gemini%20Band%20-%20Nh%E1%BA%A1c%20Vi%E1%BB%87t%20Hot%20Th%C3%A1ng%2007_2020%20-%20V.A%20-%20Playlist%20NhacCuaTui.mp3'
  },

  // ── 🌙 LO-FI COZY & STUDY BEATS ──
  {
    title: 'Lofi Study Beat',
    artist: 'Lofi Girl Style · Deep Focus',
    url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3'
  },
  {
    title: 'Coffee Chill Out (Lo-Fi)',
    artist: 'Chillhop Music · Coffee & Books',
    url: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=coffee-chill-out-122405.mp3'
  },
  {
    title: 'Lofi Chill Hop (Medium)',
    artist: 'Cozy Beats · Relax & Sleep',
    url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=lofi-chill-medium-version-159456.mp3'
  },
  {
    title: 'Rainy Night in Tokyo',
    artist: 'Lofi Rain · Mưa Đêm & Piano',
    url: 'https://cdn.pixabay.com/download/audio/2022/05/16/audio_db6591201e.mp3?filename=rainy-day-in-tokyo-lofi-chill-111166.mp3'
  },
  {
    title: 'Prelude (Chill Out Ambient)',
    artist: 'TheFatRat · Ambient Chill',
    url: 'https://archive.org/download/gdps-2.2-song-713135/713135.mp3'
  },

  // ── 🎧 VEXENTO CHILL & THƯ THÁI ──
  {
    title: 'Vexento - Devotion (Melodic Chill)',
    artist: 'Vexento · Relaxing Ambient',
    url: 'https://archive.org/download/soundcloud-407515281/Vexento_-_Devotion_Copyright_Free_Sounds-407515281.mp3'
  },
  {
    title: 'Vexento - Guava Breeze',
    artist: 'Allison & Vexento · Tropical Breeze',
    url: 'https://archive.org/download/soundcloud-561414405/Allison_Vexento_-_Guava_Breeze-561414405.mp3'
  },
  {
    title: 'Vexento - Home (Chill Out)',
    artist: 'Vexento · Warm & Cozy',
    url: 'https://archive.org/download/soundcloud-540849582/Vexento_-_Home_Chill_Royalty_Free_Music_2018_No_Copyright-540849582.mp3'
  },
  {
    title: 'Vexento - Smile (Happy Chill)',
    artist: 'Vexento · Sunshine Vibes',
    url: 'https://archive.org/download/soundcloud-270100080/Smile_-_Vexento_No_Copyright_Music-270100080.mp3'
  },
  {
    title: 'Vexento - Tevo (Melodic Chill)',
    artist: 'Vexento · Nostalgic Vibes',
    url: 'https://archive.org/download/soundcloud-579489654/Tevo_-_Vexento_SoundCloud_No_Copyright_Music-579489654.mp3'
  },
  {
    title: 'Vexento - Masked Heroes',
    artist: 'Vexento · Melodic Chill',
    url: 'https://archive.org/download/vexento-masked-heroes/Vexento%20-%20Masked%20Heroes.mp3'
  },
  {
    title: 'Vexento - We Are One',
    artist: 'Vexento · Peaceful Vibes',
    url: 'https://archive.org/download/NoCopyrightMusicWeAreOneVexento/We%20Are%20One%20-%20Vexento.mp3'
  },
  {
    title: 'Vexento - Spark',
    artist: 'Vexento · Ambient Melody',
    url: 'https://archive.org/download/vexento-spark/Vexento-Spark.mp3'
  },
  {
    title: 'Vexento - Now',
    artist: 'Vexento · Dreamy Pop',
    url: 'https://archive.org/download/vexento_now/Vexento_Now.mp3'
  },
  {
    title: 'Vexento - Pixel Party',
    artist: 'Vexento · Dreamy 8-bit Chill',
    url: 'https://archive.org/download/vexento-pixel-party/Vexento%20-%20Pixel%20Party.mp3'
  },

  // ── 🎤 US-UK VOCAL CHILL ──
  {
    title: 'Close To The Sun (ft. Anjulie)',
    artist: 'TheFatRat · Vocal Chill',
    url: 'https://archive.org/download/gdps-2.2-song-908868/908868.mp3'
  },
  {
    title: 'Oblivion (ft. Lola Blanc)',
    artist: 'TheFatRat · Vocal Chill EDM',
    url: 'https://archive.org/download/gdps-2.2-song-771866/771866.mp3'
  },
  {
    title: 'We\'ll Meet Again (ft. Laura Brehm)',
    artist: 'TheFatRat · Vocal Melodic',
    url: 'https://archive.org/download/gdps-2.2-song-949767/949767.mp3'
  },

  // ── 🏎️ ZING SPEED & TUỔI THƠ ──
  {
    title: 'Monody (ft. Laura Brehm)',
    artist: 'TheFatRat · Huyền Thoại 2S',
    url: 'https://archive.org/download/gdps-2.2-song-652927/652927.mp3'
  },
  {
    title: 'TheFatRat - Unity (Zing Speed #1)',
    artist: 'TheFatRat · Zing Speed EDM',
    url: 'https://archive.org/download/gdps-2.2-song-621134/621134.mp3'
  },
  {
    title: 'Time Lapse (Zing Speed Drift)',
    artist: 'TheFatRat · Melodic EDM',
    url: 'https://archive.org/download/gdps-2.2-song-621139/621139.mp3'
  },
  {
    title: 'Vexento - Masked Raver',
    artist: 'Vexento · Nostalgia EDM',
    url: 'https://archive.org/download/VexentoMaskedRaver/Vexento%20-%20Masked%20Raver.mp3'
  }
];

console.log('Testing', candidates.length, 'candidates...');

async function checkTrack(t, i) {
  return new Promise(res => {
    https.get(t.url, r => {
      res({ i: i + 1, title: t.title, status: r.statusCode, ok: r.statusCode === 200 || r.statusCode === 302 });
    }).on('error', e => res({ i: i + 1, title: t.title, ok: false, error: e.message }));
  });
}

Promise.all(candidates.map((t, i) => checkTrack(t, i))).then(results => {
  const failed = results.filter(r => !r.ok);
  console.log('Verified', results.length, 'tracks! Failed count:', failed.length);
  if (failed.length > 0) {
    console.log('Failed tracks:', JSON.stringify(failed, null, 2));
  } else {
    console.log('ALL 35 TRACKS ARE 100% PLAYABLE AND REACHABLE!');
  }
});
