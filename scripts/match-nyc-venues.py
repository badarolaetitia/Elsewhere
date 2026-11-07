import json,re,collections,unicodedata,math
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Conservatively match MongoDB restaurant IDs, names and addresses to a DOHMH snapshot.')
parser.add_argument('hf_json');parser.add_argument('official_json');parser.add_argument('output_directory')
args=parser.parse_args()
out=Path(args.output_directory);out.mkdir(parents=True,exist_ok=True)
hf=json.loads(Path(args.hf_json).read_text())
official=json.loads(Path(args.official_json).read_text())
byid={r['camis']:r for r in official}
def norm(v):return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',str(v)).encode('ascii','ignore').decode().lower())
def street(v):
 v=unicodedata.normalize('NFKD',str(v)).encode('ascii','ignore').decode().lower()
 for a,b in [('street','st'),('avenue','ave'),('boulevard','blvd'),('road','rd'),('place','pl'),('saint','st')]:v=re.sub(r'\b'+a+r'\b',b,v)
 v=re.sub(r'\b(\d+)(st|nd|rd|th)\b',r'\1',v)
 return norm(v)
counts=collections.Counter();matches=[];review=[]
for row in hf:
 r=byid.get(str(row.get('restaurant_id','')))
 if not r:counts['no_current_id_match']+=1;continue
 counts['id_match']+=1
 a=row.get('address') or {}
 samename=norm(row.get('name',''))==norm(r.get('dba',''))
 sameaddress=norm(a.get('building',''))==norm(r.get('building','')) and street(a.get('street',''))==street(r.get('street','')) and str(a.get('zipcode',''))==r.get('zipcode','')
 if not (samename and sameaddress):
  counts['id_match_needs_review']+=1;review.append({'camis':r['camis'],'hfName':row.get('name'),'officialName':r.get('dba'),'sameName':samename,'sameAddress':sameaddress});continue
 lat,lon=float(r.get('latitude') or 0),float(r.get('longitude') or 0)
 if not (40.49<=lat<=40.92 and -74.26<=lon<=-73.69):counts['exact_identity_bad_coordinates']+=1;continue
 counts['exact_identity_valid_coordinates']+=1
 matches.append({'camis':r['camis'],'name':r['dba'],'borough':r['boro'],'address':' '.join([r.get('building',''),r.get('street','')]),'zip':r.get('zipcode'),'latitude':lat,'longitude':lon,'cuisine':r.get('cuisine_description') or row.get('cuisine'),'hfHasMenu':bool(row.get('menu'))})
(out/'exact-matches.json').write_text(json.dumps(matches,indent=2))
(out/'review.json').write_text(json.dumps(review,indent=2))
(out/'counts.json').write_text(json.dumps(dict(counts),indent=2)+'\n')
print(json.dumps(dict(counts),indent=2))
