"""Build a compact, reproducible Nemotron persona cache without a database.
Uses the public Hugging Face datasets-server API; not a full-corpus index.
"""
import json,urllib.request,urllib.parse,random,time,pathlib
DATASET="nvidia/Nemotron-Personas-Korea"
FIELDS=("uuid","age","province","district","occupation","persona","professional_persona","family_persona","travel_persona","hobbies_and_interests")
rng=random.Random(20261119)
offsets=rng.sample(range(1000,990000),48)
rows={}
failures=0
for i,offset in enumerate(offsets):
 query=urllib.parse.urlencode(dict(dataset=DATASET,config="default",split="train",offset=offset,length=50))
 try:
  req=urllib.request.Request("https://datasets-server.huggingface.co/rows?"+query,headers={"User-Agent":"VirtualAutoMarket/1.0"})
  with urllib.request.urlopen(req,timeout=22) as res: data=json.load(res)
  for record in data.get("rows",[]):
   p=record.get("row") or {}
   uid=str(p.get("uuid") or "")
   if not uid:continue
   rows[uid]={k:(str(p[k])[:220] if isinstance(p.get(k),str) else p.get(k)) for k in FIELDS if p.get(k) is not None}
 except Exception as e:
  failures+=1
  print("Sample page",i,"unavailable:",type(e).__name__,flush=True)
 time.sleep(0.15)
if len(rows)<100:raise RuntimeError("Only "+str(len(rows))+" rows retrieved; keeping previous index")
out=pathlib.Path("data/nemotron_persona_cache.json")
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps({"source":"nvidia/Nemotron-Personas-Korea","sampling":"dispersed_nonrepresentative","records":list(rows.values())},ensure_ascii=False,separators=(",",":")),encoding="utf8")
print("Cached",len(rows),"synthetic personas; pages failed",failures,"bytes",out.stat().st_size)
