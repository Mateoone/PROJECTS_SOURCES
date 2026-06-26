"""Orchestration. Assemble geometry + rf en resultats normalises (LinkResult).
  - compute_geo_link  : une liaison GEO a un instant.
  - run_leo_scenario  : pass LEO sur une fenetre (visibilite, handover, dispo %)."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import List, Optional
import numpy as np

from . import geometry as geo
from . import rf
from .models import (LinkRequest, ScenarioRequest, LinkResult, Geometry)


def _carrier_symbol_rate(c) -> float:
    return (c.data_rate_kbps * 1000.0 * c.rs_ratio) / (c.fec_rate * c.modulation_bits_per_symbol)


def compute_geo_link(req: LinkRequest) -> LinkResult:
    s, t, c, sat = req.site, req.terminal, req.carrier, req.satellite_geo
    rng, az, el = geo.geo_look_angles(s.lat_deg, s.lon_deg, sat.longitude_deg)
    visible = el >= s.elevation_mask_deg

    fspl_up = rf.fspl_db(rng, c.uplink_mhz)
    fspl_down = rf.fspl_db(rng, c.downlink_mhz)
    nbw = rf.noise_bandwidth_hz(c.data_rate_kbps, c.fec_rate, c.rs_ratio,
                                c.modulation_bits_per_symbol, c.bt_product)
    cn_req = rf.cn_required_db(c.ebno_required_db, c.data_rate_kbps, nbw, c.system_margin_db)

    cn_up = rf.k1_uplink_db(sat.sfd_dbw_m2, c.uplink_mhz, sat.gt_dbk, nbw, sat.input_backoff_db)
    cn_down = rf.k2_downlink_db(sat.eirp_dbw, fspl_down, t.gt_dbk, nbw,
                               sat.output_backoff_db, extra_loss_db=req.rain_margin_db)
    cn_total = rf.combine_cn(cn_up, cn_down, sat.cim_db)

    sym = _carrier_symbol_rate(c)
    modcod = rf.select_modcod(cn_total, sym) if c.auto_modcod else None
    margin = cn_total - cn_req

    return LinkResult(
        site=s.name, satellite=sat.name,
        geometry=Geometry(slant_range_km=rng, azimuth_deg=az, elevation_deg=el, visible=visible),
        fspl_up_db=fspl_up, fspl_down_db=fspl_down, cn_required_db=cn_req,
        cn_uplink_db=cn_up, cn_downlink_db=cn_down,
        modcod=modcod[0] if modcod else None,
        spectral_efficiency=modcod[1] if modcod else None,
        throughput_mbps=modcod[2] if modcod else None,
        link_margin_db=margin,
        feasible=bool(visible and margin >= 0.0),
    )


def _leo_positions(req: ScenarioRequest, dt0: datetime):
    """Liste de (nom, fonction position_ecef(dt)) pour tous les satellites du scenario."""
    sats = []
    for tle in req.tles:
        sats.append((tle.name, lambda dt, l1=tle.line1, l2=tle.line2: geo.leo_state_from_tle(l1, l2, dt)))
    if req.walker:
        w = req.walker
        elems = geo.walker_constellation(w.planes, w.sats_per_plane, w.phasing,
                                         w.altitude_km, w.inclination_deg)
        for i, (raan, u0, alt, inc) in enumerate(elems):
            def f(dt, raan=raan, u0=u0, alt=alt, inc=inc):
                eci = geo.walker_sat_eci(alt, inc, raan, u0, dt0, dt)
                return geo.eci_to_ecef(eci, dt)
            sats.append((f"{w.name}-{i:03d}", f))
    return sats


def run_leo_scenario(req: ScenarioRequest) -> dict:
    """Propage la constellation sur la fenetre, choisit la meilleure liaison a chaque
    pas (handover), calcule le bilan RF et la disponibilite."""
    s, t, c = req.site, req.terminal, req.carrier
    dt0 = datetime.fromisoformat(req.epoch_iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    site_ecef = geo.geodetic_to_ecef(s.lat_deg, s.lon_deg, s.alt_m)
    sats = _leo_positions(req, dt0)
    sym = _carrier_symbol_rate(c)
    # G/T et EIRP "moyens" de la coquille pour le bilan (depuis walker si fourni)
    sat_gt = req.walker.gt_dbk if req.walker else 5.0
    sat_eirp = req.walker.eirp_dbw if req.walker else 38.0

    series, handovers = [], []
    served_prev = None
    n_steps = req.duration_s // req.step_s + 1
    feasible_steps = 0

    for k in range(n_steps):
        dt = dt0 + timedelta(seconds=k * req.step_s)
        best = None  # (el, name, rng, az)
        for name, posf in sats:
            try:
                sat_ecef = posf(dt)
            except Exception:
                continue
            rng, az, el = geo.ecef_look_angles(site_ecef, sat_ecef, s.lat_deg, s.lon_deg)
            if el < s.elevation_mask_deg:
                continue
            key = el  # max_elevation par defaut
            if req.handover_policy == "max_cn":
                key = -rf.fspl_db(rng, c.downlink_mhz)  # proxy : range mini ~ meilleur C/N
            if best is None or key > best[0]:
                best = (key, name, rng, az, el)

        if best is None:
            series.append({"t_s": k * req.step_s, "served": None, "feasible": False})
            served_prev = None
            continue

        _, name, rng, az, el = best
        fspl_down = rf.fspl_db(rng, c.downlink_mhz)
        fspl_up = rf.fspl_db(rng, c.uplink_mhz)
        nbw = rf.noise_bandwidth_hz(c.data_rate_kbps, c.fec_rate, c.rs_ratio,
                                    c.modulation_bits_per_symbol, c.bt_product)
        cn_req = rf.cn_required_db(c.ebno_required_db, c.data_rate_kbps, nbw, c.system_margin_db)
        cn_up = rf.k1_uplink_db(-90.0, c.uplink_mhz, sat_gt, nbw, 0.0)
        cn_down = rf.k2_downlink_db(sat_eirp, fspl_down, t.gt_dbk, nbw, 0.0)
        cn_total = rf.combine_cn(cn_up, cn_down, 20.0)
        modcod = rf.select_modcod(cn_total, sym)
        feasible = (cn_total - cn_req) >= 0.0
        feasible_steps += int(feasible)

        if name != served_prev and served_prev is not None:
            handovers.append({"t_s": k * req.step_s, "from": served_prev, "to": name})
        served_prev = name

        series.append({
            "t_s": k * req.step_s, "served": name,
            "elevation_deg": round(el, 2), "azimuth_deg": round(az, 2),
            "slant_range_km": round(rng, 1),
            "cn_total_db": round(cn_total, 2),
            "modcod": modcod[0] if modcod else None,
            "throughput_mbps": round(modcod[2], 1) if modcod else None,
            "feasible": feasible,
        })

    return {
        "site": s.name,
        "epoch_iso": req.epoch_iso,
        "duration_s": req.duration_s, "step_s": req.step_s,
        "n_satellites": len(sats),
        "handover_count": len(handovers),
        "availability_pct": round(100.0 * feasible_steps / max(1, n_steps), 2),
        "handovers": handovers,
        "series": series,
    }
