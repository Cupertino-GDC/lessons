/* ==========================================================================
   browse.js — the MakerWorld-style lesson grid.
   Component sidebar + engine rail + search + sort, all client-side and all
   mirrored into the URL so any filtered view is shareable and the browser
   back button steps through filter changes.
   ========================================================================== */

(function () {
    'use strict';

    var D = window.GDCData;
    var R = window.GDCRender;

    var refs = {
        engineRail: document.querySelector('[data-engine-rail]'),
        componentList: document.querySelector('[data-component-list]'),
        difficultyList: document.querySelector('[data-difficulty-list]'),
        search: document.querySelector('[data-search]'),
        sort: document.querySelector('[data-sort]'),
        grid: document.querySelector('[data-grid]'),
        count: document.querySelector('[data-count]'),
        empty: document.querySelector('[data-empty]'),
        emptyTitle: document.querySelector('[data-empty-title]'),
        emptyBody: document.querySelector('[data-empty-body]'),
        activeFilters: document.querySelector('[data-active-filters]'),
        sidebar: document.querySelector('[data-sidebar]'),
        filterToggle: document.querySelector('[data-filter-toggle]')
    };

    var DEFAULTS = { engine: 'all', component: 'all', difficulty: 'all', q: '', sort: 'featured' };
    var state = Object.assign({}, DEFAULTS);
    var lessons = [];

    /* Curriculum order = the order the club actually teaches them, which is
       the order they appear in lessons.json. */
    var ORIGINAL_INDEX = {};

    /* ------------------------------------------------------------ URL sync */

    function readUrl() {
        var params = new URLSearchParams(window.location.search);
        Object.keys(DEFAULTS).forEach(function (key) {
            var value = params.get(key);
            state[key] = value === null ? DEFAULTS[key] : value;
        });
    }

    function writeUrl(replace) {
        var params = new URLSearchParams();
        Object.keys(DEFAULTS).forEach(function (key) {
            if (state[key] && state[key] !== DEFAULTS[key]) params.set(key, state[key]);
        });
        var query = params.toString();
        var url = window.location.pathname + (query ? '?' + query : '');
        if (replace) {
            window.history.replaceState(null, '', url);
        } else {
            window.history.pushState(null, '', url);
        }
    }

    /* -------------------------------------------------------------- filter */

    function matchesSearch(lesson, query) {
        if (!query) return true;
        var needle = query.toLowerCase();
        var haystack = [
            lesson.title, lesson.summary, lesson.series, lesson.author,
            lesson.tags.join(' '),
            lesson.components.map(D.componentLabel).join(' '),
            D.engineBadge(lesson),
            lesson.files.map(function (f) { return f.name; }).join(' ')
        ].join(' ').toLowerCase();
        return needle.split(/\s+/).every(function (term) {
            return haystack.indexOf(term) !== -1;
        });
    }

    function matchesComponent(lesson, component) {
        return component === 'all' || lesson.components.indexOf(component) !== -1;
    }

    function matchesDifficulty(lesson, difficulty) {
        return difficulty === 'all' || lesson.difficulty === difficulty;
    }

    /* Everything except `skip`, so counts can show what each option WOULD
       yield given the other active filters. */
    function filtered(skip) {
        return lessons.filter(function (lesson) {
            if (skip !== 'engine' && !D.matchesEngine(lesson, state.engine)) return false;
            if (skip !== 'component' && !matchesComponent(lesson, state.component)) return false;
            if (skip !== 'difficulty' && !matchesDifficulty(lesson, state.difficulty)) return false;
            if (skip !== 'q' && !matchesSearch(lesson, state.q)) return false;
            return true;
        });
    }

    var DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

    function sortLessons(list) {
        var sorted = list.slice();
        switch (state.sort) {
            case 'az':
                sorted.sort(function (a, b) { return a.title.localeCompare(b.title); });
                break;
            case 'za':
                sorted.sort(function (a, b) { return b.title.localeCompare(a.title); });
                break;
            case 'difficulty':
                sorted.sort(function (a, b) {
                    return (DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]) ||
                        ORIGINAL_INDEX[a.id] - ORIGINAL_INDEX[b.id];
                });
                break;
            case 'steps':
                sorted.sort(function (a, b) {
                    return (b.stepCount - a.stepCount) || ORIGINAL_INDEX[a.id] - ORIGINAL_INDEX[b.id];
                });
                break;
            case 'duration':
                sorted.sort(function (a, b) {
                    return (a.durationMinutes - b.durationMinutes) ||
                        ORIGINAL_INDEX[a.id] - ORIGINAL_INDEX[b.id];
                });
                break;
            default:
                sorted.sort(function (a, b) { return ORIGINAL_INDEX[a.id] - ORIGINAL_INDEX[b.id]; });
        }
        return sorted;
    }

    /* --------------------------------------------------------------- chrome */

    function buildEngineRail() {
        refs.engineRail.textContent = '';
        D.ENGINES.forEach(function (engine) {
            var btn = R.el('button', 'engine-tab');
            btn.type = 'button';
            btn.setAttribute('role', 'tab');
            btn.dataset.engine = engine.key;
            btn.appendChild(R.icon(engine.icon));
            btn.appendChild(document.createTextNode(' ' + engine.label));
            var count = R.el('span', 'engine-count');
            btn.appendChild(count);
            btn.addEventListener('click', function () {
                state.engine = engine.key;
                apply();
            });
            refs.engineRail.appendChild(btn);
        });
    }

    function buildFilterList(host, options, key, allLabel) {
        host.textContent = '';
        var entries = [{ key: 'all', label: allLabel, icon: 'fa-solid fa-border-all' }].concat(options);
        entries.forEach(function (option) {
            var li = R.el('li');
            var btn = R.el('button', 'filter-option');
            btn.type = 'button';
            btn.dataset.value = option.key;
            btn.dataset.filterKey = key;

            if (option.icon) btn.appendChild(R.icon(option.icon + ' filter-icon'));
            btn.appendChild(R.el('span', 'filter-label', option.label));
            btn.appendChild(R.el('span', 'filter-count'));

            btn.addEventListener('click', function () {
                /* Clicking the active option clears it — MakerWorld behaviour. */
                state[key] = (state[key] === option.key) ? 'all' : option.key;
                apply();
            });
            li.appendChild(btn);
            host.appendChild(li);
        });
    }

    function updateCounts() {
        var forEngine = filtered('engine');
        Array.prototype.forEach.call(refs.engineRail.children, function (btn) {
            var key = btn.dataset.engine;
            var n = forEngine.filter(function (l) { return D.matchesEngine(l, key); }).length;
            btn.querySelector('.engine-count').textContent = n;
            var active = state.engine === key;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
            btn.classList.toggle('is-empty', n === 0);
        });

        var forComponent = filtered('component');
        Array.prototype.forEach.call(refs.componentList.querySelectorAll('.filter-option'), function (btn) {
            var key = btn.dataset.value;
            var n = key === 'all'
                ? forComponent.length
                : forComponent.filter(function (l) { return matchesComponent(l, key); }).length;
            btn.querySelector('.filter-count').textContent = n;
            var active = state.component === key;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.classList.toggle('is-empty', n === 0 && !active);
        });

        var forDifficulty = filtered('difficulty');
        Array.prototype.forEach.call(refs.difficultyList.querySelectorAll('.filter-option'), function (btn) {
            var key = btn.dataset.value;
            var n = key === 'all'
                ? forDifficulty.length
                : forDifficulty.filter(function (l) { return matchesDifficulty(l, key); }).length;
            btn.querySelector('.filter-count').textContent = n;
            var active = state.difficulty === key;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.classList.toggle('is-empty', n === 0 && !active);
        });
    }

    function chipFor(label, onClear) {
        var chip = R.el('button', 'active-chip');
        chip.type = 'button';
        chip.appendChild(document.createTextNode(label));
        chip.appendChild(R.icon('fa-solid fa-xmark'));
        chip.setAttribute('aria-label', 'Remove filter: ' + label);
        chip.addEventListener('click', onClear);
        return chip;
    }

    function updateActiveFilters() {
        refs.activeFilters.textContent = '';
        var any = false;

        if (state.engine !== 'all') {
            any = true;
            refs.activeFilters.appendChild(chipFor(D.engineLabel(state.engine), function () {
                state.engine = 'all'; apply();
            }));
        }
        if (state.component !== 'all') {
            any = true;
            refs.activeFilters.appendChild(chipFor(D.componentLabel(state.component), function () {
                state.component = 'all'; apply();
            }));
        }
        if (state.difficulty !== 'all') {
            any = true;
            refs.activeFilters.appendChild(chipFor(D.difficultyLabel(state.difficulty), function () {
                state.difficulty = 'all'; apply();
            }));
        }
        if (state.q) {
            any = true;
            refs.activeFilters.appendChild(chipFor('“' + state.q + '”', function () {
                state.q = ''; refs.search.value = ''; apply();
            }));
        }

        if (any) {
            var clear = R.el('button', 'active-chip clear-all', 'Clear all');
            clear.type = 'button';
            clear.addEventListener('click', clearAll);
            refs.activeFilters.appendChild(clear);
        }
        refs.activeFilters.hidden = !any;
    }

    function emptyMessage() {
        if (state.component !== 'all') {
            var label = D.componentLabel(state.component);
            var totalForComponent = lessons.filter(function (l) {
                return matchesComponent(l, state.component);
            }).length;
            if (totalForComponent === 0) {
                return {
                    title: 'No ' + label + ' lessons yet',
                    body: 'Nobody has written a ' + label.toLowerCase() + ' lesson for the club yet. ' +
                          'If you know the topic, the lesson editor is one click away — this is the ' +
                          'most obvious gap in the curriculum.'
                };
            }
        }
        return {
            title: 'No lessons match those filters',
            body: 'Try widening the engine or component filter, or clear the search box.'
        };
    }

    function render() {
        var list = sortLessons(filtered());

        refs.grid.textContent = '';
        list.forEach(function (lesson) {
            refs.grid.appendChild(R.renderLessonCard(lesson));
        });

        refs.count.textContent = list.length === lessons.length
            ? 'Showing all ' + list.length + ' lessons'
            : 'Showing ' + list.length + ' of ' + lessons.length + ' lessons';

        var isEmpty = list.length === 0;
        refs.empty.hidden = !isEmpty;
        refs.grid.hidden = isEmpty;
        if (isEmpty) {
            var message = emptyMessage();
            refs.emptyTitle.textContent = message.title;
            refs.emptyBody.textContent = message.body;
        }
    }

    function apply(options) {
        options = options || {};
        updateCounts();
        updateActiveFilters();
        render();
        if (!options.skipUrl) writeUrl(options.replaceUrl);
    }

    function clearAll() {
        Object.assign(state, DEFAULTS);
        refs.search.value = '';
        refs.sort.value = DEFAULTS.sort;
        apply();
    }

    /* ---------------------------------------------------------------- init */

    function bind() {
        var searchTimer = null;
        refs.search.addEventListener('input', function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                state.q = refs.search.value.trim();
                /* Typing shouldn't stack 20 history entries. */
                apply({ replaceUrl: true });
            }, 180);
        });

        refs.sort.addEventListener('change', function () {
            state.sort = refs.sort.value;
            apply();
        });

        document.querySelectorAll('[data-clear-all]').forEach(function (btn) {
            btn.addEventListener('click', clearAll);
        });

        refs.filterToggle.addEventListener('click', function () {
            var open = refs.sidebar.classList.toggle('open');
            refs.filterToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        window.addEventListener('popstate', function () {
            readUrl();
            syncControls();
            apply({ skipUrl: true });
        });
    }

    function syncControls() {
        refs.search.value = state.q;
        refs.sort.value = state.sort;
    }

    D.loadLessons().then(function (all) {
        lessons = D.visibleLessons(all);
        lessons.forEach(function (lesson, index) { ORIGINAL_INDEX[lesson.id] = index; });

        buildEngineRail();
        buildFilterList(refs.componentList, D.COMPONENTS, 'component', 'All components');
        buildFilterList(refs.difficultyList, D.DIFFICULTIES, 'difficulty', 'Any difficulty');

        readUrl();
        syncControls();
        bind();
        apply({ replaceUrl: true });
    }).catch(function (err) {
        refs.grid.textContent = '';
        refs.count.textContent = '';
        refs.empty.hidden = false;
        refs.emptyTitle.textContent = 'Could not load the lesson catalog';
        refs.emptyBody.textContent = err.message +
            ' — if you opened this file directly, serve the folder over http instead ' +
            '(python3 -m http.server).';
    });
})();
