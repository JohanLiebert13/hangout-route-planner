import { createApp } from '../../server/app.ts';
import { GroupStore } from '../../server/groups.ts';
import { upgradeProvider } from '../fixtures/upgrades.mjs';
import { settings, fakeProvider } from '../fixtures/providers.mjs';
export default async function setup() {
 const app=createApp({groupStore:new GroupStore(null),snapshot:null,config:()=>settings({port:63120,rateLimit:100}),fetchImpl:upgradeProvider});
 await new Promise((resolve,reject)=>{app.once('error',reject);app.listen(63120,'127.0.0.1',resolve);});
 return async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));};
}
