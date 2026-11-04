// Portfolio server using Node.js built-in modules and MongoDB.
// Forms are sent with fetch() (no page reload), so the page never jumps or auto-scrolls.
const http = require("http");
const fs = require("fs");
const path = require("path");
const querystring = require("querystring");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017";
const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 5000 });
const sessions = {};

let users;
let portfolio;
let messages;

const CATEGORIES = ["Skill", "Achievement", "Project", "Hobby"];

/* ---------- helpers ---------- */

// Reads a request body (JSON or normal form data) and returns it as an object.
function readBody(request) {
  return new Promise(function (resolve) {
    let body = "";
    let tooBig = false;
    request.on("data", function (part) {
      if (tooBig) return;
      body += part;
      if (body.length > 100000) { tooBig = true; body = ""; }
    });
    request.on("end", function () {
      if (tooBig) return resolve({});
      const type = request.headers["content-type"] || "";
      if (type.includes("application/json")) {
        try { resolve(JSON.parse(body || "{}") || {}); } catch (error) { resolve({}); }
      } else {
        resolve(querystring.parse(body));
      }
    });
    request.on("error", function () { resolve({}); });
  });
}

function sendPage(response, html) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(html);
}

function sendJSON(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function redirect(response, address) {
  response.writeHead(302, { Location: address });
  response.end();
}

const SESSION_SECONDS = 60 * 60 * 24 * 7;

function startSession(response, user) {
  const session = crypto.randomBytes(24).toString("hex");
  sessions[session] = { name: user.name, email: user.email, expires: Date.now() + SESSION_SECONDS * 1000 };
  response.writeHead(302, {
    "Set-Cookie": "session=" + session + "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" + SESSION_SECONDS,
    Location: "/"
  });
  response.end();
}

function getUser(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)session=([a-f0-9]+)/);
  const user = match ? sessions[match[1]] : null;
  if (user && user.expires < Date.now()) { delete sessions[match[1]]; return null; }
  return user || null;
}

// Safe JSON for putting inside a <script> tag.
function safeJSON(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function cleanItem(row) {
  return { id: row._id.toString(), title: row.title, category: row.category, description: row.description };
}

async function loadItems() {
  const rows = await portfolio.find({ category: { $ne: "Academic" } }).sort({ _id: -1 }).toArray();
  return rows.map(cleanItem);
}

/* ---------- pages ---------- */

async function showHome(request, response) {
  const user = getUser(request);
  if (!user) return redirect(response, "/auth");
  const items = await loadItems();
  let page = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
  const data = "<script>window.__ITEMS__ = " + safeJSON(items) + ";</script>";
  page = page.split("<!--INITIAL_DATA-->").join(data);
  sendPage(response, page);
}

/* ---------- JSON API ---------- */

async function handleApi(request, response, pathname) {
  // Contact form: anyone can send a message. It is stored in MongoDB (collection "messages").
  if (request.method === "POST" && pathname === "/api/contact") {
    const form = await readBody(request);
    const name = String(form.name || "").trim().slice(0, 100);
    const email = String(form.email || "").trim().slice(0, 150);
    const message = String(form.message || "").trim().slice(0, 2000);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) {
      return sendJSON(response, 400, { ok: false, error: "Please fill in your name, a valid email and a message." });
    }
    await messages.insertOne({ name: name, email: email, message: message, date: new Date() });
    return sendJSON(response, 201, { ok: true, message: "Message sent successfully!" });
  }

  // Everything below needs a logged-in user.
  if (!getUser(request)) return sendJSON(response, 401, { ok: false, error: "Please log in again." });

  if (request.method === "GET" && pathname === "/api/items") {
    return sendJSON(response, 200, { ok: true, items: await loadItems() });
  }

  if (request.method === "POST" && pathname === "/api/items") {
    const form = await readBody(request);
    const item = validateItem(form);
    if (!item) return sendJSON(response, 400, { ok: false, error: "Enter a title, a category and a description." });
    await portfolio.insertOne(item);
    return sendJSON(response, 201, { ok: true, message: "Added successfully!", items: await loadItems() });
  }

  const match = pathname.match(/^\/api\/items\/([a-f0-9]{24})$/);
  if (match && ObjectId.isValid(match[1])) {
    const id = new ObjectId(match[1]);

    if (request.method === "PUT") {
      const form = await readBody(request);
      const item = validateItem(form);
      if (!item) return sendJSON(response, 400, { ok: false, error: "Enter a title, a category and a description." });
      const result = await portfolio.updateOne({ _id: id }, { $set: item });
      if (!result.matchedCount) return sendJSON(response, 404, { ok: false, error: "That item no longer exists." });
      return sendJSON(response, 200, { ok: true, message: "Updated successfully!", items: await loadItems() });
    }

    if (request.method === "DELETE") {
      await portfolio.deleteOne({ _id: id });
      return sendJSON(response, 200, { ok: true, message: "Deleted successfully!", items: await loadItems() });
    }
  }

  return sendJSON(response, 404, { ok: false, error: "Not found" });
}

function validateItem(form) {
  const title = String(form.title || "").trim().slice(0, 100);
  const description = String(form.description || "").trim().slice(0, 500);
  const category = String(form.category || "");
  if (!title || !description || !CATEGORIES.includes(category)) return null;
  return { title: title, category: category, description: description };
}

/* ---------- routing ---------- */

async function handleRequest(request, response) {
  const pathname = new URL(request.url, "http://localhost").pathname;

  if (pathname.startsWith("/api/")) return handleApi(request, response, pathname);

  if (request.method === "GET" && pathname === "/auth") {
    if (getUser(request)) return redirect(response, "/");
    const page = fs.readFileSync(path.join(__dirname, "public", "auth.html"), "utf8");
    return sendPage(response, page);
  }

  if (request.method === "GET" && pathname === "/") return showHome(request, response);

  if (request.method === "POST" && pathname === "/register") {
    const form = await readBody(request);
    const name = String(form.name || "").trim().slice(0, 100);
    const email = String(form.email || "").trim().toLowerCase();
    const password = String(form.password || "");
    if (name.length < 2 || !email.includes("@") || password.length < 6) return redirect(response, "/auth?mode=register&error=invalid");
    const existing = await users.findOne({ email: email });
    if (existing) return redirect(response, "/auth?mode=register&error=exists");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    await users.insertOne({ name: name, email: email, salt: salt, password: hash });
    return startSession(response, { name: name, email: email });
  }

  if (request.method === "POST" && pathname === "/login") {
    const form = await readBody(request);
    const email = String(form.email || "").trim().toLowerCase();
    const user = await users.findOne({ email: email });
    if (!user || !user.salt || !user.password) return redirect(response, "/auth?error=login");
    const hash = crypto.scryptSync(String(form.password || ""), user.salt, 64);
    const saved = Buffer.from(user.password, "hex");
    if (hash.length !== saved.length || !crypto.timingSafeEqual(hash, saved)) return redirect(response, "/auth?error=login");
    return startSession(response, user);
  }

  if (request.method === "POST" && pathname === "/logout") {
    const cookie = request.headers.cookie || "";
    const match = cookie.match(/(?:^|;\s*)session=([a-f0-9]+)/);
    if (match) delete sessions[match[1]];
    response.writeHead(302, { "Set-Cookie": "session=; Max-Age=0; Path=/", Location: "/auth" });
    return response.end();
  }

  // Serve CSS, JavaScript and the optional profile photo.
  if (request.method === "GET") {
    const fileName = path.basename(pathname);
    const publicFolder = path.join(__dirname, "public");
    const filePath = path.join(publicFolder, fileName);
    const extension = path.extname(filePath).toLowerCase();
    const types = { ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
    if (types[extension] && filePath.startsWith(publicFolder) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      response.writeHead(200, { "Content-Type": types[extension] + (extension === ".css" || extension === ".js" || extension === ".svg" ? "; charset=utf-8" : "") });
      return fs.createReadStream(filePath).pipe(response);
    }
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Page not found");
}

async function startServer() {
  await client.connect();
  const database = client.db("rashidPortfolio");
  users = database.collection("users");
  portfolio = database.collection("portfolio");
  messages = database.collection("messages");

  // Add a few editable starter items the first time the project runs.
  if (await portfolio.countDocuments() === 0) {
    await portfolio.insertMany([
      { title: "HTML & CSS", category: "Skill", description: "Learning to create and style clean, responsive web pages." },
      { title: "JavaScript", category: "Skill", description: "Practising programming basics and adding interaction to websites." },
      { title: "Node.js & MongoDB", category: "Skill", description: "Learning server-side JavaScript and database operations." },
      { title: "Continuous Learning", category: "Achievement", description: "Building knowledge through coursework, practice and personal projects." },
      { title: "Personal Portfolio Website", category: "Project", description: "A student portfolio built with HTML, CSS, JavaScript, Node.js and MongoDB." },
      { title: "Football", category: "Hobby", description: "Playing football and staying active." },
      { title: "Technology & Reading", category: "Hobby", description: "Exploring technology and learning new things." }
    ]);
  }

  const server = http.createServer(function (request, response) {
    handleRequest(request, response).catch(function (error) {
      console.log("Server error:", error.message);
      if (request.url.startsWith("/api/")) {
        if (!response.headersSent) return sendJSON(response, 500, { ok: false, error: "Server error. Check that MongoDB is running." });
      } else if (!response.headersSent) {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      response.end("Something went wrong. Please check the server terminal.");
    });
  });

  server.listen(PORT, function () {
    console.log("Portfolio is running at http://localhost:" + PORT);
    console.log("MongoDB connected. Database: rashidPortfolio (collections: users, portfolio, messages)");
  });
}

startServer().catch(function (error) {
  console.log("Could not start the project.");
  console.log("Make sure MongoDB is running:", error.message);
});
