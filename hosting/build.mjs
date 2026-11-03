import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';

export async function buildPilot(projectRoot,appRoot){
  const publicConfig=JSON.parse(await readFile(path.join(projectRoot,'public-config.json'),'utf8'));
  const environment={...process.env,...publicConfig,EXPO_PUBLIC_INVITE_ONLY:'true'};
  delete environment.GEMINI_API_KEY;delete environment.GEOAPIFY_API_KEY;
  await new Promise((resolve,reject)=>{
    const process=spawn('node',[path.join(projectRoot,'node_modules/expo/bin/cli'),'export','--platform','web','--output-dir',path.join(projectRoot,'expo-export')],{cwd:appRoot,env:environment,stdio:'inherit'});
    process.on('exit',code=>code===0?resolve():reject(Error(`Expo export failed: ${code}`)));
  });
  const assets={};
  const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf','.woff2':'font/woff2','.webp':'image/webp'};
  async function collect(directory,prefix=''){
    for(const entry of await readdir(directory,{withFileTypes:true})){
      const filename=path.join(directory,entry.name);const relative=path.posix.join(prefix,entry.name);
      if(entry.isDirectory())await collect(filename,relative);
      else if(!relative.endsWith('.map'))assets[`/${relative}`]={body:gzipSync(await readFile(filename)).toString('base64'),type:types[path.extname(relative)]??'application/octet-stream'};
    }
  }
  await collect(path.join(projectRoot,'expo-export/client'));
  const server=path.join(projectRoot,'expo-export/server');
  for(const file of await readdir(server))if(file.endsWith('.html'))assets[`/${file}`]={body:gzipSync(await readFile(path.join(server,file))).toString('base64'),type:types['.html']};
  await writeFile(path.join(appRoot,'hosting/assets.generated.ts'),`export const assets=${JSON.stringify(assets)};\n`);
  await mkdir(path.join(projectRoot,'dist/server'),{recursive:true});
  await mkdir(path.join(projectRoot,'dist/.openai'),{recursive:true});
  await build({entryPoints:[path.join(appRoot,'hosting/worker.ts')],outfile:path.join(projectRoot,'dist/server/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,sourcemap:false,legalComments:'none',define:{'process.env.NODE_ENV':'"production"'}});
  const worker=await readFile(path.join(projectRoot,'dist/server/index.js'));
  const manifest=await readFile(path.join(projectRoot,'.openai/hosting.json'));
  await writeFile(path.join(projectRoot,'dist/.openai/hosting.json'),manifest);
  console.log(JSON.stringify({assets:Object.keys(assets).length,workerBytes:worker.length,workerGzipBytes:gzipSync(worker).length}));
  if(gzipSync(worker).length>3_000_000)throw Error('Worker is too large for the prototype hosting target.');
  if(/(?:GEMINI_API_KEY|GEOAPIFY_API_KEY)=["'][A-Za-z0-9_-]{15}/.test(worker.toString()))throw Error('Possible embedded provider secret.');
}
