"""Build the complete identity intersection inside NYC's West Village NTA.
Usage: python3 scripts/build-west-village-pilot.py <exact-matches.json> <nta.json>
Inputs come from match-nyc-venues.py and NYC Open Data 9nt8-h7nd (MN0203).
"""
import csv,json,sys,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
records=json.loads(Path(sys.argv[1]).read_text())
raw_boundary=Path(sys.argv[2]).read_bytes()
boundary=json.loads(raw_boundary)[0]
assert boundary['nta2020']=='MN0203' and boundary['ntaname']=='West Village'
def in_ring(x,y,ring):
    hit=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
    return hit
def inside(row):
    x,y=row['longitude'],row['latitude']
    return any(in_ring(x,y,p[0]) and not any(in_ring(x,y,h) for h in p[1:]) for p in boundary['the_geom']['coordinates'])
p=root/'src/data/nyc-pilot-venues.json'
old=json.loads(p.read_text())
# Retain only individually sourced enrichments; the identity match never imports HF menus.
enrichment={v['camis']:v for v in old['venues'] if 'website' in v}
selected=sorted((r for r in records if inside(r)),key=lambda r:(r['name'],r['camis']))
venues=[]
for r in selected:
    source='https://data.cityofnewyork.us/resource/43nn-pn8j.json?camis='+r['camis']
    cuisine=r['cuisine']
    family='bakery_pastry' if cuisine=='Bakery Products/Desserts' else 'cafe' if cuisine=='Coffee/Tea' else 'restaurant'
    v=dict(id='nyc-dohmh:'+r['camis'],camis=r['camis'],name=r['name'],aliases=[],address=r['address']+', Manhattan, NY '+r['zip'],borough=r['borough'],zip=r['zip'],latitude=r['latitude'],longitude=r['longitude'],cuisine=cuisine,categoryFamily=family,checkedAt=old['checkedAt'],features=[dict(label='NYC category: '+cuisine,summary=f'NYC’s restaurant inspection record classifies this establishment as {cuisine}. This is a broad registry category, not a verified menu.',sourceUrl=source)],identitySources=['https://huggingface.co/datasets/MongoDB/whatscooking.restaurants',source])
    if r['camis'] in enrichment:
        e=enrichment[r['camis']]
        v.update(name=e['name'],aliases=list(set(e['aliases']+[r['name']])),website=e['website'],categoryFamily=e['categoryFamily'])
        v['features']+= [f for f in e['features'] if not f['label'].startswith('NYC category: ')]
    venues.append(v)
data=dict(version='nyc-west-village-v2',area='West Village, Manhattan',checkedAt=old['checkedAt'],boundary=dict(code='MN0203',name='West Village',sourceUrl='https://data.cityofnewyork.us/resource/9nt8-h7nd.json?nta2020=MN0203',sha256=hashlib.sha256(raw_boundary).hexdigest()),venues=venues)
p.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
bp=root/'data/research/west-village-boundary.geojson';bp.write_text(json.dumps(dict(type='Feature',properties={k:v for k,v in boundary.items() if k!='the_geom'},geometry=boundary['the_geom']),indent=2)+'\n')
with (root/'data/research/west-village-identity-matches.csv').open('w') as f:
    fields=['camis','name','borough','address','zip','latitude','longitude','cuisine'];w=csv.DictWriter(f,fields,extrasaction='ignore');w.writeheader();w.writerows(selected)
sp=root/'data/research/nyc-match-summary.json';s=json.loads(sp.read_text());s.update(pilotVenues=len(venues),westVillageIdentityMatches=len(venues),pilotBoundary='NYC 2020 NTA MN0203');sp.write_text(json.dumps(s,indent=2)+'\n')
print(f'{len(venues)} matched venues inside MN0203; {len(enrichment)} retain separately sourced website details.')
