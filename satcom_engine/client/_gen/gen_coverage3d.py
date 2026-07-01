#!/usr/bin/env python3
"""Genere client/coverage3d.html : globe Cesium (base garantie + imagerie satellite),
TLE reels (Syracuse, Inmarsat GX, Amazon Kuiper, Starlink), animation LEO + handovers,
timeline moderne (play / vitesse / date), fiche satellite au clic.

Usage :  python client/_gen/gen_coverage3d.py
Les TLE sont dans client/_gen/data/ ; la sortie est ecrite dans client/coverage3d.html."""
import json, pathlib

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / "data"
out  = HERE.parent / "coverage3d.html"
syr = [t for t in json.load(open(DATA/"syracuse.json")) if t["name"] in ("SYRACUSE 4A","SYRACUSE 4B")]
gx  = json.load(open(DATA/"gx.json"))
kui = json.load(open(DATA/"kuiper.json"))
star= json.load(open(DATA/"starlink.json"))
TLE = {"syracuse": syr, "gx": gx, "kuiper": kui, "starlink": star}
API = "https://satcom-coverage-engine-58899663812.europe-west9.run.app"
SITES = [
  {"name":"Paris",       "lat":48.85,"lon":2.35, "mask":10,"gt":10.8,"label":"Europe — segment fixe / mobile (CCA X)"},
  {"name":"Kiev",        "lat":50.45,"lon":30.52,"mask":10,"gt":10.8,"label":"Europe — extremite de route Paris→Kiev"},
  {"name":"Abu Dhabi",   "lat":24.45,"lon":54.30,"mask":10,"gt":10.8,"label":"Golfe — segment mobile"},
  {"name":"Tehran",      "lat":35.69,"lon":51.39,"mask":10,"gt":10.8,"label":"Golfe — extremite de route"},
  {"name":"Kharkiv",     "lat":49.99,"lon":36.23,"mask":30,"gt":8.0, "label":"Ukraine — grappe vehicules, urbain dense (masque 30°)"},
  {"name":"USV Est-Med", "lat":34.00,"lon":33.00,"mask":7, "gt":9.5, "label":"Mediterranee orientale — USV maritime, ciel ouvert"},
]
CONST = {"start":"2026-06-28T21:00:00Z","dur":1800,"stepv":20,"stepe":30}

TEMPLATE = r"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SATCOM — Couverture 3D</title>
<link href="https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Widgets/widgets.css" rel="stylesheet">
<style>
  :root{ --bg:#0c0d12; --panel:#15161d; --panel2:#1b1d27; --ink:#ecebe4; --muted:#9b9aa3; --line:#2b2d39;
         --accent:#7F77DD; --x:#46a0ff; --ka:#9b8cff; --leo:#22c993; --star:#6cb6ff; --warn:#e3c46b; --bad:#f0997b; --em:#2ee6a6; }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);
       font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
  #app{display:grid;grid-template-columns:300px 1fr;grid-template-rows:1fr 308px;height:100vh}
  #side{grid-row:1/3;background:var(--panel);border-right:1px solid var(--line);padding:14px 15px;overflow-y:auto}
  #globe{position:relative}
  #cesium{position:absolute;inset:0}
  h1{font-size:15px;font-weight:600;margin:0 0 2px}
  .sub{color:var(--muted);font-size:11.5px;margin:0 0 12px}
  label{display:block;font-size:11px;color:var(--muted);margin:12px 0 4px;text-transform:uppercase;letter-spacing:.04em}
  select{width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;background:#0f1015;color:var(--ink);font:inherit;font-size:13px;color-scheme:dark}
  .seg-label{font-size:12px;color:var(--muted);margin:6px 0 0}
  .toggles{display:flex;flex-direction:column;gap:8px;margin-top:6px}
  .tg{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer}
  .tg input{accent-color:var(--accent)}
  .sw{width:12px;height:12px;border-radius:3px;display:inline-block;flex:none}
  .chips{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 0}
  .chip{background:#0f1015;border:1px solid var(--line);border-radius:9px;padding:7px 9px;font-size:11px;color:var(--muted);flex:1;min-width:84px}
  .chip b{display:block;color:var(--ink);font-size:16px;font-weight:600;margin-top:2px}
  .now{margin-top:12px;font-size:12px;color:var(--muted)} .now b{color:var(--leo)}
  .holog{margin-top:8px;max-height:104px;overflow-y:auto;font-size:11.5px;border-top:1px solid var(--line);padding-top:6px}
  .holog div{padding:2px 0;color:var(--muted)} .holog .t{color:var(--ink);font-variant-numeric:tabular-nums}
  .err{color:var(--bad);font-size:12px;margin-top:8px;white-space:pre-wrap}

  /* puissance liaison (panneau lateral) */
  .pwr{display:flex;flex-direction:column;gap:6px;margin-top:6px}
  .pwrow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
  .pwrow b{margin-left:auto;color:var(--ink);font:600 13px ui-monospace,monospace}
  .pwrow .lat{color:var(--bad)} .pwrow .hi{color:var(--leo)}
  /* mini-navigation (haut globe) */
  #nav{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:6;display:flex;gap:4px;
       background:rgba(12,13,18,.82);border:1px solid var(--line);border-radius:10px;padding:4px;backdrop-filter:blur(4px)}
  #nav a{font-size:12.5px;color:var(--muted);text-decoration:none;padding:5px 13px;border-radius:7px;font-weight:600}
  #nav a.on{background:var(--accent);color:#fff} #nav a:hover{color:var(--ink)}
  /* panneau scenario qualifie (sous le menu central) */
  #qscenario{position:absolute;left:50%;top:52px;transform:translateX(-50%);z-index:6;display:none;max-width:760px;
       background:rgba(12,13,18,.86);border:1px solid var(--line);border-radius:11px;padding:8px 13px;backdrop-filter:blur(5px);text-align:center}
  #qscenario.on{display:block}
  #qscenario .qt{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;color:var(--accent);margin-bottom:6px}
  #qscenario .qttl{flex:1;text-align:center} #qscenario .qttl b{color:var(--ink)}
  #qscenario .qlink{font-size:11px;color:var(--muted);text-decoration:none;font-weight:600;white-space:nowrap}
  #qscenario .qlink:hover{color:var(--accent)}
  #qscenario .qx{background:transparent;border:1px solid var(--line);color:var(--muted);border-radius:6px;width:22px;height:22px;cursor:pointer;font-size:15px;line-height:1;flex:none}
  #qscenario .qx:hover{color:var(--ink)}
  #qscenario .qrow{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
  #qscenario .qchip{font-size:11px;color:var(--muted);background:#0f1015;border:1px solid var(--line);border-radius:7px;padding:3px 9px}
  #qscenario .qchip b{color:var(--ink);font-weight:600}
  #qs_pill{position:absolute;left:50%;top:52px;transform:translateX(-50%);z-index:6;display:none;
       background:rgba(12,13,18,.84);border:1px solid var(--line);border-radius:9px;padding:5px 12px;
       font:700 11.5px system-ui;color:var(--accent);cursor:pointer;backdrop-filter:blur(5px)}
  #qs_pill.on{display:block}

  /* fiche satellite (clic) */
  #satpanel{position:absolute;right:12px;top:12px;width:300px;z-index:6;background:rgba(10,14,16,.94);
            border:1px solid rgba(46,230,166,.35);border-radius:11px;overflow:hidden;display:none;
            box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:12px;backdrop-filter:blur(6px)}
  #satpanel .ph{position:relative;height:150px;background:#05100c;display:flex;align-items:center;justify-content:center}
  #satpanel .ph img,#satpanel .ph video{width:100%;height:100%;object-fit:cover;background:#05100c}
  #sp_vid{cursor:zoom-in}
  #sp_vid.zoomed{cursor:zoom-out;box-shadow:0 18px 60px rgba(0,0,0,.6)}
  #vidback{position:fixed;inset:0;background:rgba(3,6,10,.72);z-index:1000;opacity:0;pointer-events:none;
           transition:opacity .42s;backdrop-filter:blur(2px)}
  #vidback.on{opacity:1;pointer-events:auto}
  #satpanel .ph .noimg{color:rgba(46,230,166,.5);font-size:34px}
  #satpanel .hd{position:absolute;left:10px;top:8px;right:34px}
  #satpanel .hd .nm{font:600 14px ui-monospace,monospace;color:#fff;text-shadow:0 1px 3px #000}
  #satpanel .hd .fm{font-size:10.5px;color:var(--em);text-shadow:0 1px 3px #000}
  #satpanel .cl{position:absolute;right:7px;top:6px;width:24px;height:24px;border:0;border-radius:6px;
                background:rgba(0,0,0,.5);color:#fff;cursor:pointer;font-size:15px;line-height:1}
  #satpanel .bd{padding:10px 12px 12px}
  #satpanel .row{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(46,230,166,.12);padding:3px 0}
  #satpanel .row .k{color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}
  #satpanel .row .v{color:var(--em);font-weight:500;font-family:ui-monospace,monospace;text-align:right}
  #satpanel .desc{margin-top:8px;font-size:11px;line-height:1.45;color:#cfeee2;max-height:84px;overflow:auto}
  #satpanel .lk{display:inline-block;margin-top:6px;font-size:10.5px;color:#7cc0e8}

  /* ---- timeline ---- */
  #bottom{grid-column:2;background:linear-gradient(180deg,var(--panel2),var(--panel));
          border-top:1px solid var(--line);padding:12px 18px 10px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
  #tbar{display:flex;align-items:center;gap:18px}
  .play{width:44px;height:44px;border-radius:50%;border:0;background:var(--accent);cursor:pointer;flex:none;
        display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(127,119,221,.5);transition:transform .1s,filter .1s}
  .play:hover{transform:scale(1.07);filter:brightness(1.08)} .play svg{width:20px;height:20px;fill:#fff}
  .tclock{min-width:210px} .tclock .t{font:600 18px/1 ui-monospace,Menlo,monospace;color:var(--ink);letter-spacing:.5px}
  .tclock .d{font-size:10.5px;color:var(--muted);letter-spacing:.08em;margin-top:4px;text-transform:uppercase}
  .ctl{display:flex;align-items:center;gap:10px} .ctl .cap{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
  .spd{width:150px;accent-color:var(--accent)} .spdv{font:600 14px ui-monospace,monospace;color:var(--accent);min-width:44px;text-align:right}
  .when{margin-left:auto;display:flex;align-items:center;gap:8px} .when .cap{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
  .when input{background:#0f1015;border:1px solid var(--line);border-radius:8px;color:var(--ink);font:inherit;font-size:12.5px;padding:7px 9px;color-scheme:dark}
  .when input:focus{outline:none;border-color:var(--accent)} .busy{font-size:12px;color:var(--warn)}
  #plot{cursor:ew-resize} svg{width:100%;height:auto;display:block}
  .legend{display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--muted)} .legend span{display:inline-flex;align-items:center;gap:5px}
  .cesium-credit-container,.cesium-widget-credits{display:none!important}
</style>
</head>
<body>
<div id="app">
  <div id="side">
    <h1>Couverture 3D SATCOM</h1>
    <p class="sub">TLE reels. Le moteur calcule le satellite servant et les handovers LEO. Clique un satellite pour sa fiche.</p>

    <label>Segment sol</label>
    <select id="site"></select>
    <p class="seg-label" id="seglabel"></p>

    <label>Service LEO (animation + handovers)</label>
    <select id="leoset"><option value="kuiper">Amazon Kuiper (364 TLE)</option><option value="starlink">Starlink (~400 TLE, coquille 53°)</option></select>

    <label>Couches</label>
    <div class="toggles">
      <label class="tg"><input type="checkbox" id="t_x" checked><span class="sw" style="background:var(--x)"></span>Syracuse · GEO X + couverture</label>
      <label class="tg"><input type="checkbox" id="t_ka" checked><span class="sw" style="background:var(--ka)"></span>Inmarsat GX · GEO Ka + couverture</label>
      <label class="tg"><input type="checkbox" id="t_leo" checked><span class="sw" style="background:var(--leo)"></span>Kuiper · LEO</label>
      <label class="tg"><input type="checkbox" id="t_star"><span class="sw" style="background:var(--star)"></span>Starlink · LEO</label>
      <label class="tg"><input type="checkbox" id="t_beam" checked><span class="sw" style="background:var(--warn)"></span>Faisceau servant + handover</label>
    </div>

    <div class="chips">
      <div class="chip">Disponibilite<b id="c_av">—</b></div>
      <div class="chip">Handovers<b id="c_ho">—</b></div>
      <div class="chip">GEO (el. min)<b id="c_geo">—</b></div>
    </div>

    <label>Puissance liaison · C/N reçu (dB)</label>
    <div class="pwr">
      <div class="pwrow"><span class="sw" style="background:var(--x)"></span>Syracuse · GEO X<b id="p_x">—</b></div>
      <div class="pwrow"><span class="sw" style="background:var(--ka)"></span>Inmarsat GX · GEO Ka<b id="p_ka">—</b></div>
      <div class="pwrow"><span class="sw" style="background:var(--leo)"></span>Kuiper · LEO<b id="p_kuiper">—</b></div>
      <div class="pwrow"><span class="sw" style="background:var(--star)"></span>Starlink · LEO<b id="p_starlink">—</b></div>
    </div>
    <p class="seg-label" id="p_note" style="margin-top:5px"></p>

    <p class="now">Servant : <b id="now_serv">—</b> <span id="now_el"></span></p>
    <div class="holog" id="holog"></div>
    <div class="err" id="err"></div>
  </div>

  <div id="globe">
    <div id="cesium"></div>
    <nav id="nav"><a href="brief.html">Qualification</a><a href="coverage3d.html" class="on">Couverture 3D</a><a href="scenarios.html">Scénarios</a></nav>
    <div id="qscenario">
      <div class="qt"><a class="qlink" id="qs_back" href="brief.html">← Qualification</a>
        <span class="qttl">Scénario qualifié — <b id="qs_name">—</b></span>
        <button class="qx" id="qs_hide" aria-label="Masquer" title="Masquer">−</button></div>
      <div class="qrow" id="qs_chips"></div></div>
    <button id="qs_pill">Scénario qualifié ▾</button>
    <div id="satpanel">
      <div class="ph"><video id="sp_vid" muted loop playsinline preload="metadata" style="display:none"></video><img id="sp_img" alt="" style="display:none"><span class="noimg" id="sp_noimg">🛰</span>
        <div class="hd"><div class="nm" id="sp_name">—</div><div class="fm" id="sp_fam"></div></div>
        <button class="cl" id="sp_close">×</button></div>
      <div class="bd">
        <div class="row"><span class="k">NORAD</span><span class="v" id="sp_norad">—</span></div>
        <div class="row"><span class="k">Designation int.</span><span class="v" id="sp_intl">—</span></div>
        <div class="row"><span class="k">Bande / orbite</span><span class="v" id="sp_band">—</span></div>
        <div class="row"><span class="k">Altitude</span><span class="v" id="sp_alt">—</span></div>
        <div class="row"><span class="k">Inclinaison</span><span class="v" id="sp_inc">—</span></div>
        <div class="row"><span class="k">Periode</span><span class="v" id="sp_per">—</span></div>
        <div class="row"><span class="k">Vitesse</span><span class="v" id="sp_vel">—</span></div>
        <div class="row"><span class="k">Position</span><span class="v" id="sp_pos">—</span></div>
        <div class="row"><span class="k">Elevation / site</span><span class="v" id="sp_el">—</span></div>
        <div class="desc" id="sp_desc"></div>
        <a class="lk" id="sp_wiki" target="_blank" rel="noreferrer"></a>
      </div>
    </div>
  </div>

  <div id="bottom">
    <div id="tbar">
      <button class="play" id="play" aria-label="Lecture / pause"><svg id="playicon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
      <div class="tclock"><div class="t" id="t_clock">—</div><div class="d" id="t_date">scenario LEO · fenetre 30 min</div></div>
      <div class="ctl"><span class="cap">Vitesse</span><input class="spd" type="range" id="spd" min="1" max="200" step="1" value="40"><span class="spdv" id="spd_v">×40</span></div>
      <div class="when"><span class="cap">Epoque</span><input type="date" id="d_date"><input type="time" id="d_time" step="60"><span class="busy" id="busy"></span></div>
    </div>
    <div id="plot"></div>
    <div class="legend" id="g_legend"></div>
  </div>
</div>

<script src="https://cesium.com/downloads/cesiumjs/releases/1.119/Build/Cesium/Cesium.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/satellite.js/5.0.0/satellite.min.js"></script>
<script>
const API="__API__", TLE=__TLE__, SITES=__SITES__, C=__CONST__, Re=6378.137, MU=398600.4418;
const COL={X:"#46a0ff",Ka:"#9b8cff",LEO:"#22c993",STAR:"#6cb6ff",BEAM:"#e3c46b"};
const WIKI={SYRACUSE:{fam:"Syracuse · militaire X (GEO)",term:"Syracuse (satellite)"},
            INMARSAT:{fam:"Inmarsat Global Xpress · Ka (GEO)",term:"Inmarsat"},
            KUIPER:{fam:"Amazon Kuiper / Leo · Ka (LEO)",term:"Project Kuiper"},
            STARLINK:{fam:"SpaceX Starlink · Ku/Ka (LEO)",term:"Starlink"}};
const VIDEO={SYRACUSE:"media/SYRACUSE.mp4",INMARSAT:"media/INMARSAT.mp4",KUIPER:"media/KUIPER.mp4",STARLINK:"media/STARLINK.mp4"};
const $=id=>document.getElementById(id);

// ---------- imagerie : base garantie (Natural Earth) + calque photo-reel ----------
let mbxToken="", mbxUser="mapbox", mbxStyle="satellite-streets-v12";
const baseLayer = Cesium.ImageryLayer.fromProviderAsync(
  Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")), {});
const viewer = new Cesium.Viewer("cesium", {
  baseLayer, baseLayerPicker:false, geocoder:false, homeButton:false, navigationHelpButton:false,
  sceneModePicker:false, fullscreenButton:false, infoBox:false, selectionIndicator:false,
  animation:false, timeline:false, shouldAnimate:false,
  contextOptions:{webgl:{preserveDrawingBuffer:true}} });  // preserveDrawingBuffer : capture toDataURL() pour l'export PDF du brief
window.viewer = viewer;  // exposé pour la capture depuis brief.html (iframe même origine)
viewer.scene.globe.enableLighting=false;
viewer.scene.globe.baseColor=Cesium.Color.fromCssColorString("#0a1420");
viewer.scene.backgroundColor=Cesium.Color.fromCssColorString("#05070d");
viewer.cesiumWidget.creditContainer.style.display="none";
viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(20,25,4.2e7),duration:0});

let photoLayer=null;
function loadPhotoImagery(){
  if(photoLayer){ viewer.imageryLayers.remove(photoLayer,true); photoLayer=null; }
  let prov;
  if(mbxToken){ prov=new Cesium.MapboxStyleImageryProvider({username:mbxUser,styleId:mbxStyle,accessToken:mbxToken,scaleFactor:true}); }
  else { prov=new Cesium.UrlTemplateImageryProvider({url:"https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",maximumLevel:18}); }
  photoLayer=viewer.imageryLayers.addImageryProvider(prov);
}
// Config Mapbox injectee par le serveur (token/style hors-depot, variables d'env Cloud Run).
async function initImagery(){
  try{ const r=await fetch("/mapbox-config.json"); if(r.ok){ const c=await r.json();
    if(c&&c.token){ mbxToken=c.token; mbxUser=c.username||"mapbox"; mbxStyle=c.styleId||"satellite-streets-v12"; } } }catch(e){}
  loadPhotoImagery();
}
initImagery();

// ---------- horloge ----------
let start=Cesium.JulianDate.fromIso8601(C.start), stop=Cesium.JulianDate.addSeconds(start,C.dur,new Cesium.JulianDate()), startMs=Date.parse(C.start);
function configClock(){ viewer.clock.startTime=start.clone(); viewer.clock.stopTime=stop.clone(); viewer.clock.currentTime=start.clone();
  viewer.clock.clockRange=Cesium.ClockRange.LOOP_STOP; viewer.clock.multiplier=+$("spd").value; viewer.clock.shouldAnimate=false; }
configClock();

// ---------- helpers ----------
const jdAt=s=>Cesium.JulianDate.addSeconds(start,s,new Cesium.JulianDate());
function ecef(rec,date){ const pv=satellite.propagate(rec,date); if(!pv||!pv.position) return null;
  const g=satellite.gstime(date), e=satellite.eciToEcf(pv.position,g); return new Cesium.Cartesian3(e.x*1000,e.y*1000,e.z*1000); }
function sampled(rec){ const p=new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.FIXED);
  for(let s=0;s<=C.dur;s+=C.stepv){ const jd=jdAt(s), c=ecef(rec,Cesium.JulianDate.toDate(jd)); if(c) p.addSample(jd,c); }
  p.setInterpolationOptions({interpolationDegree:2,interpolationAlgorithm:Cesium.LagrangePolynomialApproximation}); return p; }
function carto(cart){ const c=Cesium.Cartographic.fromCartesian(cart); return {lat:Cesium.Math.toDegrees(c.latitude),lon:Cesium.Math.toDegrees(c.longitude),h:c.height/1000}; }
const centralAngleDeg=(h,el)=>{ const e=el*Math.PI/180; return (Math.acos(Re/(Re+h)*Math.cos(e))-e)*180/Math.PI; };
function ring(latd,lond,angDeg){ const out=[],lat=latd*Math.PI/180,lon=lond*Math.PI/180,ang=angDeg*Math.PI/180;
  for(let i=0;i<=72;i++){ const az=i/72*2*Math.PI;
    const l2=Math.asin(Math.sin(lat)*Math.cos(ang)+Math.cos(lat)*Math.sin(ang)*Math.cos(az));
    const o2=lon+Math.atan2(Math.sin(az)*Math.sin(ang)*Math.cos(lat),Math.cos(ang)-Math.sin(lat)*Math.sin(l2));
    out.push(Cesium.Cartesian3.fromRadians(o2,l2)); } return out; }
function elevToSat(sLat,sLon,gLat,gLon,hKm){ const a=sLat*Math.PI/180,b=gLat*Math.PI/180,dl=(gLon-sLon)*Math.PI/180;
  const cg=Math.sin(a)*Math.sin(b)+Math.cos(a)*Math.cos(b)*Math.cos(dl), g=Math.acos(Math.min(1,Math.max(-1,cg)));
  return Math.atan2(Math.cos(g)-Re/(Re+hKm),Math.sin(g))*180/Math.PI; }
// Depointage : angle au nadir du satellite vers le site (croit quand l'elevation baisse,
// donc avec la latitude pour un GEO) -> rolloff EIRP faisceau (modele global, -3 dB au limbe ~8.7°).
function offNadirDeg(elDeg,hKm){ return Math.asin(Math.min(1,Re/(Re+hKm)*Math.cos(elDeg*Math.PI/180)))*180/Math.PI; }
function eirpRolloff(elDeg,hKm){ const eta=offNadirDeg(elDeg,hKm); return 3*(eta/8.7)*(eta/8.7); }
function median(a){ if(!a.length) return null; const s=[...a].sort((x,y)=>x-y),m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; }
function setPwr(id,cn,bad){ const e=$(id); if(cn==null){ e.textContent="—"; e.style.color=""; return; } e.textContent=cn.toFixed(1)+" dB"; e.style.color=bad?"var(--bad)":""; }

// ---------- satellites ----------
const satByEntity=new Map();
const mk=(arr,band,fam)=>arr.map(t=>({name:t.name,band,fam,rec:satellite.twoline2satrec(t.line1,t.line2),tle:t}));
const SYR=mk(TLE.syracuse,"X","SYRACUSE"), GX=mk(TLE.gx,"Ka","INMARSAT");
const KUI=mk(TLE.kuiper,"LEO","KUIPER"), STAR=mk(TLE.starlink,"LEO","STARLINK");

function geoPoint(s){ s.prop=sampled(s.rec); s.sub=carto(s.prop.getValue(start));
  s.entity=viewer.entities.add({ position:s.prop,
    point:{pixelSize:9,color:Cesium.Color.fromCssColorString(COL[s.band]),outlineColor:Cesium.Color.WHITE,outlineWidth:1},
    label:{text:s.name.replace("INMARSAT ","GX "),font:"600 11px sans-serif",fillColor:Cesium.Color.WHITE,
      style:Cesium.LabelStyle.FILL_AND_OUTLINE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,
      pixelOffset:new Cesium.Cartesian2(0,-16),scale:0.85,distanceDisplayCondition:new Cesium.DistanceDisplayCondition(0,1e8)} });
  satByEntity.set(s.entity,s); }
SYR.forEach(geoPoint); GX.forEach(geoPoint);

function buildLeo(arr,colorHex){ const byName={};
  arr.forEach(s=>{ s.prop=sampled(s.rec);
    s.entity=viewer.entities.add({position:s.prop,point:{pixelSize:4.5,color:Cesium.Color.fromCssColorString(colorHex),
      outlineColor:Cesium.Color.WHITE.withAlpha(0.4),outlineWidth:1,
      scaleByDistance:new Cesium.NearFarScalar(7e6,1.35,4e7,0.65)}});
    satByEntity.set(s.entity,s); byName[s.name]=s; });
  return byName; }
const KUI_byName=buildLeo(KUI,COL.LEO);
let STAR_byName=null, starBuilt=false;
function ensureStarlink(){ if(starBuilt) return; STAR_byName=buildLeo(STAR,COL.STAR); starBuilt=true; }

// service LEO actif (Kuiper par defaut)
let LEOSET={key:"kuiper",arr:KUI,byName:KUI_byName,tles:TLE.kuiper};

// ---------- couvertures + servant ----------
// Couverture : remplissage tres transparent (on voit la Terre + les LEO au travers)
// + bord lumineux facon Fresnel (PolylineGlow clampe au sol).
function makeCap(c){ const col=Cesium.Color.fromCssColorString(c);
  const fill=viewer.entities.add({polygon:{hierarchy:new Cesium.PolygonHierarchy([]), material:col.withAlpha(0.06), height:0}});
  const rim=viewer.entities.add({polyline:{positions:[], width:3, clampToGround:true,
    material:new Cesium.PolylineGlowMaterialProperty({glowPower:0.35, color:col.withAlpha(0.95)})}});
  return { setRing(p){ fill.polygon.hierarchy=new Cesium.PolygonHierarchy(p); rim.polyline.positions=p; },
           setVisible(v){ fill.show=v; rim.show=v; } }; }
const capX=makeCap(COL.X), capKa=makeCap(COL.Ka);
let activeSite=null, servedArr=[], maskNow=10;
let qsActive=false, QUALIF={};
const curSec=()=>Cesium.JulianDate.secondsDifference(viewer.clock.currentTime,start);
function servedNameAt(t){ if(!servedArr.length) return null; const k=Math.max(0,Math.min(servedArr.length-1,Math.floor(t/C.stepe))); return servedArr[k]; }
function servedRing(){ const nm=servedNameAt(curSec()), s=nm&&LEOSET.byName[nm]; if(!s) return null;
  const c=s.prop.getValue(viewer.clock.currentTime); if(!c) return null; const sp=carto(c);
  return ring(sp.lat,sp.lon,centralAngleDeg(sp.h,maskNow)); }
const leoCap=viewer.entities.add({polygon:{hierarchy:new Cesium.CallbackProperty(()=>new Cesium.PolygonHierarchy(servedRing()||[]),false),
  material:Cesium.Color.fromCssColorString(COL.LEO).withAlpha(0.12), height:0}});
const leoRim=viewer.entities.add({polyline:{positions:new Cesium.CallbackProperty(()=>servedRing()||[],false), width:3, clampToGround:true,
  material:new Cesium.PolylineGlowMaterialProperty({glowPower:0.4, color:Cesium.Color.fromCssColorString(COL.LEO).withAlpha(0.95)})}});
let siteCart=null;
const beam=viewer.entities.add({polyline:{positions:new Cesium.CallbackProperty(()=>{
    if(!siteCart) return []; const nm=servedNameAt(curSec()), s=nm&&LEOSET.byName[nm]; if(!s) return [];
    const c=s.prop.getValue(viewer.clock.currentTime); if(!c) return []; return [siteCart,c]; },false),
  width:3,material:new Cesium.PolylineGlowMaterialProperty({glowPower:0.25,color:Cesium.Color.fromCssColorString(COL.BEAM)})}});
const siteEnt=viewer.entities.add({position:new Cesium.CallbackProperty(()=>siteCart||Cesium.Cartesian3.ZERO,false),
  point:{pixelSize:10,color:Cesium.Color.WHITE,outlineColor:Cesium.Color.fromCssColorString(COL.BEAM),outlineWidth:2},
  label:{font:"600 12px sans-serif",fillColor:Cesium.Color.WHITE,style:Cesium.LabelStyle.FILL_AND_OUTLINE,outlineColor:Cesium.Color.BLACK,outlineWidth:3,pixelOffset:new Cesium.Cartesian2(0,-18)}});

// ---------- moteur ----------
async function post(path,body){ const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok) throw new Error("HTTP "+r.status+" — "+await r.text()); return r.json(); }
function bestGeo(list,site){ let best=null; for(const s of list){ const el=elevToSat(site.lat,site.lon,s.sub.lat,s.sub.lon,s.sub.h); if(!best||el>best.el) best={s,el}; } return best; }
async function selectSite(site,fly=true){
  activeSite=site; maskNow=site.mask; $("seglabel").textContent=site.label; $("err").textContent="";
  siteCart=Cesium.Cartesian3.fromDegrees(site.lon,site.lat,0); siteEnt.label.text=site.name;
  const bx=bestGeo(SYR,site), bk=bestGeo(GX,site);
  capX.setRing(ring(bx.s.sub.lat,bx.s.sub.lon,centralAngleDeg(bx.s.sub.h,site.mask)));
  capKa.setRing(ring(bk.s.sub.lat,bk.s.sub.lon,centralAngleDeg(bk.s.sub.h,site.mask)));
  $("c_geo").innerHTML = bk.el>=site.mask?'<span style="color:var(--ka)">GX '+bk.el.toFixed(0)+'°</span>':'<span style="color:var(--bad)">GX masque</span>';
  if(fly) viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(site.lon,site.lat,9.0e6),duration:1.2});

  // Puissance liaison (C/N reçu) par type — GEO : decroit avec la latitude (elevation + depointage)
  $("p_note").textContent="C/N reçu, incl. dépointage faisceau global GEO : ↓ à haute latitude.";
  geoCN(bx.s,site,{up:8000,down:7500,eirp:52,gt:5,bw:40},7.0).then(v=>setPwr("p_x",v,bx.el<site.mask)).catch(()=>setPwr("p_x",null));
  geoCN(bk.s,site,{up:30000,down:20000,eirp:60,gt:10,bw:72},site.gt).then(v=>setPwr("p_ka",v,bk.el<site.mask)).catch(()=>setPwr("p_ka",null));
  // LEO Kuiper + Starlink (C/N median, independant du service animé)
  leoCN(site,TLE.kuiper).then(v=>setPwr("p_kuiper",v,v==null));
  leoCN(site,TLE.starlink).then(v=>setPwr("p_starlink",v,v==null));

  try{
    const sc=await post("/scenario",{site:{name:site.name,lat_deg:site.lat,lon_deg:site.lon,elevation_mask_deg:site.mask},
      terminal:{name:"term",gt_dbk:site.gt},tles:LEOSET.tles,epoch_iso:C.start,duration_s:C.dur,step_s:C.stepe,handover_policy:"max_elevation"});
    servedArr=[]; const n=Math.floor(C.dur/C.stepe)+1; for(let k=0;k<n;k++){ const p=sc.series[k]; servedArr[k]=p&&p.served?p.served:null; }
    $("c_av").textContent=sc.availability_pct+" %"; $("c_ho").textContent=sc.handover_count; renderGraph(sc); renderHandovers(sc.handovers);
  }catch(e){ $("err").textContent="Moteur indisponible : "+e.message; }
  updateReadouts(curSec());
  renderQS();
}
async function geoCN(geoSat,site,p,termGt){
  const d=await post("/link",{site:{name:site.name,lat_deg:site.lat,lon_deg:site.lon,elevation_mask_deg:site.mask},
    terminal:{gt_dbk:termGt}, carrier:{uplink_mhz:p.up,downlink_mhz:p.down},
    satellite_geo:{name:"s",longitude_deg:geoSat.sub.lon,eirp_dbw:p.eirp,gt_dbk:p.gt,transponder_bw_mhz:p.bw,sfd_dbw_m2:-90}});
  return (d.cn_required_db+d.link_margin_db) - eirpRolloff(d.geometry.elevation_deg, geoSat.sub.h);
}
async function leoCN(site,tles){
  try{ const d=await post("/scenario",{site:{name:site.name,lat_deg:site.lat,lon_deg:site.lon,elevation_mask_deg:site.mask},
    terminal:{gt_dbk:site.gt}, tles, epoch_iso:C.start, duration_s:C.dur, step_s:C.stepe, handover_policy:"max_elevation"});
    return median(d.series.filter(p=>p.served&&p.cn_total_db!=null).map(p=>p.cn_total_db)); }catch(e){ return null; }
}

let G=null;
function renderGraph(d){
  const S=d.series,dur=d.duration_s,W=980,H=178,m={l:42,r:12,t:12,b:24};
  const pw=W-m.l-m.r,ribY=m.t,ribH=26,elY=ribY+ribH+18,elH=H-elY-m.b;
  const X=t=>m.l+(t/dur)*pw, Yel=e=>elY+elH-(Math.max(0,Math.min(90,e))/90)*elH; G={X,dur,pw,ribY,elY,elH,m,W,H};
  const col=name=>{ if(!name) return "#3a3a44"; let h=0; for(const c of name) h=(h*31+c.charCodeAt(0))%360; return `hsl(${h} 62% 58%)`; };
  let svg=`<svg viewBox="0 0 ${W} ${H}">`;
  svg+=`<line x1="${m.l}" y1="${elY+elH}" x2="${W-m.r}" y2="${elY+elH}" stroke="#3a3a44"/>`;
  for(const e of [0,30,60,90]) svg+=`<line x1="${m.l}" y1="${Yel(e)}" x2="${W-m.r}" y2="${Yel(e)}" stroke="#2c2c34" stroke-dasharray="2 4"/><text x="${m.l-7}" y="${Yel(e)+4}" text-anchor="end" font-size="10" fill="#9b9aa3">${e}°</text>`;
  const mask=activeSite.mask;
  svg+=`<line x1="${m.l}" y1="${Yel(mask)}" x2="${W-m.r}" y2="${Yel(mask)}" stroke="#f0997b" stroke-dasharray="5 3"/><text x="${W-m.r}" y="${Yel(mask)-3}" text-anchor="end" font-size="10" fill="#f0997b">masque ${mask}°</text>`;
  for(let t=0;t<=dur;t+=300){ const l=new Date(startMs+t*1000),hh=String(l.getUTCHours()).padStart(2,"0")+":"+String(l.getUTCMinutes()).padStart(2,"0");
    svg+=`<text x="${X(t)}" y="${elY+elH+16}" text-anchor="middle" font-size="10" fill="#9b9aa3">${hh}</text>`; }
  let i=0; const served=new Set();
  while(i<S.length){ let j=i; while(j+1<S.length&&S[j+1].served===S[i].served) j++;
    const t0=S[i].t_s,t1=(j+1<S.length?S[j+1].t_s:dur),name=S[i].served; if(name) served.add(name);
    svg+=`<rect x="${X(t0)}" y="${ribY}" width="${Math.max(0,X(t1)-X(t0))}" height="${ribH}" fill="${col(name)}" opacity="${name?0.92:0.25}" rx="2"/>`; i=j+1; }
  svg+=`<text x="${m.l}" y="${ribY-3}" font-size="10" fill="#9b9aa3">Satellite servant (${LEOSET.key})</text>`;
  for(const h of d.handovers) svg+=`<line x1="${X(h.t_s)}" y1="${ribY}" x2="${X(h.t_s)}" y2="${elY+elH}" stroke="#ecebe4" stroke-width="0.5" stroke-dasharray="2 3" opacity="0.45"/>`;
  const pts=S.filter(p=>p.served).map(p=>`${X(p.t_s)},${Yel(p.elevation_deg)}`).join(" ");
  svg+=`<polyline points="${pts}" fill="none" stroke="#9b8cff" stroke-width="2"/>`;
  svg+=`<line id="cursor" x1="${m.l}" y1="${ribY-8}" x2="${m.l}" y2="${elY+elH}" stroke="#e3c46b" stroke-width="2"/><circle id="cursordot" cx="${m.l}" cy="${ribY-8}" r="4" fill="#e3c46b"/>`;
  svg+=`</svg>`; $("plot").innerHTML=svg;
  $("g_legend").innerHTML=`<span><i class="sw" style="background:#9b8cff"></i>elevation servant</span><span><i class="sw" style="background:#f0997b"></i>masque</span><span><i class="sw" style="background:#e3c46b"></i>instant courant — clic/glisse pour naviguer</span><span>${d.n_satellites} sats · ${served.size} servants</span>`;
}
function renderHandovers(hs){ const el=$("holog");
  if(!hs.length){ el.innerHTML='<div>Aucun handover (couverture continue).</div>'; return; }
  el.innerHTML=`<div style="color:var(--ink);margin-bottom:3px">${hs.length} handovers</div>`+hs.map(h=>{ const l=new Date(startMs+h.t_s*1000),hh=String(l.getUTCHours()).padStart(2,"0")+":"+String(l.getUTCMinutes()).padStart(2,"0");
    return `<div><span class="t">${hh}</span> ${h.from.replace("KUIPER-","K").replace("STARLINK-","S")} → ${h.to.replace("KUIPER-","K").replace("STARLINK-","S")}</div>`; }).join(""); }

// ---------- fiche satellite (clic) ----------
const wikiCache={};
function tleNorad(l1){ return l1.substring(2,7).trim(); }
function tleIntl(l1){ return l1.substring(9,17).trim(); }
function orbit(s){ const inc=parseFloat(s.tle.line2.substring(8,16)); const mm=parseFloat(s.tle.line2.substring(52,63));
  const n=mm*2*Math.PI/86400; const a=Math.cbrt(MU/(n*n)); const alt=a-Re; const per=1440/mm; const vel=Math.sqrt(MU/a);
  return {inc,alt,per,vel}; }
async function showSat(s){
  const w=WIKI[s.fam]||{fam:s.name,term:s.name}; const o=orbit(s);
  $("sp_name").textContent=s.name; $("sp_fam").textContent=w.fam;
  $("sp_norad").textContent=tleNorad(s.tle.line1); $("sp_intl").textContent=tleIntl(s.tle.line1)||"—";
  $("sp_band").textContent=({X:"X · GEO",Ka:"Ka · GEO",LEO:s.fam==="STARLINK"?"Ku/Ka · LEO":"Ka · LEO"})[s.band];
  $("sp_alt").textContent=o.alt.toFixed(0)+" km"; $("sp_inc").textContent=o.inc.toFixed(2)+"°";
  $("sp_per").textContent=o.per.toFixed(1)+" min"; $("sp_vel").textContent=o.vel.toFixed(2)+" km/s";
  panelSat=s; updateSatLive();
  // video de la famille (a la place de l'image web)
  const vurl=VIDEO[s.fam], vid=$("sp_vid");
  if(vurl){ if(vid.getAttribute("src")!==vurl) vid.src=vurl; vid.style.display="block";
    $("sp_img").style.display="none"; $("sp_noimg").style.display="none"; vid.currentTime=0; vid.play().catch(()=>{}); }
  else { vid.pause(); vid.style.display="none"; $("sp_img").style.display="none"; $("sp_noimg").style.display="block"; }
  $("sp_desc").textContent=""; $("sp_wiki").textContent="";
  $("satpanel").style.display="block";
  try{ let info=wikiCache[w.term];
    if(!info){ const r=await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/"+encodeURIComponent(w.term)+"?redirect=true"); info=await r.json(); wikiCache[w.term]=info; }
    if(panelSat!==s) return;
    $("sp_desc").textContent=info.extract||"";
    if(info.content_urls){ $("sp_wiki").textContent="Wikipedia ↗"; $("sp_wiki").href=info.content_urls.desktop.page; }
  }catch(e){}
}
let panelSat=null;
function updateSatLive(){ const s=panelSat; if(!s) return; const c=s.prop&&s.prop.getValue(viewer.clock.currentTime); if(!c) return;
  const sp=carto(c); $("sp_pos").textContent=sp.lat.toFixed(2)+"°, "+sp.lon.toFixed(2)+"°";
  if(activeSite){ const el=elevToSat(activeSite.lat,activeSite.lon,sp.lat,sp.lon,sp.h);
    $("sp_el").textContent=(el>=0?el.toFixed(0)+"° ":"sous horizon ")+"("+activeSite.name+")"; } }
$("sp_close").onclick=()=>{ if(vidZoomed) unzoomVideo(); $("satpanel").style.display="none"; $("sp_vid").pause(); panelSat=null; };
viewer.screenSpaceEventHandler.setInputAction(ev=>{ const p=viewer.scene.pick(ev.position);
  if(p&&p.id&&satByEntity.has(p.id)) showSat(satByEntity.get(p.id)); }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// --- zoom video : clic -> 720p de maniere fluide (FLIP), reclic/Échap -> reduit ---
const _vb=document.createElement("div"); _vb.id="vidback"; document.body.appendChild(_vb);
const _vid=$("sp_vid"), _ph=_vid.parentNode; let vidZoomed=false;
function _flip(first){
  const last=_vid.getBoundingClientRect();
  const dx=first.left-last.left, dy=first.top-last.top, sx=(first.width/last.width)||1, sy=(first.height/last.height)||1;
  _vid.style.transformOrigin="top left"; _vid.style.transition="none";
  _vid.style.transform=`translate(${dx}px,${dy}px) scale(${sx},${sy})`;
  _vid.getBoundingClientRect();
  requestAnimationFrame(()=>{ _vid.style.transition="transform .42s cubic-bezier(.22,.61,.36,1)"; _vid.style.transform="none"; });
}
function zoomVideo(){
  if(vidZoomed || _vid.style.display==="none") return;
  const first=_vid.getBoundingClientRect();
  document.body.appendChild(_vid); _vid.muted=true; _vid.classList.add("zoomed");
  const w=Math.min(1280, innerWidth*0.94, innerHeight*0.86*16/9), h=w*9/16;
  Object.assign(_vid.style,{position:"fixed",zIndex:"1002",objectFit:"contain",borderRadius:"14px",
    width:w+"px",height:h+"px",left:((innerWidth-w)/2)+"px",top:((innerHeight-h)/2)+"px"});
  _vid.play().catch(()=>{}); _flip(first); _vb.classList.add("on"); vidZoomed=true;
}
function unzoomVideo(){
  if(!vidZoomed) return;
  const first=_vid.getBoundingClientRect(); _vid.classList.remove("zoomed");
  ["position","zIndex","objectFit","borderRadius","width","height","left","top"].forEach(k=>_vid.style[k]="");
  _ph.insertBefore(_vid,_ph.firstChild); _flip(first); _vb.classList.remove("on"); vidZoomed=false;
}
_vid.addEventListener("click",()=> vidZoomed?unzoomVideo():zoomVideo());
_vb.addEventListener("click",unzoomVideo);
window.addEventListener("keydown",e=>{ if(e.key==="Escape"&&vidZoomed) unzoomVideo(); });

// ---------- readouts + controles timeline ----------
function fmtClock(t){ const d=new Date(startMs+t*1000),p=n=>String(n).padStart(2,"0");
  return {hms:`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,ymd:`${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} UTC`}; }
function updateReadouts(t){ t=Math.max(0,Math.min(C.dur,t)); const f=fmtClock(t);
  $("t_clock").textContent=f.hms; $("t_date").textContent=f.ymd;
  if(G){ const x=G.X(t),c=$("cursor"),dot=$("cursordot"); if(c){c.setAttribute("x1",x);c.setAttribute("x2",x);} if(dot) dot.setAttribute("cx",x); }
  const nm=servedNameAt(t); $("now_serv").textContent=nm?nm.replace("KUIPER-","Kuiper ").replace("STARLINK-","Starlink "):"— (aucune visibilite)";
  const s=nm&&LEOSET.byName[nm];
  if(s&&activeSite){ const cc=s.prop.getValue(viewer.clock.currentTime); if(cc){ const sp=carto(cc); $("now_el").textContent="· el "+elevToSat(activeSite.lat,activeSite.lon,sp.lat,sp.lon,sp.h).toFixed(0)+"°"; } }
  else $("now_el").textContent="";
  if(panelSat) updateSatLive();
}
const ICON_PLAY='<path d="M8 5v14l11-7z"/>', ICON_PAUSE='<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
function updatePlayIcon(){ $("playicon").innerHTML=viewer.clock.shouldAnimate?ICON_PAUSE:ICON_PLAY; }
$("play").onclick=()=>{ if(!viewer.clock.shouldAnimate&&curSec()>=C.dur-0.5) viewer.clock.currentTime=start.clone();
  viewer.clock.shouldAnimate=!viewer.clock.shouldAnimate; updatePlayIcon(); };
$("spd").oninput=e=>{ viewer.clock.multiplier=+e.target.value; $("spd_v").textContent="×"+e.target.value; };
viewer.clock.onTick.addEventListener(()=>{ updateReadouts(curSec()); if(!viewer.clock.shouldAnimate) updatePlayIcon(); });

let scrubbing=false;
function seekFromEvent(ev){ const svg=document.querySelector("#plot svg"); if(!svg||!G) return;
  const r=svg.getBoundingClientRect(), xu=(ev.clientX-r.left)*(G.W/r.width), t=Math.max(0,Math.min(C.dur,(xu-G.m.l)/G.pw*C.dur));
  viewer.clock.currentTime=Cesium.JulianDate.addSeconds(start,t,new Cesium.JulianDate()); updateReadouts(t); }
$("plot").addEventListener("pointerdown",e=>{scrubbing=true;seekFromEvent(e);});
window.addEventListener("pointermove",e=>{if(scrubbing)seekFromEvent(e);});
window.addEventListener("pointerup",()=>scrubbing=false);

// ---------- date / epoque ----------
function resampleAll(){ const sets=[SYR,GX,KUI]; if(starBuilt) sets.push(STAR);
  sets.forEach(a=>a.forEach(s=>{ s.prop=sampled(s.rec); s.entity.position=s.prop; }));
  [...SYR,...GX].forEach(s=>{ s.sub=carto(s.prop.getValue(start)); }); }
async function setWindow(iso){ const busy=$("busy"); busy.textContent="Calcul…"; await new Promise(r=>setTimeout(r,20));
  C.start=iso; startMs=Date.parse(iso); start=Cesium.JulianDate.fromIso8601(iso); stop=Cesium.JulianDate.addSeconds(start,C.dur,new Cesium.JulianDate());
  configClock(); updatePlayIcon(); resampleAll(); await selectSite(activeSite,false); busy.textContent=""; }
function applyDate(){ const d=$("d_date").value,t=$("d_time").value; if(d&&t) setWindow(`${d}T${t}:00Z`); }
$("d_date").onchange=applyDate; $("d_time").onchange=applyDate;

// ---------- toggles + service LEO ----------
const setShow=(arr,v)=>arr.forEach(s=>s.entity&&(s.entity.show=v));
$("t_x").onchange=e=>{ setShow(SYR,e.target.checked); capX.setVisible(e.target.checked); };
$("t_ka").onchange=e=>{ setShow(GX,e.target.checked); capKa.setVisible(e.target.checked); };
$("t_leo").onchange=e=>{ setShow(KUI,e.target.checked); };
$("t_star").onchange=e=>{ if(e.target.checked){ ensureStarlink(); setShow(STAR,true); } else if(starBuilt) setShow(STAR,false); };
$("t_beam").onchange=e=>{ beam.show=e.target.checked; };
$("leoset").onchange=async e=>{ const k=e.target.value; const busy=$("busy"); busy.textContent="Calcul…"; await new Promise(r=>setTimeout(r,20));
  if(k==="starlink"){ ensureStarlink(); setShow(STAR,true); $("t_star").checked=true;
    LEOSET={key:"starlink",arr:STAR,byName:STAR_byName,tles:TLE.starlink}; }
  else { LEOSET={key:"kuiper",arr:KUI,byName:KUI_byName,tles:TLE.kuiper}; }
  const lc=Cesium.Color.fromCssColorString(k==="starlink"?COL.STAR:COL.LEO);
  leoCap.polygon.material=lc.withAlpha(0.12);
  leoRim.polyline.material=new Cesium.PolylineGlowMaterialProperty({glowPower:0.4,color:lc.withAlpha(0.95)});
  await selectSite(activeSite,false); busy.textContent=""; };

// ---------- init ----------
(function initDates(){ const d=new Date(startMs),p=n=>String(n).padStart(2,"0");
  $("d_date").value=`${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())}`; $("d_time").value=`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; })();
updatePlayIcon();
const sel=$("site");
const _q=new URLSearchParams(location.search);
if(_q.has("lat")&&_q.has("lon")){
  SITES.unshift({name:_q.get("name")||"Zone client", lat:+_q.get("lat"), lon:+_q.get("lon"),
    mask:+(_q.get("mask")||10), gt:+(_q.get("gt")||10.8), label:"Zone client — depuis la qualification"});
  // panneau "scenario qualifie" : repliable + mis a jour avec le segment / service 3D
  const g=k=>_q.get(k);
  qsActive=true;
  QUALIF={ band:g("band"), usage:g("usage"), rate:g("rate"), orbit:g("orbit"), ant:g("ant"),
           platform:g("platform"), mission:g("mission"), rain:g("rain") };
  $("qscenario").classList.add("on");
}
function renderQS(){
  if(!qsActive) return;
  $("qs_name").textContent = activeSite ? activeSite.name : "Zone client";
  const Q=QUALIF, ch=[];
  if(Q.band)     ch.push(["Bande", Q.band]);
  if(Q.usage)    ch.push(["Service", Q.usage+(Q.rate?" · "+Q.rate+" Mbps":"")]);
  if(Q.orbit)    ch.push(["Orbite reco", Q.orbit]);
  if(Q.ant)      ch.push(["Antenne", Q.ant]);
  if(Q.platform) ch.push(["Plateforme", Q.platform]);
  if(Q.mission)  ch.push(["Mission", Q.mission]);
  ch.push(["LEO actif", LEOSET.key==="starlink"?"Starlink":"Kuiper"]);
  if(activeSite){ ch.push(["Masque", activeSite.mask+"°"]); ch.push(["G/T", activeSite.gt+" dB/K"]); }
  if(Q.rain)     ch.push(["Pluie est.", Q.rain+" dB"]);
  $("qs_chips").innerHTML = ch.map(([k,v])=>`<span class="qchip">${k} <b>${v}</b></span>`).join("");
}
$("qs_hide").onclick=()=>{ $("qscenario").classList.remove("on"); $("qs_pill").classList.add("on"); };
$("qs_pill").onclick=()=>{ $("qs_pill").classList.remove("on"); $("qscenario").classList.add("on"); };
SITES.forEach((s,i)=>sel.add(new Option(s.name+" — "+s.label.split(" — ")[0],i)));
sel.onchange=()=>selectSite(SITES[+sel.value]);
const _def=_q.has("lat")?0:1; sel.value=String(_def); selectSite(SITES[_def]);
if(location.hash==="#play"){ viewer.clock.shouldAnimate=true; updatePlayIcon(); }
</script>
</body>
</html>
"""

html=(TEMPLATE.replace("__API__",API).replace("__TLE__",json.dumps(TLE,ensure_ascii=False))
      .replace("__SITES__",json.dumps(SITES,ensure_ascii=False)).replace("__CONST__",json.dumps(CONST)))
out.write_text(html,encoding="utf-8")
print(f"written {out} ({len(html)} bytes) — syr={len(syr)} gx={len(gx)} kuiper={len(kui)} starlink={len(star)}")
