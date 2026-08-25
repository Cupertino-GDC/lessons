/* ==========================================================================
   lesson.js — the lesson detail page (?id=<slug>).
   Draws everything through render.js so the editor preview stays identical.
   ========================================================================== */

(function () {
    'use strict';

    var D = window.GDCData;
    var R = window.GDCRender;

    var refs = {
        loading: document.querySelector('[data-loading]'),
        error: document.querySelector('[data-error]'),
        errorTitle: document.querySelector('[data-error-title]'),
        errorBody: document.querySelector('[data-error-body]'),
        root: document.querySelector('[data-lesson]'),
        title: document.querySelector('[data-title]'),
        summary: document.querySelector('[data-summary]'),
        crumbEngine: document.querySelector('[data-crumb-engine]'),
        crumbTitle: document.querySelector('[data-crumb-title]'),
        gallery: document.querySelector('[data-gallery-host]'),
        files: document.querySelector('[data-files-host]'),
        article: document.querySelector('[data-article-host]'),
        toc: document.querySelector('[data-toc-host]'),
        pager: document.querySelector('[data-pager]'),
        related: document.querySelector('[data-related]'),
        relatedGrid: document.querySelector('[data-related-grid]'),
        progress: document.querySelector('[data-progress]'),
        progressFill: document.querySelector('[data-progress-fill]'),
        progressLabel: document.querySelector('[data-progress-label]'),
        progressReset: document.querySelector('[data-progress-reset]')
    };

    function showError(title, body) {
        refs.loading.hidden = true;
        refs.root.hidden = true;
        refs.error.hidden = false;
        refs.errorTitle.textContent = title;
        refs.errorBody.textContent = body;
    }

    /* ------------------------------------------------------------ progress */

    function setupProgress(lesson) {
        var keys = lesson.content
            .map(function (card, index) { return card.title ? R.cardKey(card, index) : null; })
            .filter(Boolean);

        if (!keys.length) {
            refs.progress.hidden = true;
            return { done: [], keys: [], update: function () {} };
        }

        var done = D.readProgress(lesson.id).filter(function (k) {
            return keys.indexOf(k) !== -1;
        });

        function update() {
            var ratio = keys.length ? done.length / keys.length : 0;
            refs.progressFill.style.width = Math.round(ratio * 100) + '%';
            refs.progressLabel.textContent = done.length === keys.length
                ? 'Lesson complete'
                : done.length + ' of ' + keys.length + ' sections done';
            refs.progress.classList.toggle('complete', done.length === keys.length);
            refs.progressReset.hidden = done.length === 0;
        }

        refs.progress.hidden = false;
        refs.progressReset.addEventListener('click', function () {
            done.length = 0;
            D.writeProgress(lesson.id, done);
            update();
            refs.article.querySelectorAll('.block-check input').forEach(function (box) {
                box.checked = false;
                box.closest('.block').classList.remove('is-done');
            });
        });

        return {
            done: done,
            keys: keys,
            update: update,
            toggle: function (key, checked) {
                var at = done.indexOf(key);
                if (checked && at === -1) done.push(key);
                if (!checked && at !== -1) done.splice(at, 1);
                D.writeProgress(lesson.id, done);
                update();
            }
        };
    }

    /* ----------------------------------------------------------------- toc */

    function setupTocHighlight() {
        var links = refs.toc.querySelectorAll('.toc-link');
        if (!links.length || !('IntersectionObserver' in window)) return;

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                links.forEach(function (link) {
                    link.classList.toggle('active',
                        link.getAttribute('data-toc-for') === entry.target.id);
                });
            });
        }, { rootMargin: '-90px 0px -70% 0px', threshold: 0 });

        links.forEach(function (link) {
            var target = document.getElementById(link.getAttribute('data-toc-for'));
            if (target) observer.observe(target);
        });
    }

    /* --------------------------------------------------------------- pager */

    function buildPager(lesson, all) {
        /* Walk the lesson's own series so "next" means the next lesson the
           club actually teaches, not an alphabetical neighbour. */
        var siblings = all.filter(function (l) { return l.series === lesson.series; });
        var at = siblings.map(function (l) { return l.id; }).indexOf(lesson.id);
        if (at === -1) return;

        var prev = siblings[at - 1];
        var next = siblings[at + 1];

        function link(target, direction) {
            var a = R.el('a', 'pager-link ' + direction);
            a.href = 'lesson.html?id=' + encodeURIComponent(target.id);
            var label = R.el('span', 'pager-label',
                direction === 'prev' ? 'Previous in ' + lesson.series : 'Next in ' + lesson.series);
            var name = R.el('span', 'pager-name', target.title);
            if (direction === 'prev') {
                a.appendChild(R.icon('fa-solid fa-chevron-left'));
            }
            var box = R.el('span', 'pager-text');
            box.appendChild(label);
            box.appendChild(name);
            a.appendChild(box);
            if (direction === 'next') {
                a.appendChild(R.icon('fa-solid fa-chevron-right'));
            }
            return a;
        }

        refs.pager.textContent = '';
        if (prev) refs.pager.appendChild(link(prev, 'prev'));
        else refs.pager.appendChild(R.el('span', 'pager-spacer'));
        if (next) refs.pager.appendChild(link(next, 'next'));
    }

    function buildRelated(lesson, all) {
        var scored = all
            .filter(function (l) { return l.id !== lesson.id; })
            .map(function (l) {
                var shared = l.components.filter(function (c) {
                    return lesson.components.indexOf(c) !== -1;
                }).length;
                var sameEngine = l.engines.some(function (e) {
                    return lesson.engines.indexOf(e) !== -1;
                }) ? 1 : 0;
                var sameSeries = l.series === lesson.series ? 1 : 0;
                return { lesson: l, score: shared * 3 + sameEngine + sameSeries };
            })
            .filter(function (item) { return item.score > 0; })
            .sort(function (a, b) { return b.score - a.score; })
            .slice(0, 4);

        if (!scored.length) return;
        refs.relatedGrid.textContent = '';
        scored.forEach(function (item) {
            refs.relatedGrid.appendChild(R.renderLessonCard(item.lesson));
        });
        refs.related.hidden = false;
    }

    /* ---------------------------------------------------------------- draw */

    function draw(lesson, all) {
        document.title = lesson.title + ' | GDC Lessons';
        var desc = document.querySelector('meta[name="description"]');
        if (desc && lesson.summary) desc.setAttribute('content', lesson.summary);

        refs.title.textContent = lesson.title;
        refs.summary.textContent = lesson.summary;
        refs.crumbTitle.textContent = lesson.title;

        var engineKey = D.isEngineAgnostic(lesson) ? 'all' : lesson.engines[0];
        refs.crumbEngine.textContent = D.engineBadge(lesson);
        refs.crumbEngine.href = 'index.html?engine=' + encodeURIComponent(engineKey);

        refs.gallery.appendChild(R.renderGallery(lesson));
        refs.files.appendChild(R.renderFilesPanel(lesson));

        var progress = setupProgress(lesson);

        refs.article.appendChild(R.renderArticle(lesson, {
            withProgress: true,
            done: progress.done,
            onToggle: progress.toggle
        }));
        progress.update();

        var toc = R.renderToc(lesson);
        if (toc) {
            refs.toc.appendChild(toc);
            setupTocHighlight();
        } else {
            refs.toc.hidden = true;
        }

        buildPager(lesson, all);
        buildRelated(lesson, all);

        refs.loading.hidden = true;
        refs.root.hidden = false;
    }

    /* ---------------------------------------------------------------- init */

    var id = new URLSearchParams(window.location.search).get('id');

    if (!id) {
        showError('No lesson selected',
            'This page needs a lesson id, like lesson.html?id=unity-platformer. ' +
            'Pick one from the lesson list instead.');
        return;
    }

    D.loadLessons().then(function (all) {
        var visible = D.visibleLessons(all);
        var lesson = D.findLesson(all, id);

        if (!lesson) {
            showError('Lesson not found',
                'There is no lesson with the id “' + id + '”. It may have been renamed — ' +
                'browse the full list to find what you were after.');
            return;
        }
        draw(lesson, visible);
    }).catch(function (err) {
        showError('Could not load the lesson',
            err.message + ' — if you opened this file directly, serve the folder over http ' +
            'instead (python3 -m http.server).');
    });
})();
