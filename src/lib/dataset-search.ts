import catalog, {checkedVenues} from './pilot-catalog';
import {normalizeSearchContext} from './search-context';
import {calculateDistanceKm,normalizeKeywords,rankCandidates} from './places-ranking';
import {matchesVerifiedPreferences,type ExperienceEvidence} from './place-evidence';
import {personalizeCandidates} from './personalization';
import {isSupportedCity,DISCOVERY_CITY,DISCOVERY_SCOPE_MESSAGE} from './discovery-scope';
const normalize=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const snapshotId=`dataset:${catalog.version}`;
export async function searchPilotDataset(request:Request) {
  let body:any;
  try {body=await request.json();}catch{return Response.json({success:false,error:'Invalid search request.'},{status:400});}
  const place=typeof body?.place==='string'?body.place.trim():'';
  if(!place||place.length>200)return Response.json({success:false,error:'Choose a place from the prototype list.'},{status:400});
  const context=normalizeSearchContext(body?.context);
  if(!isSupportedCity(context.city))return Response.json({success:false,error:DISCOVERY_SCOPE_MESSAGE},{status:400});
  context.city=DISCOVERY_CITY;
  if(body.searchId&&body.searchId!==snapshotId)return Response.json({success:false,error:'The prototype dataset changed. Start a new search.'},{status:410});
  const query=normalize(place).replace(/\b(?:new york city|new york|nyc)\b/g,'').trim();
  const exact=catalog.venues.filter(venue=>[venue.name,...venue.aliases].some(name=>normalize(name)===query));
  const matching=exact.length?exact:catalog.venues.filter(venue=>query.length>=4&&[venue.name,...venue.aliases].some(name=>normalize(name).includes(query)));
  if(matching.length!==1)return Response.json({success:false,error:`This prototype covers ${checkedVenues.length} places with checked offerings in ${catalog.area}. Choose one of the listed places on Discover.`},{status:404});
  const original=matching[0];
  const originalFeatures=original.features ?? [];
  if(!originalFeatures.length)return Response.json({success:false,error:'This place is in the neighbourhood register, but no checked offerings are published for this location. Choose a place suggested on Discover.'},{status:422});
  if(context.mode==='tonight'&&!context.date)return Response.json({success:false,error:'Choose a valid dinner date.'},{status:400});
  const allLabels=[...new Set(checkedVenues.flatMap(venue=>(venue.features ?? []).map(feature=>feature.label)))];
  const customIntent=context.intent.replace(/Priority \d+: (?:Food & products|Atmosphere|Experience)/g,'').replace(/^[;\s]+|[;\s]+$/g,'');
  const intentLabel=customIntent?allLabels.find(label=>normalize(label)===normalize(customIntent)):undefined;
  if(customIntent&&!intentLabel)return Response.json({success:false,error:`This prototype supports these checked details: ${allLabels.join(', ')}. Other requests have not been verified.`},{status:400});
  const keywords=[...new Set([...(intentLabel?[intentLabel]:[]),...originalFeatures.map(feature=>feature.label)])];
  const selected=normalizeKeywords(body.selectedKeywords).map(value=>keywords.find(keyword=>normalize(keyword)===normalize(value)));
  if(selected.some(value=>!value))return Response.json({success:false,error:'That preference has not been checked in this prototype.'},{status:400});
  const selectedKeywords=selected as string[];
  const required=[...new Set([...selectedKeywords,...(intentLabel?[intentLabel]:[])])];
  const distance=body.distanceKm===undefined||body.distanceKm===null||body.distanceKm==='all'?null:Number(body.distanceKm);
  if(distance!==null&&![1,2,5].includes(distance))return Response.json({success:false,error:'Choose the pilot area, 1 km, 2 km or 5 km.'},{status:400});
  const preference=body.preference==='closest'?'closest':'local';
  const candidates=checkedVenues.filter(venue=>venue.id!==original.id).map(venue=>{
    const experienceEvidence:Record<string,ExperienceEvidence>=Object.fromEntries((venue.features ?? []).map(claim=>[
      claim.label,{status:'SUPPORTED',summary:claim.summary,sources:[{title:`${venue.name} source · checked ${venue.checkedAt}`,url:claim.sourceUrl}]}
    ]));
    const shared=originalFeatures.filter(feature=>(venue.features ?? []).some(claim=>claim.label===feature.label)).map(feature=>feature.label);
    const similarityScore=shared.length?Math.round(60+40*shared.length/originalFeatures.length):0;
    return {placeId:venue.id,name:venue.name,address:venue.address,latitude:venue.latitude,longitude:venue.longitude,
      categories:[venue.categoryFamily==='bakery_pastry'?'commercial.food_and_drink.bakery':venue.categoryFamily==='cafe'?'catering.cafe':'catering.restaurant'],
      metadata:{...("website" in venue?{website:venue.website}:{})},distance:calculateDistanceKm(original.latitude,original.longitude,venue.latitude,venue.longitude),
      similarityScore,localScore:0,distinctivenessScore:0,chainLikelihood:0,popularityScore:0,
      keywordScores:Object.fromEntries((venue.features ?? []).map(claim=>[claim.label,100])),experienceEvidence,
      whySimilar:`Documented details in common: ${shared.join(', ')||'none checked'}.`,
      whyTryInstead:'Compare the linked source details before visiting.',checkedAt:venue.checkedAt};
  }).filter(candidate=>matchesVerifiedPreferences(candidate,required));
  const recommendations=rankCandidates(personalizeCandidates(candidates,context.taste,Boolean(customIntent),context.avoid),preference,required,distance)
    .sort((a,b)=>preference==='closest'?a.distance-b.distance:b.focusMatchScore-a.focusMatchScore||b.similarityScore-a.similarityScore||b.personalizationTieBreak-a.personalizationTieBreak||a.distance-b.distance)
    .map(({localScore,distinctivenessScore,chainLikelihood,popularityScore,...candidate})=>({...candidate,elsewhereScore:candidate.similarityScore}));
  return Response.json({success:true,searchId:snapshotId,
    searchedPlace:{name:original.name,formatted:original.address,city:DISCOVERY_CITY,country:'United States',latitude:original.latitude,longitude:original.longitude,placeId:original.id},
    classification:{category:original.categoryFamily==='bakery_pastry'?'Bakery and pastries':original.categoryFamily==='cafe'?'Cafe':'Food and drink',categoryFamily:original.categoryFamily,experienceKeywords:keywords,intentSummary:customIntent},
    recommendations,selectedKeywords,preference,distanceKm:distance,candidateCount:candidates.filter(candidate=>distance===null||candidate.distance<=distance).length,
    context,researchStatus:'dataset',searchArea:'pilot',searchSuggestions:[],dataset:{version:catalog.version,area:catalog.area,venues:catalog.venues.length,checkedVenues:checkedVenues.length,checkedAt:catalog.checkedAt}});
}
