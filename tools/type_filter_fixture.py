"""Deterministic regression: rare-type hits below both global top-100 cutoffs."""
from rank_bm25 import BM25Okapi
from build_bm25 import PARAMS, build_index, texts_for, tokenizer


def make_fixture(tokenize=None):
    from test_search import fuse, ranking

    tokenize = tokenize or tokenizer()
    query = 'dokument'
    records = [dict(id=i, teza='dokument dokument' if i < 110 else 'dokument' if i < 115 else 'inna treść',
                    znaczenie_projawnosciowe='', podstawa_w_uzasadnieniu=f'podstawa numer {i}',
                    typ='rzadki' if 110 <= i < 115 else 'częsty', sygnatura=f'TEST {i}', link='')
               for i in range(300)]
    data = dict(version='type-filter-regression-v1', records=records)
    vectors = [[1, 0] if i < 110 else [0.5, 0.8660254037844386] if i < 115 else [0, 1]
               for i in range(len(records))]
    dense = [dict(record_index=i, score=v[0]) for i, v in enumerate(vectors)]
    dense.sort(key=lambda h: (-h['score'], h['record_index']))
    oracle = BM25Okapi([tokenize(t) for t in texts_for(records)], **PARAMS)
    lexical = ranking(oracle.get_scores(tokenize(query)))
    rare = lambda hits: [h for h in hits if records[h['record_index']]['typ'] == 'rzadki']
    assert not rare(dense[:100]) and not rare(lexical[:100])
    expected = fuse(rare(dense), rare(lexical))
    assert len(expected) == 5 and not rare(fuse(dense, lexical))
    return dict(data=data, index=build_index(data, tokenize), query=query,
                embeddings=dict(version=data['version'], model='Infojura/mmlw-retrieval-e5-small-onnx',
                                dimensions=2, embeddings=vectors),
                queryVector=[1, 0], dense=dense, lexical=lexical, expected=expected)


if __name__ == '__main__':
    from build_bm25 import ROOT, write_json
    path = ROOT / 'tests/fixtures/type-filter.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    write_json(path, make_fixture())
