# B3 Smoke Matrix — Jolly Phonics unit pages
Generated: 2026-08-23T08:56:59.451737Z by phaseB2 agent (Step 5)

Page checks validate content-type AND body (`<div id="root">` present) so the
nginx SPA-fallback cannot fake a PASS. API checks go DIRECT to :8484 (JSON
`success`/`data` shape required) and cannot be spoofed either.

| Unit | Lesson | Page (code/type) | Page body | Game config API | Scenes API shape | Scenes content | Served template |
|---|---|---|---|---|---|---|---|
| u1 | `lesson-jp-u1-tap` | 200/text/html | PASS | PASS | PASS | no content yet | tap-recognition |
| u1 | `lesson-jp-u1-match` | 200/text/html | PASS | PASS | PASS | no content yet | matching |
| u1 | `lesson-jp-u1-sort` | 200/text/html | PASS | PASS | PASS | no content yet | drag-sort |
| u2 | `lesson-jp-u2-tap` | 200/text/html | PASS | PASS | PASS | no content yet | tap-recognition |
| u2 | `lesson-jp-u2-match` | 200/text/html | PASS | PASS | PASS | no content yet | matching |
| u2 | `lesson-jp-u2-sort` | 200/text/html | PASS | PASS | PASS | no content yet | drag-sort |
| u3 | `lesson-jp-u3-tap` | 200/text/html | PASS | PASS | PASS | no content yet | tap-recognition |
| u3 | `lesson-jp-u3-quiz` | 200/text/html | PASS | PASS | PASS | no content yet | quiz |
| u3 | `lesson-jp-u3-sort` | 200/text/html | PASS | PASS | PASS | no content yet | drag-sort |
| u4 | `lesson-jp-u4-fib` | 200/text/html | PASS | PASS | PASS | no content yet | fill-in-blank |
| u4 | `lesson-jp-u4-quiz-aff` | 200/text/html | PASS | PASS | PASS | no content yet | quiz |
| u4 | `lesson-jp-u4-sort-chsh` | 200/text/html | PASS | PASS | PASS | no content yet | drag-sort |
| u5 | `lesson-jp-u5-quiz-riddle` | 200/text/html | PASS | PASS | PASS | no content yet | quiz |
| u5 | `lesson-jp-u5-fib` | 200/text/html | PASS | PASS | PASS | no content yet | fill-in-blank |
| u5 | `lesson-jp-u5-sort-patterns` | 200/text/html | PASS | PASS | PASS | no content yet | drag-sort |

**Totals:** pages 15/15 pass · APIs 15/15 fully pass
