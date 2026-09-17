const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');

async function testStudocu() {
  const courseUrl = 'https://www.studocu.vn/vn/course/truong-dai-hoc-cong-nghiep-thanh-pho-ho-chi-minh/kien-truc-may-tinh/5859487';
  console.log('Connecting to Studocu to inspect quality...');

  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,1900']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1400, height: 1900, deviceScaleFactor: 2 });

  await page.goto(courseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Extract first document URL
  const docUrl = await page.evaluate(() => {
    const link = document.querySelector('a[href*="/document/"]');
    return link ? link.href : null;
  });

  console.log('First document in course:', docUrl);
  if (!docUrl) {
    console.error('No document link found on course page!');
    await browser.close();
    return;
  }

  await page.goto(docUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  // Inspect page elements
  const pageDetails = await page.evaluate(() => {
    const pfList = Array.from(document.querySelectorAll('.pf'));
    const images = Array.from(document.querySelectorAll('.pf img, img.bi, .bi'));
    const textLayers = Array.from(document.querySelectorAll('.pf .t, .pf .c, .pf .pc'));

    return {
      title: document.title,
      pfCount: pfList.length,
      imageCount: images.length,
      sampleImages: images.slice(0, 5).map(img => ({
        src: img.src ? img.src.substring(0, 100) : '',
        bg: img.style.backgroundImage || getComputedStyle(img).backgroundImage,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        className: img.className
      })),
      textCount: textLayers.length,
      sampleText: textLayers.slice(0, 5).map(t => t.innerText || t.textContent)
    };
  });

  console.log('Page details:', JSON.stringify(pageDetails, null, 2));

  await browser.close();
}

testStudocu().catch(console.error);
