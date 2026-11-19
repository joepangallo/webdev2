# Web Development II — Interactive Course Site

An interactive companion site for **Web Development II (COP3851)**: server-side JavaScript with Node and Express, routing and middleware, REST APIs, cookies, sessions and databases, and authentication & authorization — ending in a full-stack final project.

Built in the same pattern as the Web Development I site: plain HTML, CSS and JavaScript with **no build step**. Open any page in a browser (or serve the folder with any static server) and everything works — quizzes, flashcards, playgrounds and progress tracking included. Progress is stored in the browser's local storage only.

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

## Course objectives

1. Develop user interfaces using a front-end framework.
2. Develop server-side logic using a JavaScript runtime environment.
3. Construct route processing for client requests and server responses.
4. Develop middleware as part of a web application.
5. Develop RESTful application programming interfaces (APIs).
6. Develop authentication and authorization for a web application.
7. Manage state and persistence using cookies, file systems and databases.
8. Integrate relational and non-relational databases to perform create, read, update and delete (CRUD) operations.

## Honesty note on examples

Every server example on the module pages was actually run during the site's construction (Node 26, Express 5) and its output captured verbatim. The database examples were verified the same way in a final check: the MongoDB operations against a real MongoDB 8.2.6 server, and the MySQL statements against MariaDB 10.11 (a MySQL-compatible server) through the mysql2 driver — the Week 3 result blocks match those runs. The one block still labeled "Expected output" (Week 2's generic error-handler pattern) describes a standard shape rather than a specific capture, and says so.

## Adding lessons

See `docs/AUTHORING.md`. Short version: copy an existing section, keep the manifest in `assets/js/course.js` in sync with the page, and give every section at least one interactive element and a short quiz.
