/* ==========================================================================
   render.js — the ONE renderer.
   lesson.html and the editor's live preview both draw through these
   functions, so the preview can never drift from the published page.
   (Same trick magmalabs' blog builder uses: preview calls the real renderer.)
   All content goes in via textContent — never innerHTML — so lesson JSON
   cannot inject markup.
   ========================================================================== */

(function (global) {
    'use strict';

    var D = global.GDCData;

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null && text !== '') node.textContent = text;
        return node;
    }

    function icon(classes) {
        var i = el('i', classes);
        i.setAttribute('aria-hidden', 'true');
        return i;
    }

    function frag() { return document.createDocumentFragment(); }

    /* ---------------------------------------------------------- utilities */

    /* Accept a watch URL, a share URL or an embed URL and return an embed. */
    function toEmbedUrl(url) {
        var value = D.cleanText(url);
        if (!value) return '';
        var yt = value.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
        if (yt) return 'https://www.youtube.com/embed/' + yt[1];
        var vimeo = value.match(/vimeo\.com\/(?:video\/)?(\d+)/);
        if (vimeo) return 'https://player.vimeo.com/video/' + vimeo[1];
        return value;
    }

    function fileIconClass(file) {
        return D.FILE_ICONS[file.icon] || D.FILE_ICONS.link;
    }

    function formatDate(value) {
        if (!value) return '';
        var parts = String(value).split('-');
        if (parts.length !== 3) return value;
        var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        if (isNaN(date.getTime())) return value;
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    /* Stable slug for a card, used as the progress key and TOC anchor. */
    function cardKey(card, index) {
        return 'step-' + index + '-' + (D.slugify(card.title) || card.type);
    }

    /* ------------------------------------------------------- browse card  */

    function renderLessonCard(lesson) {
        var card = el('a', 'lesson-card');
        card.href = 'lesson.html?id=' + encodeURIComponent(lesson.id);

        var media = el('div', 'lesson-card-media');
        var img = el('img');
        img.src = lesson.thumbnail || 'imgs/lessons/' + lesson.id + '.svg';
        img.alt = '';
        img.loading = 'lazy';
        media.appendChild(img);

        media.appendChild(el('span', 'lesson-badge engine', D.engineBadge(lesson)));
        media.appendChild(el('span', 'lesson-badge difficulty ' + lesson.difficulty,
            D.difficultyLabel(lesson.difficulty)));

        var progress = D.progressFor(lesson);
        if (progress.complete) {
            var done = el('span', 'lesson-badge done');
            done.appendChild(icon('fa-solid fa-circle-check'));
            done.appendChild(document.createTextNode(' Completed'));
            media.appendChild(done);
        } else if (progress.done > 0) {
            media.appendChild(el('span', 'lesson-badge partial',
                progress.done + '/' + progress.total + ' done'));
        }

        card.appendChild(media);

        var body = el('div', 'lesson-card-body');
        body.appendChild(el('h3', 'lesson-card-title', lesson.title));
        body.appendChild(el('p', 'lesson-card-summary', lesson.summary));

        var chips = el('div', 'lesson-card-chips');
        lesson.components.slice(0, 3).forEach(function (key) {
            chips.appendChild(el('span', 'chip', D.componentLabel(key)));
        });
        body.appendChild(chips);
        card.appendChild(body);

        var foot = el('div', 'lesson-card-foot');
        var steps = el('span', 'meta');
        steps.appendChild(icon('fa-solid fa-list-ol'));
        steps.appendChild(document.createTextNode(
            ' ' + lesson.stepCount + (lesson.stepCount === 1 ? ' part' : ' parts')));
        foot.appendChild(steps);

        var time = el('span', 'meta');
        time.appendChild(icon('fa-regular fa-clock'));
        time.appendChild(document.createTextNode(' ' + lesson.durationMinutes + ' min'));
        foot.appendChild(time);
        card.appendChild(foot);

        return card;
    }

    /* ------------------------------------------------------------ gallery */

    function renderGallery(lesson) {
        var wrap = el('div', 'gallery');
        var items = lesson.media.length
            ? lesson.media
            : (lesson.thumbnail
                ? [{ type: 'image', src: lesson.thumbnail, alt: lesson.title, caption: '' }]
                : []);

        /* No media and no thumbnail yet — show a placeholder rather than a
           broken image (the editor hits this constantly on a fresh draft). */
        if (!items.length) {
            var placeholder = el('div', 'gallery-stage gallery-placeholder');
            placeholder.appendChild(icon('fa-regular fa-image'));
            placeholder.appendChild(el('p', null, 'No cover image yet'));
            wrap.appendChild(placeholder);
            return wrap;
        }

        var stage = el('div', 'gallery-stage');
        wrap.appendChild(stage);

        var caption = el('p', 'gallery-caption');
        var strip = el('div', 'gallery-strip');
        var current = 0;

        function show(index) {
            current = (index + items.length) % items.length;
            var item = items[current];
            stage.textContent = '';

            if (item.type === 'video') {
                var holder = el('div', 'gallery-video');
                var iframe = document.createElement('iframe');
                iframe.src = toEmbedUrl(item.src);
                iframe.title = item.caption || (lesson.title + ' video');
                iframe.loading = 'lazy';
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('allow',
                    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
                holder.appendChild(iframe);
                stage.appendChild(holder);
            } else {
                var img = el('img', 'gallery-image');
                img.src = item.src;
                img.alt = item.alt || (lesson.title + ' preview');
                stage.appendChild(img);
            }

            caption.textContent = item.caption || '';
            caption.hidden = !item.caption;

            Array.prototype.forEach.call(strip.children, function (thumb, i) {
                thumb.classList.toggle('active', i === current);
                thumb.setAttribute('aria-selected', i === current ? 'true' : 'false');
            });
        }

        if (items.length > 1) {
            ['prev', 'next'].forEach(function (dir) {
                var btn = el('button', 'gallery-nav ' + dir);
                btn.type = 'button';
                btn.setAttribute('aria-label', dir === 'prev' ? 'Previous image' : 'Next image');
                btn.appendChild(icon('fa-solid fa-chevron-' + (dir === 'prev' ? 'left' : 'right')));
                btn.addEventListener('click', function () {
                    show(current + (dir === 'prev' ? -1 : 1));
                });
                wrap.appendChild(btn);
            });
        }

        wrap.appendChild(caption);

        if (items.length > 1) {
            strip.setAttribute('role', 'tablist');
            items.forEach(function (item, i) {
                var thumb = el('button', 'gallery-thumb');
                thumb.type = 'button';
                thumb.setAttribute('role', 'tab');
                thumb.setAttribute('aria-label', 'View item ' + (i + 1));
                var timg = el('img');
                timg.src = item.type === 'video' ? (lesson.thumbnail || item.src) : item.src;
                timg.alt = '';
                timg.loading = 'lazy';
                thumb.appendChild(timg);
                if (item.type === 'video') {
                    var play = el('span', 'gallery-thumb-play');
                    play.appendChild(icon('fa-solid fa-play'));
                    thumb.appendChild(play);
                }
                thumb.addEventListener('click', function () { show(i); });
                strip.appendChild(thumb);
            });
            wrap.appendChild(strip);

            wrap.addEventListener('keydown', function (event) {
                if (event.key === 'ArrowLeft') { show(current - 1); event.preventDefault(); }
                if (event.key === 'ArrowRight') { show(current + 1); event.preventDefault(); }
            });
        }

        show(0);
        return wrap;
    }

    /* -------------------------------------------------------- files panel */

    function renderFileRow(file) {
        var row = el('li', 'file-row');

        var badge = el('span', 'file-icon');
        badge.appendChild(icon(fileIconClass(file)));
        row.appendChild(badge);

        var info = el('div', 'file-info');
        info.appendChild(el('span', 'file-name', file.name));
        var meta = file.kind === 'repo'
            ? [file.size, 'In repo'].filter(Boolean).join(' · ')
            : (file.source || 'External link');
        info.appendChild(el('span', 'file-meta', meta));
        row.appendChild(info);

        var action = el('a', 'file-action');
        if (file.kind === 'repo') {
            action.href = file.path;
            action.setAttribute('download', '');
            action.setAttribute('aria-label', 'Download ' + file.name);
            action.appendChild(icon('fa-solid fa-download'));
        } else {
            action.href = file.url;
            action.target = '_blank';
            action.rel = 'noopener';
            action.setAttribute('aria-label', 'Open ' + file.name + ' in a new tab');
            action.appendChild(icon('fa-solid fa-arrow-up-right-from-square'));
        }
        row.appendChild(action);

        return row;
    }

    function renderFilesPanel(lesson) {
        var panel = el('section', 'files-panel gdc-card');

        var head = el('div', 'files-head');
        head.appendChild(el('h2', 'files-title', 'Required Files'));
        head.appendChild(el('span', 'files-count',
            lesson.files.length + (lesson.files.length === 1 ? ' file' : ' files')));
        panel.appendChild(head);

        if (!lesson.files.length) {
            panel.appendChild(el('p', 'files-empty',
                'No downloads needed — everything you need is in the walkthrough below.'));
        } else {
            var list = el('ul', 'file-list');
            lesson.files.forEach(function (file) { list.appendChild(renderFileRow(file)); });
            panel.appendChild(list);

            var repoFiles = lesson.files.filter(function (f) { return f.kind === 'repo'; });
            var primary = lesson.files[0];
            var cta = el('a', 'gdc-btn green full files-cta');
            if (repoFiles.length > 1) {
                cta.textContent = 'Download all files';
                cta.href = repoFiles[0].path;
                cta.setAttribute('download', '');
                cta.addEventListener('click', function () {
                    /* No server-side zip on a static host: fire each download. */
                    repoFiles.slice(1).forEach(function (file, i) {
                        setTimeout(function () {
                            var a = document.createElement('a');
                            a.href = file.path;
                            a.setAttribute('download', '');
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        }, (i + 1) * 400);
                    });
                });
            } else if (primary.kind === 'repo') {
                cta.textContent = 'Download ' + primary.name;
                cta.href = primary.path;
                cta.setAttribute('download', '');
            } else {
                cta.textContent = lesson.files.length > 1 ? 'Open Part 1' : 'Open lesson slides';
                cta.href = primary.url;
                cta.target = '_blank';
                cta.rel = 'noopener';
            }
            panel.appendChild(cta);
        }

        /* Metadata block */
        var meta = el('dl', 'lesson-meta');
        function addMeta(label, value) {
            if (!value) return;
            meta.appendChild(el('dt', null, label));
            meta.appendChild(el('dd', null, value));
        }
        addMeta('Engine', D.engineBadge(lesson));
        addMeta('Components', lesson.components.map(D.componentLabel).join(', '));
        addMeta('Difficulty', D.difficultyLabel(lesson.difficulty));
        addMeta('Est. time', lesson.durationMinutes + ' min');
        addMeta('Series', lesson.series);
        addMeta('Author', lesson.author);
        addMeta('Updated', formatDate(lesson.updatedAt || lesson.writtenAt));
        panel.appendChild(meta);

        return panel;
    }

    /* ------------------------------------------------------ block renders */

    function renderTextFigures(figures) {
        var box = frag();
        figures.forEach(function (figure) {
            if (figure.type === 'list' && Array.isArray(figure.items) && figure.items.length) {
                var ul = el('ul', 'block-list');
                figure.items.forEach(function (item) { ul.appendChild(el('li', null, item)); });
                box.appendChild(ul);
            } else if (figure.text) {
                box.appendChild(el('p', 'block-paragraph', figure.text));
            }
        });
        return box;
    }

    function renderImageBlock(card) {
        var grid = el('div', 'block-images ' + (card.layout === 'grid' ? 'grid' : 'single'));
        card.figures.forEach(function (figure) {
            if (!figure.src) return;
            var figEl = el('figure', 'block-figure');
            var img = el('img');
            img.src = figure.src;
            img.alt = figure.alt || '';
            img.loading = 'lazy';
            figEl.appendChild(img);
            if (figure.caption) figEl.appendChild(el('figcaption', null, figure.caption));
            grid.appendChild(figEl);
        });
        return grid;
    }

    function renderCodeBlock(card) {
        var stack = el('div', 'block-code-stack');
        card.figures.forEach(function (figure) {
            var block = el('div', 'code-block');

            var bar = el('div', 'code-bar');
            bar.appendChild(el('span', 'code-filename', figure.filename || 'snippet'));
            if (figure.language) bar.appendChild(el('span', 'code-lang', figure.language));

            var copy = el('button', 'code-copy');
            copy.type = 'button';
            copy.appendChild(icon('fa-regular fa-copy'));
            copy.appendChild(document.createTextNode(' Copy'));
            copy.addEventListener('click', function () {
                var text = figure.code || '';
                var done = function () {
                    copy.classList.add('copied');
                    copy.textContent = 'Copied';
                    setTimeout(function () {
                        copy.classList.remove('copied');
                        copy.textContent = '';
                        copy.appendChild(icon('fa-regular fa-copy'));
                        copy.appendChild(document.createTextNode(' Copy'));
                    }, 1600);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done, function () {});
                } else {
                    var ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); done(); } catch (err) { /* noop */ }
                    document.body.removeChild(ta);
                }
            });
            bar.appendChild(copy);
            block.appendChild(bar);

            var pre = el('pre', 'code-pre');
            pre.appendChild(el('code', null, figure.code || ''));
            block.appendChild(pre);

            if (figure.caption) block.appendChild(el('p', 'code-caption', figure.caption));
            stack.appendChild(block);
        });
        return stack;
    }

    function renderVideoBlock(card) {
        var stack = el('div', 'block-video-stack');
        card.figures.forEach(function (figure) {
            if (!figure.src) return;
            var figEl = el('figure', 'block-figure video');
            var holder = el('div', 'video-frame');
            var iframe = document.createElement('iframe');
            iframe.src = toEmbedUrl(figure.src);
            iframe.title = figure.caption || 'Lesson video';
            iframe.loading = 'lazy';
            iframe.setAttribute('allowfullscreen', '');
            iframe.setAttribute('allow',
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
            holder.appendChild(iframe);
            figEl.appendChild(holder);
            if (figure.caption) figEl.appendChild(el('figcaption', null, figure.caption));
            stack.appendChild(figEl);
        });
        return stack;
    }

    var CALLOUT_ICONS = {
        tip: 'fa-solid fa-lightbulb',
        warn: 'fa-solid fa-triangle-exclamation',
        note: 'fa-solid fa-circle-info'
    };

    function renderCalloutBlock(card) {
        var stack = frag();
        card.figures.forEach(function (figure) {
            var tone = CALLOUT_ICONS[figure.tone] ? figure.tone : 'note';
            var box = el('div', 'callout ' + tone);
            var mark = el('span', 'callout-icon');
            mark.appendChild(icon(CALLOUT_ICONS[tone]));
            box.appendChild(mark);
            var body = el('div', 'callout-body');
            if (figure.title) body.appendChild(el('strong', 'callout-title', figure.title));
            body.appendChild(el('p', null, figure.text || ''));
            box.appendChild(body);
            stack.appendChild(box);
        });
        return stack;
    }

    function renderLinkBlock(card) {
        var list = el('div', 'block-links');
        card.figures.forEach(function (figure) {
            if (!figure.url) return;
            var link = el('a', 'link-embed');
            link.href = figure.url;
            link.target = '_blank';
            link.rel = 'noopener';

            var mark = el('span', 'link-embed-icon');
            mark.appendChild(icon('fa-solid fa-arrow-up-right-from-square'));
            link.appendChild(mark);

            var body = el('div', 'link-embed-body');
            body.appendChild(el('span', 'link-embed-label', figure.label || figure.url));
            if (figure.site) body.appendChild(el('span', 'link-embed-site', figure.site));
            if (figure.description) {
                body.appendChild(el('span', 'link-embed-desc', figure.description));
            }
            link.appendChild(body);
            list.appendChild(link);
        });
        return list;
    }

    function renderQaBlock(card) {
        var list = el('div', 'block-qa');
        card.figures.forEach(function (figure) {
            if (!figure.question) return;
            var item = el('details', 'qa-item');
            var summary = el('summary', 'qa-question', figure.question);
            item.appendChild(summary);
            item.appendChild(el('p', 'qa-answer', figure.answer || ''));
            list.appendChild(item);
        });
        return list;
    }

    /* A download block points at entries in the lesson's own files[] so URLs
       live in exactly one place. */
    function renderDownloadBlock(card, lesson) {
        var list = el('ul', 'file-list inline');
        card.figures.forEach(function (figure) {
            var file = null;
            if (figure.fileRef !== undefined && lesson) {
                file = lesson.files[Number(figure.fileRef)];
            }
            if (!file && figure.url) {
                file = { kind: 'link', name: figure.name || figure.url, url: figure.url,
                         icon: figure.icon || 'link', source: figure.source || '' };
            }
            if (file) list.appendChild(renderFileRow(file));
        });
        return list.children.length ? list : el('p', 'block-paragraph muted',
            'No files linked to this block yet.');
    }

    var BLOCK_RENDERERS = {
        text: function (card) { return renderTextFigures(card.figures); },
        image: renderImageBlock,
        code: renderCodeBlock,
        video: renderVideoBlock,
        callout: renderCalloutBlock,
        'link-embed': renderLinkBlock,
        qa: renderQaBlock,
        download: renderDownloadBlock
    };

    function renderBlock(card, index, lesson, options) {
        options = options || {};
        var section = el('section', 'block block-' + card.type);
        var key = cardKey(card, index);
        section.id = key;
        section.setAttribute('data-block-key', key);

        if (card.title) {
            var head = el('div', 'block-head');

            if (options.withProgress) {
                var label = el('label', 'block-check');
                var box = el('input');
                box.type = 'checkbox';
                box.checked = !!(options.done && options.done.indexOf(key) !== -1);
                box.setAttribute('aria-label', 'Mark "' + card.title + '" as done');
                box.addEventListener('change', function () {
                    if (options.onToggle) options.onToggle(key, box.checked);
                    section.classList.toggle('is-done', box.checked);
                });
                label.appendChild(box);
                head.appendChild(label);
                if (box.checked) section.classList.add('is-done');
            }

            head.appendChild(el('h2', 'block-title', card.title));
            section.appendChild(head);
        }

        var renderer = BLOCK_RENDERERS[card.type];
        if (renderer) {
            section.appendChild(renderer(card, lesson));
        } else {
            section.appendChild(el('p', 'block-paragraph muted',
                'Unsupported block type: ' + card.type));
        }

        return section;
    }

    function renderArticle(lesson, options) {
        options = options || {};
        var article = el('article', 'lesson-article');

        if (!lesson.content.length) {
            article.appendChild(el('p', 'block-paragraph muted',
                'This lesson has no written walkthrough yet.'));
            return article;
        }

        lesson.content.forEach(function (card, index) {
            article.appendChild(renderBlock(card, index, lesson, options));
        });
        return article;
    }

    /* Table of contents built from the same titles the blocks use. */
    function renderToc(lesson) {
        var titled = [];
        lesson.content.forEach(function (card, index) {
            if (card.title) titled.push({ key: cardKey(card, index), title: card.title });
        });
        if (titled.length < 2) return null;

        var nav = el('nav', 'lesson-toc');
        nav.setAttribute('aria-label', 'Lesson contents');
        nav.appendChild(el('h2', 'toc-title', 'On this page'));
        var list = el('ol', 'toc-list');
        titled.forEach(function (item) {
            var li = el('li');
            var link = el('a', 'toc-link', item.title);
            link.href = '#' + item.key;
            link.setAttribute('data-toc-for', item.key);
            li.appendChild(link);
            list.appendChild(li);
        });
        nav.appendChild(list);
        return nav;
    }

    global.GDCRender = {
        el: el,
        icon: icon,
        cardKey: cardKey,
        formatDate: formatDate,
        toEmbedUrl: toEmbedUrl,
        renderLessonCard: renderLessonCard,
        renderGallery: renderGallery,
        renderFilesPanel: renderFilesPanel,
        renderFileRow: renderFileRow,
        renderBlock: renderBlock,
        renderArticle: renderArticle,
        renderToc: renderToc
    };
})(window);
