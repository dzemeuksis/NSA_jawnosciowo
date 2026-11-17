"""Independent live Python oracle for JS scores and rankings (no neural downloads)."""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from rank_bm25 import BM25Okapi
from build_bm25 import ROOT, PARAMS, build_index, texts_for, tokenizer


def ranking(scores):
    return [dict(record_index=int(i), score=float(scores[i]))
            for i in np.argsort(-np.asarray(scores), kind='stable') if scores[i] > 0]


def fuse(dense, lexical):
    scores = {}
    for hits in (dense[:100], lexical[:100]):
        for rank, hit in enumerate(hits, 1):
            i = hit['record_index']
            scores[i] = scores.get(i, 0.0) + 1 / (60 + rank)
    return [dict(record_index=i, score=scores[i]) for i in sorted(scores, key=lambda i: (-scores[i], i))]


def main():
    tokenize = tokenizer()
    data = json.loads((ROOT / 'data/data.json').read_text())
    committed = json.loads((ROOT / 'data/bm25.json').read_text())
    assert build_index(data, tokenize) == committed, 'Stale production BM25 index'
    corpora = [data, dict(version='synthetic', records=[
        dict(teza=t, znaczenie_projawnosciowe='', podstawa_w_uzasadnieniu='unikalnapodstawa')
        for t in ['wspólny wspólny kot', 'wspólny kot', 'wspólny pies', '', 'wspólny pies',
                  'wspólny kot kot', 'wspólny', 'rzadki dokument dokument']]),
        dict(version='negative-idf', records=[dict(teza='wspólny', znaczenie_projawnosciowe='') for _ in range(3)])]
    queries = ['dostęp do informacji publicznej', 'rażąca bezczynność', 'dokumentów dokumentów',
               'nie bez', '', 'a i _', 'niespotykanyterminxyz', 'wspólny kot', 'wspólny',
               'unikalnapodstawa', 'rzadki dokument', 'Straße STRASSE ẞ ς Σ σ İ ı',
               'ŁÓDŹ 123 ² ½ Ⅳ a_b e\u0301 𐐀𐐀', '__proto__ constructor toString']
    queries += [r['teza'][:100] for r in data['records'][::150]]
    cases = []
    for corpus in corpora:
        index = build_index(corpus, tokenize)
        oracle = BM25Okapi([tokenize(t) for t in texts_for(corpus['records'])], **PARAMS)
        for q in queries:
            tokens = tokenize(q)
            scores = oracle.get_scores(tokens)
            lexical = ranking(scores)
            # Includes ties, candidates overlapping and outside each top-100, and zero scores.
            dense = [dict(record_index=i, score=float((i * 17) % 31)) for i in range(len(scores))]
            dense.sort(key=lambda hit: (-hit['score'], hit['record_index']))
            cases.append(dict(index=index, query=q, tokens=tokens, scores=list(scores),
                              lexical=lexical, dense=dense, fused=fuse(dense, lexical)))
    subprocess.run(['node', 'tests/oracle.mjs'], input=json.dumps(cases), text=True, cwd=ROOT, check=True)
    # Exact RRF ties with deliberately non-index insertion order, and 100-candidate boundary.
    for dense, lexical in [([dict(record_index=9), dict(record_index=2)], []),
                            ([dict(record_index=9)], [dict(record_index=2)]),
                            ([], []),
                            ([dict(record_index=i) for i in range(250)], [])]:
        subprocess.run(['node', 'tests/rrf.mjs'], text=True, check=True, cwd=ROOT,
                       input=json.dumps(dict(dense=dense, lexical=lexical, expected=fuse(dense, lexical))))
    print(f'PASS: {len(cases)} Python/JS score, tokenizer, BM25 and RRF comparisons; production index rebuilt identically')


if __name__ == '__main__':
    main()
