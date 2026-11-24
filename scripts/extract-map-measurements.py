import fitz,re,json,math,hashlib,collections,sys
from pathlib import Path
from shapely.geometry import Point,Polygon,LineString
from shapely.ops import unary_union
repo=Path(__file__).resolve().parents[1]
root=repo.parent
if len(sys.argv)!=2:raise SystemExit('Uso: python scripts/extract-map-measurements.py RUTA_PDF')
s=(repo/'prueba-diseno-v08.html').read_text();get=lambda name:json.loads(re.search(r'const '+name+r'=(\[.*?\]);',s)[1]);features=get('arrayanFeatures')+get('arrayanStage2CommercialFive')
exact=[[[234.96,291.6],[220.32,273.48],[220.08,272.76],[223.2,271.92],[234.84,272.04],[247.56,272.88],[251.88,273.12],[256.8,273],[262.08,271.8],[267.84,268.44],[268.92,270.12]],[[244.08,305.52],[234.96,291.6],[268.92,270.12],[277.8,284.04]],[[252.36,319.92],[244.08,305.52],[277.8,284.04],[286.8,298.08]],[[264,340.2],[255.72,325.68],[290.4,303.72],[299.4,317.76]],[[272.64,354.48],[264,340.2],[292.08,322.32],[304.32,342.6]]]
for f,pts in zip(features[-5:],exact):f['points']=pts;f['label']=[Polygon(pts).centroid.x,Polygon(pts).centroid.y]
pdf=Path(sys.argv[1]);page=fitz.open(pdf)[0];measures=[]
for b in page.get_text('dict')['blocks']:
 for line in b.get('lines',[]):
  for sp in line['spans']:
   m=re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*m\s*',sp['text'])
   if not m:continue
   x0,y0,x1,y1=sp['bbox'];x,y=(y0+y1)/2,612-(x0+x1)/2
   measures.append({'value':float(m[1]),'point':[x,y],'text':sp['text'],'bbox':[round(v,3) for v in sp['bbox']]})
occupied=unary_union([Polygon(f["points"]).buffer(0) for f in features])
rows={};polys={};edgegeos={};assign=[]
for f in features:
 poly=Polygon(f['points']).buffer(0).simplify(.04,preserve_topology=True);polys[f['key']]=poly
 pts=list(poly.exterior.coords)[:-1];edges=[]
 for i,a in enumerate(pts):
  b=pts[(i+1)%len(pts)];line=LineString([a,b]);edges.append({'index':i+1,'points':[[round(v,3) for v in a],[round(v,3) for v in b]],'value':None,'origin':'pending'});edgegeos[f['key'],i]=line
 candidates=[]
 for mid,m in enumerate(measures):
  point=Point(m['point'])
  inside=poly.contains(point)
  if not inside and (poly.distance(point)>2.0 or occupied.contains(point)):continue
  matches=[]
  for i,e in enumerate(edges):
   line=edgegeos[f['key'],i];ratio=line.length/m['value']
   # Literal measurements must agree with the same full edge; do not spread a small side label over another boundary.
   if not .72<ratio<.94:continue
   dist=line.distance(point)
   if dist>(3 if inside else 2.0):continue
   matches.append((dist,i))
  if matches:
   dist,i=min(matches);candidates.append((dist,i,mid,m))
 for dist,i,mid,m in sorted(candidates):
  if edges[i]['value'] is not None:continue
  edges[i].update(value=m['value'],origin='pdf',bbox=m['bbox']);assign.append(mid)
 rows[f['key']]={'stage':f.get('stage'), 'block':f.get('block'),'number':f['number'],'edges':edges}
 if f['key']=='commercial-01':rows[f['key']]['mapPoints']=f['points']
# Only transfer a printed value when the neighbor shares the WHOLE matching boundary.
inferred=0
for key,r in rows.items():
 for i,e in enumerate(r['edges']):
  if e['value'] is not None:continue
  line=edgegeos[key,i]
  for other,rr in rows.items():
   if other==key:continue
   for j,ee in enumerate(rr['edges']):
    if ee['origin']!='pdf':continue
    ref=edgegeos[other,j]
    if abs(line.length-ref.length)>.12 or line.hausdorff_distance(ref)>.12:continue
    e.update(value=ee['value'],origin='shared-boundary',sourceFeatureKey=other,sourceEdge=j+1);inferred+=1;break
   if e['value'] is not None:break
stats={'lots':len(rows),'printed':sum(e['origin']=='pdf' for r in rows.values() for e in r['edges']),'shared':inferred,'pending':sum(e['value'] is None for r in rows.values() for e in r['edges']),'lotsWithMeasures':sum(any(e['value'] for e in r['edges']) for r in rows.values()),'fullyMeasured':sum(all(e['value'] for e in r['edges']) for r in rows.values())}
result={'source':'altos 2 etapa impresion.pdf','sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'stats':stats,'lots':rows}
(repo/'official-map-measurements-data.mjs').write_text('// Cotas literales del PDF y linderos compartidos comprobados geometricamente.\nexport const OFFICIAL_MAP_MEASUREMENTS='+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n')
print(json.dumps(stats,ensure_ascii=False))
