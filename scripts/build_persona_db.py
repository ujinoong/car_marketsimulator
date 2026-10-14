"""Download NVIDIA Nemotron-Personas-Korea and build a local SQLite database.
Run: pip install huggingface_hub pyarrow
     python scripts/build_persona_db.py
Requires ~13 GB of available disk space for source files and SQLite output.
Never commit the downloaded dataset or SQLite database to Git.
"""
from pathlib import Path
import sqlite3
from huggingface_hub import snapshot_download
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "nemotron"
DB = ROOT / "data" / "personas.sqlite3"
COLUMNS = [
    "uuid", "age", "sex", "province", "district", "occupation",
    "marital_status", "family_type", "housing_type", "persona",
    "professional_persona", "family_persona", "travel_persona",
    "hobbies_and_interests"
]

def main():
    DATA.mkdir(parents=True, exist_ok=True)
    print("Downloading public Parquet dataset from Hugging Face...")
    snapshot_download(
        repo_id="nvidia/Nemotron-Personas-Korea",
        repo_type="dataset",
        local_dir=str(DATA),
        allow_patterns=["data/*.parquet"],
    )
    paths = sorted(DATA.glob("data/*.parquet"))
    if not paths:
        raise RuntimeError("No Parquet files found under data/")
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    cols = ", ".join(f'"{c}" '+("INTEGER" if c == "age" else "TEXT") for c in COLUMNS)
    conn.execute(f"CREATE TABLE IF NOT EXISTS personas ({cols}, PRIMARY KEY(uuid))")
    placeholders = ",".join("?" for _ in COLUMNS)
    names = ",".join(f'"{c}"' for c in COLUMNS)
    sql = f"INSERT OR REPLACE INTO personas ({names}) VALUES ({placeholders})"
    total = 0
    for path in paths:
        parquet = pq.ParquetFile(path)
        for batch in parquet.iter_batches(batch_size=1000, columns=COLUMNS):
            records = batch.to_pylist()
            conn.executemany(sql, [[r.get(c) for c in COLUMNS] for r in records])
            conn.commit()
            total += len(records)
        print(f"Loaded {path.name}: {total:,} rows")
    for index, col in [("idx_personas_region", "province"), ("idx_personas_age", "age"), ("idx_personas_occupation", "occupation")]:
        conn.execute(f"CREATE INDEX IF NOT EXISTS {index} ON personas({col})")
    conn.commit()
    print(f"Done: {conn.execute('SELECT COUNT(*) FROM personas').fetchone()[0]:,} personas in {DB}")
    conn.close()

if __name__ == "__main__":
    main()
