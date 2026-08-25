# GDC Lessons

An interactive lesson catalog for [Cupertino Game Dev Club](https://gamedevclub.tech),
laid out like MakerWorld and styled like the rest of the club site.

- **`index.html`** — browse every lesson. Filter by component down the left, by
  game engine across the top, plus search and sort.
- **`lesson.html?id=<slug>`** — one lesson: a media gallery and required-files
  panel up top, blog-style instructions below.
- **`editor.html`** — a block editor for writing lessons. Exports a JSON object
  you paste into `data/lessons.json`.

No build step, no framework, no backend. It is plain HTML/CSS/JS and deploys to
GitHub Pages as-is.

## Running it

Anything that serves static files works. The pages `fetch()` `data/lessons.json`,
so opening `index.html` off the filesystem will **not** work — use a server:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Adding a lesson

1. Open `editor.html`.
2. Fill in the metadata, add media, files, and content blocks. The preview on the
   right is drawn by the same renderer as the real lesson page.
3. Click **Copy lesson object**.
4. Paste it into the `lessons` array in `data/lessons.json` and commit.

Your draft autosaves to `localStorage`, so a reload will not lose it. To change
an existing lesson, load it from the **Load an existing lesson** dropdown, edit,
and replace that object in the JSON.

## How a lesson is shaped

```jsonc
{
  "id": "unity-platformer",          // the ?id= in the URL
  "visibility": true,                // false hides it from the grid
  "title": "Platformer",
  "summary": "Shown on the browse card.",
  "engines": ["unity"],              // [] or ["any"] => shows under EVERY engine tab
  "components": ["mechanics"],       // drives the left sidebar
  "difficulty": "beginner",          // beginner | intermediate | advanced
  "series": "Unity Projects",        // groups the prev/next pager
  "thumbnail": "imgs/lessons/unity-platformer.svg",
  "durationMinutes": null,           // null = estimated from the content
  "media":   [ /* gallery, top-left  */ ],
  "files":   [ /* downloads, top-right */ ],
  "content": [ /* the article body   */ ]
}
```

### Engines

`unity`, `godot`, or `any`. **`any` is not a fourth category** — an
engine-agnostic lesson (Blender, art, theory) appears under *every* engine tab,
including Unity and Godot. That is why the three Blender lessons show up
everywhere.

### Components

`mechanics`, `art`, `ui`, `audio`, `programming`, `level-design`, `animation`,
`ai`, `narrative`, `tools`. Defined once in `js/data.js`; add one there and it
appears in the sidebar and the editor automatically.

> **Audio & Music currently has zero lessons.** It is deliberately still listed
> — an empty category with a real count is the clearest signal of what the
> curriculum is missing.

### Files

Two kinds:

```jsonc
{ "kind": "repo", "name": "Starter project", "path": "files/my-lesson/starter.unitypackage", "size": "4.2 MB" }
{ "kind": "link", "name": "Part 1", "url": "https://docs.google.com/presentation/…", "source": "Google Slides" }
```

`repo` files download directly; `link` files open in a new tab. Put repo files
under `files/<lesson-id>/` — see `files/README.md` about binary size.

### Content blocks

Every block is `{ "type", "title"?, "figures": [] }`:

| Type | What it renders |
| --- | --- |
| `text` | Paragraphs and bullet lists |
| `image` | One image or a grid, with captions |
| `code` | A code block with filename, language label and a copy button |
| `video` | A YouTube/Vimeo embed (paste a normal link) |
| `callout` | A tip / warning / note box |
| `link-embed` | A link card |
| `qa` | Collapsible question-and-answer pairs |
| `download` | Rows pointing at entries in this lesson's `files` array |

A block **with a `title`** gets a table-of-contents entry and a progress
checkbox. Progress is per-viewer, stored in `localStorage`, and shows up as a
badge on the browse card.

## Layout of the code

```
index.html / lesson.html / editor.html
css/primary.css     vendored GDC chrome, design tokens, lesson-card styles
css/browse.css      sidebar, engine rail, grid
css/lesson.css      gallery, files panel, article blocks, TOC
css/editor.css      editor shell
js/primary.js       vendored GDC navbar/footer/helpers
js/data.js          taxonomy, loading, normalization  <- the shape of a lesson
js/render.js        every renderer                    <- shared, see below
js/browse.js        filters, search, sort, URL state
js/lesson.js        detail page
js/editor.js        block editor
data/lessons.json   all lesson content
```

**`js/render.js` is the one renderer.** `lesson.js` and the editor's live preview
both draw through it, so the preview cannot drift from the published page. If you
add a block type, add it in `render.js` (renderer), `data.js` (`BLOCK_TYPES`),
and `editor.js` (`figureEditor` fields) — and both pages get it at once.

All content is inserted with `textContent`, never `innerHTML`, so lesson JSON
cannot inject markup.

## Tests

With the server running, open `tests/browser-tests.html`. It exercises the
editor end-to-end (build a draft → export → normalize → render), checks escaping
and the YouTube URL forms, and prints a pass/fail list.

`tests/measure.html` loads every page at 375 / 900 / 1440px and reports
horizontal overflow. `tests/navcheck.html` checks the navbar across twelve
widths for the band where six nav items no longer fit on one row. Both are worth
opening after any layout change.

Headless:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --virtual-time-budget=9000 \
  --dump-dom "http://localhost:8080/tests/browser-tests.html" | grep -E 'PASS|FAIL|passed'
```

## Where the content came from

The 39 lessons were migrated from the old accordion page in
`Cupertino-GDC.github.io/lessons.html`, keeping all 69 Google Slides links.
Their written walkthroughs are stubs — the slides are still the real lesson.
Filling those in via the editor is the obvious next job.

See `PORTING.md` for merging this into the main club site.
