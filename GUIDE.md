# How to Add a Lesson to the Site (No Coding Required)

This guide walks you through creating a lesson using the built-in **Lesson Editor** — a
point-and-click tool, no code involved. If you get stuck, ask in the club Discord/Slack
or find whoever last touched `data/lessons.json` on GitHub.

## Before you start

You'll want to have on hand:
- **Photos, screenshots, or a video link** of the finished project (a YouTube or Vimeo link works for video)
- **Any files students need to download** (a starter project, a Google Slides link, etc.)
- **A rough outline** of the steps you want to teach

## 1. Open the editor

1. Go to the site and click **Lesson Editor** in the nav bar (or open `editor.html` directly if you're running it locally).
2. If you're editing a lesson that already exists, use the **"Load an existing lesson"** dropdown near the top to pull it in. Otherwise, just start typing — you're working on a "New draft."

Your work **autosaves to your browser** as you go, so closing the tab by accident won't lose your progress. It's still smart to finish and export in one sitting.

## 2. Fill in the lesson details (left side)

This is the basic info about your lesson:

| Field | What to put |
| --- | --- |
| **Visible on the site** | Leave checked to publish. Uncheck if you're not ready to show it yet. |
| **Title** | The name of the lesson, e.g. "2D Platformer Movement" |
| **Lesson ID** | Auto-fills from the title — you usually don't need to touch this |
| **Difficulty** | Beginner / Intermediate / Advanced |
| **Summary** | One or two sentences — this is what shows on the browse page card |
| **Engines** | Check Unity, Godot, or "Any engine" if it's not engine-specific (like a Blender or art lesson — those need to show up everywhere) |
| **Components** | Check every category that applies: Mechanics, Art, UI, Audio, Programming, Level Design, Animation, AI, Narrative, Tools |
| **Series** | A group name if this lesson is part of a set (e.g. "Unity Fundamentals") — used for "next lesson" navigation |
| **Author** | Your name or the club's name |
| **Thumbnail path** | The image shown on the browse card — see "Adding images" below |
| **Tags** | A few comma-separated keywords people might search for |
| **Written / Updated dates** | Optional |
| **Estimated minutes** | Leave "Estimate the time automatically" checked — it figures out how long the lesson takes based on how much content you add |

## 3. Add your photo/video and downloads

Scroll to the **Media** and **Files** sections:

- **Media** — click **Add** to insert a photo or a video. For video, paste a normal
  YouTube or Vimeo link. Add a caption if you'd like. This is what shows at the top-left
  of the finished lesson page.
- **Files** — click **Add** for each download. You have two options:
  - **File in this repo** — for files you're including directly (starter projects,
    assets). Someone with GitHub access will need to place the actual file in the
    `files/` folder — ask for help here if you're not comfortable with GitHub.
  - **External link** — for anything hosted elsewhere, like a Google Slides deck.
    Just paste the link and give it a name.

This becomes the download panel on the top-right of the lesson page.

## 4. Write the lesson content (the main body)

This is the blog-post part of the lesson — the actual instructions. Click the
**+** button to insert a block, and pick a block type:

| Block type | Use it for |
| --- | --- |
| **Text** | Regular paragraphs or a bulleted list |
| **Image** | One picture, or a grid of several, each with an optional caption |
| **Code** | A snippet of code — pick the language and it gets formatted nicely with a copy button |
| **Video** | Embed another YouTube/Vimeo clip partway through the lesson |
| **Callout** | A highlighted box for a Tip, Note, or Warning |
| **Link** | A card linking out to something (a doc, a tutorial, a tool) |
| **Q&A** | A collapsible question-and-answer section, e.g. for common troubleshooting |
| **Download** | A row pointing at one of the files you added in step 3 |

Tips:
- Give a block a **heading/title** if you want it to show up in the lesson's table of contents with a checkbox — great for breaking a lesson into steps.
- You can drag blocks to reorder them (the ⠿ handle on the left of each block), duplicate them, or delete them using the small icon buttons on each block.
- The **preview pane on the right** shows exactly what the finished lesson will look like — check it as you go.

## 5. Adding images

Images are referenced by a file path, not uploaded through the editor. To add a new
image:
1. Save/export your image file.
2. Ask someone with GitHub access to add it under `imgs/lessons/` (for thumbnails) or
   an appropriate folder, and give you the path — e.g. `imgs/lessons/my-lesson.png`.
3. Paste that path into the relevant field (Thumbnail, or an Image block).

If you're comfortable with GitHub yourself, you can upload the image to that folder
directly through GitHub's web interface (drag-and-drop works) and then use its path.

## 6. Export your lesson

When you're happy with the preview:

1. Click **Copy lesson object** near the top of the editor. This copies a block of
   text to your clipboard — don't worry about what it looks like, you don't need to
   understand it.
2. Watch for any **warnings** shown near the bottom — they'll flag things like empty
   blocks or missing images so you can go back and fix them.

## 7. Getting it published

The copied text needs to be added to a file called `data/lessons.json` and saved to
the site's GitHub repository. If you don't use GitHub:

- **Easiest:** Paste the copied text into a message/doc and send it to whoever manages
  the site (e.g. via Discord), asking them to add it to `data/lessons.json`.

If you *do* have GitHub access, or want to try:

1. Open `data/lessons.json` in the repo (on GitHub.com, or in a text editor if you
   have the project checked out).
2. Find the `"lessons": [ ... ]` array.
3. Paste your copied lesson object in as a new item in that list (add a comma after
   the previous entry if needed).
4. Save/commit the change with a short message like "Add [lesson name] lesson."

Once it's merged, your lesson will show up on the main browse page automatically,
sorted into the right engine tab and component category.

## Updating an existing lesson later

Open the editor, use **"Load an existing lesson"** to pull it back in, make your
changes, and repeat step 6-7 — you'll be replacing the old object in
`data/lessons.json` with the newly copied one (same `id`).

---
*Questions? Ask in the club's dev channel — no one expects you to know GitHub or code to contribute a lesson.*
