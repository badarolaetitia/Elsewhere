
type Statement = {bind:(...values:any[])=>Statement;first:()=>Promise<any>;run:()=>Promise<any>};
type GuardEnvironment = {
  DB?:{prepare:(sql:string)=>Statement};
  SUPABASE_URL?:string;SUPABASE_PUBLISHABLE_KEY?:string;
  SEARCH_LIMIT_SECRET?:string;BETA_TESTER_EMAILS?:string;
};
const json=(error:string,status:number,retryAfter?:number)=>Response.json({success:false,error},{status,headers:{'Cache-Control':'no-store',...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});

async function identifierHash(value:string,secret:string){const encoder=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,24);}

async function slot(env:GuardEnvironment,bucket:string,limit:number,expires:number){
  const row=await env.DB!.prepare('INSERT INTO search_limits (bucket, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count').bind(bucket,expires,limit).first();
  return Boolean(row);
}

export async function guardSearch(request:Request,env:GuardEnvironment,now=Date.now()):Promise<Response|null>{
  if(!env.DB||!env.SEARCH_LIMIT_SECRET)return json('Search is temporarily unavailable.',503);
  const authorization=request.headers.get('authorization');
  if(authorization&&(!authorization.startsWith('Bearer ')||authorization.length>8192))return json('Your session has expired. Please sign in again.',401);
  if(Number(request.headers.get('content-length')??0)>1_200_000)return json('This search request is too large.',413);
  const ip=request.headers.get('cf-connecting-ip');
  if(!ip)return json('Could not verify this request. Please try again.',503);
  const ipHash=await identifierHash(ip,env.SEARCH_LIMIT_SECRET);
  try{
    const minute=Math.floor(now/60_000);
    if(!await slot(env,`ip:${ipHash}:${minute}`,6,(minute+2)*60_000))return json('Too many requests. Please try again in a minute.',429,60);
    let visitor=ipHash;
    let signedIn=false;
    if(authorization){
      if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return json('Account verification is temporarily unavailable. Please try again.',503);
      const verified=await fetch(`${env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:authorization},signal:AbortSignal.timeout(8_000)});
      if(!verified.ok)return json('Your session has expired. Please sign in again.',401);
      const user=await verified.json() as {id?:string;email_confirmed_at?:string};
      if(!user.id||!user.email_confirmed_at)return json('Please confirm your account before signing in.',401);
      visitor=await identifierHash(user.id,env.SEARCH_LIMIT_SECRET);
      signedIn=true;
    }
    let body:any;
    try{
      const text=await request.clone().text();
      if(text.length>1_200_000)return json('This search request is too large.',413);
      body=JSON.parse(text);
    }catch{return json('Please enter a valid search.',400);}
    if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.place!=='string'||!body.place.trim()||body.place.length>200)return json('Enter a place name of up to 200 characters.',400);
    if(typeof body.searchId==='string'&&body.searchId.length>0)return null;
    const day=Math.floor(now/86_400_000);
    const expires=(day+2)*86_400_000;
    if(!await slot(env,`${signedIn?'user':'guest'}:${visitor}:${day}`,signedIn?20:10,expires))return json('You have reached today’s preview search limit. Please try again tomorrow.',429,Math.ceil(((day+1)*86_400_000-now)/1000));
    if(!await slot(env,`all:${day}`,50,expires))return json('Today’s preview search allowance has been used. Please try again tomorrow.',429,Math.ceil(((day+1)*86_400_000-now)/1000));
    await env.DB.prepare('DELETE FROM search_limits WHERE expires_at < ?').bind(now).run();
    return null;
  }catch{return json('Could not verify search access. Please try again shortly.',503);}
}
