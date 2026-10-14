"""Build a searchable SQLite FTS5 index from ALL NVIDIA Korea persona parquet shards.

pip install huggingface_hub pyarrow
python scripts/build_persona_db.py
Source: https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea
Output: data/personas_search.sqlite3 (never commit to GitHub).
Requires several GB of local disk; use a persistent server/database for production.
"""
from pathlib import Path
import sqlite3
from huggingface_hub import snapshot_download
import pyarrow.parquet as pq

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"data"/"nemotron"
DB=ROOT/"data"/"personas_search.sqlite3"
TEXT_FIELDS=["persona","professional_persona","finance_persona","family_persona","travel_persona","hobbies_and_interests","detailed_persona"]
META_FIELDS=["uuid","age","province","occupation","family_type","income_bracket"]
def main():
    SOURCE.mkdir(parents=True,exist_ok=True)
    snapshot_download(repo_id="nvidia/Nemotron-Personas-Korea",repo_type="dataset",local_dir=str(SOURCE),allow_patterns=["data/*.parquet"])
    paths=sorted(SOURCE.glob("data/train-*.parquet"))
    if len(paths)!=9: raise RuntimeError(f"Expected 9 source parquet shards; found {len(paths)}")
    available=set(pq.ParquetFile(paths[0]).schema_arrow.names)
    cols=[c for c in META_FIELDS+TEXT_FIELDS if c in available]
    if "uuid" not in cols or "persona" not in cols: raise RuntimeError("Required columns absent")
    DB.parent.mkdir(parents=True,exist_ok=True)
    if DB.exists():DB.unlink()
    conn=sqlite3.connect(DB)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE personas (id INTEGER PRIMARY KEY, uuid TEXT UNIQUE, age INTEGER, province TEXT, occupation TEXT, family_type TEXT, income_bracket TEXT, persona TEXT, professional_persona TEXT, finance_persona TEXT, family_persona TEXT, travel_persona TEXT, hobbies_and_interests TEXT, detailed_persona TEXT)")
    conn.execute("CREATE VIRTUAL TABLE persona_fts USING fts5(persona,professional_persona,finance_persona,family_persona,travel_persona,hobbies_and_interests,detailed_persona,content='personas',content_rowid='id',tokenize='unicode61')")
    insert="INSERT INTO personas ("+",".join(META_FIELDS+TEXT_FIELDS)+") VALUES ("+",".join(["?"]*len(META_FIELDS+TEXT_FIELDS))+")"
    total=0
    for path in paths:
        pf=pq.ParquetFile(path)
        for batch in pf.iter_batches(batch_size=2000,columns=cols):
            rows=batch.to_pylist()
            conn.executemany(insert,[[r.get(c) for c in META_FIELDS+TEXT_FIELDS] for r in rows])
            total+=len(rows)
        conn.commit()
        print(path.name,total,flush=True)
    conn.execute("INSERT INTO persona_fts(persona_fts) VALUES('rebuild')")
    conn.execute("CREATE INDEX idx_province ON personas(province)")
    conn.execute("CREATE INDEX idx_age ON personas(age)")
    conn.commit()
    print("Indexed",conn.execute("SELECT count(*) FROM personas").fetchone()[0],"records")
    print("DB:",DB)
    print("Note: FTS5 unicode61 Korean tokenization is limited; consider Korean morphological search or embeddings for semantic retrieval.")
    conn.close()
if __name__=="__main__":main()
