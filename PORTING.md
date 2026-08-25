# Porting into Cupertino-GDC.github.io

This repo is standalone so it can be developed and deployed on its own. When you
want it to *become* the club site's lessons section, here is everything that has
to change.

## What it replaces

| In the club repo | Fate |
| --- | --- |
| `lessons.html` | Replaced. It is the old accordion page; all 39 lessons and 69 slide links already live in `data/lessons.json`. |
| `css/lessons.css` | Delete. Nothing here uses it. |

## Copy these in

```
index.html   -> lessons.html          (rename: the club site has no /lessons/ dir)
lesson.html  -> lesson.html
editor.html  -> lesson-editor.html
css/browse.css  css/lesson.css  css/editor.css   -> css/
js/data.js  js/render.js  js/browse.js  js/lesson.js  js/editor.js  -> js/
data/lessons.json  -> data/
imgs/lessons/*     -> imgs/lessons/
files/*            -> files/
```

Do **not** copy `css/primary.css` or `js/primary.js` — the club repo has its own.
They are vendored here only so this repo stands alone.

## Then fix these five things

1. **Drop the vendored chrome.** Delete this repo's `css/primary.css` and
   `js/primary.js`, and point the three pages at the club's versions. The club's
   `primary.css` does not have the design tokens or the shared `.lesson-card`
   rules, so move these blocks across from this repo's `css/primary.css`:
   - the `:root { --gdc-* }` token block
   - `.gdc-btn` (+ `.full`, `.small`, tone variants) and `.gdc-card`
   - `.gdc-shell`, `.skip-link`, `.visually-hidden`, `:focus-visible`
   - the whole **lesson card** section — `renderLessonCard()` is used by both
     the grid and the related-lessons strip, so its CSS must load on both pages

2. **Restore the club's real navbar and footer.** `js/primary.js` here injects
   them into `[data-gdc-navbar]` / `[data-gdc-footer]`. In the club repo, paste
   the site's own `<div id="navbar-div">` and `<footer id="footer">` markup
   straight into the three pages and delete those two attributes. Keep
   `navbar-expand-xl` rather than the club's `navbar-expand-md`, and keep the
   `max-width: 1400px` margin breakpoint from this repo's `primary.css` — the
   six nav items plus the logo need 1107px on one row (1379px once the wide
   50px margins kick in). The club's `-md` expands at 768px and clips
   "MelonJam" from 768px all the way to 1107px. `tests/navcheck.html` checks
   this across twelve widths.

3. **Make paths absolute.** This repo uses relative paths (`imgs/…`,
   `data/lessons.json`, `lesson.html?id=…`). The club site serves pages from the
   root and uses `/imgs/…`. Update:
   - `DATA_URL` in `js/data.js`
   - `'data/lessons.json'` in `js/editor.js`
   - `'lesson.html?id='` in `js/render.js` and `js/lesson.js`
   - `'index.html'` in `js/lesson.js` and `js/browse.js`
   - the `<link>`/`<script>`/favicon paths in the three HTML files

4. **Point the nav at the new page.** `GDC_NAV_LINKS` here links Lessons to
   `index.html`; the club nav already links to `/lessons.html`. Also add a link
   to the editor somewhere officers will find it — it is `noindex`, not secret.

5. **Bring the analytics tag.** Every club page starts with the gtag snippet for
   `UA-154961228-1`. These pages do not have it. Copy it into all three `<head>`s
   if lesson traffic should show up alongside the rest of the site.

## Check after porting

- The three Blender lessons still appear under **all three** engine tabs.
- `lesson.html?id=unity-platformer` shows all four Google Slides links.
- The related-lessons strip at the bottom of a lesson page is styled — if those
  cards look like bare images, step 1's card CSS did not come across.
- `tests/browser-tests.html` still passes (fix its `../js/` paths if you move it).

## What does not need porting

Bootstrap 4.5, jQuery, Popper and Font Awesome all come from the same CDNs at the
same versions the club site already uses, and the fonts are the same Google Fonts
families. Nothing to reconcile.

Third-party assets
------------------

imgs/GDCLogo_Web.png, imgs/GDCBrowserTabIcon.png and
imgs/GDCLogo_IconTransparent.svg are Cupertino Game Dev Club marks, vendored
from github.com/Cupertino-GDC/Cupertino-GDC.github.io so this repo renders
standalone.
