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

    function serializeFigure(card, figure, warnings, label) {
        var type = card.type;

        if (type === 'text') {
            if (figure.type === 'list') {
                var items = splitLines(figure.itemsText);
                if (!items.length) { warnings.push(label + ': empty list removed.'); return null; }
                return { type: 'list', items: items };
            }
            var text = D.cleanText(figure.text);
            if (!text) { warnings.push(label + ': empty paragraph removed.'); return null; }
            return { type: 'paragraph', text: text };
        }

        if (type === 'image') {
            var src = D.cleanText(figure.src);
            if (!src) { warnings.push(label + ': image with no path removed.'); return null; }
            if (!D.cleanText(figure.alt)) {
                warnings.push(label + ': image has no alt text — screen readers will skip it.');
            }
            var img = { src: src };
            if (figure.alt) img.alt = D.cleanText(figure.alt);
            if (figure.caption) img.caption = D.cleanText(figure.caption);
            return img;
        }

        if (type === 'code') {
            var code = String(figure.code == null ? '' : figure.code);
            if (!code.trim()) { warnings.push(label + ': empty code block removed.'); return null; }
            var snippet = { code: code };
            snippet.filename = D.cleanText(figure.filename) || 'snippet.txt';
            if (figure.language) snippet.language = D.cleanText(figure.language);
            if (figure.caption) snippet.caption = D.cleanText(figure.caption);
            return snippet;
        }

        if (type === 'video') {
            var vsrc = D.cleanText(figure.src);
            if (!vsrc) { warnings.push(label + ': video with no URL removed.'); return null; }
            var video = { src: vsrc };
            if (figure.caption) video.caption = D.cleanText(figure.caption);
            return video;
        }

        if (type === 'callout') {
            var ctext = D.cleanText(figure.text);
            if (!ctext) { warnings.push(label + ': empty callout removed.'); return null; }
            var callout = { tone: figure.tone || 'note', text: ctext };
            if (figure.title) callout.title = D.cleanText(figure.title);
            return callout;
        }

        if (type === 'link-embed') {
            var url = D.cleanText(figure.url);
            if (!url) { warnings.push(label + ': link with no URL removed.'); return null; }
            var link = { url: url };
            if (figure.label) link.label = D.cleanText(figure.label);
            if (figure.site) link.site = D.cleanText(figure.site);
            if (figure.description) link.description = D.cleanText(figure.description);
            return link;
        }

        if (type === 'qa') {
            var question = D.cleanText(figure.question);
            if (!question) { warnings.push(label + ': Q&A with no question removed.'); return null; }
            return { question: question, answer: D.cleanText(figure.answer) };
        }

        if (type === 'download') {
            var ref = Number(figure.fileRef);
            if (isNaN(ref) || !draft.files[ref]) {
                warnings.push(label + ': download points at a file that no longer exists.');
                return null;
            }
            return { fileRef: ref };
        }

        return null;
    }

    function serialize(warnings) {
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
            var label = 'Block ' + (index + 1) + ' (' + card.type + ')';
            var figures = card.figures
                .map(function (figure) { return serializeFigure(card, figure, warnings, label); })
                .filter(Boolean);
            if (!figures.length) {
                warnings.push(label + ': has no content, removed from the export.');
                return null;
            }
            var result = { type: card.type };
            if (D.cleanText(card.title)) result.title = D.cleanText(card.title);
            if (card.type === 'image' && card.layout === 'grid') result.layout = 'grid';
            result.figures = figures;
            return result;
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
            body.appendChild(field('Figure type', selectInput(figure.type || 'paragraph', [
                { value: 'paragraph', label: 'Paragraph' },
                { value: 'list', label: 'List' }
            ], function (v) { figure.type = v; rerender(); })));

            if (figure.type === 'list') {
                body.appendChild(field('List items',
                    textArea(figure.itemsText, function (v) { figure.itemsText = v; rerender(); },
                        5, 'One item per line'),
                    'One item per line.'));
            } else {
                body.appendChild(field('Paragraph text',
                    textArea(figure.text, function (v) { figure.text = v; rerender(); },
                        4, 'Explain this step…')));
            }
        }

        if (card.type === 'image') {
            body.appendChild(field('Image path',
                textInput(figure.src, function (v) { figure.src = v; rerender(); },
                    'imgs/lessons/my-lesson/step-1.png')));
            body.appendChild(field('Alt text',
                textInput(figure.alt, function (v) { figure.alt = v; rerender(); },
                    'What the screenshot shows'),
                'Required for screen readers. Describe what a reader would miss.'));
            body.appendChild(field('Caption',
                textInput(figure.caption, function (v) { figure.caption = v; rerender(); },
                    'Optional caption shown under the image')));
        }

        if (card.type === 'code') {
            var row = el('div', 'ed-row');
            row.appendChild(field('Filename',
                textInput(figure.filename, function (v) { figure.filename = v; rerender(); },
                    'PlayerMovement.cs')));
            row.appendChild(field('Language', selectInput(figure.language || 'C#',
                LANGUAGES.map(function (l) { return { value: l, label: l }; }),
                function (v) { figure.language = v; rerender(); })));
            body.appendChild(row);
            body.appendChild(field('Code',
                textArea(figure.code, function (v) { figure.code = v; rerender(); },
                    12, 'void Update() { ... }', true)));
            body.appendChild(field('Caption',
                textInput(figure.caption, function (v) { figure.caption = v; rerender(); },
                    'Optional note under the code')));
        }

        if (card.type === 'video') {
            body.appendChild(field('Video URL',
                textInput(figure.src, function (v) { figure.src = v; rerender(); },
                    'https://www.youtube.com/watch?v=…'),
                'A normal YouTube or Vimeo link works — it is converted to an embed.'));
            body.appendChild(field('Caption',
                textInput(figure.caption, function (v) { figure.caption = v; rerender(); },
                    'Optional caption')));
        }

        if (card.type === 'callout') {
            body.appendChild(field('Tone', selectInput(figure.tone || 'note', [
                { value: 'note', label: 'Note' },
                { value: 'tip', label: 'Tip' },
                { value: 'warn', label: 'Warning' }
            ], function (v) { figure.tone = v; rerender(); })));
            body.appendChild(field('Heading',
                textInput(figure.title, function (v) { figure.title = v; rerender(); },
                    'Optional bold heading')));
            body.appendChild(field('Text',
                textArea(figure.text, function (v) { figure.text = v; rerender(); },
                    3, 'Watch out for…')));
        }

        if (card.type === 'link-embed') {
            body.appendChild(field('URL',
                textInput(figure.url, function (v) { figure.url = v; rerender(); },
                    'https://docs.google.com/presentation/…')));
            var linkRow = el('div', 'ed-row');
            linkRow.appendChild(field('Label',
                textInput(figure.label, function (v) { figure.label = v; rerender(); },
                    'Part 1 — Unity basics')));
            linkRow.appendChild(field('Site',
                textInput(figure.site, function (v) { figure.site = v; rerender(); },
                    'Google Slides')));
            body.appendChild(linkRow);
            body.appendChild(field('Description',
                textInput(figure.description, function (v) { figure.description = v; rerender(); },
                    'Optional one-liner')));
        }

        if (card.type === 'qa') {
            body.appendChild(field('Question',
                textInput(figure.question, function (v) { figure.question = v; rerender(); },
                    'Why is my character falling through the floor?')));
            body.appendChild(field('Answer',
                textArea(figure.answer, function (v) { figure.answer = v; rerender(); },
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
                    rerender();
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
            textInput(card.title, function (v) { card.title = v; rerender(); },
                'Optional — becomes a section title'),
            'Headed blocks get a progress checkbox and a table-of-contents entry.'));

        if (card.type === 'image') {
            body.appendChild(field('Layout', selectInput(card.layout || 'single', [
                { value: 'single', label: 'Single column' },
                { value: 'grid', label: 'Grid' }
            ], function (v) { card.layout = v; rerender(); })));
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
            textInput(item.src, function (v) { item.src = v; rerender(); },
                item.type === 'video'
                    ? 'https://www.youtube.com/watch?v=…'
                    : 'imgs/lessons/my-lesson/cover.png')));
        body.appendChild(row);
        if (item.type !== 'video') {
            body.appendChild(field('Alt text',
                textInput(item.alt, function (v) { item.alt = v; rerender(); },
                    'What the image shows')));
        }
        body.appendChild(field('Caption',
            textInput(item.caption, function (v) { item.caption = v; rerender(); }, 'Optional')));
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
            textInput(item.name, function (v) { item.name = v; rerender(); },
                'Part 1 — Unity basics')));

        var row = el('div', 'ed-row');
        row.appendChild(field('Source', selectInput(item.kind, [
            { value: 'link', label: 'External link' },
            { value: 'repo', label: 'File in this repo' }
        ], function (v) { item.kind = v; rerender(); })));
        row.appendChild(field('Icon', selectInput(item.icon,
            Object.keys(D.FILE_ICONS).map(function (k) { return { value: k, label: k }; }),
            function (v) { item.icon = v; rerender(); })));
        body.appendChild(row);

        if (item.kind === 'repo') {
            var repoRow = el('div', 'ed-row');
            repoRow.appendChild(field('Path in repo',
                textInput(item.path, function (v) { item.path = v; rerender(); },
                    'files/my-lesson/starter.unitypackage')));
            repoRow.appendChild(field('Size',
                textInput(item.size, function (v) { item.size = v; rerender(); }, '4.2 MB')));
            body.appendChild(repoRow);
        } else {
            body.appendChild(field('URL',
                textInput(item.url, function (v) { item.url = v; rerender(); },
                    'https://docs.google.com/presentation/…')));
            body.appendChild(field('Source label',
                textInput(item.source, function (v) { item.source = v; rerender(); },
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

        /* --- Live preview --- */
        var previewCard = el('section', 'ed-panel gdc-card ed-preview');
        previewCard.appendChild(sectionHeader('Preview', 'Live lesson preview',
            'Drawn with the same renderer as the published lesson page, so what you see is what ships.'));
        refs.preview = el('div', 'ed-preview-body');
        previewCard.appendChild(refs.preview);
        side.appendChild(previewCard);

        /* --- Main editing column --- */
        var main = el('div', 'ed-main');

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

        /* Content */
        var contentCard = el('section', 'ed-panel ed-content-panel');
        contentCard.appendChild(sectionHeader('Content', 'Lesson blocks',
            'The blog-post style walkthrough. Add blocks, reorder them, watch the preview.'));
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
        main.appendChild(contentCard);

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
        idRow.appendChild(field('Lesson ID',
            textInput(draft.id, function (v) {
                draft.id = v;
                draft._idTouched = true;   /* stop deriving it from the title */
                refresh();
            }, 'unity-platformer'),
            'Used in lesson.html?id=… — lowercase, dashes, no spaces.'));
        idRow.appendChild(field('Difficulty', selectInput(draft.difficulty,
            D.DIFFICULTIES.map(function (d) { return { value: d.key, label: d.label }; }),
            function (v) { draft.difficulty = v; refresh(); })));
        host.appendChild(idRow);

        host.appendChild(field('Title',
            textInput(draft.title, function (v) {
                draft.title = v;
                /* Derive the slug until the author overrides it by hand. */
                if (!draft._idTouched) draft.id = D.slugify(v);
                refresh();
                if (!draft._idTouched) renderMetadata();
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

    /* The preview runs the published lesson through the real renderer. */
    function renderPreview(serialized) {
        refs.preview.textContent = '';

        var lesson = D.normalizeLesson(serialized);
        if (!lesson || !lesson.content.length) {
            refs.preview.appendChild(el('p', 'ed-empty',
                'Add a title and at least one content block to see the lesson preview.'));
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

        wrap.appendChild(R.renderArticle(lesson));
        refs.preview.appendChild(wrap);
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

    /* Recompute everything that derives from the draft. */
    function refresh() {
        var warnings = [];
        var serialized = serialize(warnings);

        refs.output.value = JSON.stringify(serialized, null, 2) + (refs.trailingComma ? ',' : '');
        renderWarnings(warnings);
        renderStats(serialized);
        renderPreview(serialized);
        saveDraft();
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
