type ParsedLink={path?:string|null;hostname?:string|null;queryParams?:{code?:string|string[]}|null};
export function createAuthCallbackHandler({platform,parse,exchange}:{platform:string;parse:(url:string)=>ParsedLink;exchange:(code:string)=>Promise<{error:unknown}>}){
  const pending=new Map<string,Promise<void>>();
  const completed=new Set<string>();
  return async function handle(url:string):Promise<void>{
    if(platform==='web')return;
    const parsed=parse(url);const code=parsed.queryParams?.code;
    if(typeof code!=='string'||!(parsed.path==='account'||parsed.hostname==='account'))return;
    if(completed.has(code))return;
    const existing=pending.get(code);if(existing)return existing;
    const task=exchange(code).then(({error})=>{if(error)throw Error('That sign-in link is invalid or expired. Please request another.');completed.add(code);if(completed.size>20)completed.delete(completed.values().next().value!);}).finally(()=>{pending.delete(code);});
    pending.set(code,task);await task;
  };
}
