import { randomBytes,createHash } from 'node:crypto';
import { readFile,writeFile,mkdir,rename } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { PROJECT_ROOT } from './config.ts';
import { PlannerError } from './errors.ts';
import type { GroupPoll,Itinerary } from '../src/types';
type Stored=Omit<GroupPoll,'totalVotes'|'myVote'> & {ballots:Record<string,string>};
export function newVoterToken():string{return randomBytes(32).toString('base64url');}
export function validVoter(token:unknown):token is string{return typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);}
export class GroupStore {
 private file:string|null;private groups:Record<string,Stored>={};private loaded:Promise<void>|null=null;private tail:Promise<unknown>=Promise.resolve();
 constructor(file:string|null=resolve(PROJECT_ROOT,'var/groups.json')){this.file=file;}
 private load(){if(!this.loaded)this.loaded=(async()=>{if(!this.file)return;try{this.groups=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}})();return this.loaded;}
 private async write(){if(!this.file)return;await mkdir(dirname(this.file),{recursive:true});const temp=this.file+'.tmp';await writeFile(temp,JSON.stringify(this.groups));await rename(temp,this.file);}
 private transaction<T>(action:()=>Promise<T>):Promise<T>{const work=this.tail.then(async()=>{await this.load();return action();});this.tail=work.catch(()=>{});return work;}
 private current(id:string):Stored{const group=this.groups[id];if(!group||Date.parse(group.expiresAt)<=Date.now())throw new PlannerError('This vote does not exist or has expired.',404,'POLL_NOT_FOUND');return group;}
 private view(group:Stored,token?:string):GroupPoll {const counts:Record<string,number>={};for(const vote of Object.values(group.ballots))counts[vote]=(counts[vote]||0)+1;return {revision:group.revision??0,id:group.id,title:group.title,createdAt:group.createdAt,expiresAt:group.expiresAt,options:group.options.map(option=>({...option,itinerary:structuredClone(option.itinerary),votes:counts[option.id]||0})),totalVotes:Object.keys(group.ballots).length,myVote:token?group.ballots[createHash('sha256').update(token).digest('hex')]:undefined};}
 async create(title:string,itineraries:Itinerary[],token?:string):Promise<GroupPoll>{return this.transaction(async()=>{
  for(const [id,g] of Object.entries(this.groups))if(Date.parse(g.expiresAt)<=Date.now())delete this.groups[id];
  if(Object.keys(this.groups).length>=200)throw new PlannerError('The local vote store is full. Try again after older votes expire.',429,'POLL_LIMIT');
  if(itineraries.length<2||itineraries.length>3)throw new PlannerError('A vote needs two or three different routes.',400,'INVALID_INPUT');
  if(new Set(itineraries.map(plan=>plan.stops.map(stop=>stop.id).join())).size!==itineraries.length)throw new PlannerError('Vote options must be different routes.',400,'INVALID_OPTIONS');
  const group:Stored={revision:0,id:randomBytes(16).toString('base64url'),title:title.trim()||'Our hangout',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*86400000).toISOString(),options:itineraries.map((itinerary,i)=>({id:String.fromCharCode(65+i),label:'Route '+String.fromCharCode(65+i),itinerary:structuredClone(itinerary),votes:0})),ballots:{}};
  this.groups[group.id]=group;try{await this.write();}catch(e){delete this.groups[group.id];throw e;}return this.view(group,token);
 });}
 async get(id:string,token?:string):Promise<GroupPoll>{return this.transaction(async()=>this.view(this.current(id),token));}
 async vote(id:string,optionId:string,token:string):Promise<GroupPoll>{if(!validVoter(token))throw new PlannerError('A valid anonymous voter token is required.',400,'INVALID_VOTER');return this.transaction(async()=>{
  const group=this.current(id);if(!group.options.some(o=>o.id===optionId))throw new PlannerError('Choose one of this vote’s routes.',400,'INVALID_OPTION');
  const key=createHash('sha256').update(token).digest('hex'),previous=group.ballots[key],previousRevision=group.revision??0;if(previous===optionId)return this.view(group,token);if(!previous&&Object.keys(group.ballots).length>=2000)throw new PlannerError('This vote is full.',429,'POLL_LIMIT');group.ballots[key]=optionId;group.revision=previousRevision+1;
  try{await this.write();}catch(e){if(previous)group.ballots[key]=previous;else delete group.ballots[key];group.revision=previousRevision;throw e;}return this.view(group,token);
 });}
}
