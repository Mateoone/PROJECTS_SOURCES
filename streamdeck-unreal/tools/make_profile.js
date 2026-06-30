#!/usr/bin/env node
// Generates dist/UnrealBridge.streamDeckProfile from a layout descriptor.
//
// Layouts live in tools/profiles/<name>/ :
//   layout.json   { name, device:"xl"|"mk2", imageDir, keys:[{coord,action,payload,title,image,showTitle}] }
//   <imageDir>/   the PNG icons referenced by the keys
//
// Format = Stream Deck 7.x (reverse-engineered from real 7.5 exports). Zip layout:
//   package.json                                          (FormatVersion 1 + RequiredPlugins)
//   Profiles/<outerUUID>.sdProfile/manifest.json          (bundle, Version 3.0, Device, Pages)
//   Profiles/<outerUUID>.sdProfile/Profiles/<pageUUID>/manifest.json   (Keypad Actions)
//   Profiles/<outerUUID>.sdProfile/Profiles/<pageUUID>/Images/*.png    (custom key images)
//   Profiles/<outerUUID>.sdProfile/Profiles/<defaultUUID>/manifest.json (empty default page)
//
// Usage:  node tools/make_profile.js [layout]      (default: alstom; e.g. 'demo')

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const BUILD = path.join(require("os").tmpdir(), `sdprofile_build_${process.pid}`);

// Device metadata from the user's real 7.5 exports.
const DEVICES = {
	xl: { Model: "20GAT9902", UUID: "5dc5f526-05a8-4539-a7e5-94dcf6cce39a" }, // Stream Deck XL (8x4)
	mk2: { Model: "20GBA9901", UUID: "833c22d1-bdb2-487f-a150-090548977a6f" }, // Stream Deck MK.2 (5x3)
};
const ENV = { AppVersion: "7.5.0.22885", OSType: "macOS", OSVersion: "26.5.1" };
const PLUGIN = { Name: "Unreal Bridge", UUID: "dev.mip.unreal", Version: "0.1.0.0" };
const ACTION_UUID = "dev.mip.unreal.trigger";

const layoutName = (process.argv[2] || "alstom").toLowerCase();
const layoutDir = path.join(__dirname, "profiles", layoutName);
const layoutFile = path.join(layoutDir, "layout.json");
if (!fs.existsSync(layoutFile)) {
	const avail = fs.existsSync(path.join(__dirname, "profiles")) ? fs.readdirSync(path.join(__dirname, "profiles")).join(", ") : "(none)";
	console.error(`Unknown layout '${layoutName}'. Available: ${avail}`);
	process.exit(1);
}
const layout = JSON.parse(fs.readFileSync(layoutFile, "utf8"));
const device = DEVICES[(layout.device || "xl").toLowerCase()];
if (!device) {
	console.error(`Layout '${layoutName}' targets unknown device '${layout.device}'. Use: ${Object.keys(DEVICES).join(", ")}`);
	process.exit(1);
}
const imageSrcDir = path.join(layoutDir, layout.imageDir || "images");

const uuid = () => crypto.randomUUID();
const outerUUID = uuid().toUpperCase();
const pageUUID = uuid().toUpperCase();
const defaultUUID = uuid().toUpperCase();

const mkAction = (k) => {
	const state = {
		FontFamily: "",
		FontSize: 12,
		FontStyle: "",
		FontUnderline: false,
		OutlineThickness: 2,
		ShowTitle: k.showTitle !== false,
		Title: k.title || "",
		TitleAlignment: "bottom",
		TitleColor: "#ffffff",
	};
	if (k.image) state.Image = `Images/${k.image}`;
	return {
		ActionID: uuid(),
		LinkedTitle: true,
		Name: "Trigger UE Event",
		Plugin: PLUGIN,
		Resources: null,
		Settings: { action: k.action || "", host: k.host || "127.0.0.1", payload: k.payload || "", port: String(k.port || "5051"), title: k.title || "" },
		State: 0,
		States: [state],
		UUID: ACTION_UUID,
	};
};

// --- build tree ---
fs.rmSync(BUILD, { recursive: true, force: true });
const sdProfileDir = path.join(BUILD, "Profiles", `${outerUUID}.sdProfile`);
const pageDir = path.join(sdProfileDir, "Profiles", pageUUID);
const imagesDir = path.join(pageDir, "Images");
const defaultDir = path.join(sdProfileDir, "Profiles", defaultUUID);
fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(defaultDir, { recursive: true });

fs.writeFileSync(
	path.join(BUILD, "package.json"),
	JSON.stringify({ AppVersion: ENV.AppVersion, DeviceModel: device.Model, DeviceSettings: null, FormatVersion: 1, OSType: ENV.OSType, OSVersion: ENV.OSVersion, RequiredPlugins: [PLUGIN.UUID] })
);

fs.writeFileSync(
	path.join(sdProfileDir, "manifest.json"),
	JSON.stringify({
		Device: { Model: device.Model, UUID: device.UUID },
		Name: layout.name || "Unreal Bridge",
		Pages: { Current: "00000000-0000-0000-0000-000000000000", Default: defaultUUID.toLowerCase(), Pages: [pageUUID.toLowerCase()] },
		Version: "3.0",
	})
);

const actions = {};
for (const k of layout.keys) {
	actions[k.coord] = mkAction(k);
	if (k.image) {
		const src = path.join(imageSrcDir, k.image);
		if (!fs.existsSync(src)) {
			console.error(`  ! image manquante: ${k.image} (touche ${k.coord})`);
		} else {
			fs.copyFileSync(src, path.join(imagesDir, k.image));
		}
	}
}
fs.writeFileSync(path.join(pageDir, "manifest.json"), JSON.stringify({ Controllers: [{ Actions: actions, Type: "Keypad" }], Icon: "", Name: "" }));
fs.writeFileSync(path.join(defaultDir, "manifest.json"), JSON.stringify({ Controllers: [{ Actions: null, Type: "Keypad" }], Icon: "", Name: "" }));

// --- zip (root entries = package.json + Profiles/) ---
fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, "UnrealBridge.streamDeckProfile");
fs.rmSync(out, { force: true });
execSync(`cd "${BUILD}" && zip -rqX "${out}" package.json Profiles -x "*/.DS_Store"`);
fs.rmSync(BUILD, { recursive: true, force: true });

console.log(`Built ${out}`);
console.log(`  layout '${layoutName}' (${layout.name}) | device ${device.Model} | ${layout.keys.length} keys`);
