import { test, expect } from '@playwright/test';
const testStyle={version:8,sources:{},layers:[{id:'test-background',type:'background',paint:{'background-color':'#17271e'}}]};
test.beforeEach(async({page})=>{await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:testStyle}));});
test('live MapLibre, controls, real backend contract, walking directions and map selection',async({page})=>{
 const requests=[];page.on('request',r=>{if(r.url().endsWith('/api/itineraries'))requests.push(r.postDataJSON());});
 await page.goto('/');await expect(page.getByRole('switch',{name:'Use demo data'})).toBeEnabled();await expect(page.locator('.maplibregl-canvas')).toBeVisible();
 await page.getByRole('slider',{name:'Search radius in meters'}).focus();await page.keyboard.press('End');
 await page.getByRole('radio',{name:'$',exact:true}).click();await page.getByRole('button',{name:'Generate route',exact:true}).click();
 await expect(page.getByText('Test Rose Garden',{exact:true})).toBeVisible();await expect(page.getByText('REAL NEARBY PLACES',{exact:true})).toBeVisible();
 expect(requests[0]).toMatchObject({vibe:'Date',radius:2000,budget:1,demoMode:false});
 await page.getByRole('button',{name:'Toggle walking directions'}).click();await expect(page.getByText('1. Start walking on Test Walkway',{exact:true}).first()).toBeVisible();
 await expect(page.getByText(/% match/).first()).toBeVisible();await expect(page.getByText('MOCK PRICE',{exact:true}).first()).toBeVisible();
 await page.locator('.maplibregl-canvas').click({position:{x:65,y:145}});await expect(page.getByText('Test Rose Garden',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Generate route',exact:true}).click();await expect(page.getByText('Test Rose Garden',{exact:true})).toBeVisible();expect(requests[1].start).not.toEqual(requests[0].start);
});
test('sample mode is explicit and uses a keyless schematic',async({page})=>{
 await page.goto('/');await expect(page.getByRole('switch',{name:'Use demo data'})).toBeEnabled();await page.getByRole('switch',{name:'Use demo data'}).click();
 await expect(page.getByRole('button',{name:'Schematic map. Tap to choose a starting point.'})).toBeVisible();await page.getByRole('radio',{name:'Friends',exact:true}).click();
 await page.getByRole('button',{name:'Generate route',exact:true}).click();await expect(page.getByText('The Shared Table',{exact:true})).toBeVisible();await expect(page.getByText('DEMO ITINERARY',{exact:true})).toBeVisible();
});
test('API failure never silently replaces real venues with samples',async({page})=>{
 await page.route('**/api/itineraries',route=>route.abort());await page.goto('/');await expect(page.getByRole('switch',{name:'Use demo data'})).toBeEnabled();
 await page.getByRole('button',{name:'Generate route',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Cannot reach the backend');await expect(page.getByText('Garden & Gallery',{exact:true})).toHaveCount(0);
});
test('changing inputs cancels delayed route generation',async({page})=>{
 await page.route('**/api/itineraries',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue().catch(()=>{});});
 await page.goto('/');await expect(page.getByRole('switch',{name:'Use demo data'})).toBeEnabled();await page.getByRole('button',{name:'Generate route',exact:true}).click();await page.getByRole('radio',{name:'Family',exact:true}).click();await expect(page.getByRole('radio',{name:'Family',exact:true})).toBeChecked();await page.waitForTimeout(900);await expect(page.getByText('Test Rose Garden',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Generate route',exact:true})).toBeEnabled();
});
test('tile failure offers a schematic while live venue search remains usable',async({page})=>{
 await page.unroute('https://tiles.openfreemap.org/**');await page.route('https://tiles.openfreemap.org/**',route=>route.abort());await page.goto('/');
 await expect(page.getByText(/Basemap unavailable/)).toBeVisible();await page.getByRole('button',{name:'Generate route',exact:true}).click();await expect(page.getByText('Test Rose Garden',{exact:true})).toBeVisible();
});

test('a venue timeout offers a usable return to the cached starting point',async({page})=>{
 let requests=0;await page.route('**/api/itineraries',route=>++requests===1?route.fulfill({status:502,json:{error:{code:'PROVIDER_UNAVAILABLE',message:'Nearby venue search timed out. Try the Rustaveli start for cached Tbilisi places, or try live search again later.'}}}):route.continue());
 await page.goto('/');await expect(page.getByRole('switch',{name:'Use demo data'})).toBeEnabled();await expect(page.locator('.maplibregl-canvas')).toBeVisible();
 await page.locator('.maplibregl-canvas').click({position:{x:45,y:140}});await page.getByRole('button',{name:'Generate route',exact:true}).click();await expect(page.getByRole('alert')).toContainText('timed out');
 await page.getByRole('button',{name:'Use Rustaveli starting point',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await page.getByRole('button',{name:'Generate route',exact:true}).click();await expect(page.getByText('Test Rose Garden',{exact:true})).toBeVisible();
});

test('Friends ends at a pub and explains the nightlife choice',async({page})=>{
 await page.goto('/');await expect(page.getByRole('switch',{name:'Use demo data'})).toBeEnabled();await page.getByRole('radio',{name:'Friends',exact:true}).click();await expect(page.getByText(/Games, shared plates, bars and clubs/)).toBeVisible();
 await page.getByRole('button',{name:'Generate route',exact:true}).click();const pub=page.getByRole('button',{name:/^Stop 3, Test (Pub|Second Pub|Copper Bar)$/});await pub.scrollIntoViewIfNeeded();await expect(pub).toBeVisible();await expect(pub).toContainText(/PUB STOP|BAR STOP/);await expect(pub).toContainText(/(Pub|Bar) for your night out/);await expect(page.getByText(/Confirm tonight’s events and entry requirements/)).toBeVisible();
});
