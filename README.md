# Tezy jawnościowe NSA — statyczna wyszukiwarka

Statyczna strona przeznaczona do hostowania przez GitHub Pages.

## O serwisie i pochodzeniu danych

Serwis prezentuje tezy jawnościowe opracowane na podstawie orzeczeń
**Naczelnego Sądu Administracyjnego** publikowanych w
**Centralnej Bazie Orzeczeń Sądów Administracyjnych (CBOSA)**:

https://orzeczenia.nsa.gov.pl/cbo/query

CBOSA jest internetową bazą prowadzoną przez sądownictwo administracyjne.
Sama baza ma charakter informacyjny i edukacyjny i nie jest urzędowym
publikatorem orzeczeń.

### Jak powstają tezy

Treść uzasadnień NSA jest analizowana automatycznie przy przy użyciu modeli językowych OpenAI w wariancie **Luna**,
z rozumowaniem ustawionym na poziom średni. Model wyszukuje i syntetyzuje wypowiedzi NSA o znaczeniu jawnościowym, m.in. takie, które:

- wspierają dostęp do informacji publicznej,
- wyjaśniają zakres jawności,
- zawężają wyjątki od jawności,
- wskazują standardy działania podmiotów zobowiązanych,
- pokazują praktyczną drogę skutecznego uzyskania informacji.

Analiza jest instruowana tak, aby odróżniać własne stanowisko NSA od poglądów
WSA, organów i stron jedynie przytoczonych w uzasadnieniu.

Tezy są wynikiem **automatycznej analizy i syntezy**. Nie są oficjalnymi tezami
sądu i mogą zawierać błędy albo pominięcia. Dlatego każda teza powinna być
weryfikowana w pełnym uzasadnieniu źródłowego orzeczenia, do którego aplikacja
podaje bezpośredni link.

### Jak działa wyszukiwanie

**Dokładna fraza** filtruje rekordy po literalnym ciągu znaków w polach
`teza`, `znaczenie_projawnosciowe` i `podstawa_w_uzasadnieniu`.
Wielkość liter jest ignorowana.

**Wyszukiwanie znaczeniowe** korzysta z polskiego modelu embeddingowego
`mmlw-retrieval-e5-small`. Przy przygotowaniu indeksu treść tezy i jej
znaczenie jawnościowe są zamieniane na 384-wymiarowe wektory. Zapytanie
użytkownika jest zamieniane na wektor lokalnie w przeglądarce, a aplikacja
porównuje go z wektorami tez i szereguje wyniki według podobieństwa
znaczeniowego.

Przy pierwszym użyciu trybu znaczeniowego przeglądarka musi pobrać model
ONNX (ok. 113 MB plus niewielkie pliki pomocnicze). Interfejs jest w tym
czasie celowo blokowany. Po zapisaniu modelu w cache kolejne użycia są
znacznie szybsze.

Na stronie dostępny jest przycisk **„O serwisie”**, który otwiera skróconą
wersję powyższego opisu w oknie modalnym.

## Co działa

- **Dokładna fraza** — natychmiastowe filtrowanie po polach `teza`, `znaczenie_projawnosciowe` i `podstawa_w_uzasadnieniu`.
- **Wyszukiwanie znaczeniowe** — embedding zapytania liczony lokalnie w przeglądarce przez Transformers.js.
- Filtr po `typ` tezy.
- Jeden wynik prowadzi bezpośrednio do orzeczenia NSA.
- Brak kluczy API i backendu.

## Pierwsze użycie wyszukiwania znaczeniowego

Po pierwszym kliknięciu **Znaczeniowe** interfejs zostaje celowo zablokowany pełnoekranową nakładką. Użytkownik jest informowany, że przeglądarka pobiera model embeddingowy. Model `Infojura/mmlw-retrieval-e5-small-onnx` działa po stronie klienta przez Transformers.js.

Strona używa gotowego, dynamicznie kwantyzowanego modelu ONNX. Sam plik modelu ma ok. 113 MB; dochodzą niewielkie pliki tokenizera i konfiguracji. Przeglądarka zwykle cache'uje pobrane zasoby, więc kolejne użycia są szybsze.

Jeśli `data/embeddings.json` nie istnieje albo nie pasuje do aktualnej wersji `data.json`, strona może jednorazowo policzyć embeddingi wszystkich tez w przeglądarce i zachować je w IndexedDB. Dla publicznej wersji strony zalecane jest jednak wcześniejsze wygenerowanie `embeddings.json`.

## Model MMLW i prefiksy E5

Wyszukiwanie znaczeniowe korzysta z polskiego modelu `mmlw-retrieval-e5-small`,
dostrojonego do zadania wyszukiwania informacji.

Ten model wymaga prefiksów E5:
- zapytanie użytkownika: `query: ...`
- indeksowana teza: `passage: ...`

Skrypt `prepare_site_data.py` dodaje prefiks `passage:` przy generowaniu indeksu,
a `app.js` dodaje `query:` przy wyszukiwaniu. Awaryjne generowanie embeddingów
w samej przeglądarce również używa `passage:`.

Model przeglądarkowy jest przypięty do konkretnej rewizji repozytorium,
żeby późniejsza zmiana struktury plików na Hugging Face nie zepsuła strony.

## Aktualizacja danych z MongoDB

W katalogu znajduje się `prepare_site_data.py`. Łączy się on z MongoDB, pobiera dokumenty z niepustym `tezy_projawnosciowe`, spłaszcza każdą tezę do osobnego rekordu i tworzy:

- `data/data.json`
- `data/embeddings.json`

Instalacja:

```bash
pip install pymongo python-dotenv sentence-transformers -r tools/requirements-search.txt
```

Następnie:

```bash
python tools/prepare_site_data.py
```

Zmienne `MONGO_URI`, `MONGO_DB`, `MONGO_COLLECTION` mogą być w `.env`.

## Lokalny podgląd

Nie otwieraj `index.html` przez `file://`, bo przeglądarka może blokować `fetch()`. Uruchom prosty serwer:

```bash
python -m http.server 8000
```

Potem otwórz `http://localhost:8000`.

## GitHub Pages

Najprostszy wariant:

1. Wgraj zawartość tego katalogu do repozytorium GitHub.
2. Wejdź w **Settings → Pages**.
3. Wybierz publikowanie z gałęzi, np. `main`, katalog `/ (root)`.
4. GitHub poda adres strony.

## Pliki

- `index.html` — struktura strony
- `styles.css` — wygląd
- `app.js` — wyszukiwanie literalne i semantyczne
- `data/data.json` — dane tez
- `data/embeddings.json` — opcjonalny, ale zalecany gotowy indeks semantyczny
- `prepare_site_data.py` — generator danych i embeddingów z MongoDB

## Hybryda MMLW + BM25 (RRF)

Tryb **Znaczeniowe** domyślnie łączy dotychczasowy MMLW z BM25.
Model, rewizja ONNX, prefiksy E5 i istniejące embeddingi pozostają takie same.
Wszystkie obliczenia przy wyszukiwaniu odbywają się w przeglądarce; GitHub Pages
serwuje wyłącznie pliki statyczne.

BM25Okapi używa `k1=1.5`, `b=0.75`, `epsilon=0.25`, łącznie z zastępowaniem
ujemnego IDF przez `epsilon * średni IDF` z całego słownika, zgodnie z
`rank_bm25==0.2.2`. Indeksowane są wyłącznie `teza + "\n" + znaczenie_projawnosciowe`.
`podstawa_w_uzasadnieniu` pozostaje dostępna w dokładnej frazie, ale nie w BM25.
Tokenizer odpowiada `re.findall(r"[^\W_]+", text.casefold())`, odrzuca tokeny
krótsze niż dwa punkty kodowe i używa `Stemmer.polimorf()` PyStempel 2.0.0,
z małymi literami i oryginalnym słowem przy braku rdzenia. Nie usuwa stop words.
Statyczne tablice Unicode z Pythona 3.12 zachowują `casefold` i polskie oraz inne
alfanumeryczne znaki także tam, gdzie JavaScript `toLowerCase()` lub `\w` dają inny wynik.

Do RRF trafia pierwszych 100 wyników MMLW i do 100 **dodatnich** wyników BM25.
Powtórzone słowa w zapytaniu liczą się wielokrotnie. Wynik RRF to suma
`1 / (60 + pozycja)` z pozycjami liczonymi od 1. Remisy w BM25, MMLW i RRF
rozstrzyga indeks rekordu w `data.records`, zgodnie z eksperymentem
`porownaj_modele.py`; identyfikator rekordu nie jest kluczem rozstrzygania remisów.
W hybrydzie paginacja obejmuje sumę obu pul (maksymalnie 200 rekordów), a filtr
typu działa **po** globalnym RRF. W trybie samego MMLW dostępny jest cały ranking.
Wartości RRF są oznaczone jako RRF, bez przeliczania ich na procent podobieństwa.

### Wyłączenie i awarie

- Odznacz **Łącz dopasowanie znaczeniowe i słowne** w trybie znaczeniowym.
- Otwórz stronę z `?hybrid=0`, aby rozpocząć z samym MMLW.
- Ustaw `HYBRID_ENABLED = false` w `search-config.js`, aby wyłączyć hybrydę dla wszystkich.

Zasoby BM25 są pobierane dopiero przy pierwszym niepustym zapytaniu znaczeniowym.
Brak pliku, uszkodzone reguły, inna wersja danych, inna treść/kolejność rekordów
lub błąd modułu uruchamiają automatyczny powrót do MMLW. Ładowanie BM25 ma limit
15 sekund. Po awarii MMLW działa do końca wizyty; odświeżenie strony ponawia próbę.
Dokładna fraza nie wymaga modelu ani BM25.

### Budowanie indeksu

Wymagany Python 3.12 (przypięte tablice Unicode):

```sh
pip install -r tools/requirements-search.txt
python tools/build_bm25.py
```

Tworzy `data/bm25.json` (ok. 1,6 MB) i `data/bm25-unicode.json` (ok. 28 KB),
bez zmiany istniejących danych lub embeddingów. Generator z MongoDB
`tools/prepare_site_data.py` również tworzy te pliki; oprócz dotychczasowych
zależności wymaga `tools/requirements-search.txt`.
Indeks zawiera IDF, długości dokumentów i listy wystąpień; przeglądarka nie
stemmuje całego korpusu. Stemmer używany do zapytań ma lokalną tablicę reguł
ok. 7,6 MB, ładowaną jednorazowo. Nie wymaga CDN ani backendu.

### Testy zgodności

```sh
pip install -r tools/requirements-search.txt
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Testy tworzą niezależny oracle w Pythonie przy użyciu rzeczywistych
PyStempel 2.0.0 i `rank_bm25==0.2.2`. Porównują tokeny, wszystkie punktacje
BM25 (tolerancja `1e-12`), kolejność BM25 i RRF oraz punktację RRF.
Obejmują dane produkcyjne, puste dokumenty/zapytania, nieznane terminy,
powtórzenia, negacje, nietypowy Unicode, niedodatnie wyniki, remisy i granicę
100 kandydatów. Przebudowują również indeks produkcyjny i sprawdzają jego zgodność.
Testy Chromium sprawdzają rzeczywiste zasoby leksykalne, interfejs, paginację,
powrót do MMLW, filtr i dokładną frazę. W tych testach model ONNX jest zastąpiony
stałym wektorem, aby CI nie pobierało 113 MB; nie sprawdzają jakości samego modelu.
Workflow `Search conformance` uruchamia testy na każdym PR do `main`.

Stemmer jest kopią przypiętą do commitu
[`1052235`](https://github.com/dzemeuksis/stempel-polimorf-js/tree/105223508979f294cfe28a273bf1cae0b541c108).
Zachowano [NOTICE](vendor/stempel-polimorf-js/NOTICE), pełne teksty licencji
Egothor, Apache-2.0 i BSD PoliMorf w [licenses/](vendor/stempel-polimorf-js/licenses/)
oraz metadane pochodzenia. Repozytorium stemmera nie jest zmieniane.
