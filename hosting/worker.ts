import {POST} from '../src/app/places+api';
import {guardSearch} from './search-guard';
import {assets} from './assets.generated';

type Environment=Parameters<typeof guardSearch>[1]&{GEMINI_API_KEY?:string;GEOAPIFY_API_KEY?:string;PUBLIC_SITE_ORIGIN?:string};
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','X-Frame-Options':'DENY'};
export default {
  async fetch(request:Request,env:Environment){
    const url=new URL(request.url);
    if(url.pathname.length>2000||url.search.length>10000)return new Response('URL too long',{status:414});
    if(url.pathname==='/places'){
      if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
      const origin=request.headers.get('origin');
      if(origin&&origin!==url.origin&&origin!==env.PUBLIC_SITE_ORIGIN)return new Response('Forbidden',{status:403});
      const denied=await guardSearch(request,env);
      if(denied)return denied;
      const response=await POST(request,env);
      for(const [key,value] of Object.entries(headers))response.headers.set(key,value);
      response.headers.set('Cache-Control','no-store');
      return response;
    }
    if(url.pathname==='/gemini')return new Response('Gone',{status:410});
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    const key=url.pathname==='/'?'/index.html':url.pathname.replace(/\/$/,'');
    const asset=assets[key]??assets[`${key}.html`];
    if(!asset)return new Response('Not found',{status:404,headers});
    const bytes=Uint8Array.from(atob(asset.body),character=>character.charCodeAt(0));
    const responseHeaders={...headers,'Content-Type':asset.type,'Cache-Control':asset.type.includes('text/html')?'no-store':'public, max-age=31536000, immutable','Vary':'Accept-Encoding'};
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(request.method==='HEAD'?null:stream,{headers:responseHeaders});
  },
};
