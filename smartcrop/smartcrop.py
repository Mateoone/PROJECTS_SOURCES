#!/usr/bin/env python3
"""
SmartCrop – Recadrage intelligent par IA  (macOS)
UI : CustomTkinter  |  IA : Claude claude-opus-4-6 (Anthropic)
"""

import base64
import json
import os
import subprocess
import threading
from io import BytesIO
from pathlib import Path

import anthropic
import customtkinter as ctk
from PIL import Image, ImageDraw, ImageTk

# ─── app-wide appearance ────────────────────────────────────────────────────
ctk.set_appearance_mode("System")          # suit le thème macOS
ctk.set_default_color_theme("blue")

SUPPORTED_FORMATS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}
AI_MAX_PX = 1568
OUTPUT_QUALITY = 92
THUMB_W, THUMB_H = 160, 110   # thumbnail size in the results grid


# ════════════════════════════════════════════════════════════════════════════
#  Main window
# ════════════════════════════════════════════════════════════════════════════
class SmartCropApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("SmartCrop")
        self.geometry("1080x740")
        self.minsize(860, 620)

        self._processing = False
        self._auto_ai = False
        self._client: anthropic.Anthropic | None = None

        # ── tkinter vars ──────────────────────────────────────────────────
        self.v_src   = ctk.StringVar()
        self.v_dst   = ctk.StringVar()
        self.v_w     = ctk.StringVar(value="1200")
        self.v_h     = ctk.StringVar(value="800")
        self.v_conf  = ctk.DoubleVar(value=0.70)
        self.v_model = ctk.StringVar(value="claude-haiku-4-5")

        self._build_layout()
        self._init_client()

    # ──────────────────────────────────────────────────────── client ──────

    def _init_client(self):
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        if key:
            self._client = anthropic.Anthropic(api_key=key)
        else:
            self._show_error(
                "ANTHROPIC_API_KEY manquante",
                "Définissez la variable d'environnement ANTHROPIC_API_KEY\n"
                "puis relancez l'application.",
            )

    # ──────────────────────────────────────────────────────── layout ──────

    def _build_layout(self):
        self.grid_columnconfigure(0, weight=0)   # left sidebar
        self.grid_columnconfigure(1, weight=1)   # right results panel
        self.grid_rowconfigure(0, weight=0)      # header
        self.grid_rowconfigure(1, weight=1)      # main content
        self.grid_rowconfigure(2, weight=0)      # bottom bar

        self._build_header()
        self._build_sidebar()
        self._build_results()
        self._build_bottom()

    # ── header ───────────────────────────────────────────────────────────

    def _build_header(self):
        hdr = ctk.CTkFrame(self, corner_radius=0, height=64,
                           fg_color=("gray85", "gray20"))
        hdr.grid(row=0, column=0, columnspan=2, sticky="ew")
        hdr.grid_propagate(False)
        hdr.grid_columnconfigure(1, weight=1)

        # coloured accent stripe on left
        stripe = ctk.CTkFrame(hdr, width=6, corner_radius=0,
                              fg_color=("#2563EB", "#3B82F6"))
        stripe.grid(row=0, column=0, sticky="ns")

        ctk.CTkLabel(
            hdr, text="  ✂  SmartCrop",
            font=ctk.CTkFont(size=22, weight="bold"),
        ).grid(row=0, column=1, padx=12, sticky="w")

        ctk.CTkLabel(
            hdr,
            text="Recadrage intelligent par IA · traitement par lot",
            font=ctk.CTkFont(size=12),
            text_color=("gray50", "gray60"),
        ).grid(row=0, column=2, padx=4, sticky="w")

        # appearance toggle
        self._mode_btn = ctk.CTkButton(
            hdr, text="☀ / ☾", width=80, height=30,
            fg_color="transparent", border_width=1,
            command=self._toggle_mode,
        )
        self._mode_btn.grid(row=0, column=3, padx=12, sticky="e")

    # ── sidebar ──────────────────────────────────────────────────────────

    def _build_sidebar(self):
        sb = ctk.CTkFrame(self, width=320, corner_radius=0,
                          fg_color=("gray93", "gray15"))
        sb.grid(row=1, column=0, sticky="nsw", padx=0, pady=0)
        sb.grid_propagate(False)
        sb.grid_rowconfigure(99, weight=1)   # spacer at bottom

        pad = {"padx": 18, "pady": 6}

        # ── section: dossiers ─────────────────────────────────────────
        self._section_label(sb, "DOSSIERS").grid(row=0, column=0, padx=18, sticky="w", pady=(18, 2))

        ctk.CTkLabel(sb, text="Source", anchor="w",
                     font=ctk.CTkFont(size=12)).grid(row=1, column=0, padx=18, sticky="w")
        src_row = ctk.CTkFrame(sb, fg_color="transparent")
        src_row.grid(row=2, column=0, padx=14, pady=(0, 4), sticky="ew")
        src_row.grid_columnconfigure(0, weight=1)
        ctk.CTkEntry(src_row, textvariable=self.v_src, placeholder_text="Choisir…",
                     height=32).grid(row=0, column=0, sticky="ew")
        ctk.CTkButton(src_row, text="…", width=32, height=32,
                      command=self._browse_src).grid(row=0, column=1, padx=(4, 0))

        ctk.CTkLabel(sb, text="Sortie", anchor="w",
                     font=ctk.CTkFont(size=12)).grid(row=3, column=0, padx=18, sticky="w")
        dst_row = ctk.CTkFrame(sb, fg_color="transparent")
        dst_row.grid(row=4, column=0, padx=14, pady=(0, 4), sticky="ew")
        dst_row.grid_columnconfigure(0, weight=1)
        ctk.CTkEntry(dst_row, textvariable=self.v_dst, placeholder_text="Choisir…",
                     height=32).grid(row=0, column=0, sticky="ew")
        ctk.CTkButton(dst_row, text="…", width=32, height=32,
                      command=self._browse_dst).grid(row=0, column=1, padx=(4, 0))

        self._sep(sb).grid(row=5, column=0, padx=18, pady=10, sticky="ew")

        # ── section: taille cible ─────────────────────────────────────
        self._section_label(sb, "TAILLE CIBLE").grid(row=6, column=0, padx=18, sticky="w", pady=(0, 2))

        size_frame = ctk.CTkFrame(sb, fg_color="transparent")
        size_frame.grid(row=7, column=0, padx=14, pady=(0, 4), sticky="ew")
        size_frame.grid_columnconfigure((0, 1, 2, 3), weight=1)

        ctk.CTkLabel(size_frame, text="L", font=ctk.CTkFont(size=12)).grid(row=0, column=0, padx=(0, 2))
        ctk.CTkEntry(size_frame, textvariable=self.v_w, width=70, height=32,
                     justify="center").grid(row=0, column=1, padx=2)
        ctk.CTkLabel(size_frame, text="H", font=ctk.CTkFont(size=12)).grid(row=0, column=2, padx=(8, 2))
        ctk.CTkEntry(size_frame, textvariable=self.v_h, width=70, height=32,
                     justify="center").grid(row=0, column=3, padx=2)

        # ratio preview
        self._ratio_label = ctk.CTkLabel(sb, text="Ratio : 3:2",
                                          font=ctk.CTkFont(size=11),
                                          text_color=("gray50", "gray55"))
        self._ratio_label.grid(row=8, column=0, padx=18, sticky="w")
        self.v_w.trace_add("write", self._update_ratio)
        self.v_h.trace_add("write", self._update_ratio)

        self._sep(sb).grid(row=9, column=0, padx=18, pady=10, sticky="ew")

        # ── section: confiance ────────────────────────────────────────
        self._section_label(sb, "SEUIL DE CONFIANCE").grid(row=10, column=0, padx=18, sticky="w", pady=(0, 2))

        self._conf_lbl = ctk.CTkLabel(sb, text="70 %", font=ctk.CTkFont(size=13, weight="bold"))
        self._conf_lbl.grid(row=11, column=0, padx=18, sticky="w")

        self._slider = ctk.CTkSlider(sb, from_=0, to=1, variable=self.v_conf,
                                      command=self._on_conf_change)
        self._slider.grid(row=12, column=0, padx=14, pady=(2, 2), sticky="ew")

        ctk.CTkLabel(sb, text="En dessous, l'IA vous demande de choisir.",
                     font=ctk.CTkFont(size=11),
                     text_color=("gray50", "gray55"),
                     wraplength=270).grid(row=13, column=0, padx=18, sticky="w")

        self._sep(sb).grid(row=14, column=0, padx=18, pady=10, sticky="ew")

        # ── section: modèle ───────────────────────────────────────────
        self._section_label(sb, "MODÈLE IA").grid(row=15, column=0, padx=18, sticky="w", pady=(0, 4))

        MODELS = {
            "claude-haiku-4-5":  "⚡ Haiku  (rapide)",
            "claude-sonnet-4-6": "⚖ Sonnet (équilibré)",
            "claude-opus-4-6":   "🎯 Opus  (précis)",
        }
        for i, (model_id, label) in enumerate(MODELS.items()):
            ctk.CTkRadioButton(
                sb, text=label, variable=self.v_model, value=model_id,
                font=ctk.CTkFont(size=12),
            ).grid(row=16 + i, column=0, padx=22, pady=2, sticky="w")

        self._sep(sb).grid(row=19, column=0, padx=18, pady=10, sticky="ew")

        # ── section: actions ──────────────────────────────────────────
        self._start_btn = ctk.CTkButton(
            sb, text="▶  Démarrer", height=40,
            font=ctk.CTkFont(size=14, weight="bold"),
            command=self._start,
        )
        self._start_btn.grid(row=20, column=0, padx=14, pady=(0, 6), sticky="ew")

        self._stop_btn = ctk.CTkButton(
            sb, text="■  Arrêter", height=36,
            fg_color=("gray70", "gray35"), hover_color=("gray60", "gray45"),
            state="disabled", command=self._stop,
        )
        self._stop_btn.grid(row=21, column=0, padx=14, pady=(0, 6), sticky="ew")

        self._open_btn = ctk.CTkButton(
            sb, text="📁  Ouvrir le dossier de sortie", height=32,
            fg_color="transparent", border_width=1,
            command=self._open_output,
        )
        self._open_btn.grid(row=22, column=0, padx=14, pady=(0, 4), sticky="ew")

    # ── results panel ────────────────────────────────────────────────────

    def _build_results(self):
        right = ctk.CTkFrame(self, fg_color=("gray97", "gray12"), corner_radius=0)
        right.grid(row=1, column=1, sticky="nsew")
        right.grid_rowconfigure(1, weight=1)
        right.grid_columnconfigure(0, weight=1)

        # stats row
        stats = ctk.CTkFrame(right, fg_color="transparent", height=36)
        stats.grid(row=0, column=0, sticky="ew", padx=16, pady=(12, 0))
        stats.grid_propagate(False)

        self._stat_total  = self._stat_chip(stats, "0", "images",  col=0)
        self._stat_ok     = self._stat_chip(stats, "0", "✓ ok",    col=1, color="#16a34a")
        self._stat_warn   = self._stat_chip(stats, "0", "⚠ alertes", col=2, color="#b45309")
        self._stat_err    = self._stat_chip(stats, "0", "✗ erreurs", col=3, color="#dc2626")

        # scrollable thumbnail grid
        self._thumb_grid = ctk.CTkScrollableFrame(
            right, fg_color="transparent", label_text=""
        )
        self._thumb_grid.grid(row=1, column=0, sticky="nsew", padx=8, pady=8)
        self._thumb_col = 0
        self._thumb_row = 0
        self._thumb_max_cols = 5

        # log
        self._log_box = ctk.CTkTextbox(right, height=140, font=ctk.CTkFont(family="Courier", size=11),
                                        wrap="word", state="disabled",
                                        fg_color=("gray90", "gray18"))
        self._log_box.grid(row=2, column=0, sticky="ew", padx=8, pady=(0, 8))
        # colour tags via underlying tk widget
        self._log_box._textbox.tag_config("ok",   foreground="#16a34a")
        self._log_box._textbox.tag_config("err",  foreground="#dc2626")
        self._log_box._textbox.tag_config("warn", foreground="#b45309")
        self._log_box._textbox.tag_config("info", foreground="#2563EB")

    def _stat_chip(self, parent, number, label, col, color=None):
        """Returns a (number_label, ) tuple for a stat chip."""
        f = ctk.CTkFrame(parent, corner_radius=8, fg_color=("gray85", "gray22"))
        f.grid(row=0, column=col, padx=6, sticky="w")
        kw = {"text_color": color} if color else {}
        n = ctk.CTkLabel(f, text=number, font=ctk.CTkFont(size=18, weight="bold"), **kw)
        n.grid(row=0, column=0, padx=(10, 4), pady=4)
        ctk.CTkLabel(f, text=label, font=ctk.CTkFont(size=11),
                     text_color=("gray50", "gray55")).grid(row=0, column=1, padx=(0, 10), pady=4)
        return n

    # ── bottom bar ───────────────────────────────────────────────────────

    def _build_bottom(self):
        bar = ctk.CTkFrame(self, height=52, corner_radius=0,
                           fg_color=("gray85", "gray20"))
        bar.grid(row=2, column=0, columnspan=2, sticky="ew")
        bar.grid_propagate(False)
        bar.grid_columnconfigure(1, weight=1)

        self._progress = ctk.CTkProgressBar(bar, height=10, corner_radius=5)
        self._progress.set(0)
        self._progress.grid(row=0, column=0, columnspan=3, padx=16, pady=(10, 2), sticky="ew")

        self._status_lbl = ctk.CTkLabel(bar, text="Prêt",
                                         font=ctk.CTkFont(size=11),
                                         text_color=("gray50", "gray55"))
        self._status_lbl.grid(row=1, column=0, padx=16, sticky="w")

    # ──────────────────────────────────────────────────────── helpers ─────

    def _section_label(self, parent, text):
        return ctk.CTkLabel(parent, text=text,
                            font=ctk.CTkFont(size=10, weight="bold"),
                            text_color=("gray50", "gray55"))

    def _sep(self, parent):
        return ctk.CTkFrame(parent, height=1, fg_color=("gray80", "gray25"))

    def _toggle_mode(self):
        mode = "Dark" if ctk.get_appearance_mode() == "Light" else "Light"
        ctk.set_appearance_mode(mode)

    def _update_ratio(self, *_):
        try:
            w, h = int(self.v_w.get()), int(self.v_h.get())
            from math import gcd
            d = gcd(w, h)
            self._ratio_label.configure(text=f"Ratio : {w//d}:{h//d}")
        except Exception:
            self._ratio_label.configure(text="Ratio : –")

    def _on_conf_change(self, val):
        self._conf_lbl.configure(text=f"{float(val):.0%}")

    def _browse_src(self):
        from tkinter import filedialog
        folder = filedialog.askdirectory(title="Dossier source")
        if folder:
            self.v_src.set(folder)
            if not self.v_dst.get():
                self.v_dst.set(os.path.join(folder, "smartcrop_output"))

    def _browse_dst(self):
        from tkinter import filedialog
        folder = filedialog.askdirectory(title="Dossier de sortie")
        if folder:
            self.v_dst.set(folder)

    def _open_output(self):
        dst = self.v_dst.get()
        if dst and Path(dst).exists():
            subprocess.Popen(["open", dst])

    def _show_error(self, title, msg):
        from tkinter import messagebox
        messagebox.showerror(title, msg)

    # ──────────────────────────────────────────────────────── log ─────────

    def _log(self, msg: str, tag: str | None = None):
        self._log_box.configure(state="normal")
        if tag:
            self._log_box._textbox.insert("end", msg + "\n", tag)
        else:
            self._log_box._textbox.insert("end", msg + "\n")
        self._log_box._textbox.see("end")
        self._log_box.configure(state="disabled")

    def _log_t(self, msg: str, tag: str | None = None):
        self.after(0, self._log, msg, tag)

    def _set_status(self, text: str, progress: float | None = None):
        self._status_lbl.configure(text=text)
        if progress is not None:
            self._progress.set(progress)

    # ──────────────────────────────────────────────────────── stats ───────

    def _reset_stats(self, total):
        self._n_total = total; self._n_ok = 0; self._n_warn = 0; self._n_err = 0
        self._refresh_stats()

    def _refresh_stats(self):
        self._stat_total.configure(text=str(self._n_total))
        self._stat_ok.configure(text=str(self._n_ok))
        self._stat_warn.configure(text=str(self._n_warn))
        self._stat_err.configure(text=str(self._n_err))

    # ──────────────────────────────────────────────────────── thumbnails ──

    def _add_thumbnail(self, img_path: Path, crop_box: tuple, status: str):
        """Add a result thumbnail to the grid (called from main thread)."""
        size = (THUMB_W, THUMB_H)
        try:
            with Image.open(img_path) as img:
                img = _to_rgb(img)
                cropped = img.crop(crop_box).resize(size, Image.LANCZOS)
        except Exception:
            cropped = Image.new("RGB", size, color=(200, 200, 200))

        # overlay coloured border
        color = {"ok": "#16a34a", "warn": "#b45309", "err": "#dc2626"}.get(status, "#888")
        draw = ImageDraw.Draw(cropped)
        draw.rectangle([0, 0, size[0] - 1, size[1] - 1], outline=color, width=3)

        photo = ctk.CTkImage(light_image=cropped, dark_image=cropped, size=size)

        cell = ctk.CTkFrame(self._thumb_grid, fg_color="transparent")
        cell.grid(row=self._thumb_row, column=self._thumb_col, padx=4, pady=4)

        lbl_img = ctk.CTkLabel(cell, image=photo, text="")
        lbl_img.image = photo
        lbl_img.pack()

        name = img_path.stem
        name_display = name[:18] + "…" if len(name) > 19 else name
        ctk.CTkLabel(cell, text=name_display, font=ctk.CTkFont(size=10),
                     text_color=("gray50", "gray55")).pack()

        self._thumb_col += 1
        if self._thumb_col >= self._thumb_max_cols:
            self._thumb_col = 0
            self._thumb_row += 1

    def _clear_thumbnails(self):
        for w in self._thumb_grid.winfo_children():
            w.destroy()
        self._thumb_col = 0
        self._thumb_row = 0

    # ──────────────────────────────────────────────────────── control ─────

    def _start(self):
        if not self._client:
            self._init_client()
            if not self._client:
                return

        src = self.v_src.get().strip()
        dst = self.v_dst.get().strip()
        if not src:
            self._show_error("Erreur", "Sélectionner un dossier source.")
            return
        if not dst:
            self._show_error("Erreur", "Sélectionner un dossier de sortie.")
            return
        try:
            w, h = int(self.v_w.get()), int(self.v_h.get())
            assert w > 0 and h > 0
        except Exception:
            self._show_error("Erreur", "Largeur et hauteur doivent être des entiers > 0.")
            return

        images = sorted({
            p for ext in SUPPORTED_FORMATS
            for p in list(Path(src).glob(f"*{ext}")) + list(Path(src).glob(f"*{ext.upper()}"))
        })
        if not images:
            from tkinter import messagebox
            messagebox.showinfo("Aucune image", "Aucun fichier image trouvé.")
            return

        Path(dst).mkdir(parents=True, exist_ok=True)

        self._processing = True
        self._auto_ai   = False
        self._start_btn.configure(state="disabled")
        self._stop_btn.configure(state="normal")
        self._clear_thumbnails()
        self._reset_stats(len(images))
        self._log_box.configure(state="normal")
        self._log_box.delete("1.0", "end")
        self._log_box.configure(state="disabled")
        self._log(f"Traitement de {len(images)} image(s)  →  {w}×{h} px", "info")
        self._log(f"Sortie : {dst}", "info")
        self._log("─" * 60)

        threading.Thread(target=self._batch, args=(images, dst, w, h), daemon=True).start()

    def _stop(self):
        self._processing = False
        self._log_t("Arrêt demandé…", "warn")

    # ──────────────────────────────────────────────────────── batch ───────

    def _batch(self, images, dst, w, h):
        for i, path in enumerate(images):
            if not self._processing:
                break
            self.after(0, self._set_status, f"{i+1}/{len(images)}  –  {path.name}",
                       i / len(images))
            self._log_t(f"◆ {path.name}")

            try:
                crop_box, status = self._process_one(path, dst, w, h)
                if status == "ok":
                    self._n_ok += 1
                    self._log_t("  ✓ Enregistré", "ok")
                else:
                    self._n_warn += 1
                    self._log_t("  ↷ Ignoré", "warn")
                self.after(0, self._add_thumbnail, path, crop_box, status)
            except Exception as exc:
                self._n_err += 1
                self._log_t(f"  ✗ {exc}", "err")

            self.after(0, self._refresh_stats)

        self.after(0, self._finish)

    def _finish(self):
        self._processing = False
        self._start_btn.configure(state="normal")
        self._stop_btn.configure(state="disabled")
        self._log("─" * 60)
        self._log(
            f"Terminé  ✓ {self._n_ok}  ↷ {self._n_warn}  ✗ {self._n_err}", "ok"
        )
        self._set_status(
            f"Terminé : {self._n_ok} ok, {self._n_warn} ignorés, {self._n_err} erreurs", 1.0
        )

    # ──────────────────────────────────────────────────────── single ──────

    def _process_one(self, path: Path, dst: str, tw: int, th: int):
        with Image.open(path) as img:
            img = _to_rgb(img)

        # ── Remove black bars first ────────────────────────────────────
        img, bars_removed = _remove_black_bars(img)
        if bars_removed:
            self._log_t("  ✂ Barres noires supprimées", "info")
        iw, ih = img.size

        # ── AI analysis (with fallback to centre crop on any failure) ──
        analysis = None
        try:
            analysis = self._analyze(path, tw, th, iw, ih)
        except Exception as exc:
            self._log_t(f"  ⚠ Analyse IA échouée, recadrage centré : {exc}", "warn")

        use_ai = analysis is not None
        if use_ai:
            conf  = float(analysis.get("confidence", 1.0))
            desc  = analysis.get("subject_description", "–")
            notes = analysis.get("notes", "")
            self._log_t(f"  Sujet : {desc}  ({conf:.0%})")
            if notes:
                self._log_t(f"  Note : {notes}", "warn")

            threshold = self.v_conf.get()
            if conf < threshold and not self._auto_ai:
                choice = self._ask_user(path, analysis, iw, ih, tw, th)
                if choice == "skip":
                    box = _center_crop_box(iw, ih, tw / th)
                    return box, "warn"
                elif choice == "center":
                    use_ai = False
                elif choice == "ai_all":
                    self._auto_ai = True

        box = _ai_crop_box(analysis, iw, ih, tw, th) if use_ai \
              else _center_crop_box(iw, ih, tw / th)

        # Sanity check — box must be strictly inside image
        x1, y1, x2, y2 = box
        assert 0 <= x1 < x2 <= iw and 0 <= y1 < y2 <= ih, \
            f"Box hors image : {box} pour {iw}×{ih}"

        out = img.crop(box).resize((tw, th), Image.LANCZOS)
        out.save(Path(dst) / (path.stem + "_smartcrop.jpg"),
                 "JPEG", quality=OUTPUT_QUALITY, optimize=True)

        return box, "ok"

    # ──────────────────────────────────────────────────────── AI ──────────

    def _encode_for_api(self, path: Path) -> str:
        with Image.open(path) as img:
            img = _to_rgb(img)
            if max(img.size) > AI_MAX_PX:
                img.thumbnail((AI_MAX_PX, AI_MAX_PX), Image.LANCZOS)
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=85)
        return base64.standard_b64encode(buf.getvalue()).decode()

    def _analyze(self, path: Path, tw: int, th: int, iw: int, ih: int) -> dict:
        ratio = tw / th
        prompt = f"""You are an expert image cropping assistant.
Analyse the image and identify the main subject for smart cropping.

Target ratio: {tw}:{th}  (width/height = {ratio:.4f})
Original size: {iw}×{ih} px

Return ONLY a JSON object with these exact keys:
{{
  "subject_box":   {{"x1":<0-1>,"y1":<0-1>,"x2":<0-1>,"y2":<0-1>}},
  "optimal_crop":  {{"x1":<0-1>,"y1":<0-1>,"x2":<0-1>,"y2":<0-1>}},
  "confidence": <0.0-1.0>,
  "subject_description": "<brief>",
  "notes": "<concerns or empty>"
}}
Rules:
- optimal_crop must respect aspect ratio {ratio:.4f}
- Centre on the most visually important region
- Set confidence < 0.70 when the crop choice is not obvious
- Return ONLY the JSON, no markdown."""

        model = self.v_model.get()
        # adaptive thinking only on Opus/Sonnet 4.6 — Haiku doesn't support it
        thinking = {"type": "adaptive"} if model != "claude-haiku-4-5" else None

        create_kwargs = dict(
            model=model,
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image",
                     "source": {"type": "base64", "media_type": "image/jpeg",
                                "data": self._encode_for_api(path)}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )
        if thinking:
            create_kwargs["thinking"] = thinking

        response = self._client.messages.create(**create_kwargs)
        text = next((b.text for b in response.content if b.type == "text"), "").strip()

        # Strip markdown fences if present
        if "```" in text:
            import re
            m = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
            text = m.group(1).strip() if m else text

        # Extract first {...} block in case Claude added surrounding text
        import re as _re
        m = _re.search(r"\{[\s\S]+\}", text)
        if not m:
            raise ValueError(f"Aucun JSON trouvé dans la réponse : {text[:200]}")
        data = json.loads(m.group(0))

        # Validate & clamp fractional coordinates to [0, 1]
        for key in ("subject_box", "optimal_crop"):
            box = data.get(key, {})
            for k in ("x1", "y1", "x2", "y2"):
                box[k] = max(0.0, min(1.0, float(box.get(k, 0.5))))
            # Ensure x1 < x2 and y1 < y2
            if box["x1"] >= box["x2"]:
                box["x1"], box["x2"] = 0.1, 0.9
            if box["y1"] >= box["y2"]:
                box["y1"], box["y2"] = 0.1, 0.9
            data[key] = box

        data["confidence"] = max(0.0, min(1.0, float(data.get("confidence", 0.5))))
        return data

    # ──────────────────────────────────────────────────────── alert ───────

    def _ask_user(self, path, analysis, iw, ih, tw, th) -> str:
        result = {"choice": None}
        event  = threading.Event()

        def _show():
            dlg = ctk.CTkToplevel(self)
            dlg.title("Choix de recadrage")
            dlg.geometry("740x530")
            dlg.resizable(False, False)
            dlg.grab_set()
            dlg.transient(self)

            # header
            ctk.CTkLabel(
                dlg, text=f"⚠  Crop ambigu : {path.name}",
                font=ctk.CTkFont(size=15, weight="bold"),
            ).pack(pady=(16, 4))

            info = (
                f"Sujet : {analysis.get('subject_description', '–')}   "
                f"Confiance : {analysis.get('confidence', 0):.0%}"
            )
            if analysis.get("notes"):
                info += f"\n{analysis['notes']}"
            ctk.CTkLabel(dlg, text=info, wraplength=680,
                         font=ctk.CTkFont(size=12),
                         text_color=("gray45", "gray60")).pack(pady=(0, 8))

            # previews
            prev_frame = ctk.CTkFrame(dlg, fg_color="transparent")
            prev_frame.pack(expand=True, fill="both", padx=16)

            PREV = (320, 220)
            try:
                with Image.open(path) as img:
                    img = _to_rgb(img)
                    ai_box  = _ai_crop_box(analysis, iw, ih, tw, th)
                    ctr_box = _center_crop_box(iw, ih, tw / th)
                    ai_pil  = img.crop(ai_box).resize(PREV, Image.LANCZOS)
                    ctr_pil = img.crop(ctr_box).resize(PREV, Image.LANCZOS)

                for pil_img, label_txt in [(ai_pil, "Recadrage IA"), (ctr_pil, "Recadrage centré")]:
                    col = ctk.CTkFrame(prev_frame, fg_color="transparent")
                    col.pack(side="left", expand=True, padx=12)
                    ctk.CTkLabel(col, text=label_txt,
                                 font=ctk.CTkFont(size=12, weight="bold")).pack(pady=(0, 4))
                    photo = ctk.CTkImage(light_image=pil_img, dark_image=pil_img, size=PREV)
                    lbl = ctk.CTkLabel(col, image=photo, text="", corner_radius=8)
                    lbl.image = photo
                    lbl.pack()
            except Exception as exc:
                ctk.CTkLabel(prev_frame, text=f"Aperçu indisponible : {exc}").pack()

            # buttons
            btn_frame = ctk.CTkFrame(dlg, fg_color="transparent")
            btn_frame.pack(pady=14)

            def choose(c):
                result["choice"] = c
                event.set()
                dlg.destroy()

            ctk.CTkButton(btn_frame, text="✓ Recadrage IA", width=160,
                          command=lambda: choose("ai")).grid(row=0, column=0, padx=6)
            ctk.CTkButton(btn_frame, text="⊞ Centré", width=130,
                          fg_color=("gray65", "gray35"),
                          command=lambda: choose("center")).grid(row=0, column=1, padx=6)
            ctk.CTkButton(btn_frame, text="↷ Ignorer", width=110,
                          fg_color=("gray65", "gray35"),
                          command=lambda: choose("skip")).grid(row=0, column=2, padx=6)
            ctk.CTkButton(btn_frame, text="IA pour toutes →", width=160,
                          fg_color=("#16a34a", "#15803d"),
                          command=lambda: choose("ai_all")).grid(row=0, column=3, padx=6)

            def _on_close():
                result["choice"] = "skip"
                event.set()
                dlg.destroy()
            dlg.protocol("WM_DELETE_WINDOW", _on_close)

        self.after(0, _show)
        event.wait()
        return result["choice"]


# ════════════════════════════════════════════════════════════════════════════
#  Pure image helpers
# ════════════════════════════════════════════════════════════════════════════

def _to_rgb(img: Image.Image) -> Image.Image:
    return img.convert("RGB") if img.mode != "RGB" else img.copy()


def _remove_black_bars(img: Image.Image, threshold: int = 18, min_strip: float = 0.01) -> tuple:
    """
    Detect and remove black bars (letterbox / pillarbox) from the image edges.
    Returns (cropped_img, was_cropped: bool).

    threshold   : pixels with all RGB channels ≤ this value are considered black
    min_strip   : minimum fraction of the image dimension to qualify as a bar
    """
    import numpy as np

    arr = np.array(img)          # H × W × 3
    h, w = arr.shape[:2]

    # A row/column is "black" if its mean max-channel value is ≤ threshold
    row_max  = arr.max(axis=(1, 2))   # shape (H,)
    col_max  = arr.max(axis=(0, 2))   # shape (W,)

    min_row_strip = max(1, int(h * min_strip))
    min_col_strip = max(1, int(w * min_strip))

    def first_nonblack(values, minimum_strip):
        for i, v in enumerate(values):
            if v > threshold:
                return i if i >= minimum_strip else 0
        return 0

    def last_nonblack(values, minimum_strip):
        n = len(values)
        for i, v in enumerate(reversed(values)):
            if v > threshold:
                idx = n - 1 - i
                return idx if (n - 1 - idx) >= minimum_strip else n - 1
        return n - 1

    top    = first_nonblack(row_max, min_row_strip)
    bottom = last_nonblack(row_max, min_row_strip)
    left   = first_nonblack(col_max, min_col_strip)
    right  = last_nonblack(col_max, min_col_strip)

    if top == 0 and left == 0 and bottom == h - 1 and right == w - 1:
        return img, False   # nothing to crop

    cropped = img.crop((left, top, right + 1, bottom + 1))
    return cropped, True


def _ai_crop_box(analysis, iw, ih, tw, th):
    """
    Compute a crop box centred on the AI-detected subject.
    The box is always entirely within the image (no letterbox possible).
    Strategy: take the largest rectangle at target ratio that fits inside
    the image, then slide it to be as centred on the subject as possible.
    """
    crop = analysis.get("optimal_crop", {"x1": 0, "y1": 0, "x2": 1, "y2": 1})
    ratio = tw / th  # target width / height

    # Subject centre in pixels
    cx = ((crop["x1"] + crop["x2"]) / 2) * iw
    cy = ((crop["y1"] + crop["y2"]) / 2) * ih

    # Largest crop that fits in the image at target ratio
    if iw / ih > ratio:
        # image wider than target → height is the limiting dimension
        nh = ih
        nw = ih * ratio
    else:
        # image taller than target → width is the limiting dimension
        nw = iw
        nh = iw / ratio

    nw, nh = int(nw), int(nh)

    # Centre crop on subject, then clamp (shift only — never resize)
    x1 = int(cx - nw / 2)
    y1 = int(cy - nh / 2)

    # Shift so the box stays inside the image
    x1 = max(0, min(x1, iw - nw))
    y1 = max(0, min(y1, ih - nh))

    return (x1, y1, x1 + nw, y1 + nh)


def _center_crop_box(iw, ih, ratio):
    if iw / ih > ratio:
        nw, nh = int(ih * ratio), ih
    else:
        nw, nh = iw, int(iw / ratio)
    return ((iw - nw) // 2, (ih - nh) // 2,
            (iw - nw) // 2 + nw, (ih - nh) // 2 + nh)


# ════════════════════════════════════════════════════════════════════════════
#  Entry point
# ════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    app = SmartCropApp()
    # centre on screen
    app.update_idletasks()
    sw, sh = app.winfo_screenwidth(), app.winfo_screenheight()
    w, h   = app.winfo_width(), app.winfo_height()
    app.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")
    app.mainloop()
