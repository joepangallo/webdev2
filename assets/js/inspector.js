/* ==========================================================================
   Web Development II: interactive line-by-line code inspector
   Modeled after the iOS Development course's five-part (Who / What / Where /
   When / Why) line inspector and clickable glossary chips.
   ========================================================================== */
(function () {
  'use strict';

  const WD1 = (window.WD1 = window.WD1 || {});
  const { h, $, $$, esc } = WD1;

  /* ---------- Web Dev II code term glossary (for clickable line chips) ---------- */

  const GLOSSARY = {
    // JS & Node runtime
    const: 'Declares a constant binding that cannot be reassigned to a different value (objects/arrays inside can still be mutated).',
    let: 'Declares a block-scoped variable whose value can be reassigned later.',
    function: 'Declares a reusable named block of code that accepts inputs (parameters) and optionally returns a value.',
    return: 'Stops running the current function immediately and hands a value back to whoever called it.',
    async: 'Marks a function as asynchronous so it always returns a Promise and can pause at await without blocking other visitors.',
    await: 'Pauses only the current async function until a Promise finishes (such as a database query or fetch), freeing Node or the browser to keep working.',
    try: 'Starts a protected block of code whose thrown errors are caught by the matching catch block instead of crashing the program.',
    catch: 'Runs only when an error is thrown inside the preceding try block, letting you handle the problem cleanly.',
    throw: 'Raises an error intentionally and jumps straight to the nearest catch block (or Express error middleware).',
    require: 'Node.js CommonJS function that loads a core module (http, fs, crypto), an npm package (express), or one of your own files (./format).',
    'module.exports': 'The value a Node file shares with any other file that loads it with require().',
    process: 'Global Node.js object representing the running server program — exposes process.env, process.version, process.cwd(), and process.exit().',
    'process.env': 'Reads configuration and secrets from environment variables outside your source code so secrets never land in Git.',
    Buffer: 'Node class for working with raw binary bytes — used by crypto for random salts, hashes, and timing-safe comparisons.',
    setTimeout: 'Schedules a callback to run after a delay once the current synchronous call stack finishes (demonstrating the event loop).',
    'console.log': 'Writes a message to the terminal (in Node) or DevTools Console (in the browser) for inspection and debugging.',
    'console.error': 'Writes an error message to standard error (stderr) or DevTools so failures stand out from normal logs.',
    JSON: 'JavaScript Object Notation: JSON.stringify() turns an object into text for the wire; JSON.parse() turns JSON text back into an object.',

    // HTTP & Express
    http: 'Node.js built-in module for creating low-level HTTP servers with http.createServer() without installing any external package.',
    express: 'Minimal web framework for Node.js that handles routing, middleware pipelines, JSON/form parsing, and response helpers cleanly.',
    Router: 'express.Router() groups related routes (such as all /api/books endpoints) into a mini-app in its own file.',
    'app.use': 'Registers a middleware function or mounts a Router in the Express pipeline — order matters because middleware runs top to bottom.',
    'app.get': 'Registers a route handler that answers HTTP GET requests (reading data or pages) at a specific path.',
    'app.post': 'Registers a route handler that answers HTTP POST requests (creating data or submitting forms) with a request body.',
    'app.put': 'Registers a route handler that answers HTTP PUT requests (replacing or updating an existing resource by ID).',
    'app.delete': 'Registers a route handler that answers HTTP DELETE requests (removing an existing resource by ID).',
    'app.listen': 'Binds the Express server to a network port (such as 3000) and starts waiting for incoming HTTP requests.',
    'req.params': 'Object holding dynamic URL path parameters declared with a colon, like :id in /api/books/:id (always strings until converted).',
    'req.query': 'Object holding URL query string options after ?, like ?sort=newest&limit=5.',
    'req.body': 'Parsed payload sent in a POST or PUT request — stays undefined until express.json() or express.urlencoded() runs first.',
    'req.headers': 'Lowercased map of incoming HTTP request headers such as cookie, authorization, content-type, and x-token.',
    'req.session': 'Visitor-specific server-side data object managed by express-session, linked to the browser via a signed cookie ID.',
    'res.status': 'Sets the three-digit HTTP status code (200, 201, 204, 400, 401, 403, 404, 500) before sending the response.',
    'res.json': 'Sets Content-Type: application/json, converts a JS object to JSON text, and sends the response.',
    'res.send': 'Sends a response body (HTML string by default, or plain text/JSON) and ends the HTTP response.',
    'res.redirect': 'Sends a 302 redirect response with a Location header telling the browser to navigate to another URL.',
    'res.cookie': 'Adds a Set-Cookie response header asking the browser to save a name=value cookie and send it back on later requests.',
    'res.clearCookie': 'Sends an expired Set-Cookie header telling the browser to delete that cookie immediately.',
    next: 'Callback passed into middleware; calling next() forwards the request to the next station, and next(err) jumps straight to error middleware.',
    morgan: 'Third-party Express logging middleware that prints method, URL, status code, response time, and byte size for every request.',
    'express.static': 'Built-in Express middleware that serves static files (HTML, CSS, client JS, images) straight from a folder such as public/.',
    'express.json': 'Built-in Express middleware that parses incoming application/json request bodies into req.body.',
    'express.urlencoded': 'Built-in Express middleware that parses HTML form submissions (application/x-www-form-urlencoded) into req.body.',

    // Persistence, MongoDB, SQL & Security
    fs: 'Node.js File System module for reading and writing files on disk (sync methods block the thread; callbacks or fs/promises do not).',
    HttpOnly: 'Cookie flag that prevents browser JavaScript (document.cookie) from reading the cookie, protecting session IDs against XSS.',
    SameSite: 'Cookie flag (Lax/Strict) controlling whether cookies travel on cross-site requests, defending against CSRF attacks.',
    MongoClient: 'Official MongoDB driver class that opens and pools connections to a MongoDB server.',
    ObjectId: 'MongoDB 24-hex-character unique document identifier (_id); passing malformed text throws a BSONError so routes can reply 400.',
    insertOne: 'MongoDB collection method that inserts one new document and returns its generated insertedId.',
    findOne: 'MongoDB collection method that returns the first matching document, or null if none matches.',
    updateOne: 'MongoDB collection method that updates the first matching document (use $set so only specified fields change).',
    deleteOne: 'MongoDB collection method that deletes the first matching document and reports deletedCount.',
    $set: 'MongoDB update operator that modifies only the listed fields instead of overwriting the whole document.',
    mysql2: 'MySQL database driver for Node.js (mysql2/promise supports async/await and parameterized ? queries).',
    createPool: 'Creates a reusable pool of database connections so many concurrent HTTP requests share connections efficiently.',
    execute: 'Runs a parameterized SQL query where ? placeholders bind user values strictly as data, preventing SQL injection.',
    'CREATE TABLE': 'SQL Data Definition statement that defines a relational table’s columns, data types, and integrity constraints.',
    'PRIMARY KEY': 'SQL constraint guaranteeing that a column uniquely identifies every row and can never be NULL.',
    'FOREIGN KEY': 'SQL constraint linking a column in one table to the PRIMARY KEY of another table so broken references are rejected.',
    'AUTO_INCREMENT': 'Tells the relational database to assign the next sequential integer ID automatically on every INSERT.',
    SELECT: 'SQL query that reads rows and columns from one or more tables.',
    INSERT: 'SQL command that adds one or more new rows into a table.',
    UPDATE: 'SQL command that modifies existing rows matching a WHERE condition (always include WHERE!).',
    DELETE: 'SQL command that removes rows matching a WHERE condition (without WHERE it deletes every row!).',
    JOIN: 'Combines rows from two relational tables by matching a foreign key to its referenced primary key.',
    WHERE: 'Filters which rows a SELECT, UPDATE, or DELETE statement affects.',
    crypto: 'Node.js built-in cryptographic module providing randomBytes, scrypt/scryptSync password hashing, HMAC, and timingSafeEqual.',
    scryptSync: 'Memory-hard password hashing function that turns a password + random salt into a slow one-way hash.',
    timingSafeEqual: 'Compares two equal-length buffers in constant time so attackers cannot guess a hash or signature byte by byte.',
    randomBytes: 'Generates cryptographically strong random bytes for salts, session secrets, and signing keys.',
    jwt: 'JSON Web Token library (jsonwebtoken): jwt.sign() creates a signed 3-part token and jwt.verify() checks its signature and expiry.',
    Bearer: 'HTTP Authorization scheme ("Authorization: Bearer <token>") used to carry a JWT on API requests.',
    rateLimit: 'Middleware (express-rate-limit) that caps how many requests an IP can make in a time window, returning 429 Too Many Requests.',

    // Browser HTML / CSS / DOM / Fetch / Vue
    fetch: 'Browser API for making HTTP requests from JavaScript without reloading the page; returns a Promise resolving to a Response.',
    document: 'Browser DOM root object representing the live HTML page (exists ONLY in browsers, never in Node.js).',
    querySelector: 'Finds the first HTML element matching a CSS selector so browser JS can read or update it.',
    addEventListener: 'Registers a function in the browser to run whenever a user event (click, submit, input) happens on an element.',
    preventDefault: 'Stops the browser’s default behavior (such as a form reloading the whole page) so JavaScript can handle it with fetch().',
    textContent: 'Safely sets or reads an element’s plain text — never parses HTML tags, making it the primary defense against XSS.',
    innerHTML: 'Parses a string as live HTML markup inside an element — dangerous with untrusted user input because it enables XSS.',
    form: 'HTML <form> element that collects named user inputs and submits them via its method (GET/POST) to its action URL.',
    action: 'HTML form attribute specifying the server URL path where the browser sends the submitted form data.',
    method: 'HTTP verb (GET, POST, PUT, DELETE) describing the intent of a request or HTML form submission.',
    defer: 'Script attribute that downloads browser JS in parallel and waits to run it until the HTML DOM is parsed.',
    'aria-live': 'Accessibility attribute telling screen readers to announce dynamic status text updates automatically.',
    flex: 'CSS Flexbox layout (display: flex) arranging child elements along a single horizontal or vertical axis.',
    grid: 'CSS Grid layout (display: grid) arranging child elements into explicit two-dimensional rows and columns.',
    'v-model': 'Vue directive creating two-way binding between an HTML input field and reactive component state.',
    'v-for': 'Vue directive that repeats an HTML element once for every item in an array.'
  };

  const PARTS = [
    ['who', 'Who', 'Which part of the system acts on this line'],
    ['what', 'What', 'What this line actually does'],
    ['where', 'Where', 'Where it lives or runs'],
    ['when', 'When', 'When it runs'],
    ['why', 'Why', 'Why it is written this way']
  ];

  /* ---------- Safe span-balanced HTML line splitter ---------- */

  function splitHighlightedLines(html) {
    const lines = [];
    let cur = '';
    const stack = [];
    const tokens = html.split(/(<span\b[^>]*>|<\/span>|\n)/g);
    for (const tok of tokens) {
      if (tok === '\n') {
        lines.push(cur + '</span>'.repeat(stack.length));
        cur = stack.join('');
      } else if (tok.startsWith('<span')) {
        stack.push(tok);
        cur += tok;
      } else if (tok === '</span>') {
        stack.pop();
        cur += tok;
      } else {
        cur += tok;
      }
    }
    lines.push(cur + '</span>'.repeat(stack.length));
    return lines;
  }

  /* ---------- Comment stripping & extraction ---------- */

  function splitJsComment(line) {
    let inStr = null, escNext = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (escNext) { escNext = false; continue; }
      if (inStr) {
        if (c === '\\') escNext = true;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '/' && line[i + 1] === '/') {
        return { code: line.slice(0, i).trim(), comment: line.slice(i + 2).trim() };
      }
      if (c === '/' && line[i + 1] === '*') {
        const end = line.indexOf('*/', i + 2);
        if (end >= 0) {
          const code = (line.slice(0, i) + line.slice(end + 2)).trim();
          return { code, comment: line.slice(i + 2, end).trim() };
        }
      }
    }
    return { code: line.trim(), comment: '' };
  }

  function splitLineComment(line, lang) {
    const t = line.trim();
    if (!t) return { code: '', comment: '' };
    if (lang === 'js' || lang === 'javascript') return splitJsComment(line);
    if (lang === 'css') {
      const m = line.match(/\/\*([\s\S]*?)\*\//);
      if (m) return { code: line.replace(/\/\*[\s\S]*?\*\//g, '').trim(), comment: m[1].trim() };
      return { code: t, comment: '' };
    }
    if (lang === 'html' || lang === 'xml') {
      const m = line.match(/<!--([\s\S]*?)-->/);
      if (m) return { code: line.replace(/<!--[\s\S]*?-->/g, '').trim(), comment: m[1].trim() };
      return { code: t, comment: '' };
    }
    if (lang === 'sql') {
      let inStr = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "'") inStr = !inStr;
        if (!inStr && line[i] === '-' && line[i + 1] === '-') {
          return { code: line.slice(0, i).trim(), comment: line.slice(i + 2).trim() };
        }
      }
      return { code: t, comment: '' };
    }
    if (lang === 'text' && t.startsWith('#')) return { code: '', comment: t.slice(1).trim() };
    return { code: t, comment: '' };
  }

  /* ---------- Context & scope tracker across the whole code block ---------- */

  function detectRuntimeContext(lines, lang, title) {
    const joined = lines.join('\n');
    const ttl = (title || '').toLowerCase();
    if (lang === 'html') return 'browser-html';
    if (lang === 'css') return 'browser-css';
    if (lang === 'sql') return 'database-sql';
    if (lang === 'json') return /"dependencies"|"scripts"|"main"/.test(joined) ? 'npm-json' : 'api-json';
    if (lang === 'text') {
      if (/^(?:GET|POST|PUT|DELETE|PATCH)\s+\//.test(joined.trim())) return 'http-req';
      if (/^HTTP\/\d/.test(joined.trim())) return 'http-res';
      if (/^(?:npm|node|curl)\b/m.test(joined)) return 'terminal';
      if (/^[A-Z0-9_]+=/m.test(joined)) return 'env';
      if (/node_modules\/|\.env/.test(joined)) return 'gitignore';
      return 'text';
    }
    // JavaScript: distinguish Browser Client vs Node/Express Server
    const serverSignals = /\brequire\(|module\.exports|\bapp\.(?:get|post|put|delete|patch|use|listen)|\brouter\.(?:get|post|put|delete|use)|\bhttp\.createServer|\bprocess\.|\bexpress\b|\bres\.(?:send|json|status|cookie|redirect|writeHead|end)|\breq\.(?:params|query|body|session|headers)|\bpool\.execute|\bMongoClient|\bObjectId|\bmysql\b|\bscrypt|\bjwt\./;
    const clientSignals = /\bdocument\.|\bwindow\.|\bfetch\(|\baddEventListener|\bFormData|\bcreateApp|\bVue\.|\blocalStorage\b/;
    if (ttl.includes('browser') || ttl.includes('client') || ttl.includes('public/') || ttl.includes('vue') || ttl.includes('spa')) {
      if (!serverSignals.test(joined)) return 'browser-js';
    }
    if (serverSignals.test(joined) || ttl.includes('server') || ttl.includes('express') || ttl.includes('node') || ttl.includes('routes/')) {
      return 'server-js';
    }
    if (clientSignals.test(joined)) return 'browser-js';
    return 'server-js';
  }

  function findOpenerLine(lines, idx, lang) {
    const raw = splitLineComment(lines[idx], lang).code;
    if (lang === 'html') {
      const m = raw.match(/^<\/([a-zA-Z][\w-]*)>/);
      if (!m) return -1;
      const tag = m[1].toLowerCase();
      let depth = 0;
      for (let i = idx - 1; i >= 0; i--) {
        const c = splitLineComment(lines[i], 'html').code;
        if (new RegExp(`<\\/${tag}\\b`, 'i').test(c)) depth++;
        if (new RegExp(`<${tag}\\b(?![^>]*\\/>)`, 'i').test(c) && !new RegExp(`<\\/${tag}>`, 'i').test(c)) {
          if (depth === 0) return i;
          depth--;
        }
      }
      return -1;
    }
    let depth = 0;
    for (let i = idx - 1; i >= 0; i--) {
      const s = splitLineComment(lines[i], lang).code;
      for (let k = s.length - 1; k >= 0; k--) {
        const ch = s[k];
        if (ch === '}' || ch === ')' || ch === ']') depth++;
        else if (ch === '{' || ch === '(' || ch === '[') {
          if (depth === 0) return i;
          depth--;
        }
      }
    }
    return -1;
  }

  function buildScopeMap(lines, lang) {
    const scopes = [];
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      const { code } = splitLineComment(lines[i], lang);
      // Record scope BEFORE pushing new scope if line closes one first
      if (/^[\}\)\]]/.test(code) && stack.length) stack.pop();
      if (lang === 'html' && /^<\//.test(code) && stack.length) stack.pop();
      scopes.push(stack.length ? stack[stack.length - 1] : null);

      if (lang === 'js' || lang === 'javascript') {
        const opens = (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;
        if (opens > 0) {
          let label = null;
          let m;
          if ((m = code.match(/\b(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/))) {
            label = `the ${m[1].toUpperCase()} ${m[2]} route handler (opened on line ${i + 1})`;
          } else if (/\b(?:app|router)\.use\s*\(/.test(code)) {
            label = `an Express middleware function (opened on line ${i + 1})`;
          } else if (/\bhttp\.createServer\s*\(/.test(code)) {
            label = `the raw Node HTTP request listener (opened on line ${i + 1})`;
          } else if ((m = code.match(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/))) {
            label = `function ${m[1]}() (opened on line ${i + 1})`;
          } else if (/\btry\s*\{/.test(code)) {
            label = `a try { ... } error-handling block (opened on line ${i + 1})`;
          } else if (/\bcatch\b/.test(code)) {
            label = `the catch error-recovery block (opened on line ${i + 1})`;
          } else if (/\baddEventListener\s*\(\s*['"]([^'"]+)['"]/.test(code)) {
            label = `the "${RegExp.$1}" browser event handler (opened on line ${i + 1})`;
          } else if (/\bif\s*\(/.test(code)) {
            label = `an if (...) conditional branch (opened on line ${i + 1})`;
          } else if (/\belse\b/.test(code)) {
            label = `the else fallback branch (opened on line ${i + 1})`;
          } else if (/\b(?:for|while)\s*\(/.test(code)) {
            label = `a loop body (opened on line ${i + 1})`;
          } else {
            label = `the block opened on line ${i + 1}`;
          }
          for (let k = 0; k < opens; k++) stack.push(label);
        }
      } else if (lang === 'css') {
        if (code.includes('{') && !code.includes('}')) {
          const sel = code.split('{')[0].trim();
          stack.push(`the "${sel}" CSS rule (opened on line ${i + 1})`);
        }
      } else if (lang === 'html') {
        const m = code.match(/^<([a-zA-Z][\w-]*)[^>]*>$/);
        const voidTag = /^<(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr|!doctype)\b/i;
        if (m && !voidTag.test(code) && !code.includes(`</${m[1]}`)) {
          stack.push(`inside the <${m[1]}> element (opened on line ${i + 1})`);
        }
      } else if (lang === 'sql') {
        const m = code.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)/i);
        if (m && code.includes('(') && !code.includes(');')) {
          stack.push(`the CREATE TABLE ${m[1]} schema definition (opened on line ${i + 1})`);
        } else if (/\);\s*$/.test(code) && stack.length) {
          stack.pop();
        }
      }
    }
    return scopes;
  }

  /* ---------- Glossary term extraction on a line ---------- */

  function termsInLine(rawLine, lang) {
    const { code } = splitLineComment(rawLine, lang);
    const found = [];
    const add = (k) => { if (Object.prototype.hasOwnProperty.call(GLOSSARY, k) && !found.includes(k)) found.push(k); };
    // Multi-word / dotted terms first
    const special = [
      'module.exports', 'process.env', 'console.log', 'console.error',
      'app.use', 'app.get', 'app.post', 'app.put', 'app.delete', 'app.listen',
      'req.params', 'req.query', 'req.body', 'req.headers', 'req.session',
      'res.status', 'res.json', 'res.send', 'res.redirect', 'res.cookie', 'res.clearCookie',
      'express.static', 'express.json', 'express.urlencoded',
      'CREATE TABLE', 'PRIMARY KEY', 'FOREIGN KEY', 'AUTO_INCREMENT',
      'aria-live', 'v-model', 'v-for'
    ];
    special.forEach((s) => {
      if (new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), lang === 'sql' ? 'i' : '').test(code)) add(s);
    });
    // Single tokens
    const words = code.match(/\$?[A-Za-z_][\w-]*/g) || [];
    words.forEach((w) => {
      add(w);
      if (lang === 'sql') add(w.toUpperCase());
      if (w === 'httpOnly') add('HttpOnly');
      if (w === 'sameSite') add('SameSite');
      if (w === 'mysql') add('mysql2');
    });
    return found.slice(0, 8);
  }

  /* ---------- Language-specific 5-part line explainers ---------- */

  function mergeNote(base, comment) {
    if (!comment) return base;
    const clean = comment.replace(/[.]+$/, '');
    // Avoid duplicating if base.what already mentions it
    const what = base.what.toLowerCase().includes(clean.toLowerCase().slice(0, 24))
      ? base.what
      : `${base.what} Author’s note: ${clean}.`;
    return Object.assign({}, base, { what });
  }

  function explainJS(code, ctx, scope, title) {
    const isClient = ctx === 'browser-js';
    const where = scope ? `Inside ${scope}.` : (isClient ? 'Top-level browser JavaScript (runs inside the visitor’s page).' : 'Top-level Node.js server code in this module.');
    const runtimeWho = isClient ? 'The browser’s JavaScript engine (running in the visitor’s tab).' : 'Node.js (running on your server, private from browsers).';
    const defaultWhen = scope && /route handler|middleware|request listener/.test(scope)
      ? 'Each time a matching HTTP request reaches this point in the handler.'
      : scope && /event handler/.test(scope)
      ? 'Whenever the user triggers that event in the browser.'
      : scope && /catch/.test(scope)
      ? 'Only when an exception is thrown inside the matching try block.'
      : scope && /function /.test(scope)
      ? 'Each time this helper function is called.'
      : (isClient ? 'Once when the browser loads and executes this script.' : 'Once at server startup when Node loads the file.');

    let m;
    if ((m = code.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/))) {
      const mod = m[1];
      const kind = mod.startsWith('.') ? 'your own local file module' : ['http', 'fs', 'fs/promises', 'path', 'os', 'crypto', 'util'].includes(mod) ? 'a built-in Node.js core module (no npm install needed)' : 'an installed npm package from node_modules/';
      return {
        who: 'Node.js module loader (CommonJS require).',
        what: `Loads "${mod}" (${kind}) and binds its exported functions or objects to a local constant.`,
        where,
        when: 'Once at startup when Node executes this file; Node caches the module so later requires reuse it.',
        why: 'Separating built-in libraries, npm packages, and your own files keeps each module small, testable, and reusable.'
      };
    }
    if (/^module\.exports\s*=/.test(code)) {
      return {
        who: 'Node.js module system.',
        what: `Exports ${code.replace(/^module\.exports\s*=\s*/, '').replace(/;$/, '')} so other files can import it via require().`,
        where: 'Usually the last line of a reusable Node module or Express router file.',
        when: 'Once when another file calls require() on this file.',
        why: 'Anything not attached to module.exports stays private to this file, preventing accidental name collisions.'
      };
    }
    if (/=\s*express\s*\(\s*\)/.test(code)) {
      return {
        who: 'The Express framework factory function.',
        what: 'Creates your Express application instance (app), which holds your middleware stack and route table.',
        where,
        when: 'Once at server startup, before registering middleware or routes.',
        why: 'Every app.use(), app.get(), app.post(), and app.listen() call attaches behavior onto this central app object.'
      };
    }
    if (/express\.Router\s*\(\s*\)/.test(code)) {
      return {
        who: 'Express Router factory.',
        what: 'Creates a mini-app Router that groups related routes (such as /api/books) in their own file.',
        where,
        when: 'Once when this router file is loaded by app.js.',
        why: 'Splitting routes into separate router files keeps app.js clean as an application grows.'
      };
    }
    if (/express\.json\s*\(/.test(code)) {
      return {
        who: 'Express built-in JSON body-parsing middleware.',
        what: 'Registers a translator that reads incoming application/json request bodies and turns them into a JavaScript object on req.body.',
        where,
        when: 'Registered at startup; runs on every incoming request before routes below it.',
        why: 'Without express.json(), req.body stays undefined on JSON API POST/PUT requests.'
      };
    }
    if (/express\.urlencoded\s*\(/.test(code)) {
      return {
        who: 'Express built-in form body-parsing middleware.',
        what: 'Registers a translator that reads HTML <form method="POST"> submissions (key=value&...) and populates req.body.',
        where,
        when: 'Registered at startup; runs on every form POST before route handlers below it.',
        why: 'Browsers send plain HTML forms as URL-encoded text, not JSON — this middleware turns each input’s name attribute into a req.body property.'
      };
    }
    if (/express\.static\s*\(/.test(code)) {
      return {
        who: 'Express built-in static file middleware.',
        what: `Serves files directly from the ${(code.match(/['"]([^'"]+)['"]/) || ['', 'public'])[1]}/ folder whenever a GET request matches a filename inside it.`,
        where,
        when: 'Checked on every incoming GET request in the order it was mounted.',
        why: 'Lets Express deliver your front-end HTML, CSS, images, and browser JS automatically without writing a manual route for each file.'
      };
    }
    if (/\bmorgan\s*\(/.test(code)) {
      return {
        who: 'The morgan HTTP request logging middleware.',
        what: 'Logs each request’s HTTP method, URL path, status code, response time, and byte size to the server console.',
        where,
        when: 'Mounted near the top so it starts timing when a request arrives and prints the log line right as the response finishes.',
        why: 'Gives you an instant live trace of every browser/API call and makes 404s or 500s visible immediately.'
      };
    }
    if (/\bsession\s*\(\s*\{/.test(code) || /\bapp\.use\s*\(\s*session\s*\(/.test(code)) {
      return {
        who: 'express-session middleware.',
        what: 'Enables server-side sessions: reads/creates a signed session ID cookie (connect.sid) and loads that visitor’s private req.session object.',
        where,
        when: 'Registered before routes that read req.session; runs on every incoming request.',
        why: 'Keeps sensitive user data (userId, role, cart) on the server instead of trusting values stored directly in the browser.'
      };
    }
    if (/\brateLimit\s*\(/.test(code)) {
      return {
        who: 'express-rate-limit middleware factory.',
        what: 'Configures a rate limiter that counts requests per IP address and blocks bursts with HTTP 429 Too Many Requests.',
        where,
        when: 'Configured once at startup; counts every request hitting the routes where it is attached.',
        why: 'Slows down automated brute-force password guessing against sensitive endpoints like POST /login.'
      };
    }
    if ((m = code.match(/\b(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/))) {
      const verb = m[2].toUpperCase(), path = m[3];
      const hasParams = path.includes(':');
      return {
        who: `Express (${m[1]} router).`,
        what: `Registers a route handler for HTTP ${verb} requests matching "${path}"${hasParams ? ' (with dynamic :param placeholders captured in req.params)' : ''}.`,
        where,
        when: 'Registered once at startup; the callback runs whenever a client sends a matching ' + verb + ' request.',
        why: 'Express matches both HTTP method and URL path declaratively so each endpoint has one clear, focused handler.'
      };
    }
    if (/\b(?:app|router)\.use\s*\(\s*\(\s*err\b/.test(code)) {
      return {
        who: 'Express 4-argument error-handling middleware.',
        what: 'Catches any error passed to next(err) (or thrown inside an Express 5 async route) in one central place.',
        where: 'Registered LAST in app.js, after every normal route and the 404 handler.',
        when: 'Runs only when an earlier middleware or route fails with an error.',
        why: 'The 4 parameters (err, req, res, next) signal Express that this is an error handler — keeping stack traces private while sending a clean JSON/HTML error.'
      };
    }
    if (/\b(?:app|router)\.use\s*\(/.test(code)) {
      return {
        who: 'Express middleware pipeline.',
        what: `Attaches a middleware function or sub-router (${code.replace(/\s*=>\s*\{?$/, '')}) into the request assembly line.`,
        where,
        when: 'Registered at startup; runs in exact top-to-bottom order on matching incoming requests.',
        why: 'Middleware separates cross-cutting concerns (parsing, logging, auth guards, 404 fallbacks) from individual route handlers.'
      };
    }
    if (/\.(?:listen)\s*\(/.test(code)) {
      const port = (code.match(/listen\s*\(\s*([^,)]+)/) || ['', '3000'])[1];
      return {
        who: 'Node.js network stack (via HTTP/Express).',
        what: `Starts listening for incoming HTTP connections on port ${port}.`,
        where,
        when: 'Once at startup, after all middleware and routes are registered (and after DB connections are ready).',
        why: 'This is the call that keeps the Node process alive and ready to answer requests instead of exiting immediately.'
      };
    }
    if (/http\.createServer\s*\(/.test(code)) {
      return {
        who: 'Node.js built-in http module.',
        what: 'Creates a low-level HTTP server whose callback receives raw req (incoming request) and res (outgoing response) objects.',
        where,
        when: 'Created once at startup; the inner callback fires on every incoming HTTP request.',
        why: 'Shows what frameworks like Express do under the hood: inspect req.method/req.url and write headers + body onto res.'
      };
    }
    if (/new URL\s*\(/.test(code)) {
      return {
        who: 'Standard WHATWG URL parser built into Node and browsers.',
        what: 'Safely splits a raw request URL (like /about?lang=es) into clean .pathname and .searchParams properties.',
        where,
        when: defaultWhen,
        why: 'Checking parsed.pathname prevents query strings like ?lang=es from breaking exact path comparisons.'
      };
    }
    if (/res\.writeHead\s*\(/.test(code)) {
      const st = (code.match(/writeHead\s*\(\s*(\d+)/) || ['', '200'])[1];
      return {
        who: 'Node’s raw HTTP response object (res).',
        what: `Writes HTTP status code ${st} and explicit response headers (such as Content-Type) onto the outgoing response.`,
        where,
        when: defaultWhen,
        why: 'Raw http servers require you to set status codes and Content-Type headers manually before calling res.end().'
      };
    }
    if (/res\.cookie\s*\(/.test(code)) {
      return {
        who: 'Express response helper (res.cookie).',
        what: 'Adds a Set-Cookie header telling the browser to save this cookie and attach it to future requests.',
        where,
        when: defaultWhen,
        why: 'Lets a stateless HTTP server remember preferences or session tickets across separate page loads; use httpOnly and sameSite for safety.'
      };
    }
    if (/res\.clearCookie\s*\(/.test(code)) {
      return {
        who: 'Express response helper (res.clearCookie).',
        what: 'Sends an expired Set-Cookie header instructing the browser to remove that cookie immediately.',
        where,
        when: defaultWhen,
        why: 'Used at logout or preference reset so the browser stops sending the old cookie on subsequent requests.'
      };
    }
    if (/res\.redirect\s*\(/.test(code)) {
      const target = (code.match(/redirect\s*\(\s*(?:\d+\s*,\s*)?['"]([^'"]+)['"]/) || ['', 'the target URL'])[1];
      return {
        who: 'Express response helper (res.redirect).',
        what: `Sends an HTTP 302 redirect response pointing the browser to "${target}".`,
        where,
        when: defaultWhen,
        why: 'Implements the Post/Redirect/Get pattern after actions like login, logout, or form submissions so refreshing never re-submits the POST.'
      };
    }
    if (/\bres\.(?:status\([^)]*\)\.)?(?:json|send|end|type)\s*\(/.test(code)) {
      const st = (code.match(/status\s*\(\s*(\d+|[^)]+)\s*\)/) || [])[1];
      const via = code.includes('.json(') ? 'JSON (with Content-Type: application/json)' : code.includes('.end(') ? 'a raw response body and closes the stream' : 'the response body';
      return {
        who: 'Express / Node HTTP response object (res).',
        what: `Sends ${st ? `HTTP status ${st} with ` : ''}${via} back to the client and completes this request.`,
        where,
        when: defaultWhen,
        why: 'Every HTTP request must end with exactly one response; sending the right status code and format tells the browser or front-end JS how to react.'
      };
    }
    if (/^next\s*\(\s*err\s*\)/.test(code)) {
      return {
        who: 'Express middleware control flow.',
        what: 'Forwards the caught error directly to your 4-argument error-handling middleware, skipping remaining normal routes.',
        where,
        when: defaultWhen,
        why: 'Centralizes 500 error logging and safe client responses instead of duplicating error formatting in every route.'
      };
    }
    if (/^next\s*\(\s*\)/.test(code)) {
      return {
        who: 'Express middleware control flow.',
        what: 'Hands the request and response objects to the next matching middleware or route handler in the stack.',
        where,
        when: defaultWhen,
        why: 'Forgetting to call next() (when you haven’t sent a response) causes the browser request to hang forever.'
      };
    }
    if (/req\.session\.regenerate\s*\(/.test(code)) {
      return {
        who: 'express-session.',
        what: 'Discards any pre-login session ID and mints a brand-new random session ID before recording the logged-in user.',
        where,
        when: 'Right after a password check succeeds inside POST /login.',
        why: 'Defends against session fixation attacks where an attacker tricks a victim into logging in with a known session cookie.'
      };
    }
    if (/req\.session\.destroy\s*\(/.test(code)) {
      return {
        who: 'express-session.',
        what: 'Deletes this visitor’s session record from the server store completely.',
        where,
        when: 'Inside POST /logout when the user signs out.',
        why: 'Invalidates the session server-side immediately so even a copied session cookie can never be reused.'
      };
    }
    if (/req\.session\./.test(code)) {
      return {
        who: 'Your route handler reading or updating express-session state.',
        what: `Reads or stores per-visitor server-side session data (${code.replace(/;$/, '')}).`,
        where,
        when: defaultWhen,
        why: 'Session data stays strictly on the server — the visitor’s browser holds only an opaque signed ticket ID.'
      };
    }
    if (/crypto\.randomBytes/.test(code)) {
      return {
        who: 'Node.js built-in crypto module (OS CSPRNG).',
        what: 'Generates cryptographically secure random bytes (for a unique password salt, secret key, or token).',
        where,
        when: defaultWhen,
        why: 'Math.random() is predictable and unsafe for security; crypto.randomBytes() uses the operating system’s cryptographic random source.'
      };
    }
    if (/crypto\.scrypt|await\s+scrypt\s*\(/.test(code)) {
      return {
        who: 'Node.js crypto password-hashing function (scrypt).',
        what: 'Derives a slow, memory-hard one-way hash from the password and unique salt.',
        where,
        when: defaultWhen,
        why: 'Password hashes are deliberately slow and salted so stolen database dumps resist brute-force and rainbow-table attacks.'
      };
    }
    if (/timingSafeEqual/.test(code)) {
      return {
        who: 'Node.js crypto constant-time comparator.',
        what: 'Compares two equal-length byte buffers in constant time to check whether the password hashes match.',
        where,
        when: defaultWhen,
        why: 'Plain === stops on the first mismatched character, which can leak timing clues; timingSafeEqual always inspects every byte.'
      };
    }
    if (/jwt\.sign\s*\(/.test(code)) {
      return {
        who: 'The jsonwebtoken library (on the server).',
        what: 'Encodes the header and payload claims, sets an expiration (exp), and signs the JWT with the server’s secret key.',
        where,
        when: defaultWhen,
        why: 'Anyone can decode a JWT payload, but nobody without the secret can forge or alter it without breaking the signature.'
      };
    }
    if (/jwt\.verify\s*\(/.test(code)) {
      return {
        who: 'The jsonwebtoken library (on the server).',
        what: 'Checks the token’s cryptographic signature, algorithm allowlist, and expiration timestamp; returns the decoded payload or throws.',
        where,
        when: defaultWhen,
        why: 'Verifying signature + pinned algorithms + expiry on every protected API call ensures tampered or expired tokens are rejected with 401.'
      };
    }
    if (/\b(?:pool|db|conn)\.(?:execute|query)\s*\(/.test(code)) {
      return {
        who: 'The mysql2/promise database driver talking to MySQL / SQLite.',
        what: 'Executes a SQL query asynchronously, binding any ? placeholders safely as data values rather than raw SQL text.',
        where,
        when: defaultWhen,
        why: 'Parameterized queries with ? placeholders are the #1 defense against SQL injection while keeping Node non-blocking via await.'
      };
    }
    if (/\bmysql\.create(?:Pool|Connection)\s*\(/.test(code)) {
      return {
        who: 'The mysql2/promise driver.',
        what: code.includes('createPool') ? 'Creates a shared connection pool that manages multiple reusable database connections.' : 'Opens an asynchronous connection to the relational database.',
        where,
        when: 'Once at startup (for a pool) or when the script connects.',
        why: 'Reusing pooled connections avoids the slow handshake overhead of connecting from scratch on every HTTP request.'
      };
    }
    if (/\bnew\s+ObjectId\s*\(/.test(code)) {
      return {
        who: 'The MongoDB driver’s ObjectId constructor.',
        what: 'Validates and converts a 24-hex-character URL parameter into a real MongoDB ObjectId (throws BSONError if malformed).',
        where,
        when: defaultWhen,
        why: 'Catching an invalid ObjectId lets the route return 400 Bad Request cleanly instead of crashing with a 500 error.'
      };
    }
    if (/\.(?:insertOne|insertMany|find|findOne|updateOne|updateMany|deleteOne|deleteMany)\s*\(/.test(code)) {
      const op = (code.match(/\.(insertOne|insertMany|findOne|find|updateOne|updateMany|deleteOne|deleteMany)\s*\(/) || ['', 'query'])[1];
      return {
        who: 'The MongoDB collection driver.',
        what: `Runs a MongoDB ${op}() database operation asynchronously on the collection.`,
        where,
        when: defaultWhen,
        why: 'MongoDB stores JSON-like documents directly, and awaiting the driver keeps Express free to serve other visitors during I/O.'
      };
    }
    if (/\bnew\s+MongoClient\s*\(/.test(code) || /\.connect\s*\(\s*\)/.test(code)) {
      return {
        who: 'The MongoDB Node.js driver.',
        what: code.includes('MongoClient') ? 'Configures a single MongoClient pointing at your MongoDB connection string.' : 'Opens the persistent connection pool to MongoDB once before serving traffic.',
        where,
        when: 'Once during application startup.',
        why: 'Opening one shared client at startup avoids exhausting database connections under concurrent requests.'
      };
    }
    if (/\bfs\.(?:readFileSync|writeFileSync|appendFileSync|readFile|writeFile|appendFile)\s*\(/.test(code)) {
      const isSync = /Sync\(/.test(code);
      return {
        who: 'Node.js File System (fs) module talking to the OS disk.',
        what: `Performs a ${isSync ? 'synchronous (blocking)' : 'non-blocking asynchronous'} file operation (${(code.match(/fs\.(\w+)/) || ['', 'file'])[1]}).`,
        where,
        when: defaultWhen,
        why: isSync ? 'Sync calls are simple for one-off CLI scripts, but block every other visitor if used inside a live Express route.' : 'Async file calls hand disk I/O to the OS so Node’s single thread keeps serving other visitors while waiting.'
      };
    }
    if (/\bfetch\s*\(/.test(code)) {
      return {
        who: 'The browser’s Fetch API.',
        what: 'Sends an asynchronous HTTP request from browser JavaScript to the server without reloading the whole page.',
        where,
        when: defaultWhen,
        why: 'Lets modern front ends talk to JSON REST APIs in the background and update just the relevant part of the DOM.'
      };
    }
    if (/\bdocument\.(?:getElementById|querySelector|querySelectorAll|createElement)\s*\(/.test(code)) {
      return {
        who: 'The browser’s Document Object Model (DOM).',
        what: code.includes('createElement') ? 'Creates a new HTML element in memory so browser JS can configure it safely before inserting it.' : 'Finds live HTML element(s) in the current web page so browser JS can read input values or update the screen.',
        where,
        when: defaultWhen,
        why: 'DOM methods exist only in the browser — they connect your client-side JavaScript to the rendered HTML.'
      };
    }
    if (/\.addEventListener\s*\(/.test(code)) {
      const ev = (code.match(/addEventListener\s*\(\s*['"]([^'"]+)['"]/) || ['', 'user'])[1];
      return {
        who: 'Browser DOM event system.',
        what: `Waits for the "${ev}" event on this element and runs the callback whenever it occurs.`,
        where,
        when: 'Registered once when the script loads; the callback fires each time the user triggers "' + ev + '".',
        why: 'Keeps interactive JavaScript separate from HTML markup (no inline onclick attributes) and lets one element have clean event handlers.'
      };
    }
    if (/\.preventDefault\s*\(/.test(code)) {
      return {
        who: 'The browser event object.',
        what: 'Cancels the browser’s default full-page form submission or link navigation.',
        where,
        when: defaultWhen,
        why: 'Lets your JavaScript send the data with fetch() and update the page smoothly instead of triggering a full reload.'
      };
    }
    if (/\.textContent\s*=/.test(code)) {
      return {
        who: 'Browser DOM element.',
        what: 'Sets the element’s visible text safely as plain text (HTML characters like < and > are shown literally, never executed).',
        where,
        when: defaultWhen,
        why: 'Always prefer textContent over innerHTML for user-supplied or API data to prevent cross-site scripting (XSS).'
      };
    }
    if (/\.innerHTML\s*=/.test(code)) {
      return {
        who: 'Browser HTML parser (via DOM innerHTML).',
        what: 'Replaces the element’s contents by parsing a string as live HTML.',
        where,
        when: defaultWhen,
        why: 'Convenient for clearing containers (""), but dangerous with untrusted user strings because injected markup/scripts can execute (XSS).'
      };
    }
    if (/\bprocess\.env\b/.test(code)) {
      const v = (code.match(/process\.env\.([A-Z0-9_]+)/) || ['', 'VARIABLE'])[1];
      return {
        who: 'Node.js process environment.',
        what: `Reads the environment variable ${v} supplied outside the codebase (for example from .env or your hosting provider).`,
        where,
        when: defaultWhen,
        why: 'Keeps secrets (DB passwords, session/JWT keys) and machine-specific ports out of Git history and source files.'
      };
    }
    if (/\bJSON\.(?:parse|stringify)\s*\(/.test(code)) {
      const isParse = code.includes('JSON.parse');
      return {
        who: 'Built-in JavaScript JSON utility.',
        what: isParse ? 'Parses a JSON text string into a live JavaScript object/array (throws SyntaxError if malformed).' : 'Serializes a JavaScript object or array into a JSON text string ready to send over HTTP or store.',
        where,
        when: defaultWhen,
        why: isParse ? 'HTTP bodies and files arrive as raw text; JSON.parse() turns valid JSON back into structured data (wrap untrusted text in try/catch!).' : 'HTTP only transmits text/bytes, so objects must be serialized into JSON before crossing the network.'
      };
    }
    if (/\bconsole\.(?:log|error|warn|info)\s*\(/.test(code)) {
      return {
        who: isClient ? 'Browser DevTools Console.' : 'Node.js terminal output (stdout/stderr).',
        what: `Prints diagnostic values (${code.replace(/^console\.\w+\s*\(|\);?$/g, '').slice(0, 70)}) so you can observe what the program is doing.`,
        where,
        when: defaultWhen,
        why: 'Logging key values and request steps is the fastest way to verify behavior and track down bugs.'
      };
    }
    if (/\bsetTimeout\s*\(/.test(code)) {
      return {
        who: 'The JavaScript runtime timer queue (event loop).',
        what: 'Schedules a callback to run after the specified delay once the current synchronous call stack finishes.',
        where,
        when: defaultWhen,
        why: 'Demonstrates non-blocking execution: even with 0 ms delay, synchronous lines after setTimeout() run first.'
      };
    }
    if (/^try\s*\{/.test(code)) {
      return {
        who: runtimeWho,
        what: 'Opens a try block around code that might throw a runtime error (such as parsing bad JSON or querying a database).',
        where,
        when: defaultWhen,
        why: 'Contains potential failures so the server can send a clean 400/500 response instead of crashing.'
      };
    }
    if (/^}?\s*catch\b/.test(code)) {
      return {
        who: runtimeWho,
        what: 'Catches an error thrown inside the preceding try block and exposes it for logging or a safe fallback response.',
        where,
        when: 'Only if something inside the try block throws or rejects.',
        why: 'Gives users a helpful error message while keeping the app running cleanly.'
      };
    }
    if (/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.test(code)) {
      const fnName = RegExp.$1;
      const isAsync = code.startsWith('async');
      return {
        who: runtimeWho,
        what: `Declares ${isAsync ? 'an asynchronous ' : 'a '}reusable function named ${fnName}().`,
        where,
        when: 'Defined when the file loads; its body runs only when called.',
        why: 'Grouping a single responsibility into a named function eliminates duplication and makes code easier to read and test.'
      };
    }
    if (/^return\b/.test(code)) {
      return {
        who: runtimeWho,
        what: `Exits the current function immediately${code.length > 7 ? ' and returns ' + code.replace(/^return\s+|;$/g, '').slice(0, 70) : ''}.`,
        where,
        when: defaultWhen,
        why: 'In Express handlers, returning res.status(...).json(...) prevents execution from continuing down and trying to send a second response.'
      };
    }
    if (/^(?:}?\s*else\s+if|if)\s*\(/.test(code)) {
      const cond = (code.match(/if\s*\((.+)\)\s*\{?/) || ['', 'the condition'])[1];
      return {
        who: runtimeWho,
        what: `Checks whether (${cond.slice(0, 75)}) is truthy to decide which branch of code to run.`,
        where,
        when: defaultWhen,
        why: 'Guards against missing inputs, invalid IDs, unauthorized roles, or unmatched routes before proceeding.'
      };
    }
    if (/^}?\s*else\b/.test(code)) {
      return {
        who: runtimeWho,
        what: 'Starts the fallback branch that runs whenever the preceding if condition was false.',
        where,
        when: defaultWhen,
        why: 'Ensures both the expected path and the fallback/error case are explicitly handled.'
      };
    }
    if (/^(?:const|let|var)\s+/.test(code)) {
      const kw = code.split(/\s+/)[0];
      const lhs = (code.match(/^(?:const|let|var)\s+([^=;]+)/) || ['', 'a binding'])[1].trim();
      return {
        who: runtimeWho,
        what: `Declares ${kw === 'const' ? 'constant' : 'variable'} ${lhs} and stores the value computed on the right side.`,
        where,
        when: defaultWhen,
        why: kw === 'const' ? 'Using const by default signals this reference will not be reassigned, preventing accidental overwrites.' : 'Using let signals that this value is intentionally updated as the program runs.'
      };
    }
    // Embedded HTML or CSS line inside a server template literal (`const html = \`...\``)
    if (/^<(?:!doctype\b|[a-zA-Z][\w-]*\b|\/[a-zA-Z][\w-]*>)/i.test(code)) {
      const htmlNote = explainHTML(code, scope);
      return Object.assign({}, htmlNote, {
        where: 'Inside a JavaScript template literal that builds HTML on the server and sends it to the browser.'
      });
    }
    // Common Web Dev II options-object properties (session, cookie, fetch, mysql, jwt, rateLimit)
    if ((m = code.match(/^([A-Za-z_$][\w$]*)\s*:\s*(.+?)(,?)$/))) {
      const [, prop, val] = m;
      const optMap = {
        secret: ['express-session cookie signer.', `Sets the signing secret (${val}) used to HMAC-sign every session cookie ID.`, 'Prevents visitors from forging or tampering with another user’s connect.sid cookie.'],
        resave: ['express-session store manager.', `Configures resave: ${val} (false avoids rewriting unchanged sessions on every request).`, 'Prevents race conditions and unnecessary database/store writes when nothing in req.session changed.'],
        saveUninitialized: ['express-session store manager.', `Configures saveUninitialized: ${val} (false avoids storing empty sessions for anonymous visitors until data is saved).`, 'Saves server memory and avoids setting login cookies before a visitor actually signs in.'],
        httpOnly: ['Browser cookie security policy.', `Sets httpOnly: ${val} — blocks page JavaScript (document.cookie) from reading this cookie.`, 'Primary defense keeping session cookies safe even if an XSS script runs in the page.'],
        sameSite: ['Browser cross-site cookie policy.', `Sets sameSite: ${val} — controls whether this cookie travels on cross-site requests.`, 'Helps defend against cross-site request forgery (CSRF) while keeping normal navigation working.'],
        maxAge: ['Browser cookie expiration timer.', `Sets maxAge: ${val} (milliseconds) so the cookie automatically expires instead of living forever.`, 'Limits how long a forgotten or stolen cookie remains usable.'],
        secure: ['Browser HTTPS cookie policy.', `Sets secure: ${val} so the cookie travels only over encrypted HTTPS connections in production.`, 'Prevents session cookies from being sniffed in plain text on public Wi-Fi.'],
        algorithms: ['jsonwebtoken verification guard.', `Pins the allowed signing algorithms (${val}).`, 'Blocks algorithm-confusion and "alg: none" attacks where an attacker tries to bypass signature checks.'],
        expiresIn: ['jsonwebtoken token issuer.', `Sets the token’s lifetime (${val}) by writing an exp timestamp into the payload.`, 'Because stateless JWTs cannot be deleted from a server table easily, short lifetimes limit stolen-token exposure.'],
        method: ['Browser fetch() request configuration.', `Sets the HTTP method to ${val} (instead of fetch’s default GET).`, 'Tells Express which verb route (app.post, app.put, app.delete) should handle this API call.'],
        headers: ['HTTP request header map.', `Attaches HTTP headers (${val}) such as Content-Type or Authorization to the request.`, 'Tells the server how to parse the body (application/json) or who is calling (Bearer token).'],
        body: ['HTTP request payload.', `Attaches the serialized request body (${val}) to send with POST or PUT.`, 'Carries the new or updated fields inside the request body instead of exposing them in the URL.'],
        connectionLimit: ['mysql2 connection pool.', `Caps the pool at ${val} simultaneous database connections.`, 'Prevents traffic spikes from opening unlimited connections and crashing the database server.'],
        host: ['Database driver configuration.', `Sets the database server hostname (${val}).`, 'Using process.env.DB_HOST lets the same code connect locally and in production without edits.'],
        user: ['Database driver configuration.', `Sets the database login username (${val}).`, 'Supplying credentials via environment variables keeps them out of source control.'],
        password: ['Database driver configuration.', `Supplies the database password (${val}).`, 'Reading passwords from process.env prevents real credentials from leaking into Git history.'],
        database: ['Database driver configuration.', `Selects which database schema (${val}) queries run against.`, 'Keeps each application’s tables isolated in its own logical database.'],
        windowMs: ['express-rate-limit window.', `Sets the counting time window to ${val} milliseconds.`, 'Defines how long the server remembers recent login attempts from one IP before resetting.'],
        limit: ['express-rate-limit threshold.', `Caps requests to ${val} attempts per IP per window before returning HTTP 429.`, 'Slows automated password-guessing bots down to a crawl while letting real users log in normally.']
      };
      if (optMap[prop]) {
        return { who: optMap[prop][0], what: optMap[prop][1], where, when: defaultWhen, why: optMap[prop][2] };
      }
    }
    return {
      who: runtimeWho,
      what: `Executes the JavaScript expression/statement: ${code.slice(0, 85)}.`,
      where,
      when: defaultWhen,
      why: isClient ? 'Updates client-side state or UI in response to user actions or server responses.' : 'Performs part of the server’s request-processing or data-handling logic.'
    };
  }

  function explainHTML(code, scope) {
    const where = scope ? `Placed ${scope}.` : 'Top-level HTML document sent to the browser.';
    if (/^<!doctype\s+html>/i.test(code)) {
      return {
        who: 'The browser’s HTML5 parser.',
        what: 'Declares that this file uses modern HTML5 standards.',
        where: 'Always line 1 of an HTML document.',
        when: 'Read first before the browser parses any tags.',
        why: 'Prevents browsers from falling back into legacy "quirks mode" layout behavior.'
      };
    }
    if (/^<html\b/i.test(code)) {
      return {
        who: 'The browser DOM.',
        what: 'Opens the root <html> element of the page (lang="en" declares English for screen readers and search engines).',
        where: 'Wraps both <head> and <body>.',
        when: 'Parsed at the very start of page load.',
        why: 'Declaring lang improves accessibility, spell-checking, and pronunciation in assistive technology.'
      };
    }
    if (/^<link\b[^>]*stylesheet/i.test(code)) {
      const href = (code.match(/href=["']([^"']+)["']/i) || ['', 'the CSS file'])[1];
      return {
        who: 'The browser network loader and CSS engine.',
        what: `Requests the external stylesheet "${href}" and applies its visual styles to this document.`,
        where: 'Inside <head> so styles load before the body paints.',
        when: 'Fetched immediately as the browser parses <head>.',
        why: 'Keeping CSS in its own file separates presentation from structure and lets the browser cache styles across pages.'
      };
    }
    if (/^<script\b/i.test(code)) {
      const src = (code.match(/src=["']([^"']+)["']/i) || [])[1];
      const hasDefer = /\bdefer\b/i.test(code);
      return {
        who: 'The browser JavaScript engine.',
        what: src ? `Loads client-side JavaScript from "${src}"${hasDefer ? ' with defer (runs after HTML parsing finishes)' : ''}.` : 'Opens an inline browser <script> block.',
        where,
        when: hasDefer ? 'Downloaded in parallel and executed once the entire HTML DOM is ready.' : 'Executed as the browser encounters the tag.',
        why: hasDefer ? 'defer ensures document.querySelector() finds every element in <body> without blocking initial page rendering.' : 'Connects interactive browser-side behavior (like fetch() calls) to the HTML page.'
      };
    }
    if (/^<form\b/i.test(code)) {
      const method = (code.match(/method=["']([^"']+)["']/i) || ['', 'GET'])[1].toUpperCase();
      const action = (code.match(/action=["']([^"']+)["']/i) || ['', 'the current URL'])[1];
      return {
        who: 'The browser’s built-in form submission engine.',
        what: `Opens an HTML form that submits named fields using HTTP ${method} to "${action}".`,
        where,
        when: 'Rendered on page load; submitted when the visitor clicks its submit button or presses Enter.',
        why: 'Forms work natively without JavaScript and pair directly with Express routes like app.post("' + action + '", ...).'
      };
    }
    if (/^<input\b/i.test(code)) {
      const type = (code.match(/type=["']([^"']+)["']/i) || ['', 'text'])[1];
      const name = (code.match(/name=["']([^"']+)["']/i) || [])[1];
      return {
        who: 'The browser form control.',
        what: `Renders a "${type}" input field${name ? ` named "${name}" (sent as req.body.${name} or req.query.${name})` : ''}.`,
        where,
        when: 'Interactive immediately once rendered; its current value is included when the form submits.',
        why: name ? `The name="${name}" attribute is what gives this field its key on the server — without name, the server never receives it.` : 'Collects typed user data with appropriate browser validation and keyboard support.'
      };
    }
    if (/^<label\b/i.test(code)) {
      return {
        who: 'Browser accessibility & form UX.',
        what: 'Associates a visible text label with its input field so clicking the label focuses the input.',
        where,
        when: 'Rendered alongside the input control.',
        why: 'Essential for screen readers and gives touch/mouse users a larger, clearer click target.'
      };
    }
    if (/^<button\b/i.test(code)) {
      const type = (code.match(/type=["']([^"']+)["']/i) || ['', 'submit'])[1];
      return {
        who: 'Browser interactive control.',
        what: `Renders a clickable button (type="${type}") that ${type === 'submit' ? 'submits its enclosing form' : 'triggers a JavaScript action'}.`,
        where,
        when: 'Fires a click (or form submit) event whenever activated by mouse, touch, or keyboard Enter/Space.',
        why: 'Native <button> elements include built-in keyboard focus and screen-reader semantics for free.'
      };
    }
    if (/^<a\b/i.test(code)) {
      const href = (code.match(/href=["']([^"']+)["']/i) || ['', 'a URL'])[1];
      return {
        who: 'Browser navigation engine.',
        what: `Creates a hyperlink sending an HTTP GET request to "${href}" when clicked.`,
        where,
        when: 'Navigates when clicked or activated via keyboard.',
        why: 'Links are the backbone of web navigation and naturally trigger safe, bookmarkable GET routes on the server.'
      };
    }
    if (/^<meta\b/i.test(code)) {
      return {
        who: 'The browser document loader.',
        what: /charset/i.test(code) ? 'Declares UTF-8 character encoding so every symbol and accent displays cleanly.' : 'Configures viewport scaling so the page fits mobile screens cleanly.',
        where: 'Inside <head>.',
        when: 'Processed before rendering any visible content.',
        why: 'Prevents garbled characters and awkward desktop-zoomed mobile layouts.'
      };
    }
    const tagMatch = code.match(/^<([a-zA-Z][\w-]*)/);
    const tag = tagMatch ? tagMatch[1] : 'element';
    const hasVue = /\bv-model|\bv-for|\bv-if|@submit|@click|\{\{/.test(code);
    return {
      who: hasVue ? 'Vue’s reactive template renderer in the browser.' : 'The browser HTML parser and DOM.',
      what: hasVue ? `Declarative Vue template markup on <${tag}> that automatically syncs the DOM with reactive JavaScript state.` : `Creates/renders the <${tag}> markup element${/aria-live/i.test(code) ? ' (with aria-live so screen readers announce updates)' : ''}.`,
      where,
      when: hasVue ? 'Rendered at mount and re-updated automatically whenever the bound state changes.' : 'Parsed and added to the DOM when the browser loads the HTML.',
      why: 'Semantic HTML elements give structure, accessibility, and clear hooks for both CSS styling and JavaScript.'
    };
  }

  function explainCSS(code, scope) {
    const where = scope ? `Inside ${scope}.` : 'Top-level CSS stylesheet loaded by the browser.';
    if (code.includes('{')) {
      const sel = code.split('{')[0].trim();
      const isMedia = sel.startsWith('@media');
      const isRoot = sel === ':root';
      return {
        who: 'The browser’s CSS selector matching engine.',
        what: isMedia ? `Opens a responsive media query (${sel}) that applies styles only when the viewport matches.` : isRoot ? 'Targets the document root to define reusable CSS custom properties (design tokens).' : `Targets every element matching the selector "${sel}" and opens its declaration block.`,
        where,
        when: 'Evaluated whenever the DOM loads, resizes, or element states (:hover, :focus, classes) change.',
        why: 'CSS selectors let one rule style every matching component consistently without repeating inline styles in HTML.'
      };
    }
    const propMatch = code.match(/^([a-zA-Z-]+)\s*:\s*([^;]+);?$/);
    if (propMatch) {
      const [, prop, val] = propMatch;
      const hints = {
        display: `Sets the element’s layout mode to "${val}" (controlling how it flows and arranges its children).`,
        'grid-template-columns': `Defines the column tracks (${val}) of a CSS Grid container.`,
        gap: `Adds consistent spacing (${val}) between flex or grid items without messy margin hacks.`,
        padding: `Adds inner breathing room (${val}) between the element’s content and its border.`,
        margin: `Adds outer spacing (${val}) separating this element from neighboring elements.`,
        'max-width': `Caps the element’s width at ${val} so content stays readable on wide monitors while shrinking on phones.`,
        background: `Sets the element’s background color or fill to ${val}.`,
        color: `Sets the foreground text color to ${val}.`,
        border: `Draws a border (${val}) around the box edge for clear visual boundaries.`,
        'border-radius': `Rounds the element’s corners by ${val}.`,
        'font-family': `Chooses the typeface stack (${val}) with safe system fallbacks.`,
        'font-size': `Sets the text size to ${val}.`,
        'font-weight': `Sets the text boldness to ${val}.`,
        cursor: `Changes the mouse pointer to ${val} to signal interactivity.`
      };
      return {
        who: 'The browser’s CSS layout and painting engine.',
        what: hints[prop] || `Sets CSS property "${prop}" to "${val}".`,
        where,
        when: 'Applied during browser style calculation, layout, and paint.',
        why: prop.startsWith('--') ? 'Design tokens (CSS variables) let themes and components share one consistent palette.' : 'Controls visual hierarchy, readability, and responsive behavior directly in CSS.'
      };
    }
    return {
      who: 'The browser’s CSS engine.',
      what: `Applies the CSS rule fragment: ${code.slice(0, 80)}.`,
      where,
      when: 'Evaluated whenever the browser lays out and paints matching elements.',
      why: 'Separates visual styling from HTML structure and JavaScript logic.'
    };
  }

  function explainSQL(code, scope) {
    const where = scope ? `Inside ${scope}.` : 'Top-level SQL statement executed by the relational database engine (MySQL / SQLite).';
    const up = code.toUpperCase();
    if (/^CREATE\s+TABLE\b/.test(up)) {
      const name = (code.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)/i) || ['', 'a table'])[1];
      return {
        who: 'The relational database schema engine (DDL).',
        what: `Creates a new table named "${name}" with strict column types and constraints.`,
        where,
        when: 'Run once during database setup or migration before inserting rows.',
        why: 'Enforces a predictable schema so every row has the exact required columns and data types.'
      };
    }
    if (/^FOREIGN\s+KEY\b/.test(up)) {
      return {
        who: 'The database’s referential integrity engine.',
        what: `Declares a foreign key constraint (${code.replace(/,$/, '')}) linking this table to a parent table’s primary key.`,
        where,
        when: 'Checked automatically on every INSERT, UPDATE, or DELETE affecting those rows.',
        why: 'Prevents orphan rows — the database refuses to store a book pointing at an author ID that does not exist.'
      };
    }
    if (/PRIMARY\s+KEY/.test(up)) {
      return {
        who: 'The relational database table schema.',
        what: `Defines the table’s PRIMARY KEY column (${code.split(/\s+/)[0]})${/AUTO_INCREMENT/i.test(code) ? ' with automatic sequential numbering' : ''}.`,
        where,
        when: 'Enforced on every INSERT so no two rows can share the same ID.',
        why: 'Every relational table needs a stable unique identifier so routes like GET /api/books/:id and JOINs can target exact rows.'
      };
    }
    if (/^INSERT\s+INTO\b/.test(up)) {
      const tbl = (code.match(/INSERT\s+INTO\s+([A-Za-z_]\w*)/i) || ['', 'the table'])[1];
      return {
        who: 'The relational database write engine (CREATE in CRUD).',
        what: `Inserts a new row into "${tbl}" supplying explicit column names and values.`,
        where,
        when: 'Executed immediately; generates the new auto-increment ID if omitted.',
        why: 'Listing column names explicitly protects the query even if new columns are added to the table later.'
      };
    }
    if (/^SELECT\b/.test(up)) {
      return {
        who: 'The relational database query engine (READ in CRUD).',
        what: `Chooses which columns (${code.replace(/^SELECT\s+/i, '').replace(/;$/, '')}) to return in the result set.`,
        where,
        when: 'Executed when reading data; never modifies stored rows.',
        why: 'Explicit column lists return only what the caller needs (and avoid accidentally leaking columns like password_hash).'
      };
    }
    if (/^FROM\b/.test(up)) {
      return {
        who: 'The SQL query planner.',
        what: `Specifies the primary source table (${code.replace(/^FROM\s+/i, '').replace(/;$/, '')}) to read rows from.`,
        where,
        when: 'Evaluated first by the database engine before filtering with WHERE or projecting SELECT columns.',
        why: 'Identifies which table’s rows feed into the query.'
      };
    }
    if (/\bJOIN\b/.test(up)) {
      return {
        who: 'The relational database JOIN engine.',
        what: `Combines matching rows from a related table (${code.replace(/;$/, '')}) using their foreign/primary key relationship.`,
        where,
        when: 'Executed as part of the SELECT query so related data arrives in one round trip.',
        why: 'Lets you store authors once (avoiding duplicates) and reassemble book titles + author names cleanly on read.'
      };
    }
    if (/^WHERE\b/.test(up)) {
      return {
        who: 'The SQL row filter.',
        what: `Restricts the statement to only rows matching (${code.replace(/^WHERE\s+/i, '').replace(/;$/, '')}).`,
        where,
        when: 'Evaluated against each candidate row before returning, updating, or deleting it.',
        why: 'Crucial on UPDATE and DELETE — omitting WHERE modifies or wipes every row in the entire table!'
      };
    }
    if (/^UPDATE\b/.test(up)) {
      return {
        who: 'The relational database write engine (UPDATE in CRUD).',
        what: `Modifies existing column values in the named table (${code.replace(/;$/, '')}).`,
        where,
        when: 'Executed immediately on every row matching the WHERE clause.',
        why: 'Updates records in place while reporting affectedRows so your API knows whether the ID existed.'
      };
    }
    if (/^DELETE\b/.test(up)) {
      return {
        who: 'The relational database write engine (DELETE in CRUD).',
        what: `Permanently removes matching rows from the table (${code.replace(/;$/, '')}).`,
        where,
        when: 'Executed immediately; fails if another table holds a FOREIGN KEY referencing the deleted row.',
        why: 'Always pair DELETE with a specific WHERE clause (usually WHERE id = ?) so you never erase the whole table.'
      };
    }
    if (scope && /CREATE TABLE/.test(scope)) {
      const col = code.split(/\s+/)[0];
      return {
        who: 'The relational table schema.',
        what: `Defines column "${col}" (${code.replace(/,$/, '')})${/NOT NULL/i.test(code) ? ' — required on every row' : ''}${/UNIQUE/i.test(code) ? ' — duplicate values are rejected' : ''}.`,
        where,
        when: 'Enforced by the database on every future INSERT and UPDATE.',
        why: 'Database-level constraints guarantee data integrity even if a bug slips past application code.'
      };
    }
    return {
      who: 'The relational SQL database engine.',
      what: `SQL clause: ${code.replace(/;$/, '')}.`,
      where,
      when: 'Evaluated when the SQL statement runs.',
      why: 'SQL declaratively describes what data you want, letting the database engine choose the fastest execution plan.'
    };
  }

  function explainJSON(code, ctx, scope) {
    const isPkg = ctx === 'npm-json';
    const m = code.match(/^"([^"]+)"\s*:\s*(.+?)(,?)$/);
    if (m) {
      const [, key, val] = m;
      const pkgHints = {
        name: 'Identifies your Node project package name.',
        version: 'Tracks your project’s semantic version (major.minor.patch).',
        main: 'Names the entry-point file Node runs for this package.',
        scripts: 'Defines reusable shortcuts you can run with npm start or npm run <name>.',
        start: 'The command executed when you or a hosting platform runs "npm start".',
        dependencies: 'Lists every npm package required for this app to run in production (installed by npm install).',
        express: 'Pins the Express version range (^) so npm install installs compatible 5.x updates.'
      };
      return {
        who: isPkg ? 'npm and Node.js reading package.json.' : 'The JSON serializer/parser exchanging API data between server and browser.',
        what: isPkg && pkgHints[key] ? `Sets "${key}" to ${val} — ${pkgHints[key]}` : `JSON property "${key}" with value ${val}.`,
        where: scope ? `Inside ${scope}.` : (isPkg ? 'Inside package.json at the project root.' : 'Inside the JSON payload sent over HTTP.'),
        when: isPkg ? 'Read by npm during install/scripts and by your host on deploy.' : 'Serialized by res.json() on the server and parsed by await response.json() in the browser.',
        why: 'Strict JSON syntax (double quotes around every key and string, no trailing commas) lets any language parse the data reliably.'
      };
    }
    return {
      who: isPkg ? 'npm reading package.json.' : 'JSON data structure.',
      what: code === '{' ? 'Opens a JSON object.' : code === '[' ? 'Opens a JSON array.' : `JSON value: ${code}.`,
      where: scope ? `Inside ${scope}.` : 'In the JSON document.',
      when: 'Parsed as a complete JSON document before use.',
      why: 'JSON is the universal text format for REST APIs and Node configuration files.'
    };
  }

  function explainText(code, ctx) {
    let m;
    if ((m = code.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(\S+)\s+(HTTP\/[\d.]+)/))) {
      return {
        who: 'The HTTP client (browser, fetch(), or curl) sending a request over TCP.',
        what: `HTTP request start line: method ${m[1]}, target path "${m[2]}", protocol ${m[3]}.`,
        where: 'Line 1 of the raw HTTP request message traveling from client to server.',
        when: 'Sent the instant a link is clicked, a form is submitted, or fetch() is called.',
        why: 'Express reads this exact method and path to choose which app.get/post/put/delete route handler to run.'
      };
    }
    if ((m = code.match(/^(HTTP\/[\d.]+)\s+(\d{3})\s*(.*)$/))) {
      return {
        who: 'Your Node/Express server replying over HTTP.',
        what: `HTTP response status line: ${m[2]} ${m[3]} (2xx = success, 3xx = redirect, 4xx = client error, 5xx = server error).`,
        where: 'Line 1 of the raw HTTP response message traveling from server back to client.',
        when: 'Sent as soon as your route handler calls res.send(), res.json(), or res.redirect().',
        why: 'Status codes let browsers and front-end code (response.ok) know immediately whether the request succeeded or failed.'
      };
    }
    if ((m = code.match(/^([A-Za-z][A-Za-z0-9-]+):\s*(.+)$/))) {
      const [, hdr, val] = m;
      const hLow = hdr.toLowerCase();
      const hdrNote = hLow === 'cookie' ? 'The browser automatically attaches every saved cookie for this domain so the server recognizes the visitor.'
        : hLow === 'set-cookie' ? 'The server instructs the browser to save (or delete) a cookie with the listed security flags.'
        : hLow === 'authorization' ? 'Carries the caller’s credential (such as a Bearer JWT) on an API request.'
        : hLow === 'content-type' ? 'Tells the receiver how to decode the body bytes (HTML, JSON, CSS, or form-encoded pairs).'
        : hLow === 'location' ? 'Tells the browser which URL to navigate to next on a 301/302 redirect.'
        : hLow === 'host' ? 'Identifies which server hostname and port this HTTP request is addressed to.'
        : `Passes HTTP metadata header "${hdr}" with value "${val}".`;
      return {
        who: ctx === 'http-res' || hLow === 'set-cookie' || hLow === 'location' ? 'The HTTP server (response header).' : 'The HTTP client/browser (request header).',
        what: `${hdr}: ${val} — ${hdrNote}`,
        where: 'In the HTTP headers section, right between the start line and the blank line before the body.',
        when: 'Read before the message body is parsed.',
        why: 'Headers carry metadata (formats, cookies, auth tokens, caching) separately from the main content body.'
      };
    }
    if (/^node\s+-e\s+/.test(code)) {
      return {
        who: 'Your terminal shell invoking the Node.js runtime.',
        what: 'Runs a one-line JavaScript snippet directly with the -e ("evaluate") flag without creating a file.',
        where: 'In your local terminal (or right here in our in-browser Node runner!).',
        when: 'Runs immediately when you press Enter and exits as soon as the snippet finishes.',
        why: 'Handy for quick experiments and generating 32-byte random secrets with require("crypto").'
      };
    }
    if (/^npm\s+/.test(code)) {
      return {
        who: 'npm (Node Package Manager) CLI in your terminal.',
        what: code.includes('install') ? 'Downloads the named package(s) into node_modules/ and records them in package.json.' : code.includes('init') ? 'Creates a new package.json manifest file for your Node project.' : `Runs the npm command: ${code}.`,
        where: 'In your project folder’s terminal.',
        when: 'Run during project setup or whenever adding dependencies.',
        why: 'Keeping dependencies declared in package.json lets anyone rebuild node_modules/ with a single npm install.'
      };
    }
    if (ctx === 'env' && /^[A-Z0-9_]+=/.test(code)) {
      const k = code.split('=')[0];
      return {
        who: 'Local environment configuration (.env file, loaded by Node --env-file=.env).',
        what: `Sets environment variable ${k} so server code can read process.env.${k}.`,
        where: 'In your private local .env file (listed in .gitignore so it is never committed!).',
        when: 'Loaded once when Node boots your app.',
        why: 'Separates secrets and per-machine config from source code so passwords and keys stay out of Git.'
      };
    }
    if (ctx === 'gitignore') {
      return {
        who: 'Git version control.',
        what: `Tells Git never to track or commit "${code}".`,
        where: 'In .gitignore at the root of your repository.',
        when: 'Checked automatically every time you run git status or git add.',
        why: 'Keeps huge generated folders (node_modules/) and private secrets (.env) out of Git history.'
      };
    }
    return {
      who: 'Developer workflow / HTTP trace.',
      what: code,
      where: 'In the shown command, trace, or configuration snippet.',
      when: 'During development, startup, or an HTTP request/response exchange.',
      why: 'Illustrates the concrete wire message, file structure, or terminal step paired with the surrounding lesson code.'
    };
  }

  /* ---------- Master 5-part line note builder ---------- */

  function explainLine(lines, idx, lang, title, ctx, scopes) {
    const raw = lines[idx] || '';
    const { code, comment } = splitLineComment(raw, lang);
    const scope = scopes[idx];

    // 1. Blank line
    if (!code && !comment) {
      return {
        who: 'Nobody — the runtime and parser ignore blank lines completely.',
        what: 'An empty line with no code on it.',
        where: `Between line ${Math.max(1, idx)} and line ${Math.min(lines.length, idx + 2)}.`,
        when: 'Never executes; it only affects readability.',
        why: 'Blank lines group related statements into visual paragraphs (imports, setup, routes, listen) so the file is easy to scan.'
      };
    }

    // 2. Pure comment line
    if (!code && comment) {
      return {
        who: 'The author writing a note for human readers (ignored by the runtime/parser).',
        what: `Comment: "${comment}"`,
        where: scope ? `Inside ${scope}.` : 'Top-level documentation note in this snippet.',
        when: 'Never executes — skipped completely when the code runs or parses.',
        why: 'Comments explain intent, ordering rules, or trade-offs so future readers (including you next week) understand why the next lines exist.'
      };
    }

    // 3. Closing brace / bracket / closing HTML tag
    const isCloser = /^[\}\)\]][\}\)\],;\s]*$/.test(code) || (lang === 'html' && /^<\/[a-zA-Z][\w-]*>$/.test(code));
    if (isCloser) {
      const opener = findOpenerLine(lines, idx, lang);
      const openText = opener >= 0 ? splitLineComment(lines[opener], lang).code.slice(0, 75) : '';
      return mergeNote({
        who: lang === 'html' ? 'The browser’s HTML parser pairing opening and closing tags.' : 'The parser pairing every opening brace/bracket with its matching closer.',
        what: opener >= 0 ? `Closes what line ${opener + 1} opened: ${openText}` : `Closes the enclosing block opened above (${code}).`,
        where: opener >= 0 ? `Lines ${opener + 1} through ${idx + 1} form one complete block.` : 'At the end of the enclosing block.',
        when: lang === 'js' ? 'Marks the end of this scope; local const/let variables declared inside go away when execution leaves.' : 'Marks the end of this structural block.',
        why: 'Matching indentation and closing delimiters make nested routes, rules, and tags easy to read and prevent syntax errors.'
      }, comment);
    }

    // 4. Language-specific analyzer + inline comment enrichment
    let note;
    if (lang === 'js' || lang === 'javascript') note = explainJS(code, ctx, scope, title);
    else if (lang === 'html' || lang === 'xml') note = explainHTML(code, scope);
    else if (lang === 'css') note = explainCSS(code, scope);
    else if (lang === 'sql') note = explainSQL(code, scope);
    else if (lang === 'json') note = explainJSON(code, ctx, scope);
    else note = explainText(code, ctx);

    return mergeNote(note, comment);
  }

  /* ---------- Render 5-part inspector card ---------- */

  function renderFiveHtml(note, codeLine, lang, lineNo, total) {
    const terms = termsInLine(codeLine, lang);
    const hl = WD1.highlight ? WD1.highlight(codeLine || ' ', lang) : esc(codeLine || ' ');
    return (
      `<div class="insp-head">` +
        `<span class="insp-line">Line ${lineNo}<span class="of"> of ${total}</span></span>` +
        `<span class="insp-nav">` +
          `<button type="button" class="btn small ghost insp-prev" aria-label="Previous line" ${lineNo <= 1 ? 'disabled' : ''}>▲ Prev</button>` +
          `<button type="button" class="btn small ghost insp-next" aria-label="Next line" ${lineNo >= total ? 'disabled' : ''}>▼ Next</button>` +
          `<button type="button" class="btn small ghost insp-close" aria-label="Close line inspector">Hide</button>` +
        `</span>` +
      `</div>` +
      `<pre class="insp-code"><code>${hl || '&nbsp;'}</code></pre>` +
      `<dl class="five">` +
        PARTS.map(([k, label, hint]) =>
          `<div class="five-row five-${k}"><dt title="${esc(hint)}">${label}</dt><dd>${esc(note[k] || '')}</dd></div>`
        ).join('') +
      `</dl>` +
      (terms.length
        ? `<div class="insp-terms" aria-label="Key terms on this line">` +
            `<span class="insp-terms-label">Terms on this line:</span>` +
            terms.map((t) => `<button type="button" class="insp-term" data-term="${esc(t)}">${esc(t)}</button>`).join('') +
          `</div><p class="insp-term-def" hidden></p>`
        : '')
    );
  }

  /* ---------- Mount inspector on every .code-block ---------- */

  function mountInspector(block) {
    if (block.dataset.inspMounted) return;
    block.dataset.inspMounted = '1';

    const pre = $(':scope > pre', block);
    const codeEl = pre && $('code', pre);
    if (!pre || !codeEl) return;

    const rawCode = block._wdCode != null ? block._wdCode : codeEl.textContent;
    const lang = (block._wdLang || 'text').toLowerCase();
    const titleEl = $(':scope > .code-lang', block);
    const title = titleEl ? titleEl.textContent : '';
    const lines = rawCode.split('\n');
    if (!lines.length) return;

    const ctx = detectRuntimeContext(lines, lang, title);
    const scopes = buildScopeMap(lines, lang);

    // Wrap each line of already-highlighted code into a numbered, clickable row
    const hlLines = splitHighlightedLines(codeEl.innerHTML);
    codeEl.innerHTML = lines.map((_, idx) => {
      const ln = idx + 1;
      const htmlLine = hlLines[idx] != null && hlLines[idx] !== '' ? hlLines[idx] : '&nbsp;';
      return `<span class="code-ln-row" data-ln="${ln}"><span class="code-ln-num" aria-hidden="true">${ln}</span><span class="code-ln-src">${htmlLine}</span></span>`;
    }).join('');
    block.classList.add('has-inspector');

    // Add or reuse the bottom .code-run-bar so "Explain line by line" sits cleanly alongside "Run live"
    let runBar = $(':scope > .code-run-bar', block);
    const toggleBtn = h('button', {
      type: 'button',
      class: 'btn small ghost insp-trigger',
      'aria-expanded': 'false',
      text: 'Explain line by line'
    });

    if (runBar) {
      let actions = $('.code-bar-actions', runBar);
      if (!actions) {
        const existingBtn = $('.run-trigger', runBar);
        actions = h('div', { class: 'cluster code-bar-actions' });
        if (existingBtn) {
          runBar.insertBefore(actions, existingBtn);
          actions.appendChild(existingBtn);
        } else {
          runBar.prepend(actions);
        }
      }
      actions.appendChild(toggleBtn);
    } else {
      runBar = h('div', { class: 'code-run-bar' },
        h('div', { class: 'cluster code-bar-actions' }, toggleBtn),
        h('span', { class: 'code-run-meta', text: 'Click any line to inspect' })
      );
      block.appendChild(runBar);
    }

    const drawer = h('div', { class: 'line-inspector', hidden: true, role: 'region', 'aria-label': 'Line-by-line explanation' });
    const announce = h('p', { class: 'sr-only', 'aria-live': 'polite' });
    // Place drawer directly after runBar (and before runner-panel if opened later)
    runBar.insertAdjacentElement('afterend', drawer);
    block.appendChild(announce);

    let activeLine = 0;

    function firstCodeLine() {
      const i = lines.findIndex((l) => l.trim().length > 0);
      return i >= 0 ? i + 1 : 1;
    }

    function showLine(ln) {
      const clamped = Math.max(1, Math.min(lines.length, ln));
      activeLine = clamped;
      drawer.hidden = false;
      block.classList.add('insp-open');
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.textContent = 'Hide line notes';

      $$('.code-ln-row', codeEl).forEach((row, i) => {
        row.classList.toggle('is-active', i + 1 === clamped);
      });

      const note = explainLine(lines, clamped - 1, lang, title, ctx, scopes);
      drawer.innerHTML = renderFiveHtml(note, lines[clamped - 1], lang, clamped, lines.length);
      announce.textContent = `Line ${clamped} of ${lines.length}: ${note.what}`;
    }

    function closeInspector() {
      activeLine = 0;
      drawer.hidden = true;
      block.classList.remove('insp-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.textContent = 'Explain line by line';
      $$('.code-ln-row.is-active', codeEl).forEach((r) => r.classList.remove('is-active'));
    }

    toggleBtn.addEventListener('click', () => {
      if (!drawer.hidden) closeInspector();
      else showLine(activeLine || firstCodeLine());
    });

    codeEl.addEventListener('click', (e) => {
      const row = e.target.closest('.code-ln-row');
      if (!row) return;
      const ln = Number(row.dataset.ln);
      if (ln === activeLine && !drawer.hidden) closeInspector();
      else showLine(ln);
    });

    drawer.addEventListener('click', (e) => {
      if (e.target.closest('.insp-prev')) { showLine(activeLine - 1); return; }
      if (e.target.closest('.insp-next')) { showLine(activeLine + 1); return; }
      if (e.target.closest('.insp-close')) { closeInspector(); toggleBtn.focus(); return; }
      const termBtn = e.target.closest('.insp-term');
      if (termBtn) {
        const def = $('.insp-term-def', drawer);
        const key = termBtn.dataset.term;
        $$('.insp-term', drawer).forEach((b) => b.classList.toggle('on', b === termBtn));
        if (def) {
          def.hidden = false;
          def.innerHTML = `<strong>${esc(key)}:</strong> ${esc(GLOSSARY[key] || '')}`;
        }
      }
    });

    block.addEventListener('keydown', (e) => {
      if (drawer.hidden || e.target.matches('input, textarea, select')) return;
      if (e.key === 'ArrowDown' && activeLine < lines.length) { e.preventDefault(); showLine(activeLine + 1); }
      else if (e.key === 'ArrowUp' && activeLine > 1) { e.preventDefault(); showLine(activeLine - 1); }
      else if (e.key === 'Escape') { closeInspector(); }
    });
  }

  function mountAll(root) {
    $$('.code-block', root || document).forEach(mountInspector);
  }

  WD1.inspector = { mountAll, explainLine, termsInLine, GLOSSARY };
  WD1.ready(() => mountAll(document));
})();
