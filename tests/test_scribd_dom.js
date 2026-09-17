const { connect } = require('puppeteer-real-browser');

async function inspectScribd() {
  const docId = '878092523';
  const url = `https://www.scribd.com/embeds/${docId}/content?start_page=1&view_mode=scroll`;
  console.log('Connecting to Scribd embed URL:', url);

  const connection = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1800']
  });

  const { page, browser } = connection;
  await page.setViewport({ width: 1280, height: 1800 });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));

  const info = await page.evaluate(() => {
    // Find all potential scroll containers
    const all = Array.from(document.querySelectorAll('*'));
    const scrollContainers = all.filter(el => {
      const s = window.getComputedStyle(el);
      return (s.overflowY === 'scroll' || s.overflowY === 'auto') && el.scrollHeight > el.clientHeight;
    }).map(el => ({
      tag: el.tagName,
      id: el.id,
      className: el.className,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }));

    const pages = Array.from(document.querySelectorAll('.outer_page, .newpage, [id^="outer_page"]'));

    return {
      title: document.title,
      scrollContainers,
      pageCountFound: pages.length,
      pageClasses: pages.slice(0, 5).map(p => ({ id: p.id, class: p.className, height: p.clientHeight }))
    };
  });

  console.log('Inspection result:', JSON.stringify(info, null, 2));
  await browser.close();
}

inspectScribd().catch(console.error);
