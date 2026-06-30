#!/usr/bin/env node
// Mock Unreal Engine — a stand-in for the StreamDeckBridge subsystem.
//
// Opens the SAME TCP server the UE plugin opens (port 5051, newline-delimited JSON),
// so the real Stream Deck plugin connects to it unchanged. Every command received is
// shown live in a web page (http://localhost:8787). You can also push feedback back to
// the button (tests the SendState round-trip -> button title).
//
// Run:  node tools/mock-ue/server.js     (then open http://localhost:8787)
// Env:  TCP_PORT (default 5051), HTTP_PORT (default 8787)

const net = require("net");
const http = require("http");

const TCP_PORT = Number(process.env.TCP_PORT || 5051);
const HTTP_PORT = Number(process.env.HTTP_PORT || 8787);

let client = null; // current Stream Deck plugin socket
let clientPeer = null;
const history = []; // last N commands
const counts = {}; // action -> count
const sse = new Set(); // connected browser EventSource responses

function pushSse(event, dataObj) {
	const payload = `event: ${event}\ndata: ${JSON.stringify(dataObj)}\n\n`;
	for (const res of sse) {
		try {
			res.write(payload);
		} catch (e) {
			/* dropped client */
		}
	}
}

function statusObj() {
	return { connected: !!client, peer: clientPeer, tcpPort: TCP_PORT, total: history.length, counts };
}

// ---------------------------------------------------------------------------
// TCP server — mimics UStreamDeckBridgeSubsystem
// ---------------------------------------------------------------------------
const tcp = net.createServer((sock) => {
	client = sock;
	clientPeer = `${sock.remoteAddress}:${sock.remotePort}`;
	console.log(`[mock-ue] Stream Deck connected: ${clientPeer}`);
	pushSse("status", statusObj());

	let buf = "";
	sock.on("data", (chunk) => {
		buf += chunk.toString("utf8");
		let i;
		while ((i = buf.indexOf("\n")) !== -1) {
			const line = buf.slice(0, i).replace(/\r$/, "").trim();
			buf = buf.slice(i + 1);
			if (!line) continue;
			handleLine(line);
		}
	});

	sock.on("close", () => {
		if (client === sock) {
			client = null;
			clientPeer = null;
		}
		console.log("[mock-ue] Stream Deck disconnected");
		pushSse("status", statusObj());
	});
	sock.on("error", () => {});
});

function handleLine(line) {
	let parsed = null;
	let action = "(raw)";
	let payload = "";
	let ok = true;
	try {
		parsed = JSON.parse(line);
		action = parsed.action !== undefined ? String(parsed.action) : "(none)";
		payload = parsed.payload !== undefined ? parsed.payload : "";
	} catch (e) {
		ok = false;
		action = line; // UE treats a bare line as the action name
	}

	const rec = {
		t: Date.now(),
		action,
		payload: typeof payload === "object" ? JSON.stringify(payload) : String(payload),
		raw: line,
		ok,
	};
	history.push(rec);
	if (history.length > 500) history.shift();
	counts[action] = (counts[action] || 0) + 1;

	console.log(`[mock-ue] <= ${rec.action}  ${rec.payload}`);
	pushSse("command", rec);
	pushSse("status", statusObj());
}

tcp.on("error", (e) => {
	if (e.code === "EADDRINUSE") {
		console.error(`[mock-ue] TCP port ${TCP_PORT} already in use — is real UE (or another mock) running?`);
		process.exit(1);
	}
	console.error("[mock-ue] TCP error:", e.message);
});
tcp.listen(TCP_PORT, () => console.log(`[mock-ue] TCP listening on 0.0.0.0:${TCP_PORT} (waiting for Stream Deck plugin)`));

// ---------------------------------------------------------------------------
// HTTP server — serves the UI, an SSE stream, history JSON, and feedback POST
// ---------------------------------------------------------------------------
const httpServer = http.createServer((req, res) => {
	const url = new URL(req.url, `http://${req.headers.host}`);

	if (req.method === "GET" && url.pathname === "/") {
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		res.end(PAGE);
		return;
	}

	if (req.method === "GET" && url.pathname === "/events") {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
		res.write(`event: status\ndata: ${JSON.stringify(statusObj())}\n\n`);
		for (const rec of history.slice(-100)) res.write(`event: command\ndata: ${JSON.stringify(rec)}\n\n`);
		sse.add(res);
		req.on("close", () => sse.delete(res));
		return;
	}

	if (req.method === "GET" && url.pathname === "/commands") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: statusObj(), history }));
		return;
	}

	if (req.method === "POST" && url.pathname === "/feedback") {
		let body = "";
		req.on("data", (c) => (body += c));
		req.on("end", () => {
			let j = {};
			try {
				j = JSON.parse(body || "{}");
			} catch (e) {}
			if (!client) {
				res.writeHead(409, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "no Stream Deck connected" }));
				return;
			}
			// Build a UE push: action + any of title / image / state.
			const push = { action: String(j.action || "") };
			if (j.title !== undefined && j.title !== "") push.title = String(j.title);
			if (j.image !== undefined && j.image !== "") push.image = String(j.image);
			if (j.state !== undefined && j.state !== "") push.state = Number.isNaN(Number(j.state)) ? String(j.state) : Number(j.state);
			const line = JSON.stringify(push) + "\n";
			client.write(line);
			console.log(`[mock-ue] => push ${line.trim()}`);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, sent: push }));
		});
		return;
	}

	res.writeHead(404);
	res.end("not found");
});

httpServer.listen(HTTP_PORT, () => console.log(`[mock-ue] Web UI:  http://localhost:${HTTP_PORT}`));

// ---------------------------------------------------------------------------
const PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mock UE — moniteur Stream Deck</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", system-ui, sans-serif; background: #0f1115; color: #e6e6e6; }
  header { padding: 14px 20px; background: #15181f; border-bottom: 1px solid #262b36; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; letter-spacing: .3px; }
  .pill { font-size: 12px; padding: 4px 10px; border-radius: 999px; font-weight: 600; }
  .pill.on { background: #16331f; color: #4ade80; border: 1px solid #1f6b35; }
  .pill.off { background: #331616; color: #f87171; border: 1px solid #6b1f1f; }
  .muted { color: #8b94a3; font-size: 12px; }
  main { display: grid; grid-template-columns: 1fr 320px; gap: 16px; padding: 16px 20px; align-items: start; }
  @media (max-width: 820px){ main { grid-template-columns: 1fr; } }
  .card { background: #15181f; border: 1px solid #262b36; border-radius: 10px; overflow: hidden; }
  .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #8b94a3; margin: 0; padding: 12px 14px; border-bottom: 1px solid #262b36; }
  #feed { max-height: 70vh; overflow-y: auto; }
  .row { display: flex; gap: 10px; align-items: baseline; padding: 9px 14px; border-bottom: 1px solid #1c212b; animation: flash .6s ease; }
  @keyframes flash { from { background: #1c2a1f; } to { background: transparent; } }
  .row .time { color: #6b7280; font-size: 11px; font-variant-numeric: tabular-nums; width: 86px; flex: none; }
  .badge { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: #1d2735; color: #7dd3fc; border: 1px solid #2b3a4f; flex: none; }
  .badge.raw { background: #2a2519; color: #fbbf24; border-color: #4a3f1f; }
  .payload { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #cbd5e1; word-break: break-all; }
  .empty { padding: 24px 14px; color: #6b7280; font-size: 13px; }
  .side .body { padding: 12px 14px; }
  .stat { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
  .stat b { font-variant-numeric: tabular-nums; }
  label { display: block; font-size: 12px; color: #8b94a3; margin: 8px 0 4px; }
  input, select { width: 100%; background: #0f1115; border: 1px solid #2b3340; color: #e6e6e6; border-radius: 6px; padding: 7px 9px; font-size: 13px; }
  button { margin-top: 12px; width: 100%; background: #2563eb; color: #fff; border: 0; border-radius: 6px; padding: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
  button:disabled { background: #313846; cursor: not-allowed; }
  .hint { font-size: 11px; color: #6b7280; margin-top: 8px; }
  .clearbtn { background: #313846; }
</style>
</head>
<body>
<header>
  <h1>🎛️ Mock UE — moniteur Stream Deck</h1>
  <span id="status" class="pill off">déconnecté</span>
  <span class="muted">TCP <b id="tcpport">5051</b> · reçus <b id="total">0</b></span>
  <span class="muted" id="peer"></span>
</header>
<main>
  <section class="card">
    <h2>Instructions reçues (live)</h2>
    <div id="feed"><div class="empty">En attente d'un appui sur le Stream Deck…</div></div>
  </section>
  <aside class="side">
    <div class="card" style="margin-bottom:16px">
      <h2>Statistiques</h2>
      <div class="body" id="stats"><div class="muted">aucune commande</div></div>
    </div>
    <div class="card">
      <h2>Callback UE → bouton</h2>
      <div class="body">
        <label for="fa">Action (touches ciblées)</label>
        <input id="fa" placeholder="Spin" />
        <label for="ft">Titre</label>
        <input id="ft" placeholder="ON" />
        <label for="fi">Image embarquée</label>
        <select id="fi">
          <option value="">(inchangée)</option>
          <option value="bt_01">bt_01</option>
          <option value="bt_02">bt_02</option>
          <option value="bt_03">bt_03</option>
          <option value="bt_04">bt_04</option>
          <option value="bt_05">bt_05</option>
        </select>
        <label for="fst">State index (multi-état)</label>
        <input id="fst" type="number" placeholder="(inchangé)" />
        <button id="send" disabled>Pousser vers le Stream Deck</button>
        <div class="hint">Écrit {"action","title","image","state"} — comme SetButtonTitle/Image/State() côté UE. Cible toutes les touches liées à cette action.</div>
        <button id="clear" class="clearbtn">Vider le journal</button>
      </div>
    </div>
  </aside>
</main>
<script>
  const feed = document.getElementById("feed");
  const statusEl = document.getElementById("status");
  const totalEl = document.getElementById("total");
  const tcpEl = document.getElementById("tcpport");
  const peerEl = document.getElementById("peer");
  const statsEl = document.getElementById("stats");
  const sendBtn = document.getElementById("send");
  let connected = false, hasRows = false;

  const fmtTime = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour12: false }) + "." + String(new Date(t).getMilliseconds()).padStart(3, "0");

  function addRow(rec) {
    if (!hasRows) { feed.innerHTML = ""; hasRows = true; }
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML =
      '<span class="time">' + fmtTime(rec.t) + '</span>' +
      '<span class="badge' + (rec.ok ? '' : ' raw') + '">' + escapeHtml(rec.action) + '</span>' +
      '<span class="payload">' + (rec.payload ? escapeHtml(rec.payload) : '<span style="color:#4b5563">∅</span>') + '</span>';
    feed.prepend(row);
    while (feed.children.length > 300) feed.removeChild(feed.lastChild);
  }

  function setStatus(s) {
    connected = s.connected;
    statusEl.textContent = s.connected ? "connecté" : "déconnecté";
    statusEl.className = "pill " + (s.connected ? "on" : "off");
    totalEl.textContent = s.total;
    tcpEl.textContent = s.tcpPort;
    peerEl.textContent = s.peer ? "(" + s.peer + ")" : "";
    sendBtn.disabled = !s.connected;
    const entries = Object.entries(s.counts || {});
    statsEl.innerHTML = entries.length
      ? entries.sort((a,b)=>b[1]-a[1]).map(([k,v]) => '<div class="stat"><span>' + escapeHtml(k) + '</span><b>' + v + '</b></div>').join("")
      : '<div class="muted">aucune commande</div>';
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c])); }

  const es = new EventSource("/events");
  es.addEventListener("command", (e) => addRow(JSON.parse(e.data)));
  es.addEventListener("status", (e) => setStatus(JSON.parse(e.data)));

  sendBtn.addEventListener("click", async () => {
    const action = document.getElementById("fa").value;
    const title = document.getElementById("ft").value;
    const image = document.getElementById("fi").value;
    const state = document.getElementById("fst").value;
    await fetch("/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, title, image, state }) });
  });
  document.getElementById("clear").addEventListener("click", () => { feed.innerHTML = '<div class="empty">Journal vidé.</div>'; hasRows = false; });
</script>
</body>
</html>`;
