"""Import a bounded pilot sample of NVIDIA synthetic personas into Supabase.
Requires GitHub Actions secret SUPABASE_DB_URL. No secrets are printed.
"""
import os
import re
import time
from huggingface_hub import HfApi, hf_hub_download
import pyarrow.parquet as pq
import psycopg

DATASET = "nvidia/Nemotron-Personas-Korea"
LIMIT = min(int(os.getenv("IMPORT_LIMIT", "10000")), 10000)
TEXT_FIELDS = ("persona", "professional_persona", "family_persona", "travel_persona", "hobbies_and_interests", "detailed_persona")
def as_text(v, maxlen=500):
    if v is None: return ""
    if isinstance(v, (list, dict)): return str(v)[:maxlen]
    return str(v)[:maxlen]
def main():
    url = os.environ["SUPABASE_DB_URL"]
    paths = sorted(p for p in HfApi().list_repo_files(DATASET, repo_type="dataset") if p.endswith(".parquet"))
    if not paths: raise RuntimeError("No parquet shards found; check dataset path/access")
    print("Found", len(paths), "parquet shards; pilot limit", LIMIT, flush=True)
    total = 0
    with psycopg.connect(url, connect_timeout=25, sslmode="require") as conn:
        with conn.cursor() as cur:
            for path in paths:
                if total >= LIMIT: break
                file = hf_hub_download(repo_id=DATASET, repo_type="dataset", filename=path)
                pf = pq.ParquetFile(file)
                cols = [x for x in ("uuid", "age", "province", "occupation") + TEXT_FIELDS if x in pf.schema_arrow.names]
                if "uuid" not in cols: raise RuntimeError("Dataset missing uuid; inspect schema before importing")
                for batch in pf.iter_batches(batch_size=500, columns=cols):
                    rows = []
                    for p in batch.to_pylist():
                        if total + len(rows) >= LIMIT: break
                        uid = as_text(p.get("uuid"), 100)
                        if not uid: continue
                        age = p.get("age")
                        try: age = int(age) if age is not None else None
                        except (ValueError, TypeError): age = None
                        fields = [as_text(p.get(k)) for k in TEXT_FIELDS]
                        search = " ".join(x for x in fields if x)[:1800]
                        rows.append((uid, age, as_text(p.get("province"), 100), as_text(p.get("occupation"), 120), fields[0], fields[2], " ".join(fields[1:])[:1200], search))
                    if not rows: continue
                    cur.executemany("""INSERT INTO public.nemotron_personas
                      (source_uuid,age,province,occupation,persona_text,family_text,lifestyle_text,search_text)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                      ON CONFLICT (source_uuid) DO NOTHING""", rows)
                    total += len(rows)
                    conn.commit()
                    print("Processed", total, "pilot records", flush=True)
                    if total >= LIMIT: break
            cur.execute("SELECT count(*) FROM public.nemotron_personas")
            print("Database total rows:", cur.fetchone()[0])
    print("Pilot import complete")
if __name__ == "__main__": main()
