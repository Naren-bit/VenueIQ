const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:3001');
  
  console.log("Page loaded. Clicking demo button...");
  
  // Wait a sec for sockets to connect
  await new Promise(r => setTimeout(r, 1000));
  
  await page.evaluate(() => {
    if (window.triggerDemoMode) {
      window.triggerDemoMode();
    } else {
      console.log('triggerDemoMode not found on window');
    }
  });
  
  // Wait to see if error happens
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
