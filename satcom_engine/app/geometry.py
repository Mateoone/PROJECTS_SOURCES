"""Geometrie. Deux fournisseurs interchangeables derriere une meme sortie (az/el/range) :
  - GEO : formules closed-form, portees a l'identique de la feuille Master.
  - LEO : propagation dynamique (SGP4 depuis TLE, ou Kepler circulaire pour un Walker).
La chaine RF (rf.py) ne voit que (range, elevation) : elle est agnostique a l'orbite."""
from __future__ import annotations
import math
from datetime import datetime, timezone
from typing import Tuple
import numpy as np
from sgp4.api import Satrec, jday

R_GEO_KM = 42164.2
R_EARTH_KM = 6378.155
MU = 398600.4418            # km^3/s^2
OMEGA_EARTH = 7.2921159e-5  # rad/s
DEG = math.pi / 180.0


# ----------------------------------------------------------------------------
# GEO : porte de l'Excel (constantes 42164.2 / 6378.155 identiques)
# ----------------------------------------------------------------------------
def geo_look_angles(site_lat_deg: float, site_lon_deg: float,
                    sat_lon_deg: float) -> Tuple[float, float, float]:
    """Retourne (slant_range_km, azimuth_deg, elevation_deg) vers un GEO.
    Reproduit la geometrie de la feuille Master."""
    lat = site_lat_deg * DEG
    dlon = (site_lon_deg - sat_lon_deg) * DEG
    cos_gamma = math.cos(lat) * math.cos(dlon)
    gamma = math.acos(max(-1.0, min(1.0, cos_gamma)))
    sin_gamma = math.sin(gamma)

    d = math.sqrt(R_EARTH_KM**2 + R_GEO_KM**2 - 2 * R_EARTH_KM * R_GEO_KM * cos_gamma)
    el = math.atan2(cos_gamma - R_EARTH_KM / R_GEO_KM, sin_gamma) / DEG

    # Azimut (gestion quadrant N/S, est/ouest du sous-satellite)
    if abs(sin_gamma) < 1e-9:
        az = 0.0
    else:
        base = math.atan2(math.tan(dlon), math.sin(lat)) / DEG
        az = (180.0 + base) % 360.0
    return d, az % 360.0, el


# ----------------------------------------------------------------------------
# Outils ECI/ECEF/ENU pour le LEO
# ----------------------------------------------------------------------------
def gmst_rad(dt: datetime) -> float:
    """Greenwich Mean Sidereal Time (rad) - suffisant pour la planif de couverture."""
    jd = _julian_date(dt)
    T = (jd - 2451545.0) / 36525.0
    gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) \
        + 0.000387933 * T * T - T * T * T / 38710000.0
    return math.radians(gmst % 360.0)


def _julian_date(dt: datetime) -> float:
    dt = dt.astimezone(timezone.utc)
    jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                  dt.second + dt.microsecond * 1e-6)
    return jd + fr


def eci_to_ecef(r_eci: np.ndarray, dt: datetime) -> np.ndarray:
    g = gmst_rad(dt)
    c, s = math.cos(g), math.sin(g)
    R = np.array([[c, s, 0.0], [-s, c, 0.0], [0.0, 0.0, 1.0]])
    return R @ r_eci


def geodetic_to_ecef(lat_deg: float, lon_deg: float, alt_m: float) -> np.ndarray:
    # Sphere de rayon R_EARTH_KM (coherent avec le reste du modele)
    lat, lon = lat_deg * DEG, lon_deg * DEG
    r = R_EARTH_KM + alt_m / 1000.0
    return np.array([r * math.cos(lat) * math.cos(lon),
                     r * math.cos(lat) * math.sin(lon),
                     r * math.sin(lat)])


def ecef_look_angles(site_ecef: np.ndarray, sat_ecef: np.ndarray,
                     lat_deg: float, lon_deg: float) -> Tuple[float, float, float]:
    """(range_km, az_deg, el_deg) depuis un site vers un satellite, repere ENU."""
    lat, lon = lat_deg * DEG, lon_deg * DEG
    d = sat_ecef - site_ecef
    sl, cl = math.sin(lat), math.cos(lat)
    so, co = math.sin(lon), math.cos(lon)
    east = -so * d[0] + co * d[1]
    north = -sl * co * d[0] - sl * so * d[1] + cl * d[2]
    up = cl * co * d[0] + cl * so * d[1] + sl * d[2]
    rng = float(np.linalg.norm(d))
    el = math.degrees(math.asin(max(-1.0, min(1.0, up / rng))))
    az = math.degrees(math.atan2(east, north)) % 360.0
    return rng, az, el


# ----------------------------------------------------------------------------
# LEO via SGP4 (TLE reels)
# ----------------------------------------------------------------------------
def leo_state_from_tle(line1: str, line2: str, dt: datetime) -> np.ndarray:
    sat = Satrec.twoline2rv(line1, line2)
    jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                  dt.second + dt.microsecond * 1e-6)
    e, r, _v = sat.sgp4(jd, fr)
    if e != 0:
        raise ValueError(f"SGP4 error code {e}")
    return eci_to_ecef(np.array(r), dt)


# ----------------------------------------------------------------------------
# LEO via Kepler circulaire (constellation Walker sans TLE)
# ----------------------------------------------------------------------------
def walker_sat_eci(altitude_km: float, inclination_deg: float,
                   raan_deg: float, arg_lat0_deg: float, dt0: datetime,
                   dt: datetime) -> np.ndarray:
    a = R_EARTH_KM + altitude_km
    n = math.sqrt(MU / a**3)               # rad/s
    inc = inclination_deg * DEG
    raan = raan_deg * DEG
    u = arg_lat0_deg * DEG + n * (dt - dt0).total_seconds()
    # position dans le plan orbital
    xp, yp = a * math.cos(u), a * math.sin(u)
    cr, sr = math.cos(raan), math.sin(raan)
    ci, si = math.cos(inc), math.sin(inc)
    x = cr * xp - sr * ci * yp
    y = sr * xp + cr * ci * yp
    z = si * yp
    return np.array([x, y, z])


def walker_constellation(planes: int, sats_per_plane: int, phasing: int,
                         altitude_km: float, inclination_deg: float):
    """Genere (raan_deg, arg_lat0_deg) pour chaque satellite d'un Walker delta."""
    out = []
    for p in range(planes):
        raan = 360.0 * p / planes
        for s in range(sats_per_plane):
            u0 = 360.0 * s / sats_per_plane + 360.0 * phasing * p / (planes * sats_per_plane)
            out.append((raan, u0, altitude_km, inclination_deg))
    return out
