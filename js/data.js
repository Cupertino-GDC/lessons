/* ==========================================================================
   data.js — lesson taxonomy, loading and normalization.
   Single source of truth for the shape of a lesson. Used by browse.js,
   lesson.js and editor.js alike.
   ========================================================================== */

(function (global) {
    'use strict';

    var DATA_URL = 'data/lessons.json';

    /* Engine rail (top of the browse page). */
    var ENGINES = [
        { key: 'all', label: 'All Engines', icon: 'fa-solid fa-layer-group' },
        { key: 'unity', label: 'Unity', icon: 'fa-solid fa-cube' },
        { key: 'godot', label: 'Godot', icon: 'fa-solid fa-robot' },
        { key: 'other', label: 'Other', icon: 'fa-solid fa-shapes' }
    ];

    /* Component sidebar (left of the browse page). */
    var COMPONENTS = [
        { key: 'mechanics', label: 'Mechanics', icon: 'fa-solid fa-gamepad' },
        { key: 'art', label: 'Art & Visuals', icon: 'fa-solid fa-palette' },
        { key: 'ui', label: 'UI & UX', icon: 'fa-solid fa-window-maximize' },
        { key: 'audio', label: 'Audio & Music', icon: 'fa-solid fa-music' },
        { key: 'programming', label: 'Programming', icon: 'fa-solid fa-code' },
        { key: 'level-design', label: 'Level Design', icon: 'fa-solid fa-map' },
        { key: 'animation', label: 'Animation & Camera', icon: 'fa-solid fa-film' },
        { key: 'ai', label: 'AI & ML', icon: 'fa-solid fa-brain' },
        { key: 'narrative', label: 'Narrative', icon: 'fa-solid fa-book-open' },
        { key: 'tools', label: 'Tools & Workflow', icon: 'fa-solid fa-screwdriver-wrench' }
    ];

    var DIFFICULTIES = [
        { key: 'beginner', label: 'Beginner' },
        { key: 'intermediate', label: 'Intermediate' },
        { key: 'advanced', label: 'Advanced' }
    ];

    var BLOCK_TYPES = [
        { key: 'text', label: 'Text', icon: 'fa-solid fa-align-left' },
        { key: 'image', label: 'Image', icon: 'fa-solid fa-image' },
        { key: 'code', label: 'Code', icon: 'fa-solid fa-code' },
        { key: 'video', label: 'Video', icon: 'fa-brands fa-youtube' },
        { key: 'callout', label: 'Callout', icon: 'fa-solid fa-lightbulb' },
        { key: 'link-embed', label: 'Link', icon: 'fa-solid fa-link' },
        { key: 'qa', label: 'Q&A', icon: 'fa-solid fa-circle-question' },
        { key: 'download', label: 'Download', icon: 'fa-solid fa-download' }
    ];

    var FILE_ICONS = {
        slides: 'fa-solid fa-file-powerpoint',
        doc: 'fa-solid fa-file-lines',
        video: 'fa-brands fa-youtube',
        code: 'fa-solid fa-file-code',
        zip: 'fa-solid fa-file-zipper',
        unitypackage: 'fa-solid fa-cube',
        image: 'fa-solid fa-file-image',
        audio: 'fa-solid fa-file-audio',
        link: 'fa-solid fa-arrow-up-right-from-square'
    };

    /* ------------------------------------------------------------- helpers */

    function cleanText(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/\s+/g, ' ').trim();
    }

    function asArray(value) {
        if (Array.isArray(value)) return value;
        if (value === null || value === undefined || value === '') return [];
        return [value];
    }

    function slugify(value) {
        return cleanText(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    var byKey = function (list) {
        var map = {};
        list.forEach(function (item) { map[item.key] = item; });
        return map;
    };

    var COMPONENT_MAP = byKey(COMPONENTS);
    var ENGINE_MAP = byKey(ENGINES);
    var DIFFICULTY_MAP = byKey(DIFFICULTIES);

    function componentLabel(key) {
        return (COMPONENT_MAP[key] && COMPONENT_MAP[key].label) || cleanText(key);
    }

    function engineLabel(key) {
        if (!key || key === 'any') return 'Any engine';
        return (ENGINE_MAP[key] && ENGINE_MAP[key].label) || cleanText(key);
    }

    function difficultyLabel(key) {
        return (DIFFICULTY_MAP[key] && DIFFICULTY_MAP[key].label) || cleanText(key);
    }

    /* An engine-agnostic lesson matches EVERY engine tab, not just "Other".
       This is the spec's subtlest rule — see plan/taxonomy. */
    function isEngineAgnostic(lesson) {
        var engines = lesson && lesson.engines;
        return !engines || !engines.length || engines.indexOf('any') !== -1;
    }

    function matchesEngine(lesson, engineKey) {
        if (!engineKey || engineKey === 'all') return true;
        if (isEngineAgnostic(lesson)) return true;
        if (engineKey === 'other') {
            // "Other" holds anything that isn't a first-class engine tab.
            return lesson.engines.some(function (e) {
                return e !== 'unity' && e !== 'godot';
            });
        }
        return lesson.engines.indexOf(engineKey) !== -1;
    }

    function engineBadge(lesson) {
        if (isEngineAgnostic(lesson)) return 'Any engine';
        return lesson.engines.map(engineLabel).join(' · ');
    }

    /* --------------------------------------------------------- word count  */

    function collectText(lesson) {
        var parts = [lesson.summary || ''];
        (lesson.content || []).forEach(function (card) {
            if (card.title) parts.push(card.title);
            (card.figures || []).forEach(function (figure) {
                ['text', 'caption', 'question', 'answer', 'quote', 'description', 'label']
                    .forEach(function (field) {
                        if (figure[field]) parts.push(figure[field]);
                    });
                if (Array.isArray(figure.items)) parts.push(figure.items.join(' '));
                if (figure.code) parts.push(figure.code);
            });
        });
        return parts.join(' ').replace(/\s+/g, ' ').trim();
    }

    /* 220 wpm, matching estimateBlogBuilderReadMinutes in the magmalabs
       builder, with a floor so a slides-only lesson still reads sensibly. */
    function estimateDuration(lesson) {
        var text = collectText(lesson);
        var words = text ? text.split(' ').filter(Boolean).length : 0;
        var fromText = words ? Math.ceil(words / 220) : 0;
        var fromSteps = (lesson.files || []).length * 8;
        return Math.max(5, fromText + fromSteps);
    }

    /* ------------------------------------------------------- normalization */

    function normalizeFigure(figure) {
        if (!figure || typeof figure !== 'object') return null;
        var out = {};
        Object.keys(figure).forEach(function (key) {
            var value = figure[key];
            if (Array.isArray(value)) {
                out[key] = value.map(function (v) {
                    return typeof v === 'string' ? cleanText(v) : v;
                }).filter(function (v) { return v !== ''; });
            } else if (key === 'code') {
                out[key] = String(value == null ? '' : value);
            } else if (typeof value === 'string') {
                out[key] = value.trim();
            } else {
                out[key] = value;
            }
        });
        return out;
    }

    function normalizeCard(card) {
        if (!card || typeof card !== 'object') return null;
        var type = cleanText(card.type) || 'text';
        var figures = asArray(card.figures).map(normalizeFigure).filter(Boolean);
        if (!figures.length) return null;
        var out = { type: type, figures: figures };
        if (card.title) out.title = cleanText(card.title);
        if (card.layout) out.layout = cleanText(card.layout);
        return out;
    }

    function normalizeFile(file, index) {
        if (!file || typeof file !== 'object') return null;
        var kind = file.kind === 'repo' ? 'repo' : 'link';
        var name = cleanText(file.name) || ('File ' + (index + 1));
        var out = {
            kind: kind,
            name: name,
            icon: cleanText(file.icon) || (kind === 'repo' ? 'zip' : 'link'),
            source: cleanText(file.source) || ''
        };
        if (kind === 'repo') {
            out.path = cleanText(file.path);
            out.size = cleanText(file.size);
        } else {
            out.url = cleanText(file.url);
        }
        if (!out.path && !out.url) return null;
        return out;
    }

    function normalizeMedia(item) {
        if (!item || typeof item !== 'object') return null;
        var src = cleanText(item.src);
        if (!src) return null;
        return {
            type: item.type === 'video' ? 'video' : 'image',
            src: src,
            alt: cleanText(item.alt),
            caption: cleanText(item.caption)
        };
    }

    function normalizeLesson(raw) {
        if (!raw || typeof raw !== 'object') return null;

        var id = slugify(raw.id || raw.title);
        if (!id) return null;

        var engines = asArray(raw.engines).map(slugify).filter(Boolean);
        var components = asArray(raw.components).map(slugify)
            .filter(function (c) { return !!COMPONENT_MAP[c]; });

        var lesson = {
            id: id,
            visibility: raw.visibility !== false,
            title: cleanText(raw.title) || id,
            summary: cleanText(raw.summary),
            engines: engines,
            components: components,
            difficulty: DIFFICULTY_MAP[raw.difficulty] ? raw.difficulty : 'beginner',
            series: cleanText(raw.series),
            thumbnail: cleanText(raw.thumbnail),
            author: cleanText(raw.author) || 'GDC Officers',
            writtenAt: cleanText(raw.writtenAt),
            updatedAt: cleanText(raw.updatedAt),
            tags: asArray(raw.tags).map(cleanText).filter(Boolean),
            media: asArray(raw.media).map(normalizeMedia).filter(Boolean),
            files: asArray(raw.files).map(normalizeFile).filter(Boolean),
            content: asArray(raw.content).map(normalizeCard).filter(Boolean)
        };

        /* Fall back to the thumbnail so the gallery is never empty. */
        if (!lesson.media.length && lesson.thumbnail) {
            lesson.media = [{ type: 'image', src: lesson.thumbnail, alt: lesson.title, caption: '' }];
        }

        var declared = Number(raw.durationMinutes);
        lesson.durationMinutes = declared > 0 ? Math.round(declared) : estimateDuration(lesson);
        lesson.stepCount = lesson.files.length ||
            lesson.content.filter(function (c) { return c.title; }).length;

        return lesson;
    }

    /* --------------------------------------------------------------- load  */

    var cache = null;

    function loadLessons() {
        if (cache) return Promise.resolve(cache);
        return fetch(DATA_URL, { cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Failed to load ' + DATA_URL + ' (' + response.status + ')');
                }
                return response.json();
            })
            .then(function (doc) {
                var list = Array.isArray(doc && doc.lessons) ? doc.lessons : [];
                cache = list.map(normalizeLesson).filter(Boolean);
                return cache;
            });
    }

    function visibleLessons(lessons) {
        return lessons.filter(function (l) { return l.visibility; });
    }

    function findLesson(lessons, id) {
        var key = slugify(id);
        return lessons.filter(function (l) { return l.id === key; })[0] || null;
    }

    /* --------------------------------------------------- progress storage  */

    var PROGRESS_PREFIX = 'gdc-lesson-progress:';

    function readProgress(lessonId) {
        try {
            var raw = window.localStorage.getItem(PROGRESS_PREFIX + lessonId);
            var parsed = raw ? JSON.parse(raw) : null;
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            return [];
        }
    }

    function writeProgress(lessonId, doneKeys) {
        try {
            if (!doneKeys || !doneKeys.length) {
                window.localStorage.removeItem(PROGRESS_PREFIX + lessonId);
            } else {
                window.localStorage.setItem(PROGRESS_PREFIX + lessonId, JSON.stringify(doneKeys));
            }
        } catch (err) {
            /* Private windows and blocked site data throw — degrade silently. */
        }
    }

    function progressFor(lesson) {
        var total = lesson.content.filter(function (c) { return c.title; }).length;
        if (!total) return { done: 0, total: 0, complete: false, ratio: 0 };
        var done = readProgress(lesson.id).length;
        if (done > total) done = total;
        return { done: done, total: total, complete: done >= total, ratio: done / total };
    }

    global.GDCData = {
        ENGINES: ENGINES,
        COMPONENTS: COMPONENTS,
        DIFFICULTIES: DIFFICULTIES,
        BLOCK_TYPES: BLOCK_TYPES,
        FILE_ICONS: FILE_ICONS,
        cleanText: cleanText,
        slugify: slugify,
        asArray: asArray,
        componentLabel: componentLabel,
        engineLabel: engineLabel,
        difficultyLabel: difficultyLabel,
        isEngineAgnostic: isEngineAgnostic,
        matchesEngine: matchesEngine,
        engineBadge: engineBadge,
        estimateDuration: estimateDuration,
        normalizeLesson: normalizeLesson,
        loadLessons: loadLessons,
        visibleLessons: visibleLessons,
        findLesson: findLesson,
        readProgress: readProgress,
        writeProgress: writeProgress,
        progressFor: progressFor
    };
})(window);
