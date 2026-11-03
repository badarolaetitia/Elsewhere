const encoder=new TextEncoder();
function encode(bytes:Uint8Array){
  let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(value:string){
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid encoding');
  const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(binary,character=>character.charCodeAt(0));
}
async function signingKey(secret:string){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signSearch(snapshot:unknown,secret:string){
  const payload=encode(encoder.encode(JSON.stringify(snapshot)));
  const signature=await crypto.subtle.sign('HMAC',await signingKey(secret),encoder.encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}
export async function readSearch(token:unknown,secret:string):Promise<any|null>{
  if(typeof token!=='string'||token.length>1_000_000)return null;
  const [payload,signature,extra]=token.split('.');
  if(!payload||!signature||extra)return null;
  try{
    if(!await crypto.subtle.verify('HMAC',await signingKey(secret),decode(signature),encoder.encode(payload)))return null;
    return JSON.parse(new TextDecoder().decode(decode(payload)));
  }catch{return null;}
}
