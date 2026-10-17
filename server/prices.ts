import type {Place,PriceEstimate} from '../src/types';
function hash(text:string):number {let value=2166136261;for(let i=0;i<text.length;i++)value=Math.imul(value^text.charCodeAt(i),16777619);return value>>>0;}
export function mockPrice(place:Pick<Place,'id'|'tags'|'priceLevel'>):PriceEstimate {
 const t=place.tags,a=t.amenity,seed=hash('hangout-price-v1:'+place.id);
 let values=[10,15,20,25,30,40,50],includes='Standard entry';
 if(a==='restaurant'){values=[18,20,24,28,32,35,40,45,55,65,80,95];includes='One meal + a soft drink';}
 else if(['fast_food','food_court'].includes(a)){values=[10,12,15,18,20,25,28];includes='One casual meal + a soft drink';}
 else if(['cafe','ice_cream'].includes(a)){values=[8,10,12,15,18,20,24,28,35];includes='One drink + a small treat';}
 else if(['bar','pub'].includes(a)){values=[12,15,18,22,25,28,32,40,50,65];includes='One drink';}
 else if(a==='nightclub'){values=[25,35,45,50,60,75,90,120];includes='Entry + one drink';}
 else if(['park','garden','playground'].includes(t.leisure)||t.tourism==='viewpoint'){values=t.fee==='yes'?[5,10,15,20,25]:[0];includes='Entry only';}
 else if(t.tourism==='gallery'){values=[0,10,15,20,25,35];}
 else if(['amusement_arcade','bowling_alley','sports_centre'].includes(t.leisure)){values=[15,20,25,30,40,50,65];includes='One activity session';}
 let amount=values[seed%values.length];
 if(place.priceLevel!==undefined){const ranges=[[0,0],[a==='nightclub'?20:8,25],[28,50],[55,100],[110,160]],range=ranges[place.priceLevel];if(range)amount=range[0]+seed%(range[1]-range[0]+1);}
 return {amount,currency:'GEL',source:'mock',includes,model:'tbilisi-2026-v1'};
}
