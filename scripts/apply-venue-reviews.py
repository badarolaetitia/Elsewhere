"""Apply manually checked primary-source evidence; never infer menus from registry cuisine."""
import collections, hashlib, json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'src/data/nyc-pilot-venues.json'
catalog = json.loads(path.read_text())
review_path = root / 'data/research/west-village-menu-review.json'
review = json.loads(review_path.read_text())
by_id = {row['camis']: row for row in review['venues']}
assert len(by_id) == len(catalog['venues']) == review['identityRecords']
assert set(by_id) == {v['camis'] for v in catalog['venues']}

for venue in catalog['venues']:
    row = by_id[venue['camis']]
    venue.pop('features', None)
    venue.pop('website', None)
    if row.get('website') and row['status'] in ['checked_offerings', 'venue_only']:
        venue['website'] = row['website']
    if row['status'] == 'checked_offerings':
        assert row['features'] and row.get('website')
        source_urls = {source['url'] for source in row['sources']}
        assert all(f['sourceUrl'] in source_urls for f in row['features'])
        assert all(not f['label'].startswith('NYC category:') for f in row['features'])
        venue['features'] = row['features']
        venue['checkedAt'] = row['checkedAt']
        display_name = row.get('displayName', row['name'])
        venue['aliases'] = sorted(set(row.get('aliases', []) + [row['name'], venue['name']] + venue['aliases']) - {display_name})
        venue['name'] = display_name

counts = dict(collections.Counter(row['status'] for row in review['venues']))
catalog['version'] = 'west-village-reviewed-' + hashlib.sha256(review_path.read_bytes()).hexdigest()[:12]
catalog['reviewCoverage'] = dict(identityRecords=len(by_id), **counts)
path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + '\n')
summary_path = root / 'data/research/nyc-match-summary.json'
summary = json.loads(summary_path.read_text())
summary['offeringReview'] = counts
summary_path.write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(counts))
