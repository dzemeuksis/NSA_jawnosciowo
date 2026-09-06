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

Treść uzasadnień NSA jest analizowana automatycznie przy użyciu modelu
językowego **GPT-5.6 Luna**. Model wyszukuje i syntetyzuje wypowiedzi NSA
o znaczeniu jawnościowym, m.in. takie, które:

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
pip install pymongo python-dotenv sentence-transformers
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
