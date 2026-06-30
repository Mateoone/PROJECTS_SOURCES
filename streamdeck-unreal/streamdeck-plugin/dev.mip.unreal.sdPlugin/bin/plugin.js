// Unreal Bridge — Stream Deck plugin (POC, plain Node).
//
// Two kinds of sockets:
//   1. WebSocket to the Stream Deck application (mandatory, protocol imposed by Elgato).
//   2. A PERSISTENT TCP connection per Unreal endpoint (host:port), shared by every button
//      that targets it, with automatic reconnection (exponential backoff).
//
// The Stream Deck app launches this script with:
//   -port <n> -pluginUUID <uuid> -registerEvent <evt> -info <json>

const WebSocket = require("ws");
const net = require("net");
const fs = require("fs");
const path = require("path");

const DEFAULTS = { host: "127.0.0.1", port: 5051, action: "Fire", payload: "", title: "" };

// Resolve an image reference coming from UE into a Stream Deck data URI.
//   - a full data URI ("data:image/png;base64,...") is returned as-is,
//   - otherwise it's treated as a bundled image name under imgs/ (e.g. "bt_03" or "bt_03.png").
const IMG_DIR = path.join(__dirname, "..", "imgs");
const imageCache = new Map();
function resolveImage(ref) {
	if (!ref) return null;
	if (ref.startsWith("data:")) return ref;
	if (imageCache.has(ref)) return imageCache.get(ref);
	const file = path.join(IMG_DIR, ref.endsWith(".png") ? ref : `${ref}.png`);
	try {
		const b64 = fs.readFileSync(file).toString("base64");
		const uri = `data:image/png;base64,${b64}`;
		imageCache.set(ref, uri);
		return uri;
	} catch (e) {
		console.error(`[unreal-bridge] image not found: ${ref}`);
		imageCache.set(ref, null);
		return null;
	}
}

// ---------------------------------------------------------------------------
// Persistent TCP connection to one Unreal endpoint, shared across buttons.
// ---------------------------------------------------------------------------
class Conn {
	constructor(host, port, onFeedback) {
		this.host = host;
		this.port = Number(port);
		this.onFeedback = onFeedback; // (action, state) => void

		this.socket = null;
		this.connected = false;
		this.connecting = false;
		this.closedByUs = false;

		this.rx = "";
		this.refCount = 0; // number of buttons using this endpoint
		this.reconnectDelay = 1000; // ms, grows to a cap
		this.reconnectTimer = null;
		this.waiters = []; // writes queued while (re)connecting: {line, resolve, reject, timer}
	}

	ensure() {
		if (!this.connected && !this.connecting) this.connect();
	}

	connect() {
		this.connecting = true;
		this.closedByUs = false;

		const s = new net.Socket();
		this.socket = s;
		s.setNoDelay(true);

		s.once("connect", () => {
			this.connected = true;
			this.connecting = false;
			this.reconnectDelay = 1000;
			console.log(`[unreal-bridge] connected to UE ${this.host}:${this.port}`);
			const queued = this.waiters;
			this.waiters = [];
			for (const w of queued) {
				clearTimeout(w.timer);
				try {
					s.write(w.line);
					w.resolve();
				} catch (e) {
					w.reject(e);
				}
			}
		});

		s.on("data", (chunk) => this._onData(chunk));
		s.once("error", (e) => console.error(`[unreal-bridge] UE socket error (${this.host}:${this.port}): ${e.message}`));
		s.once("close", () => {
			this.connected = false;
			this.connecting = false;
			this.socket = null;
			this.rx = "";
			if (!this.closedByUs && this.refCount > 0) this._scheduleReconnect();
		});

		s.connect(this.port, this.host);
	}

	_scheduleReconnect() {
		if (this.reconnectTimer) return;
		const delay = this.reconnectDelay;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (this.refCount > 0) this.connect();
		}, delay);
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000); // cap at 10s
	}

	_onData(chunk) {
		this.rx += chunk.toString("utf8");
		let i;
		while ((i = this.rx.indexOf("\n")) !== -1) {
			const line = this.rx.slice(0, i).trim();
			this.rx = this.rx.slice(i + 1);
			if (!line) continue;
			try {
				const obj = JSON.parse(line);
				// UE push: any object carrying an action plus at least one of title/image/state.
				const isPush = obj && obj.action !== undefined && (obj.title !== undefined || obj.image !== undefined || obj.state !== undefined);
				if (isPush && typeof this.onFeedback === "function") {
					this.onFeedback(obj);
				}
			} catch (e) {
				/* ignore non-JSON feedback */
			}
		}
	}

	/** Resolves once the line is handed to the socket; rejects if not connected in time. */
	send(line) {
		return new Promise((resolve, reject) => {
			if (this.connected && this.socket) {
				try {
					this.socket.write(line, () => resolve());
				} catch (e) {
					reject(e);
				}
				return;
			}
			// Not connected yet: queue with a timeout and make sure we're (re)connecting.
			const timer = setTimeout(() => {
				const idx = this.waiters.findIndex((w) => w.timer === timer);
				if (idx >= 0) this.waiters.splice(idx, 1);
				reject(new Error(`UE not reachable at ${this.host}:${this.port}`));
			}, 2000);
			this.waiters.push({ line, resolve, reject, timer });
			this.ensure();
		});
	}

	close() {
		this.closedByUs = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		for (const w of this.waiters) {
			clearTimeout(w.timer);
			w.reject(new Error("connection closed"));
		}
		this.waiters = [];
		if (this.socket) this.socket.destroy();
		this.socket = null;
		this.connected = false;
		this.connecting = false;
	}
}

// ---------------------------------------------------------------------------
// Connection pool + per-button bookkeeping.
// ---------------------------------------------------------------------------
class Bridge {
	constructor(applyPush) {
		this.conns = new Map(); // "host:port" -> Conn
		this.ctxInfo = new Map(); // context -> { host, port, action }
		this.actionSubs = new Map(); // action -> Set(context)   (for routing UE pushes to buttons)
		this.applyPush = applyPush; // (context, pushObj) => void
	}

	static keyOf(host, port) {
		return `${host}:${port}`;
	}

	// UE pushed an update keyed by action name -> apply to every button bound to that action.
	_routeFeedback(obj) {
		const subs = this.actionSubs.get(obj.action);
		if (!subs) return;
		for (const context of subs) this.applyPush(context, obj);
	}

	_acquire(host, port) {
		const key = Bridge.keyOf(host, port);
		let conn = this.conns.get(key);
		if (!conn) {
			conn = new Conn(host, port, (obj) => this._routeFeedback(obj));
			this.conns.set(key, conn);
		}
		conn.refCount++;
		conn.ensure(); // connect proactively so the first press is instant
		return conn;
	}

	_release(host, port) {
		const key = Bridge.keyOf(host, port);
		const conn = this.conns.get(key);
		if (!conn) return;
		conn.refCount--;
		if (conn.refCount <= 0) {
			conn.close();
			this.conns.delete(key);
		}
	}

	_subscribe(action, context) {
		if (!action) return;
		let set = this.actionSubs.get(action);
		if (!set) {
			set = new Set();
			this.actionSubs.set(action, set);
		}
		set.add(context);
	}

	_unsubscribe(action, context) {
		const set = this.actionSubs.get(action);
		if (!set) return;
		set.delete(context);
		if (set.size === 0) this.actionSubs.delete(action);
	}

	/** Register or update a button's settings (called on willAppear / didReceiveSettings). */
	upsertContext(context, settings) {
		const cfg = Object.assign({}, DEFAULTS, settings || {});
		const prev = this.ctxInfo.get(context);

		const endpointChanged = !prev || prev.host !== cfg.host || String(prev.port) !== String(cfg.port);
		const actionChanged = !prev || prev.action !== cfg.action;

		if (prev && endpointChanged) this._release(prev.host, prev.port);
		if (prev && actionChanged) this._unsubscribe(prev.action, context);

		if (!prev || endpointChanged) this._acquire(cfg.host, cfg.port);
		if (!prev || actionChanged) this._subscribe(cfg.action, context);

		this.ctxInfo.set(context, { host: cfg.host, port: cfg.port, action: cfg.action });
	}

	removeContext(context) {
		const prev = this.ctxInfo.get(context);
		if (!prev) return;
		this._release(prev.host, prev.port);
		this._unsubscribe(prev.action, context);
		this.ctxInfo.delete(context);
	}

	/** Fire the configured command for a button. Returns a promise (resolve=sent, reject=unreachable). */
	trigger(context, settings) {
		const cfg = Object.assign({}, DEFAULTS, settings || {});
		const conn = this._acquire(cfg.host, cfg.port); // also covers the case settings changed mid-session
		// _acquire bumped refCount; balance it without tearing down a still-used connection.
		conn.refCount--;
		return conn.send(buildCommandLine(cfg.action, cfg.payload));
	}
}

// ---------------------------------------------------------------------------
function buildCommandLine(action, payload) {
	let payloadField = '""';
	const trimmed = (payload || "").trim();
	if (trimmed) {
		try {
			JSON.parse(trimmed);
			payloadField = trimmed; // valid JSON -> nested object
		} catch (e) {
			payloadField = JSON.stringify(trimmed); // plain text -> JSON string
		}
	}
	return `{"action":${JSON.stringify(action)},"payload":${payloadField}}\n`;
}

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i];
		const val = argv[i + 1];
		if (key && key.startsWith("-")) out[key.slice(1)] = val;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Stream Deck side (only runs when launched by the Stream Deck app).
// ---------------------------------------------------------------------------
function startStreamDeck({ port, pluginUUID, registerEvent }) {
	const sd = new WebSocket(`ws://127.0.0.1:${port}`);

	const sdSend = (obj) => {
		if (sd.readyState === WebSocket.OPEN) sd.send(JSON.stringify(obj));
	};
	const setTitle = (context, title) => sdSend({ event: "setTitle", context, payload: { title: String(title), target: 0 } });
	const setImage = (context, image, state) => sdSend({ event: "setImage", context, payload: { image, target: 0, ...(Number.isInteger(state) ? { state } : {}) } });
	const setState = (context, state) => sdSend({ event: "setState", context, payload: { state } });
	const showAlert = (context) => sdSend({ event: "showAlert", context });
	const showOk = (context) => sdSend({ event: "showOk", context });

	// Apply a UE push {action, title?, image?, state?} to one button (context).
	const applyPush = (context, obj) => {
		// Title: explicit "title", or legacy string "state".
		let title = obj.title;
		if (title === undefined && typeof obj.state === "string") title = obj.state;
		if (title !== undefined) setTitle(context, title);

		// Image: a bundled name ("bt_03") or a full data URI.
		if (obj.image) {
			const dataUri = resolveImage(obj.image);
			if (dataUri) setImage(context, dataUri, Number.isInteger(obj.state) ? obj.state : undefined);
		}

		// State index (multi-state actions): only when "state" is a number.
		if (Number.isInteger(obj.state)) setState(context, obj.state);
	};

	const bridge = new Bridge(applyPush);

	sd.on("open", () => {
		sd.send(JSON.stringify({ event: registerEvent, uuid: pluginUUID }));
		console.log("[unreal-bridge] registered with Stream Deck");
	});

	sd.on("message", (data) => {
		let msg;
		try {
			msg = JSON.parse(data.toString());
		} catch (e) {
			return;
		}
		const { event, context, payload } = msg;
		const settings = (payload && payload.settings) || {};

		switch (event) {
			case "willAppear":
			case "didReceiveSettings":
				bridge.upsertContext(context, settings);
				if (settings.title) setTitle(context, settings.title);
				break;

			case "keyDown":
				bridge
					.trigger(context, settings)
					.then(() => showOk(context))
					.catch((err) => {
						console.error("[unreal-bridge] trigger failed:", err.message);
						showAlert(context);
					});
				break;

			case "willDisappear":
				bridge.removeContext(context);
				break;

			default:
				break;
		}
	});

	sd.on("close", () => process.exit(0));
	sd.on("error", (e) => console.error("[unreal-bridge] SD ws error:", e.message));
}

// ---------------------------------------------------------------------------
if (require.main === module) {
	const args = parseArgs(process.argv.slice(2));
	if (!args.port || !args.pluginUUID || !args.registerEvent) {
		console.error("[unreal-bridge] missing Stream Deck launch args, exiting");
		process.exit(1);
	}
	process.on("uncaughtException", (e) => console.error("[unreal-bridge] uncaught:", e));
	startStreamDeck(args);
}

// Exported for tests / reuse.
module.exports = { Conn, Bridge, buildCommandLine, resolveImage };
