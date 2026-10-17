import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const research=JSON.parse(readFileSync(new URL('../../data/review-snapshots.json',import.meta.url),'utf8'));
const style={version:8,sources:{},layers:[{id:'bg',type:'background',paint:{'background-color':'#17271e'}}]};
async function prepare(page){await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:style}));await page.goto('/');await expect(page.getByRole('switch',{name:'Use demo data'})).toBeEnabled();}
async function generate(page){const pending=page.waitForResponse(r=>r.url().endsWith('/api/itineraries')&&r.request().method()==='POST');await page.getByRole('button',{name:'Generate route',exact:true}).click();const response=await pending;expect(response.status()).toBe(200);return response.json();}
test('mock scores and feedback are clearly labeled and stay stable when regenerated',async({page})=>{
 await prepare(page);await page.getByRole('switch',{name:'Use demo data'}).click();const first=await generate(page);
 for(let i=0;i<3;i++){const card=page.getByRole('button',{name:'Stop '+(i+1)+', '+first.stops[i].name,exact:true});await expect(card).toContainText('DEMO RATING');await expect(card).toContainText(first.stops[i].review.rating.toFixed(1));await expect(card).toContainText('Sample feedback:');await expect(card).toContainText('not customer reviews');expect(first.stops[i].review.reviewCount).toBeUndefined();}
 const second=await generate(page);expect(second.stops.map(p=>p.review)).toEqual(first.stops.map(p=>p.review));
});
test('online snapshots show the original source, review count and date separately from demo ratings',async({page,context})=>{
 await prepare(page);const online=research.places[0];await page.route('**/api/itineraries',async route=>{const response=await route.fetch(),plan=await response.json();plan.stops[1]={...plan.stops[1],id:online.id,name:online.names[0],coordinate:online.coordinate,review:{rating:online.rating,source:'snapshot',summary:online.summary,sourceName:online.sourceName,sourceUrl:online.sourceUrl,reviewCount:online.reviewCount,researchedOn:research.researchedOn}};await route.fulfill({json:plan});});
 await generate(page);const card=page.getByRole('button',{name:'Stop 2, Shatre',exact:true});await expect(card).toContainText('ONLINE SNAPSHOT');await expect(card).toContainText('189 reviews');await expect(card).toContainText('2026-10-17');await expect(card).not.toContainText('DEMO RATING');
 await context.route('https://www.tripadvisor.com/**',r=>r.fulfill({contentType:'text/html',body:'<title>Review source</title>Review source'}));const popup=page.waitForEvent('popup');await page.getByRole('link',{name:'Read Shatre reviews on Tripadvisor',exact:true}).click();const opened=await popup;await expect(opened).toHaveURL(online.sourceUrl);await opened.close();
});
test('older saved itineraries without reviews remain usable',async({page})=>{
 await prepare(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/itineraries',async route=>{const response=await route.fetch(),plan=await response.json();for(const stop of plan.stops)delete stop.review;await route.fulfill({json:plan});});await generate(page);await expect(page.getByText('Ratings unavailable for this saved route.',{exact:true})).toHaveCount(3);await expect(page.getByRole('button',{name:'Swap stop 1',exact:true})).toBeEnabled();expect(errors).toEqual([]);
});
