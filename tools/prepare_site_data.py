"""
Generuje dane i embeddingi dla statycznej wyszukiwarki GitHub Pages bezpośrednio z MongoDB.

Instalacja:
    pip install pymongo python-dotenv sentence-transformers

Uruchomienie:
    python prepare_site_data.py

Wyniki:
    data/data.json
    data/embeddings.json

Embedding powstaje z: "passage: " + teza + znaczenie_projawnosciowe.
"""
import hashlib
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient
from sentence_transformers import SentenceTransformer

load_dotenv()

# ===== Ustawienia =====
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "baza_wyrokow")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "wyroki")

# Model źródłowy MMLW odpowiada kwantyzowanemu eksportowi ONNX używanemu w przeglądarce.
PYTHON_MODEL = "sdadas/mmlw-retrieval-e5-small"
BROWSER_MODEL = "Infojura/mmlw-retrieval-e5-small-onnx"

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data"
BATCH_SIZE = 64



def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    coll = MongoClient(MONGO_URI)[MONGO_DB][MONGO_COLLECTION]

    query = {
        "tezy_projawnosciowe": {"$type": "array", "$ne": []}
    }
    projection = {
        "_id": 1,
        "tezy_projawnosciowe": 1,
        "link": 1,
        "url": 1,
        "link_do_wyroku": 1,
        "link_do_orzeczenia": 1,
        "adres_url": 1,
    }

    records = []
    for doc in coll.find(query, projection=projection):
        link = get_link(doc)
        for teza in doc.get("tezy_projawnosciowe", []):
            if not isinstance(teza, dict):
                continue
            records.append({
                "id": len(records),
                "teza": str(teza.get("teza", "")).strip(),
                "znaczenie_projawnosciowe": str(teza.get("znaczenie_projawnosciowe", "")).strip(),
                "typ": str(teza.get("typ", "")).strip(),
                "podstawa_w_uzasadnieniu": str(teza.get("podstawa_w_uzasadnieniu", "")).strip(),
                "link": link,
            })

    compact = json.dumps(records, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    version = hashlib.sha256(compact.encode("utf-8")).hexdigest()[:16]

    data_payload = {"version": version, "count": len(records), "records": records}
    (OUTPUT_DIR / "data.json").write_text(
        json.dumps(data_payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    texts = [f"passage: {r['teza']}\n{r['znaczenie_projawnosciowe']}".strip() for r in records]
    print(f"Tez do embeddingu: {len(texts)}")
    model = SentenceTransformer(PYTHON_MODEL)
    vectors = model.encode(
        texts,
        batch_size=BATCH_SIZE,
        show_progress_bar=True,
        normalize_embeddings=True,
    )

    embeddings_payload = {
        "version": version,
        "model": BROWSER_MODEL,
        "dimensions": int(vectors.shape[1]) if len(vectors) else 384,
        "embeddings": vectors.tolist(),
    }
    (OUTPUT_DIR / "embeddings.json").write_text(
        json.dumps(embeddings_payload, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Gotowe. Wygenerowano {len(records)} tez. Wersja danych: {version}")


def get_link(doc):
    for field in ("link", "url", "link_do_wyroku", "link_do_orzeczenia", "adres_url"):
        value = doc.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


if __name__ == "__main__":
    main()
