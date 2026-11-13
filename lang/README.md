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
- Only add a term that appears in no other indexed text. The search already
  matches the class name, the English label and the localized label, so
  `"search:CapacitorElm"="cap"` or `"search:CCCSElm"="cccs"` add nothing.
  `ts/LocaleSearchTerms.test.ts` fails the build if an entry is redundant.
- Entries are optional and additive: they only extend the keywords, they never
  replace the label. A locale without them still searches by label and class
  name.
- `findmissing.py` ignores keys it does not know, so these entries are not
  reported as missing translations.
- `locale_en.txt` is the base layer. English needs no UI catalog, but it
  carries the language-neutral abbreviations ("gnd", "vcc", "dff"), and
  `Locale.load()` loads it first for every locale, then overlays the selected
  language file. So those terms work everywhere, and a locale only has to add
  its own words. A missing file simply yields an empty map.
