#!/usr/bin/env node
// Generates dist/UnrealBridge.streamDeckProfile — 5 buttons mapped to the StreamDeckDemo
// actions (Color/Scale/Spin/Reset), pre-configured AND with the bt_0X images baked in.
//
// Format = Stream Deck 7.x (reverse-engineered from real 7.5 exports). Zip layout:
//   package.json                                          (FormatVersion 1 + RequiredPlugins)
//   Profiles/<outerUUID>.sdProfile/manifest.json          (bundle, Version 3.0, Device, Pages)
//   Profiles/<outerUUID>.sdProfile/Profiles/<pageUUID>/manifest.json   (Keypad Actions)
//   Profiles/<outerUUID>.sdProfile/Profiles/<pageUUID>/Images/*.png    (custom key images)
//   Profiles/<outerUUID>.sdProfile/Profiles/<defaultUUID>/manifest.json (empty default page)
//
// Custom-image encoding (from the XL export): each key's States[0].Image points to
// "Images/<file>.png", stored next to the page manifest.
//
// Usage:  node tools/make_profile.js [xl|mk2]      (default: xl)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const IMGS = path.join(ROOT, "streamdeck-plugin/dev.mip.unreal.sdPlugin/imgs");
const DIST = path.join(ROOT, "dist");
const BUILD = path.join(require("os").tmpdir(), `sdprofile_build_${process.pid}`);

// --- device targets, with metadata from the user's real 7.5 exports ---
const DEVICES = {
	xl: { Model: "20GAT9902", UUID: "07f87425-bb2f-48a4-86e9-ac48f4c657de" }, // Stream Deck XL (8x4)
	mk2: { Model: "20GBA9901", UUID: "833c22d1-bdb2-487f-a150-090548977a6f" }, // Stream Deck MK.2 (5x3)
};
const ENV = { AppVersion: "7.5.0.22885", OSType: "macOS", OSVersion: "26.5.1" };
const PLUGIN = { Name: "Unreal Bridge", UUID: "dev.mip.unreal", Version: "0.1.0.0" };
const ACTION_UUID = "dev.mip.unreal.trigger";

const target = (process.argv[2] || "xl").toLowerCase();
const device = DEVICES[target];
if (!device) {
	console.error(`Unknown device '${target}'. Use one of: ${Object.keys(DEVICES).join(", ")}`);
	process.exit(1);
}

const uuid = () => crypto.randomUUID();
const outerUUID = uuid().toUpperCase();
const pageUUID = uuid().toUpperCase();
const defaultUUID = uuid().toUpperCase();

// 5 demo buttons on the top row (fits both XL and MK.2).
const keys = [
	{ col: 0, action: "Color", payload: '{"r":1,"g":0,"b":0}', title: "Red", img: "bt_01.png" },
	{ col: 1, action: "Color", payload: '{"r":0,"g":0.4,"b":1}', title: "Blue", img: "bt_02.png" },
	{ col: 2, action: "Scale", payload: '{"value":2.0}', title: "Scale x2", img: "bt_03.png" },
	{ col: 3, action: "Spin", payload: "", title: "Spin", img: "bt_04.png" },
	{ col: 4, action: "Reset", payload: "", title: "Reset", img: "bt_05.png" },
];

const mkAction = (k) => ({
	ActionID: uuid(),
	LinkedTitle: true,
	Name: "Trigger UE Event",
	Plugin: PLUGIN,
	Resources: null,
	Settings: { action: k.action, host: "127.0.0.1", payload: k.payload, port: "5051", title: k.title },
	State: 0,
	States: [
		{
			FontFamily: "",
			FontSize: 12,
			FontStyle: "",
			FontUnderline: false,
			Image: `Images/${k.img}`,
			OutlineThickness: 2,
			ShowTitle: true,
			Title: k.title,
			TitleAlignment: "bottom",
			TitleColor: "#ffffff",
		},
	],
	UUID: ACTION_UUID,
});

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
		Name: "Unreal Bridge",
		Pages: { Current: "00000000-0000-0000-0000-000000000000", Default: defaultUUID.toLowerCase(), Pages: [pageUUID.toLowerCase()] },
		Version: "3.0",
	})
);

const actions = {};
for (const k of keys) {
	actions[`${k.col},0`] = mkAction(k);
	fs.copyFileSync(path.join(IMGS, k.img), path.join(imagesDir, k.img));
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
console.log(`  target ${target} | device ${device.Model} | 5 keys with baked images`);
