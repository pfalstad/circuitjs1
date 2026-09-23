// The directory this module was loaded from, as an absolute URL ending in "/".
//
// Mirrors GWT.getModuleBaseURL() from the old Java app: it's derived from the
// actual script URL at runtime, not a hardcoded path, so resources fetched
// relative to it (setuplist.txt, circuits/, locale/) are found correctly no
// matter what directory this build ends up deployed to or renamed to (e.g. a
// per-version directory like circuitjs81/).
export const moduleBaseURL = new URL('.', import.meta.url).href;
