import {searchPilotDataset} from '../lib/dataset-search';
export async function POST(request: Request, _runtime?: unknown) {
  return searchPilotDataset(request);
}
