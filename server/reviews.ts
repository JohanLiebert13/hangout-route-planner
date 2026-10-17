import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { distanceBetween, validCoordinate } from './geo.ts';
import type { Place, PlaceReview, Coordinate } from '../src/types';
type Snapshot = { id: string; names: string[]; coordinate: Coordinate; rating: number; reviewCount: number; sourceName: string; sourceUrl: string; summary: string };
let researchedOn='', snapshots: Snapshot[]=[];
try {
  const data=JSON.parse(readFileSync(new URL('../data/review-snapshots.json',import.meta.url),'utf8'));
  if (/^\d{4}-\d{2}-\d{2}$/.test(data.researchedOn)&&Array.isArray(data.places)) {
    researchedOn=data.researchedOn;
    snapshots=data.places.filter((r:Snapshot)=>typeof r.id==='string'&&Array.isArray(r.names)&&r.names.every(n=>typeof n==='string')&&validCoordinate(r.coordinate)&&Number.isFinite(r.rating)&&r.rating>=1&&r.rating<=5&&Number.isSafeInteger(r.reviewCount)&&r.reviewCount>0&&r.sourceName==='Tripadvisor'&&typeof r.summary==='string'&&typeof r.sourceUrl==='string'&&r.sourceUrl.startsWith('https://www.tripadvisor.com/'));
  }
} catch { /* Missing optional research must never prevent a route. */ }
function hash(text:string):number {let value=2166136261;for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);return value>>>0;}
export function mockReview(id:string):PlaceReview {
  const rating=(30+hash('hangout-demo-reviews-v1:'+id)%20)/10;
  const summary=rating>=4.6?'Sample feedback: a standout overall experience.':rating>=4.1?'Sample feedback: enjoyable, with a few trade-offs.':rating>=3.5?'Sample feedback: decent overall; expectations vary.':'Sample feedback: mixed experience; consider another stop.';
  return {rating,source:'mock',summary};
}
export function reviewForPlace(place:Pick<Place,'id'|'name'|'coordinate'|'sample'>):PlaceReview {
  if (!place.sample) {
    const found=snapshots.find(r=>r.id===place.id&&r.names.some(n=>n.toLowerCase()===place.name.trim().toLowerCase())&&distanceBetween(place.coordinate,r.coordinate)<150);
    if(found)return {rating:found.rating,source:'snapshot',summary:found.summary,reviewCount:found.reviewCount,sourceName:found.sourceName,sourceUrl:found.sourceUrl,researchedOn};
  }
  return mockReview(place.id);
}
// Quality affects ordering separately, so the displayed vibe-match percentage stays meaningful.
export function reviewAdjustment(place:Pick<Place,'review'>):number {
  const r=place.review;if(!r||!Number.isFinite(r.rating)||r.rating<1||r.rating>5)return 0;
  const count=r.source==='snapshot'&&typeof r.reviewCount==='number'&&Number.isSafeInteger(r.reviewCount)&&r.reviewCount>0?r.reviewCount:0;
  // Shrink small real samples toward 4.0 instead of treating 16 reviews like 300.
  const effective=r.source==='snapshot'?(r.rating*count+4*20)/(count+20):r.rating;
  return (effective-4)*6;
}
export function recommendationScore(place:Pick<Place,'matchScore'|'review'>):number {return place.matchScore+reviewAdjustment(place);}
