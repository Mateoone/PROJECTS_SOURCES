// Unreal Bridge — Stream Deck plugin (POC, plain Node).
//
// Two sockets:
//   1. WebSocket to the Stream Deck application (mandatory, protocol imposed by Elgato).
//   2. A short-lived TCP connection to the Unreal StreamDeckBridge subsystem,
//      to which we send one JSON line per button press.
//
// The Stream Deck app launches this script with:
//   -port <n> -pluginUUID <uuid> -registerEvent <evt> -info <json>

const WebSocket = require("ws");
const net = require("net");

// ---- parse the args the Stream Deck app passes us --------------------------
function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i += 2) {
		const key = argv[i];
		const val = argv[i + 1];
		if (key && key.startsWith("-")) out[key.slice(1)] = val;
	}
	return out;
}

const args = parseArgs(process.argv.slice(2));
const port = args.port;
const pluginUUID = args.pluginUUID;
const registerEvent = args.registerEvent;

if (!port || !pluginUUID || !registerEvent) {
	console.error("[unreal-bridge] missing Stream Deck launch args, exiting");
	process.exit(1);
}

// Per-button settings live here, keyed by Stream Deck "context".
const contexts = new Map(); // context -> { host, port, action, payload, title }

const DEFAULTS = { host: "127.0.0.1", port: 5051, action: "Fire", payload: "", title: "" };

function settingsFor(context) {
	return Object.assign({}, DEFAULTS, contexts.get(context) || {});
}

// ---- Stream Deck websocket -------------------------------------------------
const sd = new WebSocket(`ws://127.0.0.1:${port}`);

function sdSend(obj) {
	if (sd.readyState === WebSocket.OPEN) sd.send(JSON.stringify(obj));
}

function setTitle(context, title) {
	sdSend({ event: "setTitle", context, payload: { title: String(title), target: 0 } });
}

function showAlert(context) {
	sdSend({ event: "showAlert", context });
}

function showOk(context) {
	sdSend({ event: "showOk", context });
}

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

	switch (event) {
		case "willAppear":
		case "didReceiveSettings": {
			const settings = (payload && payload.settings) || {};
			contexts.set(context, settings);
			if (settings.title) setTitle(context, settings.title);
			break;
		}
		case "keyDown": {
			const cfg = settingsFor(context);
			sendToUnreal(cfg)
				.then(() => showOk(context))
				.catch((err) => {
					console.error("[unreal-bridge] UE send failed:", err.message);
					showAlert(context);
				});
			break;
		}
		case "willDisappear": {
			contexts.delete(context);
			break;
		}
		default:
			break;
	}
});

sd.on("close", () => process.exit(0));
sd.on("error", (e) => console.error("[unreal-bridge] SD ws error:", e.message));

// ---- TCP push to Unreal ----------------------------------------------------
function sendToUnreal(cfg) {
	return new Promise((resolve, reject) => {
		const client = new net.Socket();
		let settled = false;
		const done = (err) => {
			if (settled) return;
			settled = true;
			client.destroy();
			err ? reject(err) : resolve();
		};

		client.setTimeout(2000);
		client.once("timeout", () => done(new Error("UE connection timeout")));
		client.once("error", (e) => done(e));

		client.connect(Number(cfg.port), cfg.host, () => {
			// payload may be a raw JSON string or plain text; embed as-is if it looks like JSON.
			const line = buildCommandLine(cfg.action, cfg.payload);
			client.write(line, () => done(null));
		});
	});
}

function buildCommandLine(action, payload) {
	let payloadField = '""';
	const trimmed = (payload || "").trim();
	if (trimmed) {
		// If the user typed valid JSON, forward it as a nested object; otherwise as a string.
		try {
			JSON.parse(trimmed);
			payloadField = trimmed;
		} catch (e) {
			payloadField = JSON.stringify(trimmed);
		}
	}
	return `{"action":${JSON.stringify(action)},"payload":${payloadField}}\n`;
}

process.on("uncaughtException", (e) => console.error("[unreal-bridge] uncaught:", e));
