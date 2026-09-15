/* ==========================================================================
   editor.js — the lesson block editor.
   Same shape as the magmalabs blog-builder: an export pane, a live preview
   that runs through the REAL renderer, and a stack of editable content cards.
   Output is a JSON object you paste into data/lessons.json.
   ========================================================================== */

(function () {
    'use strict';

    var D = window.GDCData;
    var R = window.GDCRender;
    var el = R.el;
    var icon = R.icon;

    var STORAGE_KEY = 'gdc-lesson-editor-draft';
    var root = document.querySelector('[data-lesson-editor]');
    var toastEl = document.querySelector('[data-toast]');

    var uid = 0;
    function nextId(prefix) { uid += 1; return prefix + '-' + uid; }

    var draft = null;      // the working lesson (editor shape)
    var existing = [];     // raw lessons from data/lessons.json
    var refs = {};

    /* ------------------------------------------------------------- toast   */

    var toastTimer = null;
    function toast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
    }

    /* ------------------------------------------------------- draft factory */

    function blankDraft() {
        return {
            id: '',
            visibility: true,
            title: '',
            summary: '',
            engines: [],
            components: [],
            difficulty: 'beginner',
            series: '',
            thumbnail: '',
            author: 'GDC Officers',
            writtenAt: new Date().toISOString().slice(0, 10),
            updatedAt: '',
            durationMinutes: '',
            autoDuration: true,
            tags: '',
            media: [],
            files: [],
            content: []
        };
    }

    /* Convert a stored lesson (lessons.json shape) into the editor's shape,
       where list fields are flat strings the textareas can hold. */
    function toDraft(raw) {
        var d = blankDraft();
        d.id = raw.id || '';
        d.visibility = raw.visibility !== false;
        d.title = raw.title || '';
        d.summary = raw.summary || '';
        d.engines = (raw.engines || []).slice();
        d.components = (raw.components || []).slice();
        d.difficulty = raw.difficulty || 'beginner';
        d.series = raw.series || '';
        d.thumbnail = raw.thumbnail || '';
        d.author = raw.author || 'GDC Officers';
        d.writtenAt = raw.writtenAt || '';
        d.updatedAt = raw.updatedAt || '';
        d.durationMinutes = raw.durationMinutes ? String(raw.durationMinutes) : '';
        d.autoDuration = !raw.durationMinutes;
        d.tags = (raw.tags || []).join(', ');
        d.media = (raw.media || []).map(function (m) {
            return { _id: nextId('media'), type: m.type || 'image', src: m.src || '',
                     alt: m.alt || '', caption: m.caption || '' };
        });
        d.files = (raw.files || []).map(function (f) {
            return { _id: nextId('file'), kind: f.kind || 'link', name: f.name || '',
                     url: f.url || '', path: f.path || '', size: f.size || '',
                     icon: f.icon || 'link', source: f.source || '' };
        });
        d.content = (raw.content || []).map(cardToDraft);
        return d;
    }

    function cardToDraft(card) {
        var c = { _id: nextId('card'), type: card.type || 'text',
                  title: card.title || '', layout: card.layout || 'single', figures: [] };
        c.figures = (card.figures || []).map(function (f) {
            var g = { _id: nextId('fig') };
            Object.keys(f).forEach(function (key) {
                if (key === 'items') {
                    g.itemsText = (f.items || []).join('\n');
                } else {
                    g[key] = f[key];
                }
            });
            if (c.type === 'text' && !g.type) g.type = g.itemsText ? 'list' : 'paragraph';
            return g;
        });
        return c;
    }

    /* --------------------------------------------------- draft persistence */

    function saveDraft() {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        } catch (err) { /* private window — editing still works, just not saved */ }
    }

    function loadStoredDraft() {
        try {
            var raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : null;
        } catch (err) {
            return null;
        }
    }

    /* --------------------------------------------------------- serializing */

    function splitLines(value) {
        return String(value || '').split(/\r?\n/)
            .map(function (line) { return line.trim(); })
            .filter(Boolean);
    }

    function splitCommas(value) {
        return String(value || '').split(',')
            .map(function (part) { return part.trim(); })
            .filter(Boolean);
    }

    /* Canvas-only placeholders. serializeFigure(..., { forCanvas: true }) never
       drops a figure — an empty one renders a placeholder so it's still a real,
       clickable DOM node in the canvas. The export path (opts omitted) is
       completely unaffected: same drop-and-warn behavior as always. */
    var ED_PLACEHOLDER = '—';
    var ED_PLACEHOLDER_PARAGRAPH = 'Write something…';
    var ED_EMPTY_IMAGE_SRC = 'data:image/svg+xml;utf8,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"/>');

    function serializeFigure(card, figure, warnings, label, opts) {
        opts = opts || {};
        var type = card.type;
        figure = figure || {};

        if (type === 'text') {
            if (figure.type === 'list') {
                if (opts.forCanvas) {
                    /* Blank lines survive as placeholders so line index N always
                       maps to the Nth <li> — export still drops them via
                       splitLines. */
                    var rawLines = String(figure.itemsText || '').split(/\r?\n/);
                    var canvasItems = rawLines.map(function (l) { return l.trim() || ED_PLACEHOLDER; });
                    if (!canvasItems.length) canvasItems = [ED_PLACEHOLDER];
                    return { type: 'list', items: canvasItems };
                }
                var items = splitLines(figure.itemsText);
                if (!items.length) { warnings.push(label + ': empty list removed.'); return null; }
                return { type: 'list', items: items };
            }
            var text = D.cleanText(figure.text);
            if (!text) {
                if (opts.forCanvas) return { type: 'paragraph', text: ED_PLACEHOLDER_PARAGRAPH };
                warnings.push(label + ': empty paragraph removed.');
                return null;
            }
            return { type: 'paragraph', text: text };
        }

        if (type === 'image') {
            var src = D.cleanText(figure.src);
            if (!src && !opts.forCanvas) {
                warnings.push(label + ': image with no path removed.');
                return null;
            }
            if (!opts.forCanvas && !D.cleanText(figure.alt)) {
                warnings.push(label + ': image has no alt text — screen readers will skip it.');
            }
            var img = { src: src || (opts.forCanvas ? ED_EMPTY_IMAGE_SRC : src) };
            if (figure.alt) img.alt = D.cleanText(figure.alt);
            if (figure.caption) img.caption = D.cleanText(figure.caption);
            return img;
        }

        if (type === 'code') {
            /* renderCodeBlock never drops a figure for empty code — it always
               renders a (possibly empty) block — so forCanvas just skips the
               warn-and-drop, it doesn't need a placeholder string. */
            var code = String(figure.code == null ? '' : figure.code);
            if (!code.trim() && !opts.forCanvas) {
                warnings.push(label + ': empty code block removed.');
                return null;
            }
            var snippet = { code: code };
            snippet.filename = D.cleanText(figure.filename) || 'snippet.txt';
            if (figure.language) snippet.language = D.cleanText(figure.language);
            if (figure.caption) snippet.caption = D.cleanText(figure.caption);
            return snippet;
        }

        if (type === 'video') {
            var vsrc = D.cleanText(figure.src);
            if (!vsrc) {
                /* renderVideoBlock drops a figure with a falsy src, so — unlike
                   code — a placeholder URL is required, not just a skipped warning.
                   about:blank is a valid, harmless iframe src. */
                if (opts.forCanvas) vsrc = 'about:blank';
                else { warnings.push(label + ': video with no URL removed.'); return null; }
            }
            var video = { src: vsrc };
            if (figure.caption) video.caption = D.cleanText(figure.caption);
            return video;
        }

        if (type === 'callout') {
            /* renderCalloutBlock never drops a figure for empty text either. */
            var ctext = D.cleanText(figure.text);
            if (!ctext && !opts.forCanvas) {
                warnings.push(label + ': empty callout removed.');
                return null;
            }
            var callout = { tone: figure.tone || 'note', text: ctext };
            if (figure.title) callout.title = D.cleanText(figure.title);
            return callout;
        }

        if (type === 'link-embed') {
            var url = D.cleanText(figure.url);
            if (!url && !opts.forCanvas) {
                warnings.push(label + ': link with no URL removed.');
                return null;
            }
            var link = { url: url || '#' };
            if (figure.label) link.label = D.cleanText(figure.label);
            if (figure.site) link.site = D.cleanText(figure.site);
            if (figure.description) link.description = D.cleanText(figure.description);
            return link;
        }

        if (type === 'qa') {
            var question = D.cleanText(figure.question);
            if (!question) {
                if (opts.forCanvas) return { question: ED_PLACEHOLDER, answer: D.cleanText(figure.answer) };
                warnings.push(label + ': Q&A with no question removed.');
                return null;
            }
            return { question: question, answer: D.cleanText(figure.answer) };
        }

        if (type === 'download') {
            var ref = Number(figure.fileRef);
            if (isNaN(ref) || !draft.files[ref]) {
                /* renderDownloadBlock already degrades a bad fileRef to a
                   friendly "no files linked" line — nothing to placeholder. */
                if (opts.forCanvas) return { fileRef: isNaN(ref) ? -1 : ref };
                warnings.push(label + ': download points at a file that no longer exists.');
                return null;
            }
            return { fileRef: ref };
        }

        return null;
    }

    /* Serializes one draft card. Shared by the export path (serialize()) and
       the canvas, which renders each card individually so it can keep a handle
       on which DOM belongs to which draft card. */
    function serializeCard(card, index, warnings, opts) {
        opts = opts || {};
        var label = 'Block ' + (index + 1) + ' (' + card.type + ')';
        var figures = (card.figures || [])
            .map(function (figure) { return serializeFigure(card, figure, warnings, label, opts); })
            .filter(Boolean);

        if (!figures.length) {
            if (opts.forCanvas) {
                /* Every type's forCanvas branch tolerates a missing figure —
                   this keeps a structurally-empty card from vanishing entirely. */
                var placeholder = serializeFigure(card, null, [], label, opts);
                if (placeholder) figures.push(placeholder);
            } else {
                warnings.push(label + ': has no content, removed from the export.');
                return null;
            }
        }

        var result = { type: card.type };
        if (D.cleanText(card.title)) result.title = D.cleanText(card.title);
        if (card.type === 'image' && card.layout === 'grid') result.layout = 'grid';
        result.figures = figures;
        return result;
    }

    function serialize(warnings, opts) {
        opts = opts || {};
        var id = D.slugify(draft.id || draft.title);
        if (!id) warnings.push('Metadata: this lesson needs an ID (or a title to derive one from).');
        if (!D.cleanText(draft.title)) warnings.push('Metadata: this lesson needs a title.');
        if (!D.cleanText(draft.summary)) {
            warnings.push('Metadata: without a summary the browse card will look empty.');
        }
        if (!draft.components.length) {
            warnings.push('Metadata: pick at least one component or this lesson only appears under "All".');
        }
        if (id && existing.some(function (l) { return l.id === id; })) {
            warnings.push('Metadata: “' + id + '” already exists in lessons.json — ' +
                'replace that entry rather than adding a second one.');
        }

        var out = {
            id: id,
            visibility: !!draft.visibility,
            title: D.cleanText(draft.title),
            summary: D.cleanText(draft.summary),
            engines: draft.engines.slice(),
            components: draft.components.slice(),
            difficulty: draft.difficulty || 'beginner'
        };

        if (D.cleanText(draft.series)) out.series = D.cleanText(draft.series);
        out.thumbnail = D.cleanText(draft.thumbnail);
        out.author = D.cleanText(draft.author) || 'GDC Officers';
        out.writtenAt = D.cleanText(draft.writtenAt);
        out.updatedAt = D.cleanText(draft.updatedAt) || null;

        var minutes = Number(draft.durationMinutes);
        out.durationMinutes = (!draft.autoDuration && minutes > 0) ? Math.round(minutes) : null;
        out.tags = splitCommas(draft.tags);

        out.media = draft.media.map(function (m, i) {
            var src = D.cleanText(m.src);
            if (!src) { warnings.push('Media ' + (i + 1) + ': no path, removed.'); return null; }
            var item = { type: m.type === 'video' ? 'video' : 'image', src: src };
            if (m.alt) item.alt = D.cleanText(m.alt);
            if (m.caption) item.caption = D.cleanText(m.caption);
            return item;
        }).filter(Boolean);

        out.files = draft.files.map(function (f, i) {
            var name = D.cleanText(f.name);
            var file = { name: name || 'File ' + (i + 1), kind: f.kind === 'repo' ? 'repo' : 'link' };
            if (file.kind === 'repo') {
                file.path = D.cleanText(f.path);
                if (!file.path) { warnings.push('File ' + (i + 1) + ': no repo path, removed.'); return null; }
                if (f.size) file.size = D.cleanText(f.size);
            } else {
                file.url = D.cleanText(f.url);
                if (!file.url) { warnings.push('File ' + (i + 1) + ': no URL, removed.'); return null; }
            }
            file.icon = D.cleanText(f.icon) || (file.kind === 'repo' ? 'zip' : 'link');
            if (f.source) file.source = D.cleanText(f.source);
            return file;
        }).filter(Boolean);

        out.content = draft.content.map(function (card, index) {
            return serializeCard(card, index, warnings, opts);
        }).filter(Boolean);

        if (!out.content.length) {
            warnings.push('Content: add at least one block — the lesson page will be empty otherwise.');
        }

        return out;
    }

    /* --------------------------------------------------------- field kit   */

    function field(label, control, hint) {
        var wrap = el('label', 'ed-field');
        wrap.appendChild(el('span', 'ed-field-label', label));
        wrap.appendChild(control);
        if (hint) wrap.appendChild(el('span', 'ed-hint', hint));
        return wrap;
    }

    function textInput(value, onInput, placeholder, type) {
        var input = el('input', 'ed-input');
        input.type = type || 'text';
        input.value = value == null ? '' : value;
        if (placeholder) input.placeholder = placeholder;
        input.addEventListener('input', function () { onInput(input.value); });
        return input;
    }

    function textArea(value, onInput, rows, placeholder, mono) {
        var area = el('textarea', 'ed-input' + (mono ? ' mono' : ''));
        area.rows = rows || 3;
        area.value = value == null ? '' : value;
        if (placeholder) area.placeholder = placeholder;
        area.addEventListener('input', function () { onInput(area.value); });
        return area;
    }

    function selectInput(value, options, onChange) {
        var select = el('select', 'ed-input');
        options.forEach(function (option) {
            var opt = el('option', null, option.label);
            opt.value = option.value;
            if (String(option.value) === String(value)) opt.selected = true;
            select.appendChild(opt);
        });
        select.addEventListener('change', function () { onChange(select.value); });
        return select;
    }

    function checkboxRow(label, checked, onChange) {
        var wrap = el('label', 'ed-toggle');
        var box = el('input');
        box.type = 'checkbox';
        box.checked = !!checked;
        box.addEventListener('change', function () { onChange(box.checked); });
        wrap.appendChild(box);
        wrap.appendChild(el('span', null, label));
        return wrap;
    }

    function checkGroup(options, selected, onChange) {
        var group = el('div', 'ed-checkgroup');
        options.forEach(function (option) {
            var chip = el('label', 'ed-checkchip');
            var box = el('input');
            box.type = 'checkbox';
            box.checked = selected.indexOf(option.key) !== -1;
            box.addEventListener('change', function () {
                var next = selected.slice();
                var at = next.indexOf(option.key);
                if (box.checked && at === -1) next.push(option.key);
                if (!box.checked && at !== -1) next.splice(at, 1);
                onChange(next);
            });
            chip.appendChild(box);
            chip.appendChild(el('span', null, option.label));
            group.appendChild(chip);
        });
        return group;
    }

    function actionButton(label, variant, onClick) {
        var btn = el('button', 'gdc-btn small ' + variant, label);
        btn.type = 'button';
        btn.addEventListener('click', onClick);
        return btn;
    }

    function moveItem(list, index, delta) {
        var to = index + delta;
        if (to < 0 || to >= list.length) return false;
        var item = list.splice(index, 1)[0];
        list.splice(to, 0, item);
        return true;
    }

    /* ================================================== figure editors ==== */

    var LANGUAGES = ['C#', 'GDScript', 'JavaScript', 'Python', 'HLSL/ShaderLab',
        'JSON', 'Bash', 'C++', 'Java', 'Plain text'];

    /* `rerender` is a STRUCTURAL rebuild (rerenderAll, or the "⋯" popover's
       rebuildBody) — reserved for changes that alter which fields are on
       screen (add/remove/reorder a figure, or a type toggle that swaps the
       field set). Every plain value field below calls refresh() directly
       instead: it updates the export + canvas without tearing down this
       form, so the input the user is actively typing in is never destroyed
       and re-created out from under their cursor. Calling `rerender` on
       every keystroke was exactly that bug — see cardEditor's block-heading
       field for the same fix, and renderMetadata's Title field for the one
       case that needed a real (but now targeted) alternative. */
    function figureEditor(card, figure, index, rerender) {
        var box = el('div', 'ed-figure');

        var head = el('div', 'ed-figure-head');
        head.appendChild(el('span', 'ed-figure-label', 'Item ' + (index + 1)));

        var tools = el('div', 'ed-figure-tools');
        tools.appendChild(actionButton('↑', 'ghost', function () {
            if (moveItem(card.figures, index, -1)) rerender();
        }));
        tools.appendChild(actionButton('↓', 'ghost', function () {
            if (moveItem(card.figures, index, 1)) rerender();
        }));
        tools.appendChild(actionButton('Remove', 'danger', function () {
            card.figures.splice(index, 1);
            rerender();
        }));
        head.appendChild(tools);
        box.appendChild(head);

        var body = el('div', 'ed-figure-body');

        if (card.type === 'text') {
            /* The only genuinely structural field here: paragraph vs list
               swaps the field set below it. */
            body.appendChild(field('Figure type', selectInput(figure.type || 'paragraph', [
                { value: 'paragraph', label: 'Paragraph' },
                { value: 'list', label: 'List' }
            ], function (v) { figure.type = v; rerender(); })));

            if (figure.type === 'list') {
                body.appendChild(field('List items',
                    textArea(figure.itemsText, function (v) { figure.itemsText = v; refresh(); },
                        5, 'One item per line'),
                    'One item per line.'));
            } else {
                body.appendChild(field('Paragraph text',
                    textArea(figure.text, function (v) { figure.text = v; refresh(); },
                        4, 'Explain this step…')));
            }
        }

        if (card.type === 'image') {
            body.appendChild(field('Image path',
                textInput(figure.src, function (v) { figure.src = v; refresh(); },
                    'imgs/lessons/my-lesson/step-1.png')));
            body.appendChild(field('Alt text',
                textInput(figure.alt, function (v) { figure.alt = v; refresh(); },
                    'What the screenshot shows'),
                'Required for screen readers. Describe what a reader would miss.'));
            body.appendChild(field('Caption',
                textInput(figure.caption, function (v) { figure.caption = v; refresh(); },
                    'Optional caption shown under the image')));
        }

        if (card.type === 'code') {
            var row = el('div', 'ed-row');
            row.appendChild(field('Filename',
                textInput(figure.filename, function (v) { figure.filename = v; refresh(); },
                    'PlayerMovement.cs')));
            row.appendChild(field('Language', selectInput(figure.language || 'C#',
                LANGUAGES.map(function (l) { return { value: l, label: l }; }),
                function (v) { figure.language = v; refresh(); })));
            body.appendChild(row);
            body.appendChild(field('Code',
                textArea(figure.code, function (v) { figure.code = v; refresh(); },
                    12, 'void Update() { ... }', true)));
            body.appendChild(field('Caption',
                textInput(figure.caption, function (v) { figure.caption = v; refresh(); },
                    'Optional note under the code')));
        }

        if (card.type === 'video') {
            body.appendChild(field('Video URL',
                textInput(figure.src, function (v) { figure.src = v; refresh(); },
                    'https://www.youtube.com/watch?v=…'),
                'A normal YouTube or Vimeo link works — it is converted to an embed.'));
            body.appendChild(field('Caption',
                textInput(figure.caption, function (v) { figure.caption = v; refresh(); },
                    'Optional caption')));
        }

        if (card.type === 'callout') {
            body.appendChild(field('Tone', selectInput(figure.tone || 'note', [
                { value: 'note', label: 'Note' },
                { value: 'tip', label: 'Tip' },
                { value: 'warn', label: 'Warning' }
            ], function (v) { figure.tone = v; refresh(); })));
            body.appendChild(field('Heading',
                textInput(figure.title, function (v) { figure.title = v; refresh(); },
                    'Optional bold heading')));
            body.appendChild(field('Text',
                textArea(figure.text, function (v) { figure.text = v; refresh(); },
                    3, 'Watch out for…')));
        }

        if (card.type === 'link-embed') {
            body.appendChild(field('URL',
                textInput(figure.url, function (v) { figure.url = v; refresh(); },
                    'https://docs.google.com/presentation/…')));
            var linkRow = el('div', 'ed-row');
            linkRow.appendChild(field('Label',
                textInput(figure.label, function (v) { figure.label = v; refresh(); },
                    'Part 1 — Unity basics')));
            linkRow.appendChild(field('Site',
                textInput(figure.site, function (v) { figure.site = v; refresh(); },
                    'Google Slides')));
            body.appendChild(linkRow);
            body.appendChild(field('Description',
                textInput(figure.description, function (v) { figure.description = v; refresh(); },
                    'Optional one-liner')));
        }

        if (card.type === 'qa') {
            body.appendChild(field('Question',
                textInput(figure.question, function (v) { figure.question = v; refresh(); },
                    'Why is my character falling through the floor?')));
            body.appendChild(field('Answer',
                textArea(figure.answer, function (v) { figure.answer = v; refresh(); },
                    3, 'Because…')));
        }

        if (card.type === 'download') {
            var options = draft.files.length
                ? draft.files.map(function (f, i) {
                    return { value: i, label: (i + 1) + '. ' + (f.name || '(unnamed file)') };
                })
                : [{ value: '', label: 'No files defined yet' }];
            body.appendChild(field('Linked file',
                selectInput(figure.fileRef, options, function (v) {
                    figure.fileRef = v === '' ? '' : Number(v);
                    refresh();
                }),
                'Points at an entry in the Files list above, so each URL lives in one place.'));
        }

        box.appendChild(body);
        return box;
    }

    /* ==================================================== content cards === */

    function defaultFigure(type) {
        var f = { _id: nextId('fig') };
        if (type === 'text') { f.type = 'paragraph'; f.text = ''; }
        if (type === 'callout') { f.tone = 'note'; f.text = ''; }
        if (type === 'code') { f.filename = 'Example.cs'; f.language = 'C#'; f.code = ''; }
        if (type === 'download') { f.fileRef = draft.files.length ? 0 : ''; }
        return f;
    }

    function cardEditor(card, index, rerender) {
        var meta = D.BLOCK_TYPES.filter(function (b) { return b.key === card.type; })[0] ||
            { label: card.type, icon: 'fa-solid fa-cube' };

        var box = el('section', 'ed-card gdc-card');

        var head = el('div', 'ed-card-head');
        var name = el('div', 'ed-card-name');
        name.appendChild(icon(meta.icon));
        name.appendChild(el('span', null, meta.label));
        name.appendChild(el('span', 'ed-card-index', '#' + (index + 1)));
        head.appendChild(name);

        var tools = el('div', 'ed-card-tools');
        tools.appendChild(actionButton('↑', 'ghost', function () {
            if (moveItem(draft.content, index, -1)) rerender();
        }));
        tools.appendChild(actionButton('↓', 'ghost', function () {
            if (moveItem(draft.content, index, 1)) rerender();
        }));
        tools.appendChild(actionButton('Duplicate', 'ghost', function () {
            var copy = cardToDraft(JSON.parse(JSON.stringify(stripIds(card))));
            draft.content.splice(index + 1, 0, copy);
            rerender();
        }));
        tools.appendChild(actionButton('Delete', 'danger', function () {
            draft.content.splice(index, 1);
            rerender();
        }));
        head.appendChild(tools);
        box.appendChild(head);

        var body = el('div', 'ed-card-body');

        body.appendChild(field('Block heading',
            textInput(card.title, function (v) { card.title = v; refresh(); },
                'Optional — becomes a section title'),
            'Headed blocks get a progress checkbox and a table-of-contents entry.'));

        if (card.type === 'image') {
            body.appendChild(field('Layout', selectInput(card.layout || 'single', [
                { value: 'single', label: 'Single column' },
                { value: 'grid', label: 'Grid' }
            ], function (v) { card.layout = v; refresh(); })));
        }

        var figures = el('div', 'ed-figures');
        card.figures.forEach(function (figure, i) {
            figures.appendChild(figureEditor(card, figure, i, rerender));
        });
        body.appendChild(figures);

        body.appendChild(actionButton('+ Add item', 'ghost', function () {
            card.figures.push(defaultFigure(card.type));
            rerender();
        }));

        box.appendChild(body);
        return box;
    }

    function stripIds(value) {
        if (Array.isArray(value)) return value.map(stripIds);
        if (value && typeof value === 'object') {
            var out = {};
            Object.keys(value).forEach(function (key) {
                if (key !== '_id') out[key] = stripIds(value[key]);
            });
            return out;
        }
        return value;
    }

    /* ============================================== canvas: path addressing */
    /*
       The canvas is the click-to-edit-in-place engine that replaced the old
       read-only preview, ported from magmalabs.dev's inline blog-builder
       (commit b0ced1e6, 2026-08-25). The mechanism: every content block is
       rendered through the exact same GDCRender functions the public lesson
       page uses (serialized with { forCanvas: true } so an empty figure still
       renders a placeholder instead of vanishing), then an "annotator" per
       block type walks that real DOM and marks specific nodes contenteditable
       with a data-ed-path address back into the draft. One delegated listener
       on the canvas root resolves data-ed-path -> draft card -> field and
       writes typed text straight into the draft — no form field ever exists
       for plain text. Fields that would corrupt under contenteditable (image
       src, code body, URLs) stay in a popover that reuses figureEditor()
       verbatim.

       Editable nodes carry data-ed-path resolved against the *draft* card:
         title            -> card.title
         f.<n>.<field>    -> card.figures[n][field]
         f.<n>.items.<r>  -> line r of card.figures[n].itemsText
    */

    function splitLinesRaw(value) {
        return String(value || '').split(/\r?\n/);
    }

    function edGetPath(card, path) {
        if (!card || !path) return '';
        var parts = String(path).split('.');
        if (parts[0] === 'title') return card.title || '';
        if (parts[0] !== 'f') return '';

        var figure = (card.figures || [])[Number(parts[1])];
        if (!figure) return '';

        if (parts[2] === 'items') {
            return splitLinesRaw(figure.itemsText)[Number(parts[3])] || '';
        }

        var value = figure[parts[2]];
        return value == null ? '' : String(value);
    }

    function edSetPath(card, path, value) {
        if (!card || !path) return;
        var parts = String(path).split('.');
        if (parts[0] === 'title') { card.title = value; return; }
        if (parts[0] !== 'f') return;

        var figure = (card.figures || [])[Number(parts[1])];
        if (!figure) return;

        if (parts[2] === 'items') {
            var items = splitLinesRaw(figure.itemsText);
            var idx = Number(parts[3]);
            while (items.length <= idx) items.push('');
            items[idx] = value;
            figure.itemsText = items.join('\n');
            return;
        }

        figure[parts[2]] = value;
    }

    /* ---------------------------------------------------- caret + editable */

    var edEditableMode = '';
    function getEditableMode() {
        if (edEditableMode) return edEditableMode;
        var probe = document.createElement('div');
        try {
            probe.contentEditable = 'plaintext-only';
            edEditableMode = probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
        } catch (err) {
            edEditableMode = 'true';
        }
        return edEditableMode;
    }

    /* Caret as a plain character offset into the element's text, so it
       survives the element being destroyed and rebuilt by a re-render. */
    function edCaretOffset(node) {
        var selection = window.getSelection();
        if (!selection || !selection.rangeCount || !node.contains(selection.focusNode)) return null;
        var range = document.createRange();
        range.selectNodeContents(node);
        range.setEnd(selection.focusNode, selection.focusOffset);
        return range.toString().length;
    }

    function edSetCaret(node, offset) {
        if (!node) return;
        node.focus();

        var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        var remaining = Math.max(0, offset);
        var target = null;

        while (walker.nextNode()) {
            var length = walker.currentNode.textContent.length;
            if (remaining <= length) { target = walker.currentNode; break; }
            remaining -= length;
        }

        var range = document.createRange();
        if (target) {
            range.setStart(target, remaining);
            range.collapse(true);
        } else {
            range.selectNodeContents(node);
            range.collapse(false);
        }

        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function edMakeEditable(node, path, card, opts) {
        if (!node) return null;
        opts = opts || {};
        node.setAttribute('data-ed-path', path);
        node.setAttribute('contenteditable', getEditableMode());
        node.classList.add('ed-editable');
        if (opts.singleLine) node.setAttribute('data-ed-single-line', '1');

        if (!D.cleanText(edGetPath(card, path))) {
            node.classList.add('ed-field-placeholder');
            node.setAttribute('data-ed-empty', '1');
            if (!D.cleanText(node.textContent) && opts.placeholder) node.textContent = opts.placeholder;
        }
        return node;
    }

    /* Optional sub-nodes (an empty caption, a title the renderer only emits
       when non-empty) are only in the DOM when the real renderer would draw
       them — this creates the missing one so it has something to click.
       `place` is "prepend", a sibling element to insert after, or omitted
       to append. */
    function edEnsureNode(parent, selector, tagName, className, place) {
        var node = parent.querySelector(selector);
        if (node) return node;

        node = document.createElement(tagName);
        if (className) node.className = className;

        if (place === 'prepend') parent.prepend(node);
        else if (place && place.nodeType === 1) place.after(node);
        else parent.appendChild(node);
        return node;
    }

    /* ------------------------------------------------------- annotators   */
    /* Each walks the DOM renderBlock() produced (with forCanvas placeholders
       baked in) and wires the nodes that hold plain text. Anything that would
       corrupt under contenteditable — image/video src, code body, URLs, the
       download block's resolved file — stays in the "⋯ fields" popover. */

    var ED_ANNOTATORS = {
        text: function (section, card) {
            var nodes = section.querySelectorAll(':scope > .block-paragraph, :scope > .block-list');
            (card.figures || []).forEach(function (figure, n) {
                var node = nodes[n];
                if (!node) return;

                if (figure.type === 'list') {
                    Array.prototype.forEach.call(node.children, function (li, r) {
                        edMakeEditable(li, 'f.' + n + '.items.' + r, card, {
                            singleLine: true, placeholder: 'List item'
                        });
                    });
                    return;
                }

                edMakeEditable(node, 'f.' + n + '.text', card, { placeholder: ED_PLACEHOLDER_PARAGRAPH });
            });
        },

        image: function (section, card) {
            var figures = section.querySelectorAll(':scope > .block-images > .block-figure');
            (card.figures || []).forEach(function (figure, n) {
                var node = figures[n];
                if (!node) return;
                if (!D.cleanText(figure.src)) node.classList.add('ed-image-empty');

                var caption = edEnsureNode(node, ':scope > figcaption', 'figcaption', null);
                edMakeEditable(caption, 'f.' + n + '.caption', card, {
                    singleLine: true, placeholder: 'Caption'
                });
            });
        },

        code: function (section, card) {
            var blocks = section.querySelectorAll(':scope > .block-code-stack > .code-block');
            (card.figures || []).forEach(function (figure, n) {
                var node = blocks[n];
                if (!node) return;
                var filename = node.querySelector(':scope > .code-bar > .code-filename');
                edMakeEditable(filename, 'f.' + n + '.filename', card, {
                    singleLine: true, placeholder: 'filename'
                });
            });
        },

        video: function (section, card) {
            var figures = section.querySelectorAll(':scope > .block-video-stack > .block-figure.video');
            (card.figures || []).forEach(function (figure, n) {
                var node = figures[n];
                if (!node) return;
                var caption = edEnsureNode(node, ':scope > figcaption', 'figcaption', null);
                edMakeEditable(caption, 'f.' + n + '.caption', card, {
                    singleLine: true, placeholder: 'Caption'
                });
            });
        },

        callout: function (section, card) {
            var boxes = section.querySelectorAll(':scope > .callout');
            (card.figures || []).forEach(function (figure, n) {
                var node = boxes[n];
                if (!node) return;
                var body = node.querySelector(':scope > .callout-body');
                if (!body) return;
                var title = edEnsureNode(body, ':scope > .callout-title', 'strong', 'callout-title', 'prepend');
                var text = body.querySelector(':scope > p');
                edMakeEditable(title, 'f.' + n + '.title', card, {
                    singleLine: true, placeholder: 'Optional heading'
                });
                edMakeEditable(text, 'f.' + n + '.text', card, { placeholder: 'Watch out for…' });
            });
        },

        'link-embed': function (section, card) {
            var links = section.querySelectorAll(':scope > .block-links > .link-embed');
            (card.figures || []).forEach(function (figure, n) {
                var node = links[n];
                if (!node) return;
                var body = node.querySelector(':scope > .link-embed-body');
                if (!body) return;
                var label = body.querySelector(':scope > .link-embed-label');
                var site = edEnsureNode(body, ':scope > .link-embed-site', 'span', 'link-embed-site');
                var desc = edEnsureNode(body, ':scope > .link-embed-desc', 'span', 'link-embed-desc');
                edMakeEditable(label, 'f.' + n + '.label', card, {
                    singleLine: true, placeholder: 'Link title'
                });
                edMakeEditable(site, 'f.' + n + '.site', card, { singleLine: true, placeholder: 'Source' });
                edMakeEditable(desc, 'f.' + n + '.description', card, { placeholder: 'Description' });
            });
        },

        qa: function (section, card) {
            var items = section.querySelectorAll(':scope > .block-qa > .qa-item');
            (card.figures || []).forEach(function (figure, n) {
                var node = items[n];
                if (!node) return;
                node.open = true;   /* stay open while editing so the answer isn't hidden */
                var question = node.querySelector(':scope > .qa-question');
                var answer = node.querySelector(':scope > .qa-answer');
                edMakeEditable(question, 'f.' + n + '.question', card, {
                    singleLine: true, placeholder: 'Question'
                });
                edMakeEditable(answer, 'f.' + n + '.answer', card, { placeholder: 'Answer' });
            });
        }

        /* No `download` annotator: a resolved file row has nothing meaningful
           to type inline — editing it is entirely the "⋯ fields" popover's job. */
    };

    function blockTypeLabel(type) {
        var meta = D.BLOCK_TYPES.filter(function (b) { return b.key === type; })[0];
        return meta ? meta.label : type;
    }

    function annotateBlock(section, card) {
        if (!section || !card) return;

        var head = edEnsureNode(section, ':scope > .block-head', 'div', 'block-head', 'prepend');
        var heading = edEnsureNode(head, ':scope > .block-title', 'h2', 'block-title');
        edMakeEditable(heading, 'title', card, {
            singleLine: true,
            placeholder: blockTypeLabel(card.type) + ' heading'
        });

        var annotate = ED_ANNOTATORS[card.type];
        if (annotate) annotate(section, card);
    }

    /* Renders one draft card through the real renderer: serialize with
       forCanvas -> normalizeCard -> renderBlock. This is the direct extension
       of the project's one shared-renderer rule — now the editing surface
       itself is that renderer, not just a read-only preview of it. */
    function renderCanvasCard(builderCard, index) {
        var rawCard = serializeCard(builderCard, index, [], { forCanvas: true });
        if (!rawCard) return null;
        var normalized = D.normalizeCard(rawCard);
        if (!normalized) return null;
        /* download blocks resolve fileRef against a lesson-shaped files[]. */
        return R.renderBlock(normalized, index, { files: draft.files }, {});
    }

    /* ---------------------------------------------------------- chrome    */

    function createBlockButton(action, glyph, title, disabled) {
        var btn = el('button', 'ed-block-btn');
        btn.type = 'button';
        btn.setAttribute('data-ed-action', action);
        btn.setAttribute('aria-label', title);
        btn.title = title;
        btn.textContent = glyph;
        btn.disabled = !!disabled;
        return btn;
    }

    function createBlockToolbar(card, index, total) {
        var bar = el('div', 'ed-block-toolbar');
        bar.setAttribute('data-ed-action', 'toolbar');

        var handle = el('span', 'ed-block-handle');
        handle.setAttribute('data-ed-action', 'drag');
        handle.setAttribute('draggable', 'true');
        handle.title = 'Drag to reorder';
        handle.setAttribute('aria-hidden', 'true');
        handle.textContent = '⠿';
        bar.appendChild(handle);

        var typeSelect = el('select', 'ed-block-type');
        typeSelect.setAttribute('data-ed-action', 'type');
        typeSelect.setAttribute('aria-label', 'Block type');
        D.BLOCK_TYPES.forEach(function (block) {
            var opt = el('option', null, block.label);
            opt.value = block.key;
            if (block.key === card.type) opt.selected = true;
            typeSelect.appendChild(opt);
        });
        bar.appendChild(typeSelect);

        if (card.type === 'text') {
            bar.appendChild(createBlockButton('toggle-list', '•—', 'Paragraph or bullet list'));
        }

        bar.appendChild(createBlockButton('add-figure', '+', 'Add ' + blockTypeLabel(card.type).toLowerCase() + ' item'));
        bar.appendChild(createBlockButton('move-up', '↑', 'Move up', index === 0));
        bar.appendChild(createBlockButton('move-down', '↓', 'Move down', index === total - 1));
        bar.appendChild(createBlockButton('fields', '⋯', 'Edit fields'));
        bar.appendChild(createBlockButton('duplicate', '⧉', 'Duplicate block'));
        bar.appendChild(createBlockButton('delete', '✕', 'Delete block'));

        return bar;
    }

    function createInserter(index) {
        var rail = el('div', 'ed-inserter');
        rail.setAttribute('data-ed-index', String(index));

        var line = el('span', 'ed-inserter-line');
        line.setAttribute('aria-hidden', 'true');
        rail.appendChild(line);

        var btn = el('button', 'ed-inserter-btn');
        btn.type = 'button';
        btn.setAttribute('data-ed-action', 'insert');
        btn.setAttribute('data-ed-index', String(index));
        btn.title = 'Insert a block here';
        btn.setAttribute('aria-label', 'Insert a block here');
        btn.textContent = '+';
        rail.appendChild(btn);

        return rail;
    }

    function createPicker(index) {
        var picker = el('div', 'ed-picker');
        picker.setAttribute('data-ed-action', 'picker');

        var grid = el('div', 'ed-picker-grid');
        D.BLOCK_TYPES.forEach(function (block) {
            var btn = el('button', 'ed-picker-item');
            btn.type = 'button';
            btn.setAttribute('data-ed-action', 'pick');
            btn.setAttribute('data-ed-type', block.key);
            btn.setAttribute('data-ed-index', String(index));
            btn.appendChild(icon(block.icon));
            btn.appendChild(document.createTextNode(' ' + block.label));
            grid.appendChild(btn);
        });
        picker.appendChild(grid);
        return picker;
    }

    /* -------------------------------------------------------- the canvas  */
    /* Title/summary/gallery/files-panel stay static, driven by the Metadata/
       Media/Files sections exactly as before — only the content body becomes
       the interactive canvas, matching magmalabs' own split (they don't
       inline-edit the post title or citations either). */

    function renderCanvas(lesson) {
        refs.preview.textContent = '';

        if (!lesson) {
            refs.preview.appendChild(el('p', 'ed-empty',
                'Add a title to see the lesson preview.'));
            return;
        }

        var wrap = el('div', 'ed-preview-lesson');
        wrap.appendChild(el('h1', 'lesson-title', lesson.title));
        if (lesson.summary) wrap.appendChild(el('p', 'lesson-summary', lesson.summary));

        var split = el('div', 'lesson-split');
        var left = el('div', 'lesson-split-left');
        left.appendChild(R.renderGallery(lesson));
        var right = el('div', 'lesson-split-right');
        right.appendChild(R.renderFilesPanel(lesson));
        split.appendChild(left);
        split.appendChild(right);
        wrap.appendChild(split);

        var canvas = el('div', 'ed-canvas');
        canvas.setAttribute('data-ed-canvas', '1');

        if (!draft.content.length) {
            canvas.appendChild(el('p', 'ed-canvas-empty',
                'No content yet — use + to add your first block.'));
        }

        draft.content.forEach(function (card, index) {
            canvas.appendChild(createInserter(index));

            var block = el('div', 'ed-block ed-block--' + card.type);
            block.setAttribute('data-ed-card-key', card._id);
            block.appendChild(createBlockToolbar(card, index, draft.content.length));

            var rendered = renderCanvasCard(card, index);
            if (rendered) {
                annotateBlock(rendered, card);
                block.appendChild(rendered);
            } else {
                block.classList.add('ed-block--broken');
                block.appendChild(el('p', 'ed-empty', 'Could not render this block.'));
            }

            canvas.appendChild(block);
        });

        canvas.appendChild(createInserter(draft.content.length));
        wrap.appendChild(canvas);

        refs.preview.appendChild(wrap);
    }

    /* ----------------------------------------------------- event wiring   */

    function findBuilderCardByKey(key) {
        if (!key) return null;
        return draft.content.filter(function (c) { return c._id === key; })[0] || null;
    }

    function findCanvasTarget(node) {
        var target = node && node.closest ? node.closest('[data-ed-path]') : null;
        if (!target || !refs.preview.contains(target)) return null;
        var blockRoot = target.closest('[data-ed-card-key]');
        var card = findBuilderCardByKey(blockRoot && blockRoot.getAttribute('data-ed-card-key'));
        if (!card) return null;
        return { el: target, card: card, path: target.getAttribute('data-ed-path') };
    }

    var exportTimer = null;
    function scheduleExport() {
        clearTimeout(exportTimer);
        exportTimer = setTimeout(function () {
            exportTimer = null;
            updateExportOnly();
        }, 250);
    }

    function restoreCaret(snapshot) {
        if (!snapshot || !snapshot.key) return;
        var target = refs.preview.querySelector(
            '[data-ed-card-key="' + snapshot.key + '"] [data-ed-path="' + snapshot.path + '"]');
        if (target) edSetCaret(target, Math.min(snapshot.offset, target.textContent.length));
    }

    /* Structural edits rebuild the canvas, so they say explicitly where the
       caret should land afterwards. */
    function applyStructuralChange(caretTarget) {
        refresh();
        restoreCaret(caretTarget);
    }

    function handleCanvasEnter(event, target) {
        var node = target.el, card = target.card, path = target.path;
        var parts = path.split('.');
        var figureIndex = Number(parts[1]);
        var figure = (card.figures || [])[figureIndex];
        var isTextCard = card.type === 'text' && parts[0] === 'f' && figure;

        event.preventDefault();

        /* Shift+Enter is a literal newline in genuinely multi-line fields.
           insertText("\n") would split a plaintext-only contenteditable into
           nested <div>s instead, corrupting the markup — go through state. */
        if (event.shiftKey && !node.hasAttribute('data-ed-single-line')) {
            var offset = edCaretOffset(node);
            var full = node.textContent;
            var at = offset == null ? full.length : offset;
            edSetPath(card, path, full.slice(0, at) + '\n' + full.slice(at));
            applyStructuralChange({ key: card._id, path: path, offset: at + 1 });
            return;
        }

        if (isTextCard && parts[2] === 'text') {
            var off2 = edCaretOffset(node);
            var full2 = node.textContent;
            var at2 = off2 == null ? full2.length : off2;
            figure.text = full2.slice(0, at2);
            var nextFigure = defaultFigure('text');
            nextFigure.text = full2.slice(at2);
            card.figures.splice(figureIndex + 1, 0, nextFigure);
            applyStructuralChange({ key: card._id, path: 'f.' + (figureIndex + 1) + '.text', offset: 0 });
            return;
        }

        if (isTextCard && parts[2] === 'items') {
            var row = Number(parts[3]);
            var items = splitLinesRaw(figure.itemsText);

            /* Enter on an empty trailing bullet exits the list, as in every
               other editor. */
            if (!D.cleanText(items[row]) && row === items.length - 1) {
                items.splice(row, 1);
                figure.itemsText = items.join('\n');
                var afterList = defaultFigure('text');
                card.figures.splice(figureIndex + 1, 0, afterList);
                applyStructuralChange({ key: card._id, path: 'f.' + (figureIndex + 1) + '.text', offset: 0 });
                return;
            }

            var off3 = edCaretOffset(node);
            var at3 = off3 == null ? (items[row] || '').length : off3;
            var current = items[row] || '';
            items[row] = current.slice(0, at3);
            items.splice(row + 1, 0, current.slice(at3));
            figure.itemsText = items.join('\n');
            applyStructuralChange({ key: card._id, path: 'f.' + figureIndex + '.items.' + (row + 1), offset: 0 });
            return;
        }

        /* Everywhere else Enter just advances to the next field. */
        var editables = Array.prototype.slice.call(refs.preview.querySelectorAll('[data-ed-path]'));
        var next = editables[editables.indexOf(node) + 1];
        if (next) edSetCaret(next, next.textContent.length);
    }

    function handleCanvasBackspace(event, target) {
        var node = target.el, card = target.card;
        if (edCaretOffset(node) !== 0 || D.cleanText(node.textContent)) return;

        var editables = Array.prototype.slice.call(refs.preview.querySelectorAll('[data-ed-path]'));
        var index = editables.indexOf(node);
        var blockRoot = node.closest('[data-ed-card-key]');

        /* Only collapse the block when EVERY field is empty. Placeholder text
           is rendered into the node, so emptiness has to be judged by the
           data-ed-empty marker rather than textContent alone. */
        var blockEditables = Array.prototype.slice.call(blockRoot.querySelectorAll('[data-ed-path]'));
        var blockIsEmpty = blockEditables.every(function (n) {
            return n.hasAttribute('data-ed-empty') || !D.cleanText(n.textContent);
        });
        if (!blockIsEmpty) return;

        event.preventDefault();

        var cardIndex = draft.content.indexOf(card);
        if (cardIndex === -1) return;
        draft.content.splice(cardIndex, 1);

        var previous = null;
        for (var i = index - 1; i >= 0; i -= 1) {
            if (!blockRoot.contains(editables[i])) { previous = editables[i]; break; }
        }

        var snapshot = previous ? {
            key: previous.closest('[data-ed-card-key]').getAttribute('data-ed-card-key'),
            path: previous.getAttribute('data-ed-path'),
            offset: previous.textContent.length
        } : null;

        applyStructuralChange(snapshot);
    }

    function closePickers() {
        refs.preview.querySelectorAll('.ed-picker').forEach(function (n) { n.remove(); });
        refs.preview.querySelectorAll('.ed-inserter.is-open').forEach(function (n) {
            n.classList.remove('is-open');
        });
    }

    function focusFirstEditable(cardKey) {
        var target = refs.preview.querySelector('[data-ed-card-key="' + cardKey + '"] [data-ed-path]');
        if (target) edSetCaret(target, target.textContent.length);
    }

    /* Structured fields (image/video src, code body, link URLs, which file a
       download block points at) can't be typed into the rendered output, so
       they open a popover. It reuses figureEditor() verbatim rather than
       restating every per-type field list a second time. Mounted on `root`,
       outside refs.preview, so the canvas's own re-renders can't destroy it
       mid-edit. */
    function closeFieldPopover() {
        root.querySelectorAll('.ed-popover').forEach(function (n) { n.remove(); });
        refs.preview.querySelectorAll('[data-ed-action="fields"].is-active').forEach(function (n) {
            n.classList.remove('is-active');
        });
    }

    function openFieldPopover(card, anchor) {
        closeFieldPopover();

        var popover = el('div', 'ed-popover');

        var header = el('div', 'ed-popover-header');
        header.appendChild(el('strong', null, blockTypeLabel(card.type) + ' fields'));
        var close = el('button', 'ed-popover-close');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        close.textContent = '✕';
        close.addEventListener('click', closeFieldPopover);
        header.appendChild(close);
        popover.appendChild(header);

        var body = el('div', 'ed-popover-body');
        popover.appendChild(body);

        function rebuildBody() {
            body.textContent = '';
            if (card.type === 'image') {
                body.appendChild(field('Layout', selectInput(card.layout || 'single', [
                    { value: 'single', label: 'Single column' },
                    { value: 'grid', label: 'Grid' }
                ], function (v) { card.layout = v; refresh(); })));
            }
            (card.figures || []).forEach(function (figure, figureIndex) {
                body.appendChild(figureEditor(card, figure, figureIndex, function () {
                    refresh();
                    rebuildBody();
                }));
            });
            if (!(card.figures || []).length) {
                body.appendChild(el('p', 'ed-empty', 'No items yet — use + on the block to add one.'));
            }
        }
        rebuildBody();

        root.appendChild(popover);
        var box = anchor.getBoundingClientRect();
        popover.style.top = (window.scrollY + box.bottom + 8) + 'px';
        popover.style.left = Math.max(8, window.scrollX + box.left) + 'px';
        anchor.classList.add('is-active');
    }

    function insertCard(type, index) {
        var card = { _id: nextId('card'), type: type, title: '', layout: 'single',
                     figures: [defaultFigure(type)] };
        var at = Math.max(0, Math.min(index, draft.content.length));
        draft.content.splice(at, 0, card);
        refresh();
        focusFirstEditable(card._id);
    }

    function wireCanvasEvents() {
        refs.preview.addEventListener('input', function (event) {
            if (event.isComposing) return;
            var target = findCanvasTarget(event.target);
            if (!target) return;
            target.el.classList.remove('ed-field-placeholder');
            target.el.removeAttribute('data-ed-empty');
            /* Commit raw, untrimmed text — trimming mid-keystroke would eat
               spaces as the user types. Trimming happens at serialize time. */
            edSetPath(target.card, target.path, target.el.textContent);
            scheduleExport();
        });

        refs.preview.addEventListener('compositionend', function (event) {
            var target = findCanvasTarget(event.target);
            if (!target) return;
            edSetPath(target.card, target.path, target.el.textContent);
            scheduleExport();
        });

        /* Plain text only: the schema stores strings and every renderer uses
           textContent. */
        refs.preview.addEventListener('paste', function (event) {
            var target = findCanvasTarget(event.target);
            if (!target) return;
            event.preventDefault();
            var text = (event.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, text);
        });

        refs.preview.addEventListener('beforeinput', function (event) {
            if (!findCanvasTarget(event.target)) return;
            if (/^format/.test(event.inputType || '')) event.preventDefault();
        });

        refs.preview.addEventListener('keydown', function (event) {
            if (event.isComposing) return;
            var target = findCanvasTarget(event.target);
            if (!target) return;
            if (event.key === 'Enter') handleCanvasEnter(event, target);
            else if (event.key === 'Backspace') handleCanvasBackspace(event, target);
        });

        /* blur does not bubble — listen in the capture phase. Crossing the
           empty/non-empty boundary changes which nodes the renderer emits
           (an optional figcaption appears/disappears), so only THAT case
           rebuilds the canvas. */
        refs.preview.addEventListener('blur', function (event) {
            var target = findCanvasTarget(event.target);
            if (!target) return;
            var isEmpty = !D.cleanText(edGetPath(target.card, target.path));
            var wasEmpty = target.el.hasAttribute('data-ed-empty');
            if (isEmpty !== wasEmpty) refresh();
        }, true);

        refs.preview.addEventListener('click', function (event) {
            var actionEl = event.target.closest ? event.target.closest('[data-ed-action]') : null;
            if (!actionEl) { closePickers(); return; }

            var action = actionEl.getAttribute('data-ed-action');
            if (action === 'toolbar' || action === 'picker' || action === 'drag') return;

            event.preventDefault();

            if (action === 'insert') {
                var rail = actionEl.closest('.ed-inserter');
                var alreadyOpen = rail.classList.contains('is-open');
                closePickers();
                if (alreadyOpen) return;
                rail.classList.add('is-open');
                rail.appendChild(createPicker(Number(actionEl.getAttribute('data-ed-index'))));
                return;
            }

            if (action === 'pick') {
                var type = actionEl.getAttribute('data-ed-type');
                var pickIndex = Number(actionEl.getAttribute('data-ed-index'));
                closePickers();
                insertCard(type, pickIndex);
                return;
            }

            var blockRoot = actionEl.closest('[data-ed-card-key]');
            var card = blockRoot ? findBuilderCardByKey(blockRoot.getAttribute('data-ed-card-key')) : null;
            var cardIndex = card ? draft.content.indexOf(card) : -1;
            if (cardIndex === -1) return;

            if (action === 'move-up' || action === 'move-down') {
                moveItem(draft.content, cardIndex, action === 'move-up' ? -1 : 1);
                refresh();
                return;
            }

            if (action === 'duplicate') {
                var copy = cardToDraft(JSON.parse(JSON.stringify(stripIds(card))));
                draft.content.splice(cardIndex + 1, 0, copy);
                refresh();
                return;
            }

            if (action === 'delete') {
                var hasContent = (card.figures || []).some(function (figure) {
                    return Object.keys(figure).some(function (k) {
                        return k !== '_id' && k !== 'type' && D.cleanText(figure[k]);
                    });
                });
                if (hasContent && !window.confirm('Delete this block and its content?')) return;
                draft.content.splice(cardIndex, 1);
                refresh();
                return;
            }

            if (action === 'fields') {
                if (actionEl.classList.contains('is-active')) closeFieldPopover();
                else openFieldPopover(card, actionEl);
                return;
            }

            if (action === 'add-figure') {
                card.figures = card.figures || [];
                card.figures.push(defaultFigure(card.type));
                refresh();
                return;
            }

            if (action === 'toggle-list') {
                /* Lossless both ways: paragraph text becomes a single bullet
                   and back. */
                (card.figures || []).forEach(function (figure) {
                    if (figure.type === 'list') {
                        figure.type = 'paragraph';
                        figure.text = splitLines(figure.itemsText).join(' ');
                        figure.itemsText = '';
                    } else {
                        figure.type = 'list';
                        figure.itemsText = D.cleanText(figure.text);
                        figure.text = '';
                    }
                });
                refresh();
            }
        });

        /* Everything except editor chrome must be inert: a lesson editor is
           not a page a click should navigate away from. Code-copy is disabled
           via CSS pointer-events instead, since it needs no preventDefault. */
        refs.preview.addEventListener('click', function (event) {
            if (!event.target.closest) return;
            if (event.target.closest('[data-ed-action]')) return;
            var canvas = event.target.closest('[data-ed-canvas]');
            if (!canvas) return;
            var link = event.target.closest('a');
            if (link && canvas.contains(link)) event.preventDefault();
        });

        refs.preview.addEventListener('change', function (event) {
            var select = event.target.closest ? event.target.closest('[data-ed-action="type"]') : null;
            if (!select) return;

            var blockRoot = select.closest('[data-ed-card-key]');
            var card = blockRoot ? findBuilderCardByKey(blockRoot.getAttribute('data-ed-card-key')) : null;
            var cardIndex = card ? draft.content.indexOf(card) : -1;
            if (cardIndex === -1) return;

            var nextType = select.value;
            if (nextType === card.type) return;

            var replacement = { _id: nextId('card'), type: nextType, title: card.title,
                                 layout: 'single', figures: [] };

            /* Only text <-> callout carries content losslessly; everything
               else starts clean rather than silently mangling the figures. */
            if (card.type === 'text' && nextType === 'callout') {
                replacement.figures = (card.figures || []).map(function (figure) {
                    var callout = defaultFigure('callout');
                    callout.text = figure.type === 'list'
                        ? splitLines(figure.itemsText).join(' ')
                        : D.cleanText(figure.text);
                    return callout;
                });
            } else if (card.type === 'callout' && nextType === 'text') {
                replacement.figures = (card.figures || []).map(function (figure) {
                    var text = defaultFigure('text');
                    text.text = D.cleanText(figure.text);
                    return text;
                });
            }
            if (!replacement.figures.length) replacement.figures = [defaultFigure(nextType)];

            draft.content.splice(cardIndex, 1, replacement);
            refresh();
        });

        /* ------------------------------------------------ drag to reorder */

        var dragKey = '';

        refs.preview.addEventListener('dragstart', function (event) {
            var handle = event.target.closest ? event.target.closest('[data-ed-action="drag"]') : null;
            if (!handle) return;
            var blockRoot = handle.closest('[data-ed-card-key]');
            dragKey = blockRoot ? blockRoot.getAttribute('data-ed-card-key') : '';
            if (!dragKey) return;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', dragKey);
            event.dataTransfer.setDragImage(blockRoot, 12, 12);
            refs.preview.classList.add('ed-dragging');
        });

        function inserterForPoint(y) {
            var rails = Array.prototype.slice.call(refs.preview.querySelectorAll('.ed-inserter'));
            var best = null, bestDistance = Infinity;
            rails.forEach(function (rail) {
                var box = rail.getBoundingClientRect();
                var distance = Math.abs(box.top + box.height / 2 - y);
                if (distance < bestDistance) { bestDistance = distance; best = rail; }
            });
            return best;
        }

        refs.preview.addEventListener('dragover', function (event) {
            if (!dragKey) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            var rail = inserterForPoint(event.clientY);
            refs.preview.querySelectorAll('.ed-inserter.is-drop-target').forEach(function (n) {
                n.classList.remove('is-drop-target');
            });
            if (rail) rail.classList.add('is-drop-target');
        });

        function endDrag() {
            dragKey = '';
            refs.preview.classList.remove('ed-dragging');
            refs.preview.querySelectorAll('.ed-inserter.is-drop-target').forEach(function (n) {
                n.classList.remove('is-drop-target');
            });
        }

        refs.preview.addEventListener('drop', function (event) {
            if (!dragKey) return;
            event.preventDefault();
            var rail = inserterForPoint(event.clientY);
            var card = findBuilderCardByKey(dragKey);
            endDrag();
            if (!rail || !card) return;

            var from = draft.content.indexOf(card);
            var to = Number(rail.getAttribute('data-ed-index'));
            if (from === -1) return;
            if (to > from) to -= 1;
            if (to === from) return;

            moveItem(draft.content, from, to - from);
            refresh();
        });

        refs.preview.addEventListener('dragend', endDrag);

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                endDrag();
                closePickers();
                closeFieldPopover();
            }
        });

        document.addEventListener('click', function (event) {
            if (!event.target.closest) return;
            if (event.target.closest('.ed-popover')) return;
            if (event.target.closest('[data-ed-action="fields"]')) return;
            closeFieldPopover();
        });
    }

    /* ================================================= repeatable rows ==== */

    function mediaEditor(item, index, rerender) {
        var box = el('div', 'ed-figure');
        var head = el('div', 'ed-figure-head');
        head.appendChild(el('span', 'ed-figure-label', 'Media ' + (index + 1)));
        var tools = el('div', 'ed-figure-tools');
        tools.appendChild(actionButton('↑', 'ghost', function () {
            if (moveItem(draft.media, index, -1)) rerender();
        }));
        tools.appendChild(actionButton('↓', 'ghost', function () {
            if (moveItem(draft.media, index, 1)) rerender();
        }));
        tools.appendChild(actionButton('Remove', 'danger', function () {
            draft.media.splice(index, 1); rerender();
        }));
        head.appendChild(tools);
        box.appendChild(head);

        var body = el('div', 'ed-figure-body');
        var row = el('div', 'ed-row');
        row.appendChild(field('Type', selectInput(item.type, [
            { value: 'image', label: 'Image' },
            { value: 'video', label: 'Video' }
        ], function (v) { item.type = v; rerender(); })));
        row.appendChild(field(item.type === 'video' ? 'Video URL' : 'Image path',
            textInput(item.src, function (v) { item.src = v; refresh(); },
                item.type === 'video'
                    ? 'https://www.youtube.com/watch?v=…'
                    : 'imgs/lessons/my-lesson/cover.png')));
        body.appendChild(row);
        if (item.type !== 'video') {
            body.appendChild(field('Alt text',
                textInput(item.alt, function (v) { item.alt = v; refresh(); },
                    'What the image shows')));
        }
        body.appendChild(field('Caption',
            textInput(item.caption, function (v) { item.caption = v; refresh(); }, 'Optional')));
        box.appendChild(body);
        return box;
    }

    function fileEditor(item, index, rerender) {
        var box = el('div', 'ed-figure');
        var head = el('div', 'ed-figure-head');
        head.appendChild(el('span', 'ed-figure-label', 'File ' + (index + 1)));
        var tools = el('div', 'ed-figure-tools');
        tools.appendChild(actionButton('↑', 'ghost', function () {
            if (moveItem(draft.files, index, -1)) rerender();
        }));
        tools.appendChild(actionButton('↓', 'ghost', function () {
            if (moveItem(draft.files, index, 1)) rerender();
        }));
        tools.appendChild(actionButton('Remove', 'danger', function () {
            draft.files.splice(index, 1); rerender();
        }));
        head.appendChild(tools);
        box.appendChild(head);

        var body = el('div', 'ed-figure-body');
        body.appendChild(field('Name',
            textInput(item.name, function (v) { item.name = v; refresh(); },
                'Part 1 — Unity basics')));

        var row = el('div', 'ed-row');
        row.appendChild(field('Source', selectInput(item.kind, [
            { value: 'link', label: 'External link' },
            { value: 'repo', label: 'File in this repo' }
        ], function (v) { item.kind = v; rerender(); })));
        row.appendChild(field('Icon', selectInput(item.icon,
            Object.keys(D.FILE_ICONS).map(function (k) { return { value: k, label: k }; }),
            function (v) { item.icon = v; refresh(); })));
        body.appendChild(row);

        if (item.kind === 'repo') {
            var repoRow = el('div', 'ed-row');
            repoRow.appendChild(field('Path in repo',
                textInput(item.path, function (v) { item.path = v; refresh(); },
                    'files/my-lesson/starter.unitypackage')));
            repoRow.appendChild(field('Size',
                textInput(item.size, function (v) { item.size = v; refresh(); }, '4.2 MB')));
            body.appendChild(repoRow);
        } else {
            body.appendChild(field('URL',
                textInput(item.url, function (v) { item.url = v; refresh(); },
                    'https://docs.google.com/presentation/…')));
            body.appendChild(field('Source label',
                textInput(item.source, function (v) { item.source = v; refresh(); },
                    'Google Slides')));
        }
        box.appendChild(body);
        return box;
    }

    /* ======================================================= editor shell = */

    function buildShell() {
        root.textContent = '';

        var shell = el('div', 'ed-shell');
        var side = el('div', 'ed-side');

        /* --- Export (top-right on desktop) --- */
        var exportCard = el('section', 'ed-panel gdc-card ed-export');
        exportCard.appendChild(sectionHeader('Export', 'Copyable lesson object',
            'Paste this into the lessons array in data/lessons.json, then commit.'));
        exportCard.appendChild(checkboxRow('Append a trailing comma', false, function (checked) {
            refs.trailingComma = checked;
            refresh();
        }));
        refs.warnings = el('div', 'ed-warnings');
        exportCard.appendChild(refs.warnings);
        refs.output = el('textarea', 'ed-input mono ed-output');
        refs.output.rows = 18;
        refs.output.readOnly = true;
        exportCard.appendChild(refs.output);
        var exportActions = el('div', 'ed-actions');
        exportActions.appendChild(actionButton('Copy lesson object', 'navy', copyOutput));
        exportActions.appendChild(actionButton('Download .json', 'ghost', downloadOutput));
        exportCard.appendChild(exportActions);
        side.appendChild(exportCard);

        /* --- Main editing column --- */
        var main = el('div', 'ed-main');

        /* Canvas — the primary surface. Wide, not the narrow sticky side
           column: it's an interactive editor now, not a passive preview. */
        var canvasCard = el('section', 'ed-panel gdc-card ed-preview');
        var canvasHead = sectionHeader('Editor', 'The lesson itself', null);
        var canvasNote = el('p', 'ed-section-note');
        canvasNote.appendChild(document.createTextNode('Click any text to edit it in place. Hover between blocks for '));
        canvasNote.appendChild(el('strong', null, '+'));
        canvasNote.appendChild(document.createTextNode(' to insert one, drag '));
        canvasNote.appendChild(el('strong', null, '⠿'));
        canvasNote.appendChild(document.createTextNode(' to reorder, and use '));
        canvasNote.appendChild(el('strong', null, '⋯'));
        canvasNote.appendChild(document.createTextNode(' for fields that aren\'t plain text (image paths, code, URLs).'));
        canvasHead.appendChild(canvasNote);
        canvasCard.appendChild(canvasHead);
        refs.preview = el('div', 'ed-preview-body');
        canvasCard.appendChild(refs.preview);
        main.appendChild(canvasCard);

        /* Workspace */
        var workspace = el('section', 'ed-panel gdc-card');
        workspace.appendChild(sectionHeader('Workspace', 'Draft controls',
            'Start fresh or load an existing lesson to edit it.'));
        var wsGrid = el('div', 'ed-row');
        refs.sourceSelect = selectInput('', [{ value: '', label: 'New draft' }], function (value) {
            if (!value) return;
            var raw = existing.filter(function (l) { return l.id === value; })[0];
            if (!raw) return;
            draft = toDraft(raw);
            rerenderAll();
            toast('Loaded “' + raw.title + '”');
        });
        wsGrid.appendChild(field('Load an existing lesson', refs.sourceSelect,
            'Editing a lesson that already exists? Load it, change it, then replace that object.'));
        workspace.appendChild(wsGrid);
        var wsActions = el('div', 'ed-actions');
        wsActions.appendChild(actionButton('New blank draft', 'ghost', function () {
            if (!window.confirm('Discard the current draft and start over?')) return;
            draft = blankDraft();
            refs.sourceSelect.value = '';
            rerenderAll();
            toast('Started a new draft');
        }));
        wsActions.appendChild(actionButton('Load a starter template', 'ghost', function () {
            draft = starterTemplate();
            refs.sourceSelect.value = '';
            rerenderAll();
            toast('Loaded the starter template');
        }));
        workspace.appendChild(wsActions);
        refs.stats = el('div', 'ed-stats');
        workspace.appendChild(refs.stats);
        main.appendChild(workspace);

        /* Metadata */
        var metaCard = el('section', 'ed-panel gdc-card');
        metaCard.appendChild(sectionHeader('Metadata', 'Lesson settings',
            'These fields drive the browse card and the filters.'));
        refs.metaBody = el('div', 'ed-form');
        metaCard.appendChild(refs.metaBody);
        main.appendChild(metaCard);

        /* Media */
        var mediaCard = el('section', 'ed-panel gdc-card');
        mediaCard.appendChild(sectionHeader('Media', 'Finished-result gallery',
            'Shown top-left on the lesson page. Lead with a photo or video of what the lesson builds.'));
        refs.mediaList = el('div', 'ed-figures');
        mediaCard.appendChild(refs.mediaList);
        mediaCard.appendChild(actionButton('+ Add media', 'ghost', function () {
            draft.media.push({ _id: nextId('media'), type: 'image', src: '', alt: '', caption: '' });
            rerenderAll();
        }));
        main.appendChild(mediaCard);

        /* Files */
        var filesCard = el('section', 'ed-panel gdc-card');
        filesCard.appendChild(sectionHeader('Files', 'Required files',
            'Shown top-right on the lesson page. Repo files download directly; links open in a new tab.'));
        refs.filesList = el('div', 'ed-figures');
        filesCard.appendChild(refs.filesList);
        filesCard.appendChild(actionButton('+ Add file', 'ghost', function () {
            draft.files.push({ _id: nextId('file'), kind: 'link', name: '', url: '',
                path: '', size: '', icon: 'link', source: '' });
            rerenderAll();
        }));
        main.appendChild(filesCard);

        /* Content — form fallback. The canvas above is the primary editor;
           this panel edits the exact same draft.content through plain form
           fields, for when a block ever fails to render on the canvas, or
           bulk-editing a textarea is just faster than clicking. */
        var fallback = el('details', 'ed-fallback-panel');
        var fallbackSummary = el('summary', null, 'Form editor (fallback)');
        fallback.appendChild(fallbackSummary);

        var contentCard = el('div', 'ed-content-panel');
        contentCard.appendChild(sectionHeader('Content', 'Lesson blocks (form view)',
            'Edits the same content the canvas above shows — useful as a backup, or for bulk edits.'));
        refs.addTray = el('div', 'ed-add-tray');
        D.BLOCK_TYPES.forEach(function (block) {
            var btn = el('button', 'ed-add-btn');
            btn.type = 'button';
            btn.appendChild(icon(block.icon));
            btn.appendChild(el('span', null, block.label));
            btn.addEventListener('click', function () {
                draft.content.push({
                    _id: nextId('card'), type: block.key, title: '', layout: 'single',
                    figures: [defaultFigure(block.key)]
                });
                rerenderAll();
            });
            refs.addTray.appendChild(btn);
        });
        contentCard.appendChild(refs.addTray);
        refs.cardStack = el('div', 'ed-card-stack');
        contentCard.appendChild(refs.cardStack);
        fallback.appendChild(contentCard);
        main.appendChild(fallback);

        shell.appendChild(main);
        shell.appendChild(side);   /* after main: grid fills columns in DOM order */
        root.appendChild(shell);
    }

    function sectionHeader(kicker, title, note) {
        var head = el('div', 'ed-section-head');
        head.appendChild(el('div', 'ed-kicker', kicker));
        head.appendChild(el('h2', 'ed-section-title', title));
        if (note) head.appendChild(el('p', 'ed-section-note', note));
        return head;
    }

    /* ========================================================== rendering = */

    function renderMetadata() {
        refs.metaBody.textContent = '';
        var host = refs.metaBody;

        host.appendChild(checkboxRow('Visible on the site', draft.visibility, function (v) {
            draft.visibility = v; refresh();
        }));

        var idRow = el('div', 'ed-row');
        refs.idInput = textInput(draft.id, function (v) {
            draft.id = v;
            draft._idTouched = true;   /* stop deriving it from the title */
            refresh();
        }, 'unity-platformer');
        idRow.appendChild(field('Lesson ID', refs.idInput,
            'Used in lesson.html?id=… — lowercase, dashes, no spaces.'));
        idRow.appendChild(field('Difficulty', selectInput(draft.difficulty,
            D.DIFFICULTIES.map(function (d) { return { value: d.key, label: d.label }; }),
            function (v) { draft.difficulty = v; refresh(); })));
        host.appendChild(idRow);

        host.appendChild(field('Title',
            textInput(draft.title, function (v) {
                draft.title = v;
                /* Derive the slug until the author overrides it by hand.
                   Update the ID field's value directly instead of calling
                   renderMetadata() — a full form rebuild on every Title
                   keystroke would tear down and recreate the Title input
                   itself, kicking the user's cursor out mid-word. */
                if (!draft._idTouched) {
                    draft.id = D.slugify(v);
                    if (refs.idInput) refs.idInput.value = draft.id;
                }
                refresh();
            }, 'Platformer')));

        host.appendChild(field('Summary',
            textArea(draft.summary, function (v) { draft.summary = v; refresh(); },
                3, 'One or two sentences for the browse card.')));

        host.appendChild(field('Engines',
            checkGroup([
                { key: 'unity', label: 'Unity' },
                { key: 'godot', label: 'Godot' },
                { key: 'any', label: 'Any engine (engine-agnostic)' }
            ], draft.engines, function (next) {
                /* "Any" is exclusive — it already matches every tab. */
                if (next.indexOf('any') !== -1 && draft.engines.indexOf('any') === -1) next = ['any'];
                else if (next.length > 1) next = next.filter(function (e) { return e !== 'any'; });
                draft.engines = next;
                renderMetadata();
                refresh();
            }),
            'Tick "Any engine" for Blender, art or theory lessons — they then show under every engine tab.'));

        host.appendChild(field('Components',
            checkGroup(D.COMPONENTS.map(function (c) { return { key: c.key, label: c.label }; }),
                draft.components, function (next) {
                    draft.components = next;
                    renderMetadata();
                    refresh();
                }),
            'Drives the left sidebar. Pick every one that genuinely applies.'));

        var row2 = el('div', 'ed-row');
        row2.appendChild(field('Series',
            textInput(draft.series, function (v) { draft.series = v; refresh(); },
                'Unity Fundamentals'),
            'Groups the prev/next pager.'));
        row2.appendChild(field('Author',
            textInput(draft.author, function (v) { draft.author = v; refresh(); }, 'GDC Officers')));
        host.appendChild(row2);

        var row3 = el('div', 'ed-row');
        row3.appendChild(field('Thumbnail path',
            textInput(draft.thumbnail, function (v) { draft.thumbnail = v; refresh(); },
                'imgs/lessons/unity-platformer.svg')));
        row3.appendChild(field('Tags',
            textInput(draft.tags, function (v) { draft.tags = v; refresh(); }, '2d, movement'),
            'Comma separated. Searchable.'));
        host.appendChild(row3);

        var row4 = el('div', 'ed-row');
        row4.appendChild(field('Written', textInput(draft.writtenAt, function (v) {
            draft.writtenAt = v; refresh();
        }, '', 'date')));
        row4.appendChild(field('Updated', textInput(draft.updatedAt, function (v) {
            draft.updatedAt = v; refresh();
        }, '', 'date')));
        host.appendChild(row4);

        var durationInput = textInput(draft.durationMinutes, function (v) {
            draft.durationMinutes = v; refresh();
        }, 'Auto', 'number');
        durationInput.min = '1';
        durationInput.disabled = draft.autoDuration;
        host.appendChild(field('Estimated minutes', durationInput,
            draft.autoDuration ? 'Estimated from the draft text and file count.' : ''));
        host.appendChild(checkboxRow('Estimate the time automatically', draft.autoDuration,
            function (v) { draft.autoDuration = v; renderMetadata(); refresh(); }));
    }

    function renderLists() {
        refs.mediaList.textContent = '';
        draft.media.forEach(function (item, i) {
            refs.mediaList.appendChild(mediaEditor(item, i, rerenderAll));
        });
        if (!draft.media.length) {
            refs.mediaList.appendChild(el('p', 'ed-empty',
                'No media yet — the thumbnail will be used as the gallery.'));
        }

        refs.filesList.textContent = '';
        draft.files.forEach(function (item, i) {
            refs.filesList.appendChild(fileEditor(item, i, rerenderAll));
        });
        if (!draft.files.length) {
            refs.filesList.appendChild(el('p', 'ed-empty',
                'No files yet — the panel will say nothing needs downloading.'));
        }

        refs.cardStack.textContent = '';
        draft.content.forEach(function (card, i) {
            refs.cardStack.appendChild(cardEditor(card, i, rerenderAll));
        });
        if (!draft.content.length) {
            refs.cardStack.appendChild(el('p', 'ed-empty',
                'No blocks yet — add one from the tray above to start the walkthrough.'));
        }
    }

    function renderWarnings(warnings) {
        refs.warnings.textContent = '';
        if (!warnings.length) {
            var ok = el('p', 'ed-warning ok');
            ok.appendChild(icon('fa-solid fa-circle-check'));
            ok.appendChild(document.createTextNode(' Ready to paste into data/lessons.json.'));
            refs.warnings.appendChild(ok);
            return;
        }
        warnings.forEach(function (message) {
            var line = el('p', 'ed-warning');
            line.appendChild(icon('fa-solid fa-triangle-exclamation'));
            line.appendChild(document.createTextNode(' ' + message));
            refs.warnings.appendChild(line);
        });
    }

    function renderStats(serialized) {
        var lesson = D.normalizeLesson(serialized);
        refs.stats.textContent = '';
        var stats = [
            ['Blocks', serialized.content.length],
            ['Files', serialized.files.length],
            ['Media', serialized.media.length],
            ['Est. minutes', lesson ? lesson.durationMinutes : '—']
        ];
        stats.forEach(function (pair) {
            var chip = el('div', 'ed-stat');
            chip.appendChild(el('span', 'ed-stat-value', String(pair[1])));
            chip.appendChild(el('span', 'ed-stat-label', pair[0]));
            refs.stats.appendChild(chip);
        });
    }

    /* Writes the JSON export + warnings + stats + autosave. Cheap — this runs
       on every keystroke, including inside the canvas (debounced there via
       scheduleExport). Does NOT touch the canvas DOM, so it never costs a
       contenteditable node its caret. */
    function updateExportOnly() {
        var warnings = [];
        var serialized = serialize(warnings, {});

        refs.output.value = JSON.stringify(serialized, null, 2) + (refs.trailingComma ? ',' : '');
        renderWarnings(warnings);
        renderStats(serialized);
        saveDraft();
        return serialized;
    }

    /* Recompute everything that derives from the draft, including a full
       canvas rebuild. Called for every structural change (add/delete/reorder/
       metadata edit) — never from the canvas's own per-keystroke input
       handler, which uses updateExportOnly() instead. */
    function refresh() {
        var serialized = updateExportOnly();
        renderCanvas(D.normalizeLesson(serialized));
    }

    function rerenderAll() {
        renderMetadata();
        renderLists();
        refresh();
    }

    /* ---------------------------------------------------------- actions   */

    function copyOutput() {
        var text = refs.output.value;
        var done = function () { toast('Lesson object copied to the clipboard'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () {
                refs.output.select();
                toast('Press ⌘C / Ctrl+C to copy');
            });
        } else {
            refs.output.select();
            try { document.execCommand('copy'); done(); }
            catch (err) { toast('Press ⌘C / Ctrl+C to copy'); }
        }
    }

    function downloadOutput() {
        var id = D.slugify(draft.id || draft.title) || 'lesson';
        var blob = new Blob([refs.output.value], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = id + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toast('Downloaded ' + id + '.json');
    }

    /* A template that exercises every block type — opening the editor is how
       most officers will discover what the vocabulary actually is. */
    function starterTemplate() {
        return toDraft({
            id: 'my-new-lesson',
            visibility: true,
            title: 'My New Lesson',
            summary: 'One or two sentences describing what a member will have built by the end.',
            engines: ['unity'],
            components: ['mechanics'],
            difficulty: 'beginner',
            series: 'Unity Fundamentals',
            author: 'GDC Officers',
            writtenAt: new Date().toISOString().slice(0, 10),
            tags: ['example'],
            media: [],
            files: [
                { kind: 'link', name: 'Lesson slides', url: 'https://docs.google.com/presentation/',
                  icon: 'slides', source: 'Google Slides' },
                { kind: 'repo', name: 'Starter project', path: 'files/my-new-lesson/starter.unitypackage',
                  icon: 'unitypackage', size: '4.2 MB' }
            ],
            content: [
                { type: 'text', title: 'What you\'ll build',
                  figures: [{ type: 'paragraph',
                      text: 'Describe the finished result here, and what a member will understand ' +
                            'once they are done. Delete every block you do not need.' }] },
                { type: 'text', title: 'Set up the scene',
                  figures: [{ type: 'list', items: ['Create a new 2D scene.',
                      'Add a sprite for the player.', 'Attach a Rigidbody2D.'] }] },
                { type: 'image', title: 'What it should look like', layout: 'single',
                  figures: [{ src: 'imgs/lessons/unity-platformer.svg',
                      alt: 'The scene hierarchy after adding the player sprite',
                      caption: 'Swap this for a real screenshot under imgs/lessons/your-lesson/.' }] },
                { type: 'code', title: 'Move the player',
                  figures: [{ filename: 'PlayerMovement.cs', language: 'C#',
                      code: 'void Update()\n{\n    float x = Input.GetAxis("Horizontal");\n    transform.Translate(x * speed * Time.deltaTime, 0f, 0f);\n}' }] },
                { type: 'callout',
                  figures: [{ tone: 'tip',
                      text: 'Multiply by Time.deltaTime so movement is frame-rate independent.' }] },
                { type: 'video', title: 'Watch it running',
                  figures: [{ src: 'https://www.youtube.com/watch?v=jlX_u2-iX6g',
                      caption: 'A normal YouTube link is converted to an embed automatically.' }] },
                { type: 'download', title: 'Grab the starter project',
                  figures: [{ fileRef: 1 }] },
                { type: 'link-embed', title: 'Read more',
                  figures: [{ url: 'https://docs.unity3d.com/ScriptReference/Input.GetAxis.html',
                      label: 'Input.GetAxis', site: 'Unity Documentation',
                      description: 'The API used above.' }] },
                { type: 'qa', title: 'Common problems',
                  figures: [
                      { question: 'My player falls through the floor.',
                        answer: 'The ground needs a Collider2D, and the player needs one too.' },
                      { question: 'Movement feels sluggish.',
                        answer: 'Raise the speed value, or lower the Rigidbody2D linear drag.' }] }
            ]
        });
    }

    /* ------------------------------------------------------------- init   */

    function populateSourceSelect() {
        refs.sourceSelect.textContent = '';
        var blank = el('option', null, 'New draft');
        blank.value = '';
        refs.sourceSelect.appendChild(blank);
        existing.forEach(function (lesson) {
            var opt = el('option', null, lesson.title + '  (' + lesson.id + ')');
            opt.value = lesson.id;
            refs.sourceSelect.appendChild(opt);
        });
    }

    var stored = loadStoredDraft();
    draft = stored || starterTemplate();
    /* A hand-edited id must survive a title change. */
    if (draft.id && draft.title && draft.id !== D.slugify(draft.title)) draft._idTouched = true;

    buildShell();
    wireCanvasEvents();
    rerenderAll();

    fetch('data/lessons.json', { cache: 'no-store' })
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(function (doc) {
            existing = Array.isArray(doc && doc.lessons) ? doc.lessons : [];
            populateSourceSelect();
            refresh();
        })
        .catch(function () {
            toast('Could not read data/lessons.json — duplicate-ID checks are off');
        });

    if (stored) toast('Restored your saved draft');
})();
