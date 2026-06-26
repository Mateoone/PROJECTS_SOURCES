"""Contrat d'I/O normalise du moteur. Ces schemas sont la frontiere stable
entre la physique (ce service) et le rendu (Unity / Unreal / HTML / Ventuz).
Les clients ne consomment que des LinkResult ; ils ne contiennent aucune physique."""
from __future__ import annotations
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field


class Band(str, Enum):
    Ka = "Ka"
    Ku = "Ku"
    X = "X"


class Site(BaseModel):
    """Station sol (fixe, vehicule, USV...). alt en metres."""
    name: str = "site"
    lat_deg: float
    lon_deg: float
    alt_m: float = 0.0
    elevation_mask_deg: float = Field(5.0, description="Masque d'elevation local (urbain dense => plus eleve)")


class Terminal(BaseModel):
    """Terminal sol. On peut fournir G/T et EIRP directement (cas Excel),
    ou les laisser calculer depuis diametre + efficacite (helper rf.antenna_gain_dbi)."""
    name: str = "terminal"
    gt_dbk: float = Field(..., description="G/T terminal en dB/K")
    eirp_dbw: Optional[float] = Field(None, description="EIRP terminal sature en dBW (option)")
    diameter_m: Optional[float] = None
    efficiency: float = 0.6
    tx_loss_db: float = 1.0
    pointing_loss_db: float = 0.0


class Carrier(BaseModel):
    """Porteuse. data_rate en kbps. rolloff = facteur d'espacement DVB."""
    band: Band = Band.Ka
    uplink_mhz: float = 30000.0
    downlink_mhz: float = 20000.0
    data_rate_kbps: float = 2048.0
    fec_rate: float = 0.5
    rs_ratio: float = 1.0896
    modulation_bits_per_symbol: float = 2.0   # QPSK=2
    rolloff: float = 1.1
    bt_product: float = 1.05
    ebno_required_db: float = 1.5
    system_margin_db: float = 5.5
    auto_modcod: bool = Field(True, description="Si vrai, balaye la table DVB-S2X (ACM) pour le debit max qui ferme")


class SatelliteGEO(BaseModel):
    kind: str = "GEO"
    name: str = "GEO-sat"
    longitude_deg: float
    eirp_dbw: float = Field(..., description="EIRP descendant (peak ou au site) en dBW")
    gt_dbk: float = Field(..., description="G/T satellite en dB/K")
    sfd_dbw_m2: float = -90.0
    transponder_bw_mhz: float = 72.0
    input_backoff_db: float = 7.0
    output_backoff_db: float = 4.0
    cim_db: float = 20.0


class TLE(BaseModel):
    name: str = "LEO-sat"
    line1: str
    line2: str


class WalkerShell(BaseModel):
    """Generateur de constellation LEO sans TLE (modele circulaire).
    Defaut proche d'Amazon Leo : coquilles 590/610/630 km."""
    name: str = "LEO-shell"
    altitude_km: float = 610.0
    inclination_deg: float = 51.9
    planes: int = 28
    sats_per_plane: int = 28
    phasing: int = 1
    eirp_dbw: float = 38.0
    gt_dbk: float = 5.0


class Geometry(BaseModel):
    slant_range_km: float
    azimuth_deg: float
    elevation_deg: float
    visible: bool
    range_rate_kms: float = 0.0  # >0 = s'eloigne (utile pour Doppler)


class LinkResult(BaseModel):
    """Sortie atomique par (site, satellite, instant)."""
    site: str
    satellite: str
    epoch_iso: Optional[str] = None
    geometry: Geometry
    fspl_up_db: float
    fspl_down_db: float
    cn_required_db: float
    cn_uplink_db: Optional[float] = None
    cn_downlink_db: Optional[float] = None
    modcod: Optional[str] = None
    spectral_efficiency: Optional[float] = None
    throughput_mbps: Optional[float] = None
    link_margin_db: Optional[float] = None
    feasible: bool = False


# ---- Requetes API ----

class LinkRequest(BaseModel):
    site: Site
    terminal: Terminal
    carrier: Carrier = Carrier()
    satellite_geo: SatelliteGEO
    rain_margin_db: float = 0.5  # override simple ; mettre auto_rain plus tard (ITU-R P.618)


class ScenarioRequest(BaseModel):
    site: Site
    terminal: Terminal
    carrier: Carrier = Carrier()
    tles: List[TLE] = []
    walker: Optional[WalkerShell] = None
    epoch_iso: str = Field(..., description="Debut de fenetre, ISO 8601 UTC")
    duration_s: int = 3600
    step_s: int = 10
    handover_policy: str = Field("max_elevation", description="max_elevation | max_cn")
