// Opt-in, one-view browser QA against the running private MVP. Uses public tiles sparingly.
import {chromium} from '@playwright/test';import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:63119/');await page.getByRole('switch',{name:'Use demo data'}).waitFor();
if(process.argv[2]==='Friends')await page.getByRole('radio',{name:'Friends',exact:true}).click();
const response=page.waitForResponse(r=>r.url().endsWith('/api/itineraries')&&r.request().method()==='POST');await page.getByRole('button',{name:'Generate route',exact:true}).click();const res=await response;const plan=await res.json();
await page.getByText('The day is yours.',{exact:true}).waitFor({timeout:35000});await page.waitForTimeout(1500);
await page.evaluate(()=>{for(const el of document.querySelectorAll('div'))if(el.scrollHeight>el.clientHeight+100&&getComputedStyle(el).overflowY==='auto')el.scrollTop=0;});
await page.waitForTimeout(300);await page.screenshot({path:'artifacts/mvp-keyless-map.png'});
await page.getByText('The day is yours.',{exact:true}).scrollIntoViewIfNeeded();if(process.argv[2]==='Friends')await page.getByRole('button',{name:'Stop 3, '+plan.stops[2].name,exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:process.argv[2]==='Friends'?'artifacts/mvp-friends-nightlife.png':'artifacts/mvp-keyless-results.png'});
console.log(JSON.stringify({http:res.status(),source:plan.source,catalogSource:plan.catalogSource,stops:plan.stops?.map(s=>({name:s.name,type:s.tags.amenity||s.tags.leisure||s.tags.tourism,label:s.label})),routing:plan.route?.source,mapCanvas:await page.locator('.maplibregl-canvas').count(),snapshotBadge:await page.getByText('OSM snapshot',{exact:true}).count(),errors},null,2));
}finally{await browser.close();}
