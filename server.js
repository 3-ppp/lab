// Lab: el mapa de proyectos del curso. Sin dependencias: solo Node.
// Lee la carpeta estudiantes/ del repositorio, muestra un mapa y avisa en vivo cuando un proyecto cambia.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const REPO_DIR = path.resolve(process.env.REPO_DIR || __dirname);
const REPO_URL = (process.env.REPO_URL || "").replace(/\.git$/, "").replace(/\/$/, ""); // https://github.com/usuario/repo
const GIT_PULL = process.env.GIT_PULL === "1"; // en producción: trae los cambios de GitHub
const POLL_MS = Number(process.env.POLL_MS || 20000);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const STUDENTS = path.join(REPO_DIR, "estudiantes");
const PUBLIC = path.join(__dirname, "public");

const ID_RE = /^[a-z0-9][a-z0-9-]{0,38}$/; // nombre de carpeta = usuario de GitHub en minúsculas
const MAX_PROJECTS = 200;
const MAX_FILE = 2 * 1024 * 1024;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { cwd: REPO_DIR, timeout: 60000, maxBuffer: 20 * 1024 * 1024, ...opts }, (err, stdout, stderr) =>
      err ? reject(Object.assign(err, { stderr })) : resolve(stdout)
    )
  );
const git = (...args) => run("git", ["-c", "core.quotepath=false", "-c", "safe.directory=*", ...args]);

// ---------- Lectura de proyectos ----------
async function listFiles(dir, base = "", depth = 0, out = []) {
  let entries = [];
  try { entries = await fs.readdir(path.join(dir, base), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (out.length >= 60 || e.name.startsWith(".")) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isFile()) out.push(rel); // los enlaces simbólicos no son isFile(): quedan afuera
    else if (e.isDirectory() && depth < 3) await listFiles(dir, rel, depth + 1, out);
  }
  return out;
}

async function history() {
  // una sola consulta: por cada commit, las carpetas de estudiantes que tocó
  const info = new Map();
  try {
    const out = await git("log", "--format=@%ct", "--name-only", "--", "estudiantes");
    let ts = 0, seen = new Set();
    for (const line of out.split("\n")) {
      if (line.startsWith("@")) { ts = Number(line.slice(1)); seen = new Set(); continue; }
      const m = line.match(/^estudiantes\/([^/]+)\//);
      if (!m || !ID_RE.test(m[1])) continue;
      const it = info.get(m[1]) || { first: ts, last: ts, commits: 0 };
      it.first = Math.min(it.first, ts); it.last = Math.max(it.last, ts);
      if (!seen.has(m[1])) { it.commits++; seen.add(m[1]); }
      info.set(m[1], it);
    }
  } catch { /* sin git: se usan las fechas de los archivos */ }
  return info;
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function scan() {
  let entries = [];
  try { entries = await fs.readdir(STUDENTS, { withFileTypes: true }); } catch {}
  const ids = entries.filter((e) => e.isDirectory() && ID_RE.test(e.name)).map((e) => e.name).slice(0, MAX_PROJECTS);
  const hist = await history();
  const projects = [];
  for (const id of ids) {
    const dir = path.join(STUDENTS, id);
    const files = await listFiles(dir);
    if (!files.includes("index.html")) continue; // sin index.html todavía no es un proyecto
    let meta = {};
    try {
      const raw = await fs.readFile(path.join(dir, "proyecto.json"), "utf8");
      if (raw.length < 8192) meta = JSON.parse(raw);
    } catch {}
    let h = hist.get(id);
    if (!h) { // fuera de git: fechas de los archivos
      let newest = 0, oldest = Infinity;
      for (const f of files) { try { const st = await fs.stat(path.join(dir, f)); newest = Math.max(newest, st.mtimeMs); oldest = Math.min(oldest, st.mtimeMs); } catch {} }
      h = { first: Math.floor(oldest / 1000) || 0, last: Math.floor(newest / 1000) || 0, commits: 1 };
    }
    projects.push({
      id,
      titulo: str(meta.titulo, 80) || id,
      nombre: str(meta.nombre, 60) || id,
      descripcion: str(meta.descripcion, 240),
      archivos: files.length,
      commits: h.commits,
      creado: h.first,
      actualizado: h.last,
    });
  }
  projects.sort((a, b) => a.creado - b.creado || a.id.localeCompare(b.id));
  return projects;
}

// ---------- Estado y avisos en vivo ----------
let state = { projects: [], at: 0 };
const signature = (p) => [p.actualizado, p.commits, p.archivos, p.titulo, p.descripcion].join("|");
const clients = new Set();
const send = (event, data) => { for (const res of clients) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

let refreshing = null;
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    if (GIT_PULL) {
      try {
        await git("fetch", "--quiet", "--depth", "500", "origin", "main");
        await git("reset", "--quiet", "--hard", "origin/main");
      } catch (e) { console.error("git:", (e.stderr || e.message).toString().trim().slice(0, 300)); }
    }
    const next = await scan();
    const before = new Map(state.projects.map((p) => [p.id, signature(p)]));
    const first = state.at === 0;
    state = { projects: next, at: Date.now() };
    if (!first) for (const p of next) {
      const prev = before.get(p.id);
      if (prev !== signature(p)) send("cambio", { id: p.id, titulo: p.titulo, nombre: p.nombre, nuevo: prev === undefined });
    }
  })().catch((e) => console.error("refresh:", e.message)).finally(() => { refreshing = null; });
  return refreshing;
}

// ---------- HTTP ----------
const SEC = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const APP_CSP = "default-src 'self'; img-src 'self' data:; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function json(res, code, body) {
  res.writeHead(code, { ...SEC, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(JSON.stringify(body));
}
const notFound = (res) => json(res, 404, { error: "No existe" });

// Archivos de un proyecto: código de estudiantes, o sea NO confiable. Se sirven aislados (sandbox sin same-origin).
async function serveProject(req, res, url) {
  const m = url.pathname.match(/^\/p\/([^/]+)(\/.*)?$/);
  if (!m || !ID_RE.test(m[1])) return notFound(res);
  if (!m[2]) { res.writeHead(301, { Location: `/p/${m[1]}/` }); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(m[2]); } catch { return notFound(res); }
  if (rel.includes("\0") || rel.split("/").some((s) => s === "..")) return notFound(res);
  if (rel.endsWith("/")) rel += "index.html";
  const type = TYPES[path.extname(rel).toLowerCase()];
  if (!type) return notFound(res);
  try {
    const root = path.join(await fs.realpath(STUDENTS), m[1]);
    const dirStat = await fs.lstat(root);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return notFound(res);
    const real = await fs.realpath(path.join(root, rel));
    if (!real.startsWith(root + path.sep)) return notFound(res); // un enlace simbólico no puede sacar archivos de la carpeta
    const st = await fs.stat(real);
    if (!st.isFile() || st.size > MAX_FILE) return notFound(res);
    const body = await fs.readFile(real);
    res.writeHead(200, {
      ...SEC,
      "Content-Type": type,
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-modals",
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch { notFound(res); }
}

async function serveStatic(req, res, url) {
  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  try { rel = decodeURIComponent(rel); } catch { return notFound(res); }
  const target = path.normalize(path.join(PUBLIC, rel));
  const type = TYPES[path.extname(target).toLowerCase()];
  if (!target.startsWith(PUBLIC + path.sep) || !type) return notFound(res);
  try {
    const body = await fs.readFile(target);
    res.writeHead(200, { ...SEC, "Content-Type": type, "Content-Security-Policy": APP_CSP, "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch { notFound(res); }
}

function readBody(req, max = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > max) { reject(new Error("grande")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "POST" && url.pathname === "/hook") {
      // Aviso de GitHub (webhook "push"): trae los cambios ya, sin esperar al siguiente ciclo
      if (!WEBHOOK_SECRET) return notFound(res);
      const body = await readBody(req);
      const sig = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
      const got = String(req.headers["x-hub-signature-256"] || "");
      if (got.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(sig))) return json(res, 401, { error: "firma inválida" });
      refresh();
      return json(res, 202, { ok: true });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "método no permitido" });
    if (url.pathname === "/healthz") return json(res, 200, { ok: true, proyectos: state.projects.length });
    if (url.pathname === "/api/proyectos")
      return json(res, 200, { proyectos: state.projects, repo: REPO_URL, ahora: Math.floor(Date.now() / 1000) });
    if (url.pathname === "/api/eventos") {
      if (clients.size >= 500) return json(res, 503, { error: "muchas conexiones" });
      res.writeHead(200, { ...SEC, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.write("retry: 3000\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname.startsWith("/p/")) return serveProject(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e.message);
    if (!res.headersSent) json(res, 500, { error: "error interno" });
  }
});

async function start() {
  if (GIT_PULL) {
    // Primera vez: clonar el repositorio público en REPO_DIR
    try { await fs.access(path.join(REPO_DIR, ".git")); }
    catch {
      if (!REPO_URL) throw new Error("GIT_PULL=1 necesita REPO_URL");
      await fs.mkdir(REPO_DIR, { recursive: true });
      await run("git", ["clone", "--quiet", "--depth", "500", "--branch", "main", REPO_URL + ".git", REPO_DIR], { cwd: "/" });
    }
  }
  await refresh();
  setInterval(refresh, POLL_MS).unref();
  setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 25000).unref();
  server.listen(PORT, () => console.log(`Lab escuchando en :${PORT} (${state.projects.length} proyectos)`));
}
start().catch((e) => { console.error(e.message); process.exit(1); });
