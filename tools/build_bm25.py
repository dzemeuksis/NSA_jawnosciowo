"""Build only the lexical index; never changes data.json or embeddings.json."""
import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter
from functools import lru_cache
from pathlib import Path

from pystempel import Stemmer
from rank_bm25 import BM25Okapi

ROOT = Path(__file__).resolve().parent.parent
PARAMS = dict(k1=1.5, b=0.75, epsilon=0.25)


def tokenizer():
    stemmer = Stemmer.polimorf()

    @lru_cache(maxsize=100_000)
    def stem(word):
        result = stemmer(word)
        return str(result).lower() if result else word

    def tokenize(text):
        return [stem(w) for w in re.findall(r"[^\W_]+", str(text).casefold()) if len(w) >= 2]
    return tokenize


def texts_for(records):
    return [f"{r.get('teza', '')}\n{r.get('znaczenie_projawnosciowe', '')}" for r in records]


def fingerprint(records):
    # Hash exactly the indexed fields and their order, independently of metadata/version.
    return hashlib.sha256(json.dumps(texts_for(records), ensure_ascii=False,
                                    separators=(',', ':')).encode()).hexdigest()


def build_index(data, tokenize=None):
    tokenize = tokenize or tokenizer()
    corpus = [tokenize(t) for t in texts_for(data['records'])]
    if not corpus or not any(corpus):
        raise ValueError('Empty BM25 corpus')
    bm25 = BM25Okapi(corpus, **PARAMS)
    postings = {term: [] for term in bm25.idf}
    for i, tokens in enumerate(corpus):
        for term, tf in Counter(tokens).items():
            postings[term].append([i, tf])
    return dict(schema=1, version=data['version'], fingerprint=fingerprint(data['records']),
                params=PARAMS, lengths=bm25.doc_len, avgdl=bm25.avgdl,
                terms={term: [bm25.idf[term], hits] for term, hits in postings.items()})


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def write_unicode(path):
    # Pin Python's casefold and alphanumeric semantics instead of JS lowercasing/\w.
    folds = {}
    ranges = []
    for cp in range(0x110000):
        ch = chr(cp)
        if ch.casefold() != ch:
            folds[ch] = ch.casefold()
        if ch.isalnum():
            if ranges and ranges[-1][1] == cp - 1:
                ranges[-1][1] = cp
            else:
                ranges.append([cp, cp])
    write_json(path, dict(version=unicodedata.unidata_version, folds=folds, ranges=ranges))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ROOT / 'data/data.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/bm25.json')
    args = parser.parse_args()
    write_json(args.output, build_index(json.loads(args.data.read_text(encoding='utf-8'))))
    write_unicode(ROOT / 'data/bm25-unicode.json')


if __name__ == '__main__':
    main()
