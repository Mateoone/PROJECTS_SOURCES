"""Coeur RF mutualise. Porte de la feuille Master, structure par sections
auditables. Une fois (range, elevation) fournis par geometry.py, ce module est
agnostique a l'orbite : meme code pour Syracuse (GEO) et Amazon Leo (LEO)."""
from __future__ import annotations
import math

C_LIGHT = 299_700_000.0    # valeur de l'Excel (pour reproduire le FSPL au centieme de dB)
K_BOLTZMANN_DB = -228.6    # dBW/K/Hz

# Table DVB-S2X (sous-ensemble representatif) : seuil Es/N0 requis (dB) -> efficacite (b/sym)
# Sert au balayage ACM : on prend le MODCOD le plus efficace dont le seuil ferme avec marge.
MODCOD_TABLE = [
    ("QPSK 1/4",   -2.35, 0.49),
    ("QPSK 1/2",    1.00, 0.99),
    ("QPSK 3/5",    2.23, 1.19),
    ("QPSK 3/4",    4.03, 1.49),
    ("QPSK 9/10",   6.42, 1.79),
    ("8PSK 3/5",    5.50, 1.78),
    ("8PSK 3/4",    7.91, 2.23),
    ("8PSK 9/10",  10.98, 2.68),
    ("16APSK 3/4", 10.21, 2.97),
    ("16APSK 8/9", 12.73, 3.52),
    ("32APSK 3/4", 12.73, 3.70),
    ("32APSK 9/10",16.05, 4.45),
]


def fspl_db(range_km: float, freq_mhz: float) -> float:
    """Perte en espace libre. Reproduit 10*log10((4*pi*d*f/c)^2) de l'Excel."""
    d = range_km * 1000.0
    f = freq_mhz * 1e6
    return 10.0 * math.log10((4.0 * math.pi * d * f / C_LIGHT) ** 2)


def antenna_gain_dbi(diameter_m: float, freq_mhz: float, efficiency: float = 0.6) -> float:
    lam = C_LIGHT / (freq_mhz * 1e6)
    return 10.0 * math.log10(efficiency * (math.pi * diameter_m / lam) ** 2)


def noise_bandwidth_hz(data_rate_kbps: float, fec_rate: float, rs_ratio: float,
                       bits_per_symbol: float, bt_product: float) -> float:
    """Largeur de bruit = debit symbole * produit BT demod. Reproduit la NoiseBW
    de la Master (Rs * 1.05), distincte du facteur d'espacement porteuse (~1.1)."""
    symbol_rate = (data_rate_kbps * 1000.0 * rs_ratio) / (fec_rate * bits_per_symbol)
    return symbol_rate * bt_product


def cn_required_db(ebno_required_db: float, data_rate_kbps: float,
                   noise_bw_hz: float, system_margin_db: float) -> float:
    """C/N requis = Eb/No requis + 10log10(Rb) - 10log10(Bn) + marge systeme.
    Reproduit le 6.4154 dB de l'exemple Yahsat."""
    rb_db = 10.0 * math.log10(data_rate_kbps * 1000.0)
    bn_db = 10.0 * math.log10(noise_bw_hz)
    return ebno_required_db + rb_db - bn_db + system_margin_db


def k1_uplink_db(sfd_dbw_m2: float, freq_up_mhz: float, gt_sat_dbk: float,
                 noise_bw_hz: float, input_backoff_db: float) -> float:
    """C/N montant pleine porteuse (methode SFD de la Master).
    K1 = SFD - Gain(1 m^2) + G/T_sat - k - Nb - IBO."""
    g_1m2 = 10.0 * math.log10(4.0 * math.pi * (freq_up_mhz * 1e6 / C_LIGHT) ** 2)
    nb_db = 10.0 * math.log10(noise_bw_hz)
    return sfd_dbw_m2 - g_1m2 + gt_sat_dbk - K_BOLTZMANN_DB - nb_db - input_backoff_db


def k2_downlink_db(eirp_sat_dbw: float, fspl_down_db: float, gt_es_dbk: float,
                   noise_bw_hz: float, output_backoff_db: float,
                   extra_loss_db: float = 0.0) -> float:
    """C/N descendant pleine porteuse (methode EIRP de la Master).
    K2 = EIRP_sat - Ls - FSPL - OBO + G/T_es - k - Nb."""
    nb_db = 10.0 * math.log10(noise_bw_hz)
    return (eirp_sat_dbw - extra_loss_db - fspl_down_db - output_backoff_db
            + gt_es_dbk - K_BOLTZMANN_DB - nb_db)


def combine_cn(cn_up_db: float, cn_down_db: float, cim_db: float) -> float:
    """C/N total = 1 / (1/up + 1/down + 1/IM), en lineaire."""
    up, down, im = (10 ** (x / 10.0) for x in (cn_up_db, cn_down_db, cim_db))
    total = 1.0 / (1.0 / up + 1.0 / down + 1.0 / im)
    return 10.0 * math.log10(total)


def select_modcod(cn_db: float, symbol_rate_hz: float, margin_db: float = 0.0):
    """Balaye la table ACM : meilleur MODCOD dont le seuil + marge <= C/N disponible.
    Retourne (nom, efficacite, debit_mbps) ou None si rien ne ferme."""
    best = None
    for name, threshold, eff in MODCOD_TABLE:
        if cn_db >= threshold + margin_db and (best is None or eff > best[1]):
            best = (name, eff, threshold)
    if best is None:
        return None
    name, eff, _ = best
    throughput_mbps = symbol_rate_hz * eff / 1e6
    return name, eff, throughput_mbps
