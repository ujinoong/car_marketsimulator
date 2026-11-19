"""Resumable full-corpus Nemotron ingestion into Supabase Postgres.
Run with SUPABASE_DB_URL; only synthetic public persona records are loaded.
Never prints credentials. Designed for bounded GitHub Actions runs.
"""
import os, re, time
from urllib.parse import urlsplit, urlunsplit, quote
import psycopg
from psycopg.types.json import Jsonb
from huggingface_hub import HfApi, hf_hub_download
import pyarrow.parquet as pq

DATASET="nvidia/Nemotron-Personas-Korea"
BATCH=int(os.getenv("IMPORT_BATCH","300"))
MAX_ROWS=int(os.getenv("IMPORT_MAX_ROWS","50000"))
MAX_SECONDS=int(os.getenv("IMPORT_MAX_SECONDS","1800"))
TEXT_FIELDS=("persona","professional_persona","family_persona","travel_persona","hobbies_and_interests","detailed_persona")
META_FIELDS=("uuid","age","province","district","occupation","sex")
DDL="""
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS public.nemotron_personas (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_uuid text NOT NULL UNIQUE,
 age integer, province text, occupation text,
 persona_text text, family_text text, lifestyle_text text,
 search_text text NOT NULL DEFAULT ''
);
ALTER TABLE public.nemotron_personas ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE public.nemotron_personas ADD COLUMN IF NOT EXISTS sex text;
ALTER TABLE public.nemotron_personas ADD COLUMN IF NOT EXISTS source_shard text;
CREATE TABLE IF NOT EXISTS public.nemotron_import_progress (
 shard text PRIMARY KEY, processed bigint NOT NULL DEFAULT 0,
 completed boolean NOT NULL DEFAULT false, updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.nemotron_personas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nemotron_personas FROM anon, authenticated;
"""
def txt(v,n=350):
 if v is None:return ""
 return str(v)[:n]
def convert(p,shard):
 uid=txt(p.get("uuid"),120)
 if not uid:return None
 try:age=int(p.get("age")) if p.get("age") is not None else None
 except (TypeError,ValueError):age=None
 values=[txt(p.get(k)) for k in TEXT_FIELDS]
 search=" ".join(filter(None,[txt(p.get("occupation"),100),txt(p.get("province"),60),txt(p.get("district"),60)]+values))[:1600]
 return (uid,age,txt(p.get("province"),100),txt(p.get("occupation"),120),values[0],values[2], " ".join(values[1:])[:900],search,txt(p.get("district"),100),txt(p.get("sex"),30),shard)
def safe_db_url():
 raw=os.environ["SUPABASE_DB_URL"].strip().strip("\\\"").strip("\\'")
 # A URL must not contain literal whitespace in its userinfo or host.
 # Spaces in a pasted password are usually an accidental copy/paste error.
 if any(c.isspace() for c in raw):
  raise ValueError("SUPABASE_DB_URL contains whitespace. Copy the Session pooler URI again and replace [YOUR-PASSWORD] with your actual password; URL-encode special characters.")
 return raw

def main():
 if BATCH<1 or MAX_ROWS<1:raise ValueError("positive batch and max rows required")
 start=time.monotonic()
 paths=sorted(p for p in HfApi().list_repo_files(DATASET,repo_type="dataset") if p.endswith(".parquet"))
 if not paths:raise RuntimeError("No parquet shards found")
 with psycopg.connect(safe_db_url(),connect_timeout=25,sslmode="require") as conn:
  with conn.cursor() as cur:
   cur.execute(DDL)
   conn.commit()
   total=0
   for shard in paths:
    if total>=MAX_ROWS or time.monotonic()-start>=MAX_SECONDS:break
    cur.execute("SELECT processed,completed FROM public.nemotron_import_progress WHERE shard=%s",(shard,))
    state=cur.fetchone()
    if state and state[1]:continue
    skip=state[0] if state else 0
    print("Shard",shard,"resume row",skip,flush=True)
    file=hf_hub_download(repo_id=DATASET,repo_type="dataset",filename=shard)
    pf=pq.ParquetFile(file)
    cols=[k for k in META_FIELDS+TEXT_FIELDS if k in pf.schema_arrow.names]
    if "uuid" not in cols:raise RuntimeError("uuid column missing in "+shard)
    position=0
    for batch in pf.iter_batches(batch_size=BATCH,columns=cols):
     batch_len=batch.num_rows
     if position+batch_len<=skip:
      position+=batch_len
      continue
     records=batch.to_pylist()
     if position<skip:records=records[skip-position:]
     remaining=MAX_ROWS-total
     records=records[:remaining]
     converted=[convert(p,shard) for p in records]
     converted=[p for p in converted if p]
     if converted:
      cur.executemany("""INSERT INTO public.nemotron_personas
      (source_uuid,age,province,occupation,persona_text,family_text,lifestyle_text,search_text,district,sex,source_shard)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
      ON CONFLICT (source_uuid) DO NOTHING""",converted)
     position+=len(records)
     cur.execute("""INSERT INTO public.nemotron_import_progress(shard,processed,completed,updated_at)
      VALUES (%s,%s,false,now()) ON CONFLICT(shard)
      DO UPDATE SET processed=excluded.processed,updated_at=now()""",(shard,position))
     conn.commit()
     total+=len(records)
     if total%3000<BATCH:print("Rows scanned this run:",total,flush=True)
     if total>=MAX_ROWS or time.monotonic()-start>=MAX_SECONDS:break
    if position>=pf.metadata.num_rows:
     cur.execute("UPDATE public.nemotron_import_progress SET completed=true,updated_at=now() WHERE shard=%s",(shard,))
     conn.commit()
   cur.execute("SELECT count(*) FROM public.nemotron_personas")
   print("Indexed personas:",cur.fetchone()[0],flush=True)
   cur.execute("SELECT count(*),sum(completed::int) FROM public.nemotron_import_progress")
   print("Shards tracked / completed:",cur.fetchone(),flush=True)
 print("Batch finished; rerun workflow to resume")
if __name__=="__main__":main()
