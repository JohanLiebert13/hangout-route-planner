import type {Budget,Place} from '../src/types';
export const BUDGET_LIMITS:Record<Budget,number>={1:25,2:50,3:100};
export function priceTier(amount:number):number {return amount===0?0:amount<=25?1:amount<=50?2:amount<=100?3:4;}
export function fitsBudget(place:Pick<Place,'priceEstimate'|'priceLevel'>,level:number):boolean {
 const amount=place.priceEstimate?.amount,limit=level===0?0:level===4?Infinity:BUDGET_LIMITS[level as Budget];
 return typeof amount==='number'&&Number.isFinite(amount)&&amount>=0&&limit!==undefined&&amount<=limit&&(place.priceLevel===undefined||place.priceLevel<=level);
}
export function estimatedTotal(stops:Pick<Place,'priceEstimate'>[]):number|undefined {if(stops.length!==3||stops.some(s=>!s.priceEstimate||s.priceEstimate.currency!=='GEL'||!Number.isFinite(s.priceEstimate.amount)||s.priceEstimate.amount<0))return undefined;return stops.reduce((sum,s)=>sum+s.priceEstimate!.amount,0);}
