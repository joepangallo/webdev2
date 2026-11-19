# Web Development II — Interactive Course Site

An interactive companion site for **Web Development II (COP3851)**: server-side JavaScript with Node and Express, routing and middleware, REST APIs, cookies, sessions and databases, and authentication & authorization — ending in a full-stack final project.

Built in the same pattern as the Web Development I site: plain HTML, CSS and JavaScript with **no build step**. Open any page in a browser (or serve the folder with any static server) and everything works — quizzes, flashcards, playgrounds and progress tracking included. Progress is stored in the browser's local storage only, and the site loads nothing from third parties: fonts are self-hosted in `assets/fonts/`.

**Live site:** https://joepangallo.github.io/webdev2/

## Contents

| Page | What is in it |
| --- | --- |
| `index.html` | Course hub: module cards, objectives matrix, progress, final-project overview |
| `wk1/` | Week 1 · Node & Express Foundations — runtime, http module, npm, first routes, GET & POST, debugging |
| `wk2/` | Week 2 · Routing, Middleware & REST APIs — parameters, the middleware pipeline, REST design, SPA front ends, routers |
| `wk3/` | Week 3 · State, Persistence & Databases — cookies, sessions, files, MongoDB and MySQL CRUD, validation & configuration |
| `wk4/` | Week 4 · Authentication & Authorization — hashing, login flow, JWTs, roles, security hygiene, capstone walkthrough |
| `audio/` | One narrated audio-companion episode per week (`wk1.mp3` … `wk4.mp3`), linked at the top of each module page |
| `glossary.html` | Every key term, searchable, with flashcard mode |
| `project/` | The final project: milestones, requirements, self-checks and rubric |
| `tools/playground.html` | Full-page code playground (HTML / CSS / JS) |
| `docs/` | Component gallery (`components.html`) and the authoring guide (`AUTHORING.md`) |
| `tests/` | Automated checks for the engine, the content and the pages in a real browser |

## Course objectives

1. Build interactive and dynamic user interfaces utilizing a front-end framework
2. Implement robust server-side logic with a JavaScript runtime for back-end web development
3. Design and implement route processing for efficient handling of HTTP request/response objects
4. Develop and/or apply middleware functions to separate and streamline server-side logic
5. Build and consume RESTful APIs that adhere to industry standards
6. Apply authentication and authorization mechanisms to secure a web application
7. Utilize various state and persistence mechanisms such as cookies, file systems, and databases to ensure data consistency and integrity
8. Integrate relational and/or non-relational databases into a web application that performs common CRUD (Create, Read, Update, Delete) operations

(The wording above is the single source of truth in `assets/js/course.js`; a test keeps the two in step.)

## Honesty note on examples

Every block captioned "Real output" or "Captured run" on the module pages was produced by running the code printed above it (Node 26.13, Express 5.3) and pasting the output verbatim. Samples that were edited after their first capture were run again: Week 2's `rest-api.js` session, Week 3's `session-demo.js`, and Week 3's mysql2 CRUD program (against a MySQL 9.7 server). The original database checks used a real MongoDB 8.2.6 server and MariaDB 10.11 (a MySQL-compatible server) through the official drivers, and the Week 3 result tables match those runs.

Code that was not captured as one run says so where it appears: Week 2's error-handler pattern ("Expected output"), Week 3's MongoDB startup pattern, and Week 4's login, registration and capstone code ("Expected behavior" or "sketch"). The pieces those are assembled from were each run — the login and registration routes against an in-memory user list, for example. The MongoDB startup pattern is the exception: it has been run only as far as its "could not reach the database" path, not against a live server.

## Playground safety

Student code — including code that arrives in a share link or an imported progress file — runs in a sandboxed frame with its own throwaway origin. It cannot read this site's saved progress, change the lesson page, or open windows. Loops are guarded, so a runaway `while (true)` is stopped with a console message instead of freezing the tab.

## Tests

```
npm test
```

Needs Node 22+ and Chrome or Chromium; installs nothing. The suite checks the engine, every quiz and challenge, links, layout at phone width, and keyboard and screen-reader behavior, and it runs on every push. Details are in `docs/AUTHORING.md`.

## Adding lessons

See `docs/AUTHORING.md`. Short version: copy an existing section, keep the manifest in `assets/js/course.js` in sync with the page, give every section at least one interactive element and a short quiz, and run `npm test` before you push.
