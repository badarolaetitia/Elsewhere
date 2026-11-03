export type Collection = 'saved' | 'visits' | 'plans';
export type Item = {id:string;[key:string]:unknown};
export type Pending = {kind:Collection;id:string;data:Item|null;revision:number};
const legacy:Record<Collection,string>={saved:'elsewhere.saved.v1',visits:'elsewhere.visits.v1',plans:'elsewhere.plans.v1'};
let owner='guest';
let revision=Date.now();
let persist:((key:string,value:string)=>void)|undefined;
export function configurePersistence(callback:(key:string,value:string)=>void){persist=callback;}
export function hydrateLocalData(entries:readonly (readonly [string,string|null])[]){for(const [key,value] of entries)if(value!==null)memory.set(key,value);emit();}
const memory=new Map<string,string>();
const listeners=new Set<()=>void>();
function read(key:string){try{return typeof localStorage!=='undefined'?localStorage.getItem(key):memory.get(key)??null;}catch{return memory.get(key)??null;}}
function write(key:string,value:string){memory.set(key,value);persist?.(key,value);try{if(typeof localStorage!=='undefined')localStorage.setItem(key,value);}catch{}}
export function storageKey(kind:Collection,user=owner){return user==='guest'?legacy[kind]:`elsewhere.user.${user}.${kind}`;}
export function currentOwner(){return owner;}
export function subscribeData(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function refreshData(){emit();}
function emit(){for(const listener of listeners)listener();}
export function setDataOwner(user:string|null){owner=user??'guest';emit();}
export function readCollection(kind:Collection,user=owner):Item[]{try{const data=JSON.parse(read(storageKey(kind,user))??'[]');return Array.isArray(data)?data.filter(item=>item&&typeof item.id==='string'):[];}catch{return [];}}
export function readPending(user=owner):Pending[]{try{return JSON.parse(read(`elsewhere.pending.${user}`)??'[]');}catch{return [];}}
function writePending(pending:Pending[],user=owner){write(`elsewhere.pending.${user}`,JSON.stringify(pending));}
export function writeCollection(kind:Collection,items:Item[]){
  const before=readCollection(kind);
  if(owner!=='guest'){
    const pending=readPending();
    const previous=new Map(before.map(item=>[item.id,item]));
    const next=new Map(items.map(item=>[item.id,item]));
    for(const id of new Set([...previous.keys(),...next.keys()])){
      if(JSON.stringify(previous.get(id))===JSON.stringify(next.get(id)))continue;
      const index=pending.findIndex(item=>item.kind===kind&&item.id===id);
      const item={kind,id,data:next.get(id)??null,revision:++revision};
      if(index<0)pending.push(item);else pending[index]=item;
    }
    writePending(pending);
  }
  write(storageKey(kind),JSON.stringify(items));emit();return items;
}
export function acknowledgePending(sent:Pending[],user:string){const current=readPending(user);writePending(current.filter(item=>!sent.some(done=>done.kind===item.kind&&done.id===item.id&&done.revision===item.revision)),user);}
export function applyCloud(kind:Collection,items:Item[],user:string){
  const merged=new Map(items.map(item=>[item.id,item]));
  for(const pending of readPending(user).filter(item=>item.kind===kind)){if(pending.data)merged.set(pending.id,pending.data);else merged.delete(pending.id);}
  write(storageKey(kind,user),JSON.stringify([...merged.values()]));if(owner===user)emit();
}
export function importGuestData(){if(owner==='guest')throw Error('Sign in before importing.');for(const kind of ['saved','visits','plans'] as const){const current=readCollection(kind);const ids=new Set(current.map(item=>item.id));writeCollection(kind,[...current,...readCollection(kind,'guest').filter(item=>!ids.has(item.id))]);}}
export function clearGuestData(){for(const kind of ['saved','visits','plans'] as const)write(storageKey(kind,'guest'),'[]');emit();}
export function clearAccountCache(user:string){for(const kind of ['saved','visits','plans'] as const)write(storageKey(kind,user),'[]');writePending([],user);emit();}
