import {searchPilotDataset} from '../lib/dataset-search';
import type {DiscoveryEnvironment} from '../lib/discovery-agent';
export async function POST(request:Request,runtime:DiscoveryEnvironment={}) {
  return searchPilotDataset(request,{GEMINI_API_KEY:runtime.GEMINI_API_KEY ?? (typeof process!=='undefined'?process.env.GEMINI_API_KEY:undefined)});
}
