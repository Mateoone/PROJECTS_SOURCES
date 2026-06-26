"""Test de non-regression : la geometrie et la chaine RF portees doivent
reproduire l'exemple Yahsat de la feuille Master (GetSAT LBG). C'est le filet
de securite avant d'empiler la dynamique LEO.

Lancer :  pytest -q
"""
from app import geometry as g, rf


def test_geo_geometry_matches_excel():
    d, az, el = g.geo_look_angles(24.45, 54.3, 52.5)
    assert abs(d - 36457.05) < 1.0
    assert abs(az - 184.34) < 0.05
    assert abs(el - 61.33) < 0.05


def test_fspl_matches_excel():
    d, _, _ = g.geo_look_angles(24.45, 54.3, 52.5)
    assert abs(rf.fspl_db(d, 30000) - 213.2285) < 0.01
    assert abs(rf.fspl_db(d, 20000) - 209.7067) < 0.01


def test_noise_bw_and_cn_required_match_excel():
    nbw = rf.noise_bandwidth_hz(2048, 0.5, 1.0896, 2.0, 1.05)
    assert abs(nbw / 1000.0 - 2343.0758) < 0.01
    cnr = rf.cn_required_db(1.5, 2048, nbw, 5.5)
    assert abs(cnr - 6.4154) < 0.001


def test_modcod_selection_monotonic():
    # un meilleur C/N ne doit jamais donner un debit inferieur
    sym = 2_231_500.0
    low = rf.select_modcod(3.0, sym)
    high = rf.select_modcod(12.0, sym)
    assert high[2] >= low[2]
