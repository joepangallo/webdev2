/* ==========================================================================
   Web Development II: in-browser Node / Express / MongoDB / SQLite WASM runner
   Self-hosted, zero third-party requests. Loads sql.js WASM lazily only when
   a SQL or mysql2 example is executed.
   ========================================================================== */
(function () {
  'use strict';

  const WD1 = (window.WD1 = window.WD1 || {});
  const { h, $, $$, esc } = WD1;

  /* ---------- Pure-JS Buffer + SHA-256 / HMAC-SHA256 / PBKDF2 ---------- */

  const encUtf8 = new TextEncoder();
  const decUtf8 = new TextDecoder();

  function toBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function fromBase64(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  class MiniBuffer extends Uint8Array {
    toString(encoding = 'utf8') {
      const e = String(encoding).toLowerCase();
      if (e === 'hex') {
        let out = '';
        for (let i = 0; i < this.length; i++) out += this[i].toString(16).padStart(2, '0');
        return out;
      }
      if (e === 'base64') return toBase64(this);
      if (e === 'base64url') return toBase64(this).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      return decUtf8.decode(this);
    }
    equals(other) {
      if (!other || this.length !== other.length) return false;
      let diff = 0;
      for (let i = 0; i < this.length; i++) diff |= this[i] ^ other[i];
      return diff === 0;
    }
    static from(input, encoding = 'utf8') {
      if (input instanceof MiniBuffer) return new MiniBuffer(input);
      if (input instanceof Uint8Array || Array.isArray(input)) return new MiniBuffer(input);
      if (typeof input === 'string') {
        const e = String(encoding).toLowerCase();
        if (e === 'hex') {
          const clean = input.length % 2 ? input.slice(0, -1) : input;
          const out = new MiniBuffer(clean.length / 2);
          for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
          return out;
        }
        if (e === 'base64' || e === 'base64url') return new MiniBuffer(fromBase64(input));
        return new MiniBuffer(encUtf8.encode(input));
      }
      throw new TypeError('Unsupported Buffer.from input');
    }
    static alloc(size, fill = 0) {
      const b = new MiniBuffer(size);
      if (fill) b.fill(typeof fill === 'string' ? fill.charCodeAt(0) : fill);
      return b;
    }
    static concat(list) {
      const bufs = list.map((x) => (x instanceof Uint8Array ? x : MiniBuffer.from(x)));
      const total = bufs.reduce((s, b) => s + b.length, 0);
      const out = new MiniBuffer(total);
      let off = 0;
      bufs.forEach((b) => { out.set(b, off); off += b.length; });
      return out;
    }
    static isBuffer(x) { return x instanceof MiniBuffer; }
    static byteLength(str, enc = 'utf8') { return MiniBuffer.from(String(str), enc).length; }
  }

  const SHA_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function sha256(input) {
    const data = input instanceof Uint8Array ? input : MiniBuffer.from(String(input));
    const bitLen = data.length * 8;
    const padLen = ((data.length + 9 + 63) & ~63);
    const buf = new Uint8Array(padLen);
    buf.set(data);
    buf[data.length] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
    dv.setUint32(padLen - 4, bitLen >>> 0, false);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);

    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + SHA_K[i] + w[i]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
    }
    const out = new MiniBuffer(32);
    const odv = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => odv.setUint32(i * 4, v, false));
    return out;
  }

  function hmacSha256(keyIn, dataIn) {
    let key = keyIn instanceof Uint8Array ? keyIn : MiniBuffer.from(String(keyIn));
    const data = dataIn instanceof Uint8Array ? dataIn : MiniBuffer.from(String(dataIn));
    if (key.length > 64) key = sha256(key);
    const ipad = new Uint8Array(64 + data.length);
    const opad = new Uint8Array(96);
    for (let i = 0; i < 64; i++) {
      const kb = i < key.length ? key[i] : 0;
      ipad[i] = kb ^ 0x36;
      opad[i] = kb ^ 0x5c;
    }
    ipad.set(data, 64);
    opad.set(sha256(ipad), 64);
    return sha256(opad);
  }

  function pbkdf2Sha256(password, salt, iterations, keylen) {
    const pw = password instanceof Uint8Array ? password : MiniBuffer.from(String(password));
    const sl = salt instanceof Uint8Array ? salt : MiniBuffer.from(String(salt));
    const blocks = Math.ceil(keylen / 32);
    const out = new MiniBuffer(blocks * 32);
    for (let b = 1; b <= blocks; b++) {
      const seed = new Uint8Array(sl.length + 4);
      seed.set(sl);
      seed[sl.length] = (b >>> 24) & 0xff;
      seed[sl.length + 1] = (b >>> 16) & 0xff;
      seed[sl.length + 2] = (b >>> 8) & 0xff;
      seed[sl.length + 3] = b & 0xff;
      let u = hmacSha256(pw, seed);
      const t = new Uint8Array(u);
      for (let i = 1; i < iterations; i++) {
        u = hmacSha256(pw, u);
        for (let j = 0; j < 32; j++) t[j] ^= u[j];
      }
      out.set(t, (b - 1) * 32);
    }
    return new MiniBuffer(out.subarray(0, keylen));
  }

  function createCryptoModule() {
    const randomBytes = (n) => {
      const b = new MiniBuffer(n);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b);
      else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
      return b;
    };
    const scryptSync = (password, salt, keylen) => pbkdf2Sha256(password, salt, 240, keylen);
    const scrypt = (password, salt, keylen, optionsOrCb, maybeCb) => {
      const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb;
      setTimeout(() => {
        try { cb(null, scryptSync(password, salt, keylen)); }
        catch (err) { cb(err); }
      }, 10);
    };
    const timingSafeEqual = (a, b) => {
      if (!a || !b || a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
      return diff === 0;
    };
    const createHmac = (alg, key) => {
      if (String(alg).toLowerCase() !== 'sha256') throw new Error('Simulated crypto supports sha256');
      const chunks = [];
      return {
        update(data) { chunks.push(data instanceof Uint8Array ? data : MiniBuffer.from(String(data))); return this; },
        digest(enc) {
          const res = hmacSha256(key, MiniBuffer.concat(chunks));
          return enc ? res.toString(enc) : res;
        }
      };
    };
    const createHash = (alg) => {
      if (String(alg).toLowerCase() !== 'sha256') throw new Error('Simulated crypto supports sha256');
      const chunks = [];
      return {
        update(data) { chunks.push(data instanceof Uint8Array ? data : MiniBuffer.from(String(data))); return this; },
        digest(enc) {
          const res = sha256(MiniBuffer.concat(chunks));
          return enc ? res.toString(enc) : res;
        }
      };
    };
    return { randomBytes, scryptSync, scrypt, timingSafeEqual, createHmac, createHash };
  }

  /* ---------- jsonwebtoken (real HS256 JWT sign & verify) ---------- */

  function parseExpiresIn(val) {
    if (typeof val === 'number') return val;
    const m = String(val).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i);
    if (!m) return 3600;
    const num = parseFloat(m[1]);
    const unit = (m[2] || 's').toLowerCase();
    if (unit === 'ms') return num / 1000;
    if (unit === 'm') return num * 60;
    if (unit === 'h') return num * 3600;
    if (unit === 'd') return num * 86400;
    return num;
  }

  function createJwtModule(cryptoMod) {
    class JsonWebTokenError extends Error {
      constructor(msg) { super(msg); this.name = 'JsonWebTokenError'; }
    }
    class TokenExpiredError extends JsonWebTokenError {
      constructor(msg, expiredAt) { super(msg); this.name = 'TokenExpiredError'; this.expiredAt = expiredAt; }
    }
    return {
      JsonWebTokenError,
      TokenExpiredError,
      sign(payload, secret, options = {}) {
        if (!secret) throw new JsonWebTokenError('secretOrPrivateKey must have a value');
        const alg = options.algorithm || 'HS256';
        const header = { alg, typ: 'JWT' };
        const body = Object.assign({}, payload);
        const now = Math.floor(Date.now() / 1000);
        if (!options.noTimestamp && body.iat === undefined) body.iat = now;
        if (options.expiresIn !== undefined) body.exp = (body.iat || now) + Math.floor(parseExpiresIn(options.expiresIn));
        const hB64 = MiniBuffer.from(JSON.stringify(header)).toString('base64url');
        const pB64 = MiniBuffer.from(JSON.stringify(body)).toString('base64url');
        const sig = hmacSha256(String(secret), hB64 + '.' + pB64).toString('base64url');
        return hB64 + '.' + pB64 + '.' + sig;
      },
      verify(token, secret, options = {}) {
        if (typeof token !== 'string') throw new JsonWebTokenError('jwt must be a string');
        const parts = token.split('.');
        if (parts.length !== 3) throw new JsonWebTokenError('jwt malformed');
        let header, payload;
        try {
          header = JSON.parse(MiniBuffer.from(parts[0], 'base64url').toString('utf8'));
          payload = JSON.parse(MiniBuffer.from(parts[1], 'base64url').toString('utf8'));
        } catch {
          throw new JsonWebTokenError('invalid token');
        }
        if (!header || !header.alg || header.alg.toLowerCase() === 'none') {
          throw new JsonWebTokenError('invalid algorithm');
        }
        if (Array.isArray(options.algorithms) && !options.algorithms.includes(header.alg)) {
          throw new JsonWebTokenError('invalid algorithm');
        }
        if (header.alg !== 'HS256') throw new JsonWebTokenError('invalid algorithm');
        const expected = hmacSha256(String(secret || ''), parts[0] + '.' + parts[1]);
        const actual = MiniBuffer.from(parts[2], 'base64url');
        if (actual.length !== expected.length || !cryptoMod.timingSafeEqual(expected, actual)) {
          throw new JsonWebTokenError('invalid signature');
        }
        const now = Math.floor(Date.now() / 1000);
        if (typeof payload.exp === 'number' && now >= payload.exp) {
          throw new TokenExpiredError('jwt expired', new Date(payload.exp * 1000));
        }
        return payload;
      },
      decode(token) {
        if (typeof token !== 'string') return null;
        const parts = token.split('.');
        if (parts.length < 2) return null;
        try { return JSON.parse(MiniBuffer.from(parts[1], 'base64url').toString('utf8')); }
        catch { return null; }
      }
    };
  }

  /* ---------- Lazy self-hosted sql.js (SQLite WebAssembly) ---------- */

  let sqlJsPromise = null;

  function loadSqlJs() {
    if (sqlJsPromise) return sqlJsPromise;
    sqlJsPromise = new Promise((resolve, reject) => {
      const boot = () => {
        if (typeof window.initSqlJs !== 'function') {
          reject(new Error('sql.js loader did not expose initSqlJs.'));
          return;
        }
        window.initSqlJs({
          locateFile: () => WD1.url('assets/vendor/sqljs/sql-wasm.wasm')
        }).then(resolve, (err) => {
          sqlJsPromise = null;
          if (location.protocol === 'file:') {
            reject(new Error('WebAssembly (.wasm) cannot be fetched on file:// URLs. Open this course over HTTP (GitHub Pages or a local server like npx serve) to run live SQL.'));
          } else {
            reject(err);
          }
        });
      };
      if (typeof window.initSqlJs === 'function') { boot(); return; }
      const s = document.createElement('script');
      s.src = WD1.url('assets/vendor/sqljs/sql-wasm.js');
      s.onload = boot;
      s.onerror = () => {
        sqlJsPromise = null;
        reject(new Error('Could not load self-hosted sql-wasm.js from assets/vendor/sqljs/.'));
      };
      document.head.appendChild(s);
    });
    return sqlJsPromise;
  }

  function normalizeSql(sql) {
    return String(sql)
      .replace(/\b(?:BIG)?INT(?:EGER)?\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/\b(?:BIG)?INT(?:EGER)?\s+PRIMARY\s+KEY\s+AUTO_INCREMENT\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/\bAUTO_INCREMENT\b/gi, 'AUTOINCREMENT')
      .replace(/\bENGINE\s*=\s*\w+/gi, '')
      .replace(/\bDEFAULT\s+CHARSET\s*=\s*\w+/gi, '');
  }

  function createMysql2Module(getDbPromise) {
    async function runQuery(sql, params = []) {
      const db = await getDbPromise();
      const norm = normalizeSql(sql);
      const stripped = norm.replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/g, '');
      const isRead = /^(?:SELECT|PRAGMA|WITH|EXPLAIN|SHOW)\b/i.test(stripped);
      const bound = Array.isArray(params) ? params.map((v) => (v === undefined ? null : v)) : [];

      if (isRead) {
        const stmt = db.prepare(norm);
        try {
          if (bound.length) stmt.bind(bound);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          return [rows, []];
        } finally {
          stmt.free();
        }
      }
      const stmt = db.prepare(norm);
      try {
        if (bound.length) stmt.bind(bound);
        stmt.step();
      } finally {
        stmt.free();
      }
      const affectedRows = db.getRowsModified();
      const idRes = db.exec('SELECT last_insert_rowid()');
      const insertId = idRes.length && idRes[0].values.length ? idRes[0].values[0][0] : 0;
      return [{ affectedRows, insertId }, null];
    }

    const connApi = {
      execute: runQuery,
      query: runQuery,
      end: async () => {},
      release: () => {}
    };

    return {
      async createConnection() {
        await getDbPromise();
        return Object.assign({}, connApi);
      },
      createPool() {
        return Object.assign({}, connApi);
      }
    };
  }

  /* ---------- In-browser MongoDB shim ---------- */

  function createMongoModule(cryptoMod, initialSeed) {
    class ObjectId {
      constructor(input) {
        if (input === undefined) {
          const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
          this._hex = (ts + cryptoMod.randomBytes(8).toString('hex')).toLowerCase();
        } else if (input instanceof ObjectId) {
          this._hex = input._hex;
        } else if (typeof input === 'string' && /^[0-9a-fA-F]{24}$/.test(input)) {
          this._hex = input.toLowerCase();
        } else {
          const err = new Error('input must be a 24 character hex string, 12 byte Uint8Array, or an integer');
          err.name = 'BSONError';
          throw err;
        }
      }
      toString() { return this._hex; }
      toHexString() { return this._hex; }
      toJSON() { return this._hex; }
      equals(other) { return other instanceof ObjectId ? this._hex === other._hex : String(other) === this._hex; }
    }

    function cloneDoc(v) {
      if (v instanceof ObjectId) return new ObjectId(v._hex);
      if (Array.isArray(v)) return v.map(cloneDoc);
      if (v && typeof v === 'object') {
        const out = {};
        Object.keys(v).forEach((k) => { out[k] = cloneDoc(v[k]); });
        return out;
      }
      return v;
    }

    function valEq(a, b) {
      if (a instanceof ObjectId && b instanceof ObjectId) return a._hex === b._hex;
      if (a instanceof ObjectId && typeof b === 'string') return a._hex === b.toLowerCase();
      if (b instanceof ObjectId && typeof a === 'string') return b._hex === a.toLowerCase();
      return a === b;
    }

    function matchFilter(doc, filter) {
      if (!filter || typeof filter !== 'object') return true;
      for (const k of Object.keys(filter)) {
        const cond = filter[k];
        const actual = doc[k];
        if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !Array.isArray(cond)) {
          if ('$gt' in cond && !(actual > cond.$gt)) return false;
          if ('$gte' in cond && !(actual >= cond.$gte)) return false;
          if ('$lt' in cond && !(actual < cond.$lt)) return false;
          if ('$lte' in cond && !(actual <= cond.$lte)) return false;
          if ('$ne' in cond && valEq(actual, cond.$ne)) return false;
          if ('$in' in cond && !cond.$in.some((x) => valEq(actual, x))) return false;
        } else if (!valEq(actual, cond)) {
          return false;
        }
      }
      return true;
    }

    const dbs = new Map();
    if (initialSeed) {
      Object.keys(initialSeed).forEach((dbName) => {
        const cols = new Map();
        Object.keys(initialSeed[dbName]).forEach((colName) => {
          cols.set(colName, initialSeed[dbName][colName].map((d) => {
            const copy = cloneDoc(d);
            if (typeof copy._id === 'string' && /^[0-9a-fA-F]{24}$/.test(copy._id)) copy._id = new ObjectId(copy._id);
            else if (copy._id === undefined) copy._id = new ObjectId();
            return copy;
          }));
        });
        dbs.set(dbName, cols);
      });
    }

    function getDocs(dbName, colName) {
      if (!dbs.has(dbName)) dbs.set(dbName, new Map());
      const cols = dbs.get(dbName);
      if (!cols.has(colName)) cols.set(colName, []);
      return cols.get(colName);
    }

    function makeCollection(dbName, colName) {
      const list = getDocs(dbName, colName);
      return {
        async insertOne(doc) {
          const copy = cloneDoc(doc);
          if (copy._id === undefined) copy._id = new ObjectId();
          list.push(copy);
          return { acknowledged: true, insertedId: copy._id };
        },
        async insertMany(docs) {
          const insertedIds = {};
          docs.forEach((d, idx) => {
            const copy = cloneDoc(d);
            if (copy._id === undefined) copy._id = new ObjectId();
            list.push(copy);
            insertedIds[idx] = copy._id;
          });
          return { acknowledged: true, insertedCount: docs.length, insertedIds };
        },
        find(filter = {}) {
          let rows = list.filter((d) => matchFilter(d, filter)).map(cloneDoc);
          const cursor = {
            sort(spec) {
              const keys = Object.keys(spec || {});
              rows.sort((a, b) => {
                for (const k of keys) {
                  if (a[k] < b[k]) return -1 * spec[k];
                  if (a[k] > b[k]) return 1 * spec[k];
                }
                return 0;
              });
              return cursor;
            },
            skip(n) { rows = rows.slice(n); return cursor; },
            limit(n) { rows = rows.slice(0, n); return cursor; },
            async toArray() { return rows; }
          };
          return cursor;
        },
        async findOne(filter = {}) {
          const hit = list.find((d) => matchFilter(d, filter));
          return hit ? cloneDoc(hit) : null;
        },
        async updateOne(filter, update) {
          const hit = list.find((d) => matchFilter(d, filter));
          if (!hit) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
          if (update && update.$set) Object.assign(hit, cloneDoc(update.$set));
          if (update && update.$inc) Object.keys(update.$inc).forEach((k) => { hit[k] = (hit[k] || 0) + update.$inc[k]; });
          if (update && update.$unset) Object.keys(update.$unset).forEach((k) => { delete hit[k]; });
          return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
        },
        async updateMany(filter, update) {
          let count = 0;
          list.forEach((hit) => {
            if (!matchFilter(hit, filter)) return;
            count++;
            if (update && update.$set) Object.assign(hit, cloneDoc(update.$set));
          });
          return { acknowledged: true, matchedCount: count, modifiedCount: count };
        },
        async deleteOne(filter) {
          const idx = list.findIndex((d) => matchFilter(d, filter));
          if (idx === -1) return { acknowledged: true, deletedCount: 0 };
          list.splice(idx, 1);
          return { acknowledged: true, deletedCount: 1 };
        },
        async deleteMany(filter) {
          let deleted = 0;
          for (let i = list.length - 1; i >= 0; i--) {
            if (matchFilter(list[i], filter)) { list.splice(i, 1); deleted++; }
          }
          return { acknowledged: true, deletedCount: deleted };
        },
        async countDocuments(filter = {}) {
          return list.filter((d) => matchFilter(d, filter)).length;
        }
      };
    }

    class MongoClient {
      constructor(uri) { this.uri = uri; this._connected = false; }
      async connect() { this._connected = true; return this; }
      db(name = 'test') { return { collection: (col) => makeCollection(name, col) }; }
      async close() { this._connected = false; }
    }

    return { MongoClient, ObjectId, _getCollection: makeCollection };
  }

  /* ---------- Virtual Filesystem + Path + OS + Util ---------- */

  function normPath(p, cwd = '/app') {
    const raw = String(p || '');
    const full = raw.startsWith('/') ? raw : cwd + '/' + raw;
    const parts = [];
    full.split('/').forEach((seg) => {
      if (!seg || seg === '.') return;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    });
    return '/' + parts.join('/');
  }

  function createPathModule() {
    return {
      sep: '/',
      join: (...args) => normPath(args.filter(Boolean).join('/'), ''),
      resolve: (...args) => {
        let cur = '/app';
        args.forEach((a) => { cur = normPath(a, cur); });
        return cur;
      },
      basename: (p) => { const s = String(p).replace(/\/+$/, ''); return s.slice(s.lastIndexOf('/') + 1); },
      dirname: (p) => { const s = normPath(p); const i = s.lastIndexOf('/'); return i <= 0 ? '/' : s.slice(0, i); },
      extname: (p) => { const b = String(p).split('/').pop() || ''; const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; }
    };
  }

  function createFsModule(filesMap, onMutate) {
    const enoent = (p) => {
      const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
      err.code = 'ENOENT';
      return err;
    };
    const syncApi = {
      readFileSync(p, enc) {
        const key = normPath(p);
        if (!filesMap.has(key)) throw enoent(p);
        const val = filesMap.get(key);
        return enc ? val : MiniBuffer.from(val);
      },
      writeFileSync(p, data) {
        filesMap.set(normPath(p), String(data));
        if (onMutate) onMutate();
      },
      appendFileSync(p, data) {
        const key = normPath(p);
        filesMap.set(key, (filesMap.get(key) || '') + String(data));
        if (onMutate) onMutate();
      },
      existsSync(p) { return filesMap.has(normPath(p)); },
      unlinkSync(p) {
        const key = normPath(p);
        if (!filesMap.has(key)) throw enoent(p);
        filesMap.delete(key);
        if (onMutate) onMutate();
      },
      readdirSync(dir) {
        const prefix = normPath(dir).replace(/\/$/, '') + '/';
        const names = new Set();
        filesMap.forEach((_, k) => {
          if (k.startsWith(prefix)) names.add(k.slice(prefix.length).split('/')[0]);
        });
        return Array.from(names).sort();
      }
    };

    const promisesApi = {
      readFile: (p, enc) => new Promise((res, rej) => setTimeout(() => {
        try { res(syncApi.readFileSync(p, enc)); } catch (e) { rej(e); }
      }, 12)),
      writeFile: (p, data) => new Promise((res, rej) => setTimeout(() => {
        try { syncApi.writeFileSync(p, data); res(); } catch (e) { rej(e); }
      }, 12)),
      appendFile: (p, data) => new Promise((res, rej) => setTimeout(() => {
        try { syncApi.appendFileSync(p, data); res(); } catch (e) { rej(e); }
      }, 12)),
      unlink: (p) => new Promise((res, rej) => setTimeout(() => {
        try { syncApi.unlinkSync(p); res(); } catch (e) { rej(e); }
      }, 12)),
      readdir: (d) => new Promise((res) => setTimeout(() => res(syncApi.readdirSync(d)), 10))
    };

    return {
      fs: Object.assign({}, syncApi, {
        readFile(p, encOrCb, maybeCb) {
          const cb = typeof encOrCb === 'function' ? encOrCb : maybeCb;
          const enc = typeof encOrCb === 'function' ? undefined : encOrCb;
          setTimeout(() => {
            try { cb(null, syncApi.readFileSync(p, enc)); } catch (e) { cb(e); }
          }, 15);
        },
        writeFile(p, data, encOrCb, maybeCb) {
          const cb = typeof encOrCb === 'function' ? encOrCb : maybeCb;
          setTimeout(() => {
            try { syncApi.writeFileSync(p, data); if (cb) cb(null); } catch (e) { if (cb) cb(e); }
          }, 15);
        },
        appendFile(p, data, encOrCb, maybeCb) {
          const cb = typeof encOrCb === 'function' ? encOrCb : maybeCb;
          setTimeout(() => {
            try { syncApi.appendFileSync(p, data); if (cb) cb(null); } catch (e) { if (cb) cb(e); }
          }, 15);
        },
        promises: promisesApi
      }),
      fsPromises: promisesApi
    };
  }

  /* ---------- Virtual Cookie Jar ---------- */

  function createCookieJar() {
    const map = new Map();
    return {
      applySetCookie(headerStr) {
        const parts = String(headerStr).split(';').map((s) => s.trim()).filter(Boolean);
        if (!parts.length) return;
        const eq = parts[0].indexOf('=');
        if (eq < 1) return;
        const name = parts[0].slice(0, eq).trim();
        const value = parts[0].slice(eq + 1).trim();
        const meta = { name, value, httpOnly: false, secure: false, sameSite: null, maxAge: null };
        let expired = false;
        for (let i = 1; i < parts.length; i++) {
          const p = parts[i], idx = p.indexOf('=');
          const k = (idx < 0 ? p : p.slice(0, idx)).trim().toLowerCase();
          const v = idx < 0 ? '' : p.slice(idx + 1).trim();
          if (k === 'httponly') meta.httpOnly = true;
          else if (k === 'secure') meta.secure = true;
          else if (k === 'samesite') meta.sameSite = v;
          else if (k === 'max-age') {
            meta.maxAge = Number(v);
            if (meta.maxAge <= 0) expired = true;
          } else if (k === 'expires') {
            const t = Date.parse(v);
            if (!isNaN(t) && t <= Date.now()) expired = true;
          }
        }
        if (expired) map.delete(name);
        else map.set(name, meta);
      },
      headerString() {
        return Array.from(map.values()).map((c) => c.name + '=' + c.value).join('; ');
      },
      list() { return Array.from(map.values()); },
      clear() { map.clear(); },
      size() { return map.size; }
    };
  }

  /* ---------- HTTP + Mini-Express 5 + morgan + express-session + rate-limit ---------- */

  const STATUS_TEXT = {
    200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found',
    304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Entity',
    429: 'Too Many Requests', 500: 'Internal Server Error'
  };

  const STATIC_MIME = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml'
  };

  function compileRoutePattern(pattern) {
    if (pattern instanceof RegExp) return { regex: pattern, keys: [] };
    const clean = pattern.length > 1 && pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
    const keys = [];
    const reStr = clean.replace(/([.+*?^${}()|[\]\\])/g, '\\$1').replace(/:([A-Za-z_]\w*)/g, (_, name) => {
      keys.push(name);
      return '([^/]+)';
    });
    return { regex: new RegExp('^' + reStr + '/?$'), keys };
  }

  function createHttpAndExpress(ctx) {
    const { filesMap, cryptoMod, log, onListen } = ctx;

    function buildReqRes(reqOpts, resolveDispatch) {
      const start = performance.now();
      const method = (reqOpts.method || 'GET').toUpperCase();
      const rawUrl = reqOpts.url && reqOpts.url.startsWith('/') ? reqOpts.url : '/' + (reqOpts.url || '');
      const parsed = new URL(rawUrl, 'http://localhost:3000');
      const query = {};
      parsed.searchParams.forEach((v, k) => {
        if (k in query) query[k] = Array.isArray(query[k]) ? query[k].concat(v) : [query[k], v];
        else query[k] = v;
      });
      const headers = {};
      Object.entries(reqOpts.headers || {}).forEach(([k, v]) => { headers[k.toLowerCase()] = String(v); });

      const req = {
        method,
        url: parsed.pathname + parsed.search,
        originalUrl: parsed.pathname + parsed.search,
        baseUrl: '',
        path: parsed.pathname,
        query,
        params: {},
        headers,
        ip: '127.0.0.1',
        body: undefined,
        _rawBody: reqOpts.body == null ? '' : String(reqOpts.body),
        get(name) { return this.headers[String(name).toLowerCase()]; },
        header(name) { return this.get(name); }
      };

      const resHeaders = {};
      const setCookies = [];
      const chunks = [];
      const beforeFinish = [];
      const finishListeners = [];
      let finished = false;

      const res = {
        statusCode: 200,
        headersSent: false,
        locals: {},
        _beforeFinish(fn) { beforeFinish.push(fn); },
        on(evt, fn) { if (evt === 'finish') finishListeners.push(fn); return res; },
        setHeader(k, v) {
          const lk = String(k).toLowerCase();
          if (lk === 'set-cookie') {
            if (Array.isArray(v)) v.forEach((x) => setCookies.push(String(x)));
            else setCookies.push(String(v));
          } else {
            resHeaders[lk] = String(v);
          }
          return res;
        },
        set(k, v) {
          if (k && typeof k === 'object') { Object.keys(k).forEach((key) => res.setHeader(key, k[key])); return res; }
          return res.setHeader(k, v);
        },
        header(k, v) { return res.set(k, v); },
        getHeader(k) {
          const lk = String(k).toLowerCase();
          return lk === 'set-cookie' ? setCookies.slice() : resHeaders[lk];
        },
        writeHead(status, hdrs) {
          res.statusCode = status;
          if (hdrs && typeof hdrs === 'object') Object.keys(hdrs).forEach((k) => res.setHeader(k, hdrs[k]));
          return res;
        },
        status(code) { res.statusCode = code; return res; },
        type(t) {
          const map = { text: 'text/plain; charset=utf-8', html: 'text/html; charset=utf-8', json: 'application/json; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8' };
          res.setHeader('Content-Type', map[t] || t);
          return res;
        },
        cookie(name, val, opts = {}) {
          const parts = [encodeURIComponent(name) + '=' + encodeURIComponent(String(val))];
          parts.push('Path=' + (opts.path || '/'));
          if (opts.maxAge != null) parts.push('Max-Age=' + Math.floor(opts.maxAge / 1000));
          if (opts.expires instanceof Date) parts.push('Expires=' + opts.expires.toUTCString());
          if (opts.httpOnly) parts.push('HttpOnly');
          if (opts.secure === true) parts.push('Secure');
          if (opts.sameSite) {
            const ss = opts.sameSite === true ? 'Strict' : String(opts.sameSite);
            parts.push('SameSite=' + ss.charAt(0).toUpperCase() + ss.slice(1).toLowerCase());
          }
          setCookies.push(parts.join('; '));
          return res;
        },
        clearCookie(name, opts = {}) {
          return res.cookie(name, '', Object.assign({}, opts, { maxAge: 0, expires: new Date(0) }));
        },
        write(chunk) {
          if (chunk != null) chunks.push(chunk instanceof Uint8Array ? chunk.toString('utf8') : String(chunk));
          return true;
        },
        end(chunk) {
          if (finished) return res;
          if (chunk != null) res.write(chunk);
          beforeFinish.forEach((fn) => { try { fn(); } catch (e) { log('error', String(e)); } });
          finished = true;
          res.headersSent = true;
          const body = chunks.join('');
          if (!('content-length' in resHeaders)) resHeaders['content-length'] = String(MiniBuffer.byteLength(body));
          const durationMs = performance.now() - start;
          res._bodyLength = body.length;
          finishListeners.forEach((fn) => { try { fn(); } catch (e) { log('error', String(e)); } });
          resolveDispatch({
            status: res.statusCode,
            statusText: STATUS_TEXT[res.statusCode] || '',
            headers: resHeaders,
            setCookies,
            body,
            durationMs
          });
          return res;
        },
        send(body) {
          if (body === undefined || body === null) return res.end('');
          if (typeof body === 'object' && !(body instanceof Uint8Array)) return res.json(body);
          if (!resHeaders['content-type']) res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(body instanceof Uint8Array ? body.toString('utf8') : String(body));
        },
        json(obj) {
          if (!resHeaders['content-type']) res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.end(JSON.stringify(obj));
        },
        redirect(a, b) {
          const code = typeof a === 'number' ? a : 302;
          const loc = typeof a === 'number' ? b : a;
          res.statusCode = code;
          res.setHeader('Location', loc);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.end(`Found. Redirecting to ${loc}`);
        }
      };

      return { req, res, isFinished: () => finished };
    }

    function dispatchWithTimeout(runFn, reqOpts) {
      return new Promise((resolve) => {
        let settled = false;
        const done = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(hangTimer);
          resolve(result);
        };
        const { req, res, isFinished } = buildReqRes(reqOpts, done);
        const hangTimer = setTimeout(() => {
          if (!isFinished()) {
            done({
              hung: true,
              status: 0,
              statusText: 'Timed Out (Hung)',
              headers: {},
              setCookies: [],
              body: 'No response arrived after 2 seconds.\nDid a middleware forget to call next() or send a response?',
              durationMs: 2000
            });
          }
        }, 2000);
        try {
          const maybe = runFn(req, res);
          if (maybe && typeof maybe.then === 'function') {
            maybe.catch((err) => {
              log('error', err && err.stack ? err.stack : String(err));
              if (!isFinished()) res.status(err.status || 500).type('text/plain').send(err.message || 'Internal Server Error');
            });
          }
        } catch (err) {
          log('error', err && err.stack ? err.stack : String(err));
          if (!isFinished()) res.status(err.status || 500).type('text/plain').send(err.message || 'Internal Server Error');
        }
      });
    }

    const httpMod = {
      createServer(handler) {
        const srv = {
          listen(port, cb) {
            onListen({ kind: 'http', port: port || 3000, dispatch: (reqOpts) => dispatchWithTimeout(handler, reqOpts) });
            if (typeof cb === 'function') cb();
            return srv;
          },
          close(cb) { if (typeof cb === 'function') cb(); }
        };
        return srv;
      }
    };

    function makeRouter() {
      const stack = [];
      function router(req, res, outNext) {
        let idx = 0;
        const origPath = req.path;
        const origUrl = req.url;
        const origBase = req.baseUrl;

        function next(err) {
          if (res.headersSent) return;
          if (err === 'route' || err === 'router') {
            req.path = origPath; req.url = origUrl; req.baseUrl = origBase;
            return outNext ? outNext() : null;
          }
          if (idx >= stack.length) {
            req.path = origPath; req.url = origUrl; req.baseUrl = origBase;
            if (outNext) return outNext(err);
            if (err) {
              const status = err.status || 500;
              if (status >= 500) log('error', err.stack || err.message || String(err));
              res.status(status).type('text/plain').send(err.message || 'Internal Server Error');
            } else {
              res.status(404).type('text/plain').send(`Cannot ${req.method} ${req.originalUrl.split('?')[0]}`);
            }
            return;
          }

          const layer = stack[idx++];
          const isErrLayer = layer.fn.length === 4 && !layer.isRouter;

          if (err) {
            if (!isErrLayer) return next(err);
            invokeLayer(layer.fn, [err, req, res, next], next);
            return;
          }
          if (isErrLayer) return next();

          if (layer.type === 'use') {
            const pfx = layer.prefix;
            const matched = pfx === '/' || req.path === pfx || req.path.startsWith(pfx + '/');
            if (!matched) return next();

            const savedPath = req.path, savedUrl = req.url, savedBase = req.baseUrl;
            if (pfx !== '/') {
              req.baseUrl = savedBase + pfx;
              req.path = savedPath.slice(pfx.length) || '/';
              const qIdx = savedUrl.indexOf('?');
              req.url = req.path + (qIdx >= 0 ? savedUrl.slice(qIdx) : '');
            }
            const resume = (e) => {
              req.path = savedPath; req.url = savedUrl; req.baseUrl = savedBase;
              next(e);
            };
            invokeLayer(layer.fn, [req, res, resume], resume);
            return;
          }

          // Route layer
          if (layer.method !== 'ALL' && layer.method !== req.method) return next();
          const m = layer.compiled.regex.exec(req.path);
          if (!m) return next();
          const params = {};
          layer.compiled.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
          req.params = Object.assign({}, req.params, params);
          invokeLayer(layer.fn, [req, res, next], next);
        }

        function invokeLayer(fn, args, onErr) {
          try {
            const ret = fn.apply(null, args);
            if (ret && typeof ret.then === 'function') ret.catch((e) => onErr(e));
          } catch (e) {
            onErr(e);
          }
        }

        next();
      }

      router.isRouter = true;
      router._stack = stack;

      router.use = function (pathOrFn, ...rest) {
        let prefix = '/';
        let fns = [];
        if (typeof pathOrFn === 'string') {
          prefix = pathOrFn.length > 1 && pathOrFn.endsWith('/') ? pathOrFn.slice(0, -1) : pathOrFn;
          fns = rest;
        } else {
          fns = [pathOrFn, ...rest];
        }
        fns.flat().forEach((fn) => {
          if (typeof fn === 'function') stack.push({ type: 'use', prefix, fn, isRouter: !!fn.isRouter });
        });
        return router;
      };

      ['get', 'post', 'put', 'delete', 'patch', 'all'].forEach((m) => {
        router[m] = function (pattern, ...fns) {
          const compiled = compileRoutePattern(pattern);
          fns.flat().forEach((fn) => {
            if (typeof fn === 'function') stack.push({ type: 'route', method: m.toUpperCase(), pattern, compiled, fn });
          });
          return router;
        };
      });

      return router;
    }

    function express() {
      const app = makeRouter();
      app.listen = function (port, cb) {
        const p = typeof port === 'number' || typeof port === 'string' ? port : 3000;
        const done = typeof port === 'function' ? port : cb;
        onListen({ kind: 'express', port: p, app, dispatch: (reqOpts) => dispatchWithTimeout((req, res) => app(req, res), reqOpts) });
        if (typeof done === 'function') done();
        return { close() {} };
      };
      return app;
    }

    express.Router = makeRouter;
    express.json = () => (req, res, next) => {
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (!ct.includes('application/json') && !ct.includes('+json')) return next();
      if (!req._rawBody.trim()) { req.body = {}; return next(); }
      try {
        req.body = JSON.parse(req._rawBody);
        next();
      } catch (err) {
        err.status = 400;
        next(err);
      }
    };
    express.urlencoded = () => (req, res, next) => {
      const ct = (req.headers['content-type'] || '').toLowerCase();
      if (!ct.includes('application/x-www-form-urlencoded')) return next();
      const obj = {};
      new URLSearchParams(req._rawBody).forEach((v, k) => { obj[k] = v; });
      req.body = obj;
      next();
    };
    express.static = (rootDir) => {
      const base = normPath(rootDir);
      return (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        let rel = req.path === '/' ? '/index.html' : req.path;
        const target = normPath(base + rel);
        if (!target.startsWith(base + '/') && target !== base) return next();
        if (!filesMap.has(target)) return next();
        const dot = target.lastIndexOf('.');
        const ext = dot >= 0 ? target.slice(dot).toLowerCase() : '';
        res.setHeader('Content-Type', STATIC_MIME[ext] || 'application/octet-stream');
        res.send(filesMap.get(target));
      };
    };

    const morgan = () => (req, res, next) => {
      const t0 = performance.now();
      res.on('finish', () => {
        const ms = (performance.now() - t0).toFixed(3);
        const len = res.getHeader('content-length') || '0';
        log('log', `${req.method} ${req.originalUrl} ${res.statusCode} ${ms} ms - ${len}`);
      });
      next();
    };

    const expressSession = (opts = {}) => {
      const cookieName = opts.name || 'connect.sid';
      const secret = opts.secret || 'dev-secret';
      const saveUninit = opts.saveUninitialized !== false;
      const cookieOpts = Object.assign({ httpOnly: true, sameSite: 'lax', path: '/' }, opts.cookie || {});
      const store = new Map();

      const signSid = (sid) => 's:' + sid + '.' + hmacSha256(String(secret), sid).toString('base64url').slice(0, 16);
      const parseSid = (cookieHeader) => {
        if (!cookieHeader) return null;
        const pairs = cookieHeader.split(';');
        for (const p of pairs) {
          const eq = p.indexOf('=');
          if (eq < 0) continue;
          const k = decodeURIComponent(p.slice(0, eq).trim());
          if (k !== cookieName) continue;
          const v = decodeURIComponent(p.slice(eq + 1).trim());
          const m = v.match(/^s:([^.]+)\./);
          return m ? m[1] : v;
        }
        return null;
      };

      const makeSessionObj = (sid, data) => {
        const sess = Object.assign({}, data);
        Object.defineProperties(sess, {
          id: { value: sid, enumerable: false, configurable: true },
          cookie: { value: Object.assign({}, cookieOpts), enumerable: false, configurable: true },
          regenerate: {
            enumerable: false, configurable: true,
            value(cb) {
              store.delete(this.id);
              const freshId = cryptoMod.randomBytes(12).toString('hex');
              const fresh = makeSessionObj(freshId, {});
              fresh._touched = true;
              fresh._regenerated = true;
              store.set(freshId, {});
              if (this._req) this._req.session = fresh;
              if (typeof cb === 'function') cb(null);
            }
          },
          destroy: {
            enumerable: false, configurable: true,
            value(cb) {
              store.delete(this.id);
              if (this._req) {
                this._req._sessionDestroyed = true;
                this._req.session = null;
              }
              if (typeof cb === 'function') cb(null);
            }
          },
          save: {
            enumerable: false, configurable: true,
            value(cb) { if (typeof cb === 'function') cb(null); }
          }
        });
        return sess;
      };

      return (req, res, next) => {
        const incomingSid = parseSid(req.headers.cookie || '');
        const existed = !!(incomingSid && store.has(incomingSid));
        const sid = existed ? incomingSid : cryptoMod.randomBytes(12).toString('hex');
        const initialData = existed ? Object.assign({}, store.get(sid)) : {};
        const beforeSnap = JSON.stringify(initialData);
        req.session = makeSessionObj(sid, initialData);
        req.session._req = req;

        res._beforeFinish(() => {
          if (req._sessionDestroyed || !req.session) return;
          const cur = req.session;
          const plain = {};
          Object.keys(cur).forEach((k) => { if (!k.startsWith('_')) plain[k] = cur[k]; });
          const changed = JSON.stringify(plain) !== beforeSnap || cur._regenerated;
          if (existed || changed || saveUninit) {
            store.set(cur.id, plain);
            if (!existed || cur._regenerated) {
              res.cookie(cookieName, signSid(cur.id), cookieOpts);
            }
          }
        });

        next();
      };
    };

    const rateLimit = (opts = {}) => {
      const limit = opts.limit || opts.max || 10;
      const windowMs = opts.windowMs || 15 * 60 * 1000;
      const hits = new Map();
      return (req, res, next) => {
        const now = Date.now();
        let rec = hits.get(req.ip);
        if (!rec || now > rec.resetAt) rec = { count: 0, resetAt: now + windowMs };
        rec.count++;
        hits.set(req.ip, rec);
        const remaining = Math.max(0, limit - rec.count);
        if (opts.standardHeaders) {
          res.setHeader('RateLimit-Limit', String(limit));
          res.setHeader('RateLimit-Remaining', String(remaining));
        }
        if (rec.count > limit) {
          const msg = opts.message || 'Too many requests, please try again later.';
          if (typeof msg === 'object') return res.status(429).json(msg);
          return res.status(429).send(String(msg));
        }
        next();
      };
    };

    return { httpMod, express, morgan, expressSession, rateLimit };
  }

  /* ---------- Named Virtual Harnesses for Course Snippets ---------- */

  const SEED_BOOKS_SQL = [
    'CREATE TABLE books (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(200) NOT NULL, author VARCHAR(120) NOT NULL);',
    "INSERT INTO books (title, author) VALUES ('Dune', 'Frank Herbert');",
    "INSERT INTO books (title, author) VALUES ('Emma', 'Jane Austen');",
    "INSERT INTO books (title, author) VALUES ('The Hobbit', 'J.R.R. Tolkien');"
  ].join('\n');

  const SEED_USERS_SQL = [
    'CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(60) NOT NULL, role VARCHAR(20) NOT NULL);',
    "INSERT INTO users (name, role) VALUES ('ada', 'admin');",
    "INSERT INTO users (name, role) VALUES ('grace', 'instructor');",
    "INSERT INTO users (name, role) VALUES ('student1', 'student');"
  ].join('\n');

  const SEED_MONGO_BOOKS = {
    bookstore: {
      books: [
        { _id: '65f000000000000000000001', title: 'Dune', author: 'Frank Herbert' },
        { _id: '65f000000000000000000002', title: 'Emma', author: 'Jane Austen' },
        { _id: '65f000000000000000000003', title: 'The Hobbit', author: 'J.R.R. Tolkien' }
      ]
    }
  };

  const WK2_BOOKS_ROUTER_SRC = `
const express = require('express');
const router = express.Router();
let books = [
  { id: 1, title: 'Dune', author: 'Frank Herbert' },
  { id: 2, title: 'Emma', author: 'Jane Austen' }
];
let nextId = 3;
router.get('/', (req, res) => res.json(books));
router.get('/:id', (req, res) => {
  const book = books.find((b) => b.id === Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json(book);
});
router.post('/', (req, res) => {
  if (!req.body || !req.body.title) return res.status(400).json({ error: 'title required' });
  const book = { id: nextId++, title: req.body.title, author: req.body.author || '' };
  books.push(book);
  res.status(201).json(book);
});
router.delete('/:id', (req, res) => {
  const i = books.findIndex((b) => b.id === Number(req.params.id));
  if (i === -1) return res.status(404).json({ error: 'Book not found' });
  books.splice(i, 1);
  res.status(204).send();
});
module.exports = router;
`;

  const WK4_PASSWORD_SRC = `
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const COST = { N: 16384, r: 8, p: 1 };
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, COST);
  return salt + ':' + hash.toString('hex');
}
async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = await scrypt(password, salt, 64, COST);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), test);
}
module.exports = { hashPassword, checkPassword };
`;

  const HARNESSES = {
    'notes': {
      note: 'Virtual filesystem pre-loaded with notes.txt (edit or inspect below).',
      files: { '/app/notes.txt': 'Remember to call next() in Express middleware.\nKeep secrets in environment variables.\n' }
    },
    'wk1-format': {
      note: 'Virtual project includes local module ./format.js exporting formatGreeting().',
      modules: {
        '/app/format.js': `function formatGreeting(name) {\n  const clean = (name || 'visitor').trim();\n  return 'Hello, ' + clean + '!';\n}\nmodule.exports = { formatGreeting };`
      }
    },
    'wk1-app-excerpt': {
      note: 'Wrapped in a pre-configured Express app with express.json() and express.urlencoded().',
      wrapServer: true
    },
    'wk1-broken-module': {
      note: 'Virtual project contains ./server.js (spelled with an "r"), not ./sever.js.',
      modules: { '/app/server.js': `console.log('server.js loaded successfully!');\nmodule.exports = { ok: true };` }
    },
    'wk2-app-excerpt': {
      note: 'Wrapped in a pre-configured Express app listening on port 3000.',
      wrapServer: true
    },
    'wk2-gatekeeper': {
      note: 'Wrapped in Express with a protected route GET /api/secret and public route GET /public mounted after your middleware.',
      wrapServer: true,
      afterCode: `
app.get('/api/secret', (req, res) => res.json({ secret: '42', ok: true }));
app.get('/public', (req, res) => res.send('Open to everyone — no token needed'));
`
    },
    'wk2-hang': {
      note: 'Wrapped in Express with a GET / route mounted after the broken middleware. Requests time out after 2 seconds when next() is missing.',
      wrapServer: true,
      afterCode: `app.get('/', (req, res) => res.send('You will only see this after adding next()!'));`
    },
    'wk2-static': {
      note: 'Virtual public/ folder pre-loaded with index.html, styles.css, app.js, and hello.txt.',
      files: {
        '/app/public/hello.txt': 'Hello from the public folder!\n',
        '/app/public/index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <title>Static Demo</title>\n  <link rel="stylesheet" href="/styles.css">\n</head>\n<body>\n  <main class="card">\n    <h1>Served by express.static()</h1>\n    <p id="status">Loading…</p>\n  </main>\n  <script src="/app.js"></script>\n</body>\n</html>`,
        '/app/public/styles.css': `body { font-family: system-ui, sans-serif; max-width: 520px; margin: 40px auto; padding: 0 16px; }\n.card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 20px; }\nh1 { margin-top: 0; color: #1f4fd1; }`,
        '/app/public/app.js': `document.getElementById('status').textContent = 'Client JS ran at ' + new Date().toLocaleTimeString();`
      }
    },
    'wk2-router': {
      note: 'Virtual project includes ./routes/books.js and public/hello.txt.',
      files: { '/app/public/hello.txt': 'Hello from the public folder!\n' },
      modules: { '/app/routes/books.js': WK2_BOOKS_ROUTER_SRC }
    },
    'wk3-theme-cookie': {
      note: 'Wrapped in Express with GET / rendering a themed page based on your theme cookie.',
      wrapServer: true,
      afterCode: `
app.get('/', (req, res) => {
  const m = (req.headers.cookie || '').match(/(?:^|;\\s*)theme=([^;]+)/);
  const theme = m ? decodeURIComponent(m[1]) : 'light';
  const bg = theme === 'dark' ? '#161b26' : '#ffffff';
  const fg = theme === 'dark' ? '#eef2ff' : '#1f2937';
  res.send('<!DOCTYPE html><html lang="en"><body style="font-family:system-ui;padding:24px;background:' + bg + ';color:' + fg + '"><h1>Current theme: ' + theme + '</h1><p>Cookie header received: <code>' + (req.headers.cookie || '(none)') + '</code></p></body></html>');
});
`
    },
    'wk3-session-cart': {
      note: 'Wrapped in Express with express.json() and express-session.',
      wrapServer: true,
      withSession: true
    },
    'wk3-async-notes': {
      note: 'Wrapped in Express with express.json() and virtual file /app/notes.txt.',
      wrapServer: true,
      files: { '/app/notes.txt': 'Buy milk\nFinish Week 3\n' }
    },
    'wk3-sql-books-empty': {
      note: 'Pre-seeded SQLite WebAssembly database: empty table books ready for INSERT.',
      seedSql: 'CREATE TABLE books (id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(200) NOT NULL, author VARCHAR(120) NOT NULL);'
    },
    'wk3-sql-books': {
      note: 'Pre-seeded SQLite WebAssembly database: table books with 3 rows (Dune, Emma, The Hobbit).',
      seedSql: SEED_BOOKS_SQL
    },
    'wk3-sql-books-server': {
      note: 'Express app backed by live SQLite WebAssembly (table books pre-seeded with 3 rows).',
      seedSql: SEED_BOOKS_SQL,
      afterCode: `app.listen(3000, () => console.log('Listening on port 3000 (SQLite WASM pool ready)'));`
    },
    'wk3-sql-authors': {
      note: 'Real SQLite WebAssembly with PRAGMA foreign_keys = ON. Try the preset buttons to seed rows or test a broken foreign key!',
      sqlPresets: [
        {
          label: 'Run schema + empty JOIN',
          append: ''
        },
        {
          label: 'Seed authors & books + JOIN',
          replace: `CREATE TABLE authors (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n);\n\nCREATE TABLE books (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  title VARCHAR(200) NOT NULL,\n  author_id INT NOT NULL,\n  FOREIGN KEY (author_id) REFERENCES authors(id)\n);\n\nINSERT INTO authors (name) VALUES ('Frank Herbert'), ('Jane Austen');\nINSERT INTO books (title, author_id) VALUES ('Dune', 1), ('Dune Messiah', 1), ('Emma', 2);\n\nSELECT books.id, books.title, authors.name AS author\nFROM books\nJOIN authors ON books.author_id = authors.id;`
        },
        {
          label: 'Test broken FOREIGN KEY (error!)',
          replace: `CREATE TABLE authors (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(120) NOT NULL\n);\nCREATE TABLE books (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  title VARCHAR(200) NOT NULL,\n  author_id INT NOT NULL,\n  FOREIGN KEY (author_id) REFERENCES authors(id)\n);\n\n-- No author with id 99 exists — the database rejects this!\nINSERT INTO books (title, author_id) VALUES ('Ghost Book', 99);`
        }
      ]
    },
    'wk3-mongo-crud': {
      note: 'Runs inside an async function with a pre-seeded in-browser bookstore.books collection (Dune, Emma, The Hobbit).',
      seedMongo: SEED_MONGO_BOOKS,
      asyncNode: true,
      beforeCode: `const { MongoClient, ObjectId } = require('mongodb');\nconst _client = new MongoClient('mongodb://localhost:27017');\nawait _client.connect();\nconst books = _client.db('bookstore').collection('books');\n`,
      afterCode: `\nconsole.log('--- Collection state now ---');\nconsole.log(await books.find().toArray());`
    },
    'wk3-mongo-read': {
      note: 'Runs inside an async function with a pre-seeded bookstore.books collection and prints all, byAusten, and one.',
      seedMongo: SEED_MONGO_BOOKS,
      asyncNode: true,
      beforeCode: `const { MongoClient, ObjectId } = require('mongodb');\nconst _client = new MongoClient('mongodb://localhost:27017');\nawait _client.connect();\nconst books = _client.db('bookstore').collection('books');\n`,
      afterCode: `\nconsole.log('all (' + all.length + '):', all);\nconsole.log('byAusten:', byAusten);\nconsole.log('one:', one);`
    },
    'wk3-mongo-routes-list': {
      note: 'Wrapped in Express with seeded bookstore.books (Dune, Emma, The Hobbit) and error middleware.',
      seedMongo: SEED_MONGO_BOOKS,
      wrapServer: true,
      beforeCode: `const _mongo = require('mongodb');\nconst books = new _mongo.MongoClient('mongodb://localhost:27017').db('bookstore').collection('books');\n`,
      afterCode: `
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
`
    },
    'wk3-mongo-routes': {
      note: 'Wrapped in Express with seeded bookstore.books (Dune: 65f000000000000000000001, Emma: 65f000000000000000000002) and error middleware.',
      seedMongo: SEED_MONGO_BOOKS,
      wrapServer: true,
      beforeCode: `const { MongoClient, ObjectId } = require('mongodb');\nconst _mc = new MongoClient('mongodb://localhost:27017');\nconst books = _mc.db('bookstore').collection('books');\n`,
      afterCode: `
app.get('/api/books', async (req, res, next) => {
  try { res.json(await books.find().toArray()); } catch (e) { next(e); }
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
`
    },
    'wk4-password-async': {
      note: 'Tests your async hashPassword() and checkPassword() functions right after defining them.',
      afterCode: `
(async () => {
  const stored = await hashPassword('correct horse battery staple');
  console.log('Async hash:', stored.slice(0, 20) + '... (' + stored.length + ' chars total)');
  console.log('Right password accepted:', await checkPassword('correct horse battery staple', stored));
  console.log('Wrong password accepted:', await checkPassword('hunter2', stored));
})();
`
    },
    'wk3-validate-fn': {
      note: 'Calls your validateBook() function against 3 test inputs and prints each result.',
      afterCode: `
console.log('Valid book:', validateBook({ title: 'Dune', author: 'Frank Herbert' }));
console.log('Empty title:', validateBook({ title: '   ', author: 'Jane Austen' }));
console.log('Missing both:', validateBook({}));
`
    },
    'wk3-validate-route': {
      note: 'Wrapped in Express with express.json(), validateBook(), and an in-memory saveBook() helper.',
      wrapServer: true,
      beforeCode: `
function validateBook(book) {
  const errors = [];
  if (!book || typeof book !== 'object') return ['Send a book object.'];
  if (typeof book.title !== 'string' || book.title.trim() === '') errors.push('Title is required.');
  else if (book.title.trim().length > 100) errors.push('Title must be 100 characters or fewer.');
  if (typeof book.author !== 'string' || book.author.trim() === '') errors.push('Author is required.');
  else if (book.author.trim().length > 60) errors.push('Author must be 60 characters or fewer.');
  return errors;
}
let _id = 1;
async function saveBook(b) { return { id: _id++, ...b }; }
`
    },
    'wk4-hash-salts': {
      note: 'Includes hashPassword() from hash-demo.js (in-browser PBKDF2-SHA256 KDF shim).',
      beforeCode: `
const crypto = require('crypto');
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
`
    },
    'wk4-login': {
      note: 'Pre-seeded user: username "ada", password "correct horse battery staple" (role: student). Includes ./password.js and GET /dashboard.',
      env: { SESSION_SECRET: 'course-demo-session-secret-0123456789abcdef' },
      modules: { '/app/password.js': WK4_PASSWORD_SRC },
      beforeCode: `
const _c = require('crypto');
const _adaSalt = _c.randomBytes(16).toString('hex');
const _adaHash = _adaSalt + ':' + _c.scryptSync('correct horse battery staple', _adaSalt, 64).toString('hex');
const _USERS = [{ id: 42, username: 'ada', role: 'student', password_hash: _adaHash }];
async function findUser(u) { return _USERS.find((x) => x.username === u) || null; }
`,
      afterCode: `
app.get('/dashboard', (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).send('401 Unauthorized — please POST /login first');
  res.json({ message: 'Welcome to your dashboard!', userId: req.session.userId, role: req.session.role });
});
app.get('/', (req, res) => res.send(req.session && req.session.userId ? 'Signed in as user #' + req.session.userId : 'Signed out (public home page)'));
`
    },
    'wk4-jwt-route': {
      note: 'Wrapped in Express with process.env.JWT_SECRET set. Preset chips include a real freshly-signed HS256 token and a tampered copy.',
      env: { JWT_SECRET: 'course-demo-jwt-secret-keep-private' },
      wrapServer: true,
      dynamicPresets(cryptoMod) {
        const jwtMod = createJwtModule(cryptoMod);
        const valid = jwtMod.sign({ sub: 'user-42', name: 'Ada', role: 'student' }, 'course-demo-jwt-secret-keep-private', { expiresIn: '1h' });
        const last = valid.slice(-1);
        const tampered = valid.slice(0, -1) + (last === 'A' ? 'B' : 'A');
        return [
          { label: 'Valid Bearer token (200)', method: 'GET', path: '/api/my-grades', headers: { Authorization: 'Bearer ' + valid } },
          { label: 'Tampered token (401)', method: 'GET', path: '/api/my-grades', headers: { Authorization: 'Bearer ' + tampered } },
          { label: 'No Authorization header (401)', method: 'GET', path: '/api/my-grades' }
        ];
      }
    },
    'wk4-guards': {
      note: 'Wrapped in Express + express-session with a demo helper route POST /demo-login/:role so you can switch roles and test 401 vs 403 live.',
      wrapServer: true,
      withSession: true,
      beforeCode: `
// Demo-only helper so you can sign in as different roles in class:
app.post('/demo-login/:role', (req, res) => {
  req.session.userId = 'user-' + req.params.role;
  req.session.role = req.params.role;
  res.json({ signedInAs: req.session.userId, role: req.session.role });
});
app.post('/demo-logout', (req, res) => {
  req.session.destroy(() => { res.clearCookie('connect.sid'); res.json({ signedOut: true }); });
});
`
    },
    'wk4-ownership': {
      note: 'Wrapped in Express + sessions with seeded books (#1 owned by user-1, #2 owned by user-2) and POST /demo-login/:userId/:role.',
      wrapServer: true,
      withSession: true,
      beforeCode: `
const _BOOKS = [
  { id: '1', title: 'Dune', author: 'Frank Herbert', ownerId: 'user-1' },
  { id: '2', title: 'Emma', author: 'Jane Austen', ownerId: 'user-2' }
];
async function findBookById(id) { return _BOOKS.find((b) => b.id === String(id)) || null; }
async function updateBook(id, body) {
  const b = _BOOKS.find((x) => x.id === String(id));
  if (body && body.title) b.title = body.title;
  if (body && body.author) b.author = body.author;
  return b;
}
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first' });
  next();
}
app.post('/demo-login/:userId/:role', (req, res) => {
  req.session.userId = req.params.userId;
  req.session.role = req.params.role;
  res.json({ userId: req.session.userId, role: req.session.role });
});
`
    },
    'wk4-sqli': {
      note: 'Live SQL injection demo backed by real SQLite WebAssembly (table users: ada, grace, student1). Edit username below to test!',
      seedSql: SEED_USERS_SQL,
      asyncNode: true,
      beforeCode: `
const mysql = require('mysql2/promise');
const db = await mysql.createConnection({ database: 'demo' });
const username = "' OR '1'='1";
console.log('Attacker input username =', JSON.stringify(username));
`,
      afterCode: `
const [badRows] = await db.execute(badSql);
console.log('\\n1) VULNERABLE query built:', badSql);
console.log('   Rows leaked (' + badRows.length + '):', badRows);
console.log('\\n2) SAFE parameterized query with ? placeholder:');
console.log('   Rows returned (' + rows.length + '):', rows);
`
    },
    'wk4-ratelimit': {
      note: 'Wrapped in Express with a stub handleLogin. Try changing limit: 10 to limit: 3 and clicking Send repeatedly to trigger 429!',
      wrapServer: true,
      beforeCode: `
let _attempt = 0;
function handleLogin(req, res) {
  _attempt++;
  res.status(401).json({ error: 'Wrong password', attempt: _attempt });
}
`
    }
  };

  /* ---------- Pretty formatter for console.log ---------- */

  function fmtVal(v, depth = 0) {
    if (typeof v === 'string') return v;
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'function') return `[Function: ${v.name || 'anonymous'}]`;
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (v instanceof MiniBuffer) return `<Buffer ${v.toString('hex').slice(0, 40)}${v.length > 20 ? '...' : ''}>`;
    if (depth > 3) return '[Object]';
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }

  /* ---------- Code Execution Engine ---------- */

  async function executeScript(code, opts) {
    const { mode, harness, filesMap, env, log, onListen, getDbPromise, mongoMod, timers } = opts;
    const cryptoMod = createCryptoModule();
    const jwtMod = createJwtModule(cryptoMod);
    const pathMod = createPathModule();
    const { fs: fsMod, fsPromises } = createFsModule(filesMap, opts.onFsMutate);
    const mysql2Mod = createMysql2Module(getDbPromise);
    const { httpMod, express, morgan, expressSession, rateLimit } = createHttpAndExpress({
      filesMap, cryptoMod, log, onListen
    });

    const moduleCache = new Map();
    const localSources = Object.assign({}, (harness && harness.modules) || {});

    function makeRequire() {
      return function reqMod(id) {
        if (id === 'http' || id === 'node:http') return httpMod;
        if (id === 'express') return express;
        if (id === 'fs' || id === 'node:fs') return fsMod;
        if (id === 'fs/promises' || id === 'node:fs/promises') return fsPromises;
        if (id === 'path' || id === 'node:path') return pathMod;
        if (id === 'os' || id === 'node:os') return { platform: () => 'browser (simulated Linux)', type: () => 'Linux', hostname: () => 'localhost', EOL: '\n' };
        if (id === 'util' || id === 'node:util') {
          return {
            promisify: (fn) => (...args) => new Promise((res, rej) => fn(...args, (err, val) => (err ? rej(err) : res(val))))
          };
        }
        if (id === 'crypto' || id === 'node:crypto') return cryptoMod;
        if (id === 'jsonwebtoken') return jwtMod;
        if (id === 'morgan') return morgan;
        if (id === 'express-session') return expressSession;
        if (id === 'express-rate-limit') return rateLimit;
        if (id === 'mongodb') return mongoMod;
        if (id === 'mysql2/promise') return mysql2Mod;

        if (id.startsWith('./') || id.startsWith('../')) {
          const base = normPath(id);
          const candidates = [base, base + '.js', base + '/index.js'];
          const hit = candidates.find((c) => c in localSources);
          if (hit) {
            if (moduleCache.has(hit)) return moduleCache.get(hit).exports;
            const mod = { exports: {} };
            moduleCache.set(hit, mod);
            runSandboxed(localSources[hit], mod, false);
            return mod.exports;
          }
        }
        const err = new Error(`Cannot find module '${id}'`);
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      };
    }

    const fakeProcess = {
      version: 'v24.11.1 (browser simulator)',
      platform: 'linux',
      cwd: () => '/app',
      env: Object.assign({
        NODE_ENV: 'development',
        PORT: '3000',
        DB_HOST: 'localhost',
        DB_USER: 'root',
        DB_PASSWORD: 'demo-password',
        DB_NAME: 'bookstore',
        SESSION_SECRET: 'dev-session-secret',
        JWT_SECRET: 'dev-jwt-secret'
      }, (harness && harness.env) || {}, env || {}),
      exit: (c) => { log('warn', `process.exit(${c || 0})`); }
    };

    const fakeConsole = {
      log: (...a) => log('log', a.map((x) => fmtVal(x)).join(' ')),
      info: (...a) => log('info', a.map((x) => fmtVal(x)).join(' ')),
      warn: (...a) => log('warn', a.map((x) => fmtVal(x)).join(' ')),
      error: (...a) => log('error', a.map((x) => fmtVal(x)).join(' ')),
      table: (rows) => log('log', fmtVal(rows))
    };

    const trackedSetTimeout = (fn, ms, ...args) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        try { fn(...args); } catch (e) { log('error', e && e.stack ? `${e.name}: ${e.message}` : String(e)); }
      }, ms);
      timers.add(id);
      return id;
    };
    const trackedClearTimeout = (id) => { timers.delete(id); window.clearTimeout(id); };

    // Loop guard with 1.5s budget per event-loop turn
    let gCount = 0, gStart = 0, gArmed = false;
    function __wd2loop() {
      if (!gArmed) { gArmed = true; gCount = 0; gStart = Date.now(); window.setTimeout(() => { gArmed = false; }, 0); }
      gCount++;
      if ((gCount < 50 || gCount % 200 === 0) && Date.now() - gStart > 1500) {
        throw new Error('Loop stopped after 1.5 seconds (possible infinite loop).');
      }
      return true;
    }

    function runSandboxed(src, modObj, isAsync) {
      let body = src;
      if (isAsync) body = `return (async () => {\n${src}\n})();`;
      const guarded = WD1.guardLoops ? WD1.guardLoops(body) : body;
      const fn = new Function(
        'require', 'module', 'exports', '__dirname', '__filename',
        'console', 'process', 'Buffer', 'setTimeout', 'clearTimeout', '__wd2loop',
        'window', 'document', 'localStorage', 'sessionStorage', 'location', 'history', 'alert', 'confirm', 'prompt', 'top', 'parent', 'self', 'globalThis',
        guarded
      );
      return fn(
        makeRequire(), modObj, modObj.exports, '/app', '/app/index.js',
        fakeConsole, fakeProcess, MiniBuffer, trackedSetTimeout, trackedClearTimeout, __wd2loop,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined
      );
    }

    // Handle `node -e "..."` terminal one-liners
    let userSrc = String(code);
    const trimmed = userSrc.trim();
    if (/^node\s+-e\s+/.test(trimmed)) {
      const m = trimmed.match(/^node\s+-e\s+(['"])([\s\S]*)\1\s*$/);
      if (m) userSrc = m[2];
    }

    // Assemble harness wrapper if configured
    let fullSrc = userSrc;
    let isAsync = !!(harness && harness.asyncNode);

    if (harness && harness.wrapServer) {
      const pre = [
        `const express = require('express');`,
        `const app = express();`,
        `app.use(express.json());`,
        `app.use(express.urlencoded({ extended: true }));`,
        harness.withSession ? `const session = require('express-session'); app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax' } }));` : '',
        harness.beforeCode || ''
      ].filter(Boolean).join('\n');
      const post = [
        harness.afterCode || '',
        `app.listen(3000, () => console.log('Listening on port 3000'));`
      ].filter(Boolean).join('\n');
      fullSrc = pre + '\n' + userSrc + '\n' + post;
    } else {
      if (harness && harness.beforeCode) fullSrc = harness.beforeCode + '\n' + fullSrc;
      if (harness && harness.afterCode) fullSrc = fullSrc + '\n' + harness.afterCode;
    }

    const modObj = { exports: {} };
    const ret = runSandboxed(fullSrc, modObj, isAsync);
    if (ret && typeof ret.then === 'function') await ret;
  }

  /* ---------- UI Mounting ---------- */

  function parsePresets(raw) {
    if (!raw) return [];
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
    catch { return []; }
  }

  function parseEnv(raw) {
    if (!raw) return {};
    try { const e = JSON.parse(raw); return e && typeof e === 'object' ? e : {}; }
    catch { return {}; }
  }

  function statusPillClass(code) {
    if (code >= 200 && code < 300) return 'pill good';
    if (code >= 300 && code < 400) return 'pill info';
    if (code >= 400 && code < 500) return 'pill warn';
    return 'pill bad';
  }

  function renderSqlTable(columns, values, caption) {
    const thead = h('thead', null, h('tr', null, columns.map((c) => h('th', { text: c }))));
    const tbody = h('tbody', null, values.length
      ? values.map((row) => h('tr', null, row.map((cell) => h('td', { text: cell === null ? 'NULL' : String(cell) }))))
      : [h('tr', null, h('td', { colspan: String(columns.length), class: 'muted', text: '(0 rows)' }))]);
    const wrap = h('div', { class: 'table-wrap' }, h('table', { class: 'data-table' }, thead, tbody));
    return caption ? h('div', null, h('div', { class: 'runner-sql-meta', text: caption, style: { marginBottom: '4px' } }), wrap) : wrap;
  }

  function mountRunner(block) {
    if (block.dataset.runnerMounted) return;
    block.dataset.runnerMounted = '1';

    const mode = block.dataset.run; // 'node' | 'server' | 'sql'
    const harnessName = block.dataset.harness || '';
    const harness = harnessName ? HARNESSES[harnessName] : null;
    const origCode = block._wdCode || '';
    const lang = block._wdLang || (mode === 'sql' ? 'sql' : 'js');
    const staticPresets = parsePresets(block.dataset.presets);
    const envObj = parseEnv(block.dataset.env);

    const triggerLabel = mode === 'sql' ? '▶ Run SQL (WASM)'
      : mode === 'server' ? '▶ Start & test server'
      : '▶ Run live';
    const metaText = mode === 'sql' ? 'SQLite WebAssembly (MySQL-compatible)'
      : mode === 'server' ? 'In-browser Node / Express simulator'
      : 'In-browser Node simulator';

    const triggerBtn = h('button', {
      type: 'button',
      class: 'btn small run-trigger',
      'aria-expanded': 'false',
      text: triggerLabel
    });
    const runBar = h('div', { class: 'code-run-bar' },
      triggerBtn,
      h('span', { class: 'code-run-meta' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), metaText)
    );
    block.appendChild(runBar);

    let panel = null;
    let open = false;
    let instance = null;

    function toggle() {
      open = !open;
      block.classList.toggle('runner-open', open);
      triggerBtn.setAttribute('aria-expanded', String(open));
      triggerBtn.textContent = open ? 'Hide runner' : triggerLabel;
      if (open && !panel) {
        panel = buildPanel();
        block.appendChild(panel);
        if (instance && instance.autoStart) instance.autoStart();
      } else if (panel) {
        panel.hidden = !open;
      }
    }

    triggerBtn.addEventListener('click', toggle);

    function buildPanel() {
      const timers = new Set();
      let activeServer = null;
      let wasmDb = null;
      let wasmDbPromise = null;
      const cookieJar = createCookieJar();
      const filesMap = new Map();
      let mongoMod = null;

      function resetState() {
        timers.forEach((id) => window.clearTimeout(id));
        timers.clear();
        activeServer = null;
        if (wasmDb) { try { wasmDb.close(); } catch { /* ignore */ } wasmDb = null; }
        wasmDbPromise = null;
        filesMap.clear();
        if (harness && harness.files) {
          Object.entries(harness.files).forEach(([k, v]) => filesMap.set(normPath(k), v));
        }
        mongoMod = createMongoModule(createCryptoModule(), harness && harness.seedMongo);
      }
      resetState();

      function getDbPromise() {
        if (wasmDbPromise) return wasmDbPromise;
        wasmDbPromise = loadSqlJs().then((SQL) => {
          const db = new SQL.Database();
          db.run('PRAGMA foreign_keys = ON;');
          if (harness && harness.seedSql) db.run(normalizeSql(harness.seedSql));
          wasmDb = db;
          return db;
        });
        return wasmDbPromise;
      }

      const statusEl = h('span', { class: 'runner-status', role: 'status', text: 'Ready' });
      const badgeText = mode === 'sql' ? 'SQLite WASM' : 'In-browser simulator';

      const editorWrap = h('div', { class: 'runner-editor-col' });
      const edHeader = h('div', { class: 'runner-section-head' },
        h('span', { text: 'Editable code' }),
        h('span', { text: 'Changes run here only' }));
      const edHolder = h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1' } });
      editorWrap.append(edHeader, edHolder);

      const editorLang = lang === 'text' ? 'text' : lang;
      const edHeight = Math.min(340, Math.max(170, origCode.split('\n').length * 22 + 32));
      const editor = WD1.editor(edHolder, { value: origCode, lang: editorLang, height: edHeight });

      const outCol = h('div', { class: 'runner-out-col' });
      const consoleEl = mode === 'sql' ? null : h('div', { class: 'runner-console', 'aria-live': 'polite', 'aria-label': 'Runner console' });
      const sqlOutEl = mode === 'sql' ? h('div', { class: 'runner-sql-out', 'aria-live': 'polite' }) : null;

      function clearConsole() {
        if (!consoleEl) return;
        consoleEl.innerHTML = '';
        consoleEl.appendChild(h('div', { class: 'empty', text: mode === 'server' ? 'Server console logs appear here.' : 'Output appears here.' }));
      }

      function log(type, text) {
        if (!consoleEl) return;
        const empty = $('.empty', consoleEl);
        if (empty) empty.remove();
        const prefix = type === 'error' ? '✖ ' : type === 'warn' ? '⚠ ' : type === 'info' ? '› ' : '';
        consoleEl.appendChild(h('div', { class: 'log-line ' + (type === 'log' ? '' : type), text: prefix + text }));
        while (consoleEl.childElementCount > 400) consoleEl.firstElementChild.remove();
        consoleEl.scrollTop = consoleEl.scrollHeight;
      }

      if (consoleEl) clearConsole();

      // Virtual files viewer (shown when virtual files exist)
      const filesBox = h('details', { class: 'runner-files', hidden: true });
      const filesSummary = h('summary', { text: 'Virtual files' });
      const filesBody = h('div');
      filesBox.append(filesSummary, filesBody);

      function renderFiles() {
        if (!filesMap.size) { filesBox.hidden = true; return; }
        filesBox.hidden = false;
        filesSummary.textContent = `Virtual files (${filesMap.size})`;
        filesBody.innerHTML = '';
        filesMap.forEach((content, path) => {
          filesBody.appendChild(h('div', { style: { marginTop: '6px' } },
            h('code', { text: path }),
            h('pre', { text: content })));
        });
      }

      // Server-specific UI: presets, request bar, cookies, response + HTML preview
      let reqMethodSel, reqPathInp, reqHeadersInp, reqBodyInp, respBox, previewWrap, cookiesBar, cookiesList;
      let lastResponse = null;

      if (mode === 'server') {
        const presets = (harness && typeof harness.dynamicPresets === 'function')
          ? harness.dynamicPresets(createCryptoModule())
          : staticPresets;

        if (presets.length) {
          const presetBar = h('div', { class: 'runner-presets', 'aria-label': 'Preset requests' });
          presets.forEach((p) => {
            const btn = h('button', {
              type: 'button',
              class: 'runner-preset',
              onclick: () => {
                reqMethodSel.value = (p.method || 'GET').toUpperCase();
                reqPathInp.value = p.path || '/';
                reqHeadersInp.value = p.headers ? Object.entries(p.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
                reqBodyInp.value = p.body || '';
                updateEquiv();
                sendCurrentRequest();
              }
            }, h('span', { class: 'm-tag', text: (p.method || 'GET').toUpperCase() }), p.label || p.path || '/');
            presetBar.appendChild(btn);
          });
          outCol.appendChild(presetBar);
        }

        const firstP = presets[0] || { method: 'GET', path: '/' };
        reqMethodSel = h('select', { class: 'mono', 'aria-label': 'HTTP method' },
          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => h('option', { value: m, text: m })));
        reqMethodSel.value = (firstP.method || 'GET').toUpperCase();
        reqPathInp = h('input', { type: 'text', class: 'mono', 'aria-label': 'Request path', value: firstP.path || '/', placeholder: '/path?query=1' });
        reqPathInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendCurrentRequest(); } });
        const sendBtn = h('button', { type: 'button', class: 'btn small primary send-btn', text: 'Send', onclick: sendCurrentRequest });

        reqHeadersInp = h('textarea', { class: 'input mono', 'aria-label': 'Request headers', placeholder: 'Content-Type: application/json\nAuthorization: Bearer ...' });
        reqHeadersInp.value = firstP.headers ? Object.entries(firstP.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
        reqBodyInp = h('textarea', { class: 'input mono', 'aria-label': 'Request body', placeholder: '{"title": "Dune", "author": "Frank Herbert"}' });
        reqBodyInp.value = firstP.body || '';

        const extraDetails = h('details', { class: 'runner-req-extra' },
          h('summary', { text: 'Headers & Body' }),
          h('div', { class: 'field' }, h('label', { text: 'Headers (Name: Value, one per line)' }), reqHeadersInp),
          h('div', { class: 'field' }, h('label', { text: 'Request body (JSON or form key=value&...)' }), reqBodyInp)
        );

        const curlPre = h('pre', { class: 'runner-equiv-code' });
        const curlKey = h('p', { class: 'runner-equiv-key' });
        const fetchPre = h('pre', { class: 'runner-equiv-code' });
        const equivDetails = h('details', { class: 'runner-req-extra runner-equiv' },
          h('summary', { text: 'Show as curl & browser fetch()' }),
          h('div', { class: 'runner-equiv-grid' },
            h('div', { class: 'runner-equiv-box' },
              h('div', { class: 'runner-equiv-lbl', text: 'Terminal (curl)' }),
              curlPre,
              curlKey),
            h('div', { class: 'runner-equiv-box' },
              h('div', { class: 'runner-equiv-lbl', text: 'Browser JS (fetch)' }),
              fetchPre))
        );

        function updateEquiv() {
          const method = reqMethodSel.value || 'GET';
          const rawPath = (reqPathInp.value || '/').trim() || '/';
          const path = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
          const url = 'http://localhost:3000' + path;
          const headers = {};
          reqHeadersInp.value.split('\n').forEach((line) => {
            const idx = line.indexOf(':');
            if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          });
          const body = reqBodyInp.value;
          const hasCt = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
          if (body && !hasCt) {
            headers['Content-Type'] = /^\s*[{[]/.test(body) ? 'application/json' : 'application/x-www-form-urlencoded';
          }
          const jarStr = cookieJar.headerString();

          // Build equivalent curl command + plain-English flag key
          const curlParts = ['curl -i'];
          const flags = ['-i shows status + headers'];
          if (method !== 'GET') {
            curlParts.push(`-X ${method}`);
            flags.push(`-X ${method} sets HTTP method`);
          }
          Object.entries(headers).forEach(([k, v]) => {
            curlParts.push(`-H "${k}: ${v.replace(/"/g, '\\"')}"`);
            if (!flags.some((f) => f.startsWith('-H'))) flags.push('-H adds a header');
          });
          if (jarStr && !Object.keys(headers).some((k) => k.toLowerCase() === 'cookie')) {
            curlParts.push('-b jar.txt');
            flags.push('-b sends saved cookies');
          }
          if (body) {
            curlParts.push(`-d '${body.replace(/'/g, "'\\''")}'`);
            flags.push('-d attaches request body');
          }
          curlParts.push(path.includes('?') || path.includes('&') ? `"${url}"` : url);
          curlPre.textContent = curlParts.join(' \\\n  ');
          curlKey.textContent = flags.join(' · ');

          // Build equivalent browser fetch() code
          const fetchOpts = [];
          if (method !== 'GET') fetchOpts.push(`  method: '${method}'`);
          if (Object.keys(headers).length) {
            const hLines = Object.entries(headers).map(([k, v]) => `    '${k}': '${v.replace(/'/g, "\\'")}'`).join(',\n');
            fetchOpts.push(`  headers: {\n${hLines}\n  }`);
          }
          if (body) {
            const isJson = /^\s*[{[]/.test(body);
            if (isJson) {
              try {
                JSON.parse(body);
                fetchOpts.push(`  body: JSON.stringify(${body})`);
              } catch {
                fetchOpts.push(`  body: ${JSON.stringify(body)}`);
              }
            } else {
              fetchOpts.push(`  body: ${JSON.stringify(body)}`);
            }
          }
          fetchPre.textContent = fetchOpts.length
            ? `const res = await fetch('${path}', {\n${fetchOpts.join(',\n')}\n});`
            : `const res = await fetch('${path}');`;
        }

        [reqMethodSel, reqPathInp, reqHeadersInp, reqBodyInp].forEach((el) => {
          el.addEventListener('input', updateEquiv);
          el.addEventListener('change', updateEquiv);
        });
        updateEquiv();

        outCol.appendChild(h('div', { class: 'runner-req' },
          h('div', { class: 'runner-req-row' }, reqMethodSel, reqPathInp, sendBtn),
          extraDetails,
          equivDetails
        ));

        cookiesList = h('span', { class: 'cluster' });
        const clearCookiesBtn = h('button', {
          type: 'button', class: 'btn small ghost', text: 'Clear cookies',
          onclick: () => { cookieJar.clear(); renderCookies(); updateEquiv(); log('info', 'Browser cookie jar cleared (acting as a new visitor).'); }
        });
        cookiesBar = h('div', { class: 'runner-cookies', hidden: true },
          h('strong', { text: 'Browser cookies:' }), cookiesList, clearCookiesBtn);
        outCol.appendChild(cookiesBar);

        respBox = h('div', { class: 'runner-response', 'aria-live': 'polite' },
          h('span', { class: 'muted', text: 'Click a preset button above or press Send to make a request.' }));
        previewWrap = h('div', { class: 'runner-preview-wrap', hidden: true });
        outCol.append(
          h('div', { class: 'runner-section-head' }, h('span', { text: 'HTTP Response' })),
          respBox,
          previewWrap,
          h('div', { class: 'runner-section-head' },
            h('span', { text: 'Server Console' }),
            h('button', { type: 'button', class: 'btn small ghost', text: 'Clear', onclick: clearConsole })),
          consoleEl
        );
      } else if (mode === 'sql') {
        const sqlPresets = (harness && harness.sqlPresets) || staticPresets;
        if (sqlPresets.length) {
          const presetBar = h('div', { class: 'runner-presets', 'aria-label': 'SQL presets' });
          sqlPresets.forEach((p) => {
            presetBar.appendChild(h('button', {
              type: 'button', class: 'runner-preset', text: p.label,
              onclick: () => {
                if (p.replace != null) editor.set(p.replace);
                else if (p.append != null) editor.set(origCode + p.append);
                runSql();
              }
            }));
          });
          outCol.appendChild(presetBar);
        }
        outCol.append(
          h('div', { class: 'runner-section-head' }, h('span', { text: 'SQL Result (SQLite WebAssembly)' })),
          sqlOutEl
        );
      } else {
        outCol.append(
          h('div', { class: 'runner-section-head' },
            h('span', { text: 'Console Output' }),
            h('button', { type: 'button', class: 'btn small ghost', text: 'Clear', onclick: clearConsole })),
          consoleEl
        );
      }

      function renderCookies() {
        if (!cookiesBar) return;
        const list = cookieJar.list();
        cookiesBar.hidden = !list.length;
        cookiesList.innerHTML = '';
        list.forEach((c) => {
          const flags = [c.httpOnly ? 'HttpOnly' : '', c.sameSite ? 'SameSite=' + c.sameSite : '', c.secure ? 'Secure' : ''].filter(Boolean);
          cookiesList.appendChild(h('span', {
            class: 'runner-cookie-chip',
            text: `${c.name}=${c.value.length > 26 ? c.value.slice(0, 26) + '…' : c.value}${flags.length ? ' (' + flags.join(', ') + ')' : ''}`
          }));
        });
      }

      async function renderHtmlPreview(html) {
        if (!previewWrap || !activeServer) return;
        let doc = html;
        // Inline local <link rel="stylesheet" href="/..."> from the live server
        const cssMatches = [...doc.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'](\/[^"']+)["'][^>]*>/gi)];
        for (const m of cssMatches) {
          const r = await activeServer.dispatch({ method: 'GET', url: m[1], headers: {}, body: '' });
          if (r.status === 200) doc = doc.replace(m[0], '<style>\n' + r.body + '\n</style>');
        }
        // Inline local <script src="/..."></script> from the live server
        const jsMatches = [...doc.matchAll(/<script\b[^>]*src=["'](\/[^"']+)["'][^>]*><\/script>/gi)];
        for (const m of jsMatches) {
          const r = await activeServer.dispatch({ method: 'GET', url: m[1], headers: {}, body: '' });
          if (r.status === 200) doc = doc.replace(m[0], '<script>\n' + r.body.replace(/<\/script/gi, '<\\/script') + '\n<\/script>');
        }
        previewWrap.innerHTML = '';
        const frame = WD1.previewFrame('Live server response preview');
        frame.srcdoc = doc;
        previewWrap.appendChild(frame);
        previewWrap.hidden = false;
      }

      async function sendCurrentRequest() {
        if (!activeServer) {
          if (statusEl.textContent !== 'Starting…') await runCode();
          const deadline = Date.now() + 1200;
          while (!activeServer && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 25));
          }
          if (!activeServer) return;
        }
        const method = reqMethodSel.value;
        const url = reqPathInp.value.trim() || '/';
        const headers = {};
        reqHeadersInp.value.split('\n').forEach((line) => {
          const idx = line.indexOf(':');
          if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
        });
        const body = reqBodyInp.value;
        if (body && !headers['content-type']) {
          headers['content-type'] = /^\s*[{[]/.test(body) ? 'application/json' : 'application/x-www-form-urlencoded';
        }
        const jarHeader = cookieJar.headerString();
        if (jarHeader && !headers.cookie) headers.cookie = jarHeader;

        previewWrap.hidden = true;
        respBox.innerHTML = '';
        respBox.appendChild(h('span', { class: 'muted', text: `Sending ${method} ${url}…` }));

        const res = await activeServer.dispatch({ method, url, headers, body });
        lastResponse = res;
        (res.setCookies || []).forEach((sc) => cookieJar.applySetCookie(sc));
        renderCookies();
        if (typeof updateEquiv === 'function') updateEquiv();
        renderFiles();

        respBox.innerHTML = '';
        const statusPill = h('span', {
          class: res.hung ? 'pill bad' : statusPillClass(res.status),
          text: res.hung ? '⏱ Hung (2s timeout)' : `${res.status} ${res.statusText}`.trim()
        });
        const headRow = h('div', { class: 'runner-resp-head' },
          statusPill,
          h('span', { class: 'muted small', text: `${method} ${url} · ${res.durationMs.toFixed(1)} ms` })
        );

        const ct = (res.headers['content-type'] || '').toLowerCase();
        if (ct.includes('text/html') && res.body && !res.hung) {
          const prevBtn = h('button', {
            type: 'button', class: 'btn small', text: 'Preview rendered HTML',
            onclick: () => {
              if (!previewWrap.hidden) { previewWrap.hidden = true; prevBtn.textContent = 'Preview rendered HTML'; }
              else { renderHtmlPreview(res.body); prevBtn.textContent = 'Hide HTML preview'; }
            }
          });
          headRow.appendChild(prevBtn);
        }
        if (res.status >= 300 && res.status < 400 && res.headers.location) {
          const loc = res.headers.location;
          headRow.appendChild(h('button', {
            type: 'button', class: 'btn small', text: `Follow → GET ${loc}`,
            onclick: () => { reqMethodSel.value = 'GET'; reqPathInp.value = loc; reqBodyInp.value = ''; sendCurrentRequest(); }
          }));
        }

        const hdrLines = Object.entries(res.headers).map(([k, v]) => `${k}: ${v}`)
          .concat((res.setCookies || []).map((c) => `set-cookie: ${c}`));
        let bodyDisplay = res.body;
        if (ct.includes('application/json') && res.body) {
          try { bodyDisplay = JSON.stringify(JSON.parse(res.body), null, 2); } catch { /* keep raw */ }
        }
        respBox.append(
          headRow,
          hdrLines.length ? h('div', { class: 'runner-resp-headers', text: hdrLines.join('\n') }) : null,
          h('pre', { class: 'runner-resp-body', text: bodyDisplay || '(empty body)' })
        );
      }

      let listenGraceTimer = null;
      async function runCode() {
        clearTimeout(listenGraceTimer);
        resetState();
        clearConsole();
        if (previewWrap) previewWrap.hidden = true;
        statusEl.textContent = mode === 'server' ? 'Starting…' : 'Running…';
        statusEl.className = 'runner-status';

        try {
          await executeScript(editor.get(), {
            mode, harness, filesMap, env: envObj, log, timers, getDbPromise, mongoMod,
            onFsMutate: renderFiles,
            onListen: (srv) => {
              clearTimeout(listenGraceTimer);
              activeServer = srv;
              statusEl.textContent = `Listening on :${srv.port}`;
              statusEl.className = 'runner-status live';
              log('info', `Virtual server ready at http://localhost:${srv.port}`);
            }
          });
          renderFiles();
          if (mode === 'server') {
            if (!activeServer) {
              // Async startup functions (e.g. await hashPassword(); app.listen()) may call listen shortly after
              listenGraceTimer = window.setTimeout(() => {
                if (!activeServer) {
                  statusEl.textContent = 'No server listening';
                  statusEl.className = 'runner-status err';
                  log('warn', 'Code finished without calling app.listen() or server.listen().');
                }
              }, 800);
            }
          } else {
            statusEl.textContent = 'Finished';
            statusEl.className = 'runner-status live';
          }
        } catch (err) {
          clearTimeout(listenGraceTimer);
          log('error', err && err.name ? `${err.name}: ${err.message}` : String(err));
          statusEl.textContent = 'Error';
          statusEl.className = 'runner-status err';
        }
      }

      async function runSql() {
        sqlOutEl.innerHTML = '';
        statusEl.textContent = 'Loading SQLite WASM…';
        statusEl.className = 'runner-status';
        try {
          const SQL = await loadSqlJs();
          const db = new SQL.Database();
          try {
            db.run('PRAGMA foreign_keys = ON;');
            if (harness && harness.seedSql) db.run(normalizeSql(harness.seedSql));
            const t0 = performance.now();
            const results = db.exec(normalizeSql(editor.get()));
            const ms = (performance.now() - t0).toFixed(1);
            const modified = db.getRowsModified();

            if (results.length) {
              results.forEach((r, idx) => {
                const cap = results.length > 1 ? `Query #${idx + 1} — ${r.values.length} row(s)` : `${r.values.length} row(s) returned (${ms} ms)`;
                sqlOutEl.appendChild(renderSqlTable(r.columns, r.values, cap));
              });
            } else {
              sqlOutEl.appendChild(h('div', { class: 'feedback good', style: { marginTop: 0 }, text: `✓ Executed successfully (${modified} row(s) affected · ${ms} ms)` }));
              // Show live table contents after DDL/DML so students immediately see the result!
              const tbls = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
              if (tbls.length && tbls[0].values.length) {
                tbls[0].values.forEach(([tName]) => {
                  const safeName = String(tName).replace(/"/g, '""');
                  const rows = db.exec(`SELECT * FROM "${safeName}" LIMIT 25`);
                  if (rows.length) {
                    sqlOutEl.appendChild(renderSqlTable(rows[0].columns, rows[0].values, `Current rows in "${tName}"`));
                  } else {
                    const cols = db.exec(`PRAGMA table_info("${safeName}")`);
                    if (cols.length) {
                      sqlOutEl.appendChild(renderSqlTable(['column', 'type', 'not null', 'pk'], cols[0].values.map((r) => [r[1], r[2], r[3] ? 'YES' : 'NO', r[5] ? 'PRIMARY KEY' : '']), `Schema created: "${tName}" (0 rows)`));
                    }
                  }
                });
              }
            }
            statusEl.textContent = `OK · ${ms} ms`;
            statusEl.className = 'runner-status live';
          } finally {
            db.close();
          }
        } catch (err) {
          sqlOutEl.appendChild(h('div', { class: 'feedback bad', style: { marginTop: 0 }, text: 'SQL Error: ' + (err.message || String(err)) }));
          statusEl.textContent = 'SQL Error';
          statusEl.className = 'runner-status err';
        }
      }

      const primaryAction = mode === 'sql' ? runSql : runCode;
      const primaryLabel = mode === 'sql' ? '▶ Run SQL' : mode === 'server' ? '↻ Restart server' : '▶ Run again';

      const toolbar = h('div', { class: 'runner-bar' },
        h('span', { class: 'runner-badge', text: badgeText }),
        h('button', { type: 'button', class: 'btn small primary', text: primaryLabel, onclick: primaryAction }),
        h('button', {
          type: 'button', class: 'btn small ghost', text: 'Reset code',
          onclick: () => {
            editor.set(origCode);
            cookieJar.clear();
            renderCookies();
            primaryAction();
          }
        }),
        statusEl
      );

      const p = h('div', { class: 'runner-panel' },
        toolbar,
        h('div', { class: 'runner-panes' }, editorWrap, outCol),
        filesBox,
        harness && harness.note ? h('div', { class: 'runner-note', text: harness.note }) : null
      );

      instance = {
        autoStart: primaryAction,
        run: primaryAction,
        sendRequest: sendCurrentRequest
      };
      block._wdRunner = instance;
      return p;
    }
  }

  function mountAll(root) {
    $$('.code-block[data-run]', root || document).forEach(mountRunner);
  }

  WD1.runner = {
    mountAll,
    loadSqlJs,
    normalizeSql,
    _crypto: createCryptoModule,
    _jwt: () => createJwtModule(createCryptoModule())
  };

  WD1.ready(() => mountAll(document));
})();
