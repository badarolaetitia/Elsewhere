const {getDefaultConfig}=require('expo/metro-config');
const path=require('node:path');
const config=getDefaultConfig(__dirname);
const compatibilityModule=path.resolve(__dirname,'src/lib/query-string-compat.cjs');
config.resolver.resolveRequest=(context,moduleName,platform)=>{
  if(moduleName==='query-string'&&context.originModulePath!==compatibilityModule)return {type:'sourceFile',filePath:compatibilityModule};
  return context.resolveRequest(context,moduleName,platform);
};
module.exports=config;
