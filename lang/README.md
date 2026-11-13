[The locale files for translation are here](../ts/public/locale).

To make a new one, create a text file with lines of the form "string"="translation".  See one of the existing locale files for an example.  Use [locale_template.txt](locale_template.txt) as a template, or see [all_strings.txt](all_strings.txt) for the current list of all strings.

## Search abbreviations

Element labels are translated, so the component search already matches the
localized name and the English original. Abbreviations that appear in neither
("opv", "elko", "trafo") are language data as well, so they live in the locale
file instead of a table in the code:

    "search:OpAmpElm"="opv"
    "search:PolarCapacitorElm"="elko"

Rules:

- Key is `search:` plus the element class name (`ts/<Class>Elm.ts`, the same
  name the Draw menu registers in `UIManager.mainMenuItemNames`).
- Value is a space-separated list of extra search terms.
- Entries are optional and additive: they only extend the keywords, they never
  replace the label. A locale without them still searches by label and class
  name.
- `findmissing.py` ignores keys it does not know, so these entries are not
  reported as missing translations.
- `locale_en.txt` contains only these entries. English needs no UI catalog, but
  the abbreviations are useful there too, so `Locale.load()` reads the English
  file as well (a missing one simply yields an empty map).
