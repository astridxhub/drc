const axios = require('axios');

async function test() {
  const urls = [
    'https://wetv.vip/id/channel/10054?id=10054',
    'https://wetv.vip/id/channel/10054?id=10054&type=PAGE_TYPE_MODULE_LIST',
  ];
  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 15000,
      });
      console.log(`${url}: status=${res.status}, length=${res.data.length}`);
      const match = res.data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (match) {
        const data = JSON.parse(match[1]);
        const modules = data.props?.pageProps?.data?.modules;
        if (modules) console.log(`  modules: ${modules.length}, names: ${modules.map(m => m.name).join(', ')}`);
        else console.log('  No modules found');
      } else {
        console.log('  No __NEXT_DATA__ found');
      }
    } catch (err) {
      console.log(`${url}: ERROR ${err.response?.status || err.message}`);
    }
  }
}
test().catch(e => console.error(e.message));
