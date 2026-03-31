#!/usr/bin/env python3
"""
SmartCrop - Intelligent AI-powered batch image cropping for macOS
Uses Claude claude-opus-4-6 (Anthropic) to detect subjects and compute optimal crops.
"""

import base64
import json
import os
import threading
from io import BytesIO
from pathlib import Path

import anthropic
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk

try:
    from PIL import Image, ImageTk
except ImportError:
    raise SystemExit("Pillow is required. Run: pip install Pillow")

SUPPORTED_FORMATS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}
AI_MAX_PX = 1568  # max long-edge sent to Claude (keeps tokens manageable)
OUTPUT_QUALITY = 92


class SmartCropApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("SmartCrop – Intelligent Cropping")
        self.root.geometry("860x680")
        self.root.resizable(True, True)

        self._processing = False
        self._auto_ai = False   # "Apply AI to all remaining ambiguous" flag
        self._client: anthropic.Anthropic | None = None

        self.input_folder = tk.StringVar()
        self.output_folder = tk.StringVar()
        self.target_width = tk.IntVar(value=1200)
        self.target_height = tk.IntVar(value=800)
        self.conf_threshold = tk.DoubleVar(value=0.70)

        self._build_ui()
        self._init_client()

    # ─────────────────────────────────────────────── client ──

    def _init_client(self):
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        if key:
            self._client = anthropic.Anthropic(api_key=key)
        else:
            messagebox.showwarning(
                "API Key manquante",
                "La variable d'environnement ANTHROPIC_API_KEY n'est pas définie.\n"
                "Définissez-la puis relancez l'application.",
            )

    # ─────────────────────────────────────────────── UI ──────

    def _build_ui(self):
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("Accent.TButton", font=("Helvetica", 12, "bold"))

        main = ttk.Frame(self.root, padding=12)
        main.pack(fill=tk.BOTH, expand=True)

        ttk.Label(main, text="SmartCrop", font=("Helvetica", 22, "bold")).pack()
        ttk.Label(
            main,
            text="Recadrage intelligent par IA · traitement par lot",
            font=("Helvetica", 11),
            foreground="#555",
        ).pack(pady=(0, 12))

        # ── settings ──────────────────────────────────────────
        cfg = ttk.LabelFrame(main, text="Configuration", padding=10)
        cfg.pack(fill=tk.X, pady=(0, 8))

        def row(parent, label, var, width=50, is_browse=None):
            f = ttk.Frame(parent)
            f.pack(fill=tk.X, pady=3)
            ttk.Label(f, text=label, width=18, anchor="w").pack(side=tk.LEFT)
            ttk.Entry(f, textvariable=var, width=width).pack(side=tk.LEFT, padx=4)
            if is_browse:
                ttk.Button(f, text="…", width=3, command=is_browse).pack(side=tk.LEFT)

        row(cfg, "Dossier source :", self.input_folder, is_browse=self._browse_input)
        row(cfg, "Dossier sortie :", self.output_folder, is_browse=self._browse_output)

        size_row = ttk.Frame(cfg)
        size_row.pack(fill=tk.X, pady=3)
        ttk.Label(size_row, text="Taille cible :", width=18, anchor="w").pack(side=tk.LEFT)
        ttk.Label(size_row, text="Largeur :").pack(side=tk.LEFT)
        ttk.Entry(size_row, textvariable=self.target_width, width=7).pack(side=tk.LEFT, padx=4)
        ttk.Label(size_row, text="Hauteur :").pack(side=tk.LEFT)
        ttk.Entry(size_row, textvariable=self.target_height, width=7).pack(side=tk.LEFT, padx=4)
        ttk.Label(size_row, text="px").pack(side=tk.LEFT)

        thresh_row = ttk.Frame(cfg)
        thresh_row.pack(fill=tk.X, pady=3)
        ttk.Label(thresh_row, text="Seuil confiance :", width=18, anchor="w").pack(side=tk.LEFT)
        ttk.Scale(
            thresh_row,
            from_=0,
            to=1,
            variable=self.conf_threshold,
            orient=tk.HORIZONTAL,
            length=180,
        ).pack(side=tk.LEFT, padx=4)
        ttk.Label(thresh_row, textvariable=self._conf_label()).pack(side=tk.LEFT)

        # ── actions ───────────────────────────────────────────
        btn_row = ttk.Frame(main)
        btn_row.pack(fill=tk.X, pady=6)

        self._start_btn = ttk.Button(
            btn_row,
            text="▶  Démarrer",
            style="Accent.TButton",
            command=self._start,
        )
        self._start_btn.pack(side=tk.LEFT, padx=4)

        self._stop_btn = ttk.Button(
            btn_row, text="■  Arrêter", command=self._stop, state=tk.DISABLED
        )
        self._stop_btn.pack(side=tk.LEFT, padx=4)

        # ── progress ──────────────────────────────────────────
        prog = ttk.LabelFrame(main, text="Progression", padding=8)
        prog.pack(fill=tk.X, pady=(0, 8))

        self._progress_var = tk.DoubleVar()
        ttk.Progressbar(prog, variable=self._progress_var, maximum=100).pack(fill=tk.X)
        self._status = ttk.Label(prog, text="Prêt")
        self._status.pack()

        # ── log ───────────────────────────────────────────────
        log_frame = ttk.LabelFrame(main, text="Journal", padding=4)
        log_frame.pack(fill=tk.BOTH, expand=True)

        self._log = scrolledtext.ScrolledText(
            log_frame, height=14, state=tk.DISABLED, font=("Courier", 10)
        )
        self._log.pack(fill=tk.BOTH, expand=True)
        self._log.tag_config("ok", foreground="#1a7a1a")
        self._log.tag_config("err", foreground="#cc0000")
        self._log.tag_config("warn", foreground="#cc7700")
        self._log.tag_config("info", foreground="#003399")

    def _conf_label(self):
        """Returns a StringVar that tracks conf_threshold display."""
        lbl = tk.StringVar()

        def _update(*_):
            lbl.set(f"{self.conf_threshold.get():.0%}")

        self.conf_threshold.trace_add("write", _update)
        _update()
        return lbl

    # ─────────────────────────────────────────────── browse ──

    def _browse_input(self):
        folder = filedialog.askdirectory(title="Sélectionner le dossier source")
        if folder:
            self.input_folder.set(folder)
            if not self.output_folder.get():
                self.output_folder.set(os.path.join(folder, "smartcrop_output"))

    def _browse_output(self):
        folder = filedialog.askdirectory(title="Sélectionner le dossier de sortie")
        if folder:
            self.output_folder.set(folder)

    # ─────────────────────────────────────────────── log ─────

    def _write_log(self, msg: str, tag: str | None = None):
        self._log.config(state=tk.NORMAL)
        self._log.insert(tk.END, msg + "\n", tag or "")
        self._log.see(tk.END)
        self._log.config(state=tk.DISABLED)

    def _log_main(self, msg: str, tag: str | None = None):
        """Thread-safe log write."""
        self.root.after(0, self._write_log, msg, tag)

    def _set_status(self, text: str, progress: float | None = None):
        self._status.config(text=text)
        if progress is not None:
            self._progress_var.set(progress)

    # ─────────────────────────────────────────────── control ─

    def _start(self):
        if not self._client:
            self._init_client()
            if not self._client:
                return

        src = self.input_folder.get().strip()
        dst = self.output_folder.get().strip()
        if not src:
            messagebox.showerror("Erreur", "Veuillez sélectionner un dossier source.")
            return
        if not dst:
            messagebox.showerror("Erreur", "Veuillez sélectionner un dossier de sortie.")
            return
        try:
            w, h = self.target_width.get(), self.target_height.get()
            assert w > 0 and h > 0
        except Exception:
            messagebox.showerror("Erreur", "Largeur et hauteur doivent être des entiers positifs.")
            return

        images = []
        for ext in SUPPORTED_FORMATS:
            images.extend(Path(src).glob(f"*{ext}"))
            images.extend(Path(src).glob(f"*{ext.upper()}"))
        images = sorted(set(images))

        if not images:
            messagebox.showinfo("Aucune image", "Aucun fichier image trouvé dans le dossier source.")
            return

        Path(dst).mkdir(parents=True, exist_ok=True)

        self._processing = True
        self._auto_ai = False
        self._start_btn.config(state=tk.DISABLED)
        self._stop_btn.config(state=tk.NORMAL)

        self._log.config(state=tk.NORMAL)
        self._log.delete("1.0", tk.END)
        self._log.config(state=tk.DISABLED)

        self._write_log(f"Traitement de {len(images)} image(s)  →  {w}×{h} px", "info")
        self._write_log(f"Sortie : {dst}", "info")
        self._write_log("─" * 60)

        threading.Thread(
            target=self._batch, args=(images, dst, w, h), daemon=True
        ).start()

    def _stop(self):
        self._processing = False
        self._log_main("Arrêt demandé – en attente de la fin de l'image courante…", "warn")

    # ─────────────────────────────────────────────── batch ───

    def _batch(self, images: list, dst: str, w: int, h: int):
        ok = fail = skip = 0
        total = len(images)

        for i, path in enumerate(images):
            if not self._processing:
                break
            self.root.after(
                0,
                self._set_status,
                f"{i + 1}/{total}  {path.name}",
                i / total * 100,
            )
            self._log_main(f"◆ {path.name}")

            try:
                res = self._process_one(path, dst, w, h)
                if res == "ok":
                    ok += 1
                    self._log_main("  ✓ Enregistré", "ok")
                else:
                    skip += 1
                    self._log_main("  ↷ Ignoré par l'utilisateur", "warn")
            except Exception as exc:
                fail += 1
                self._log_main(f"  ✗ Erreur : {exc}", "err")

        self.root.after(0, self._finish, ok, fail, skip)

    def _finish(self, ok: int, fail: int, skip: int):
        self._processing = False
        self._start_btn.config(state=tk.NORMAL)
        self._stop_btn.config(state=tk.DISABLED)

        self._write_log("─" * 60)
        self._write_log(f"Terminé  ✓ {ok}  ✗ {fail}  ↷ {skip}", "ok")
        self._set_status(f"Terminé : {ok} enregistré(s), {fail} erreur(s), {skip} ignoré(s)", 100)

    # ─────────────────────────────────────────────── single image ─

    def _process_one(self, path: Path, dst: str, target_w: int, target_h: int) -> str:
        with Image.open(path) as img:
            img = _to_rgb(img)
            orig_w, orig_h = img.size

        analysis = self._analyze(path, target_w, target_h, orig_w, orig_h)

        conf = float(analysis.get("confidence", 1.0))
        desc = analysis.get("subject_description", "–")
        notes = analysis.get("notes", "")
        self._log_main(f"  Sujet : {desc}  (confiance {conf:.0%})")
        if notes:
            self._log_main(f"  Note : {notes}", "warn")

        threshold = self.conf_threshold.get()
        use_ai = True

        if conf < threshold and not self._auto_ai:
            choice = self._ask_user(path, analysis, orig_w, orig_h, target_w, target_h)
            if choice == "skip":
                return "skip"
            elif choice == "center":
                use_ai = False
            elif choice == "ai_all":
                self._auto_ai = True
                use_ai = True
            # "ai" → use_ai = True already

        if use_ai:
            box = _ai_crop_box(analysis, orig_w, orig_h, target_w, target_h)
        else:
            box = _center_crop_box(orig_w, orig_h, target_w / target_h)

        with Image.open(path) as img:
            img = _to_rgb(img)
            cropped = img.crop(box)
            resized = cropped.resize((target_w, target_h), Image.LANCZOS)
            out_name = path.stem + "_smartcrop.jpg"
            resized.save(
                Path(dst) / out_name, "JPEG", quality=OUTPUT_QUALITY, optimize=True
            )
        return "ok"

    # ─────────────────────────────────────────────── AI ──────

    def _encode_for_api(self, path: Path) -> str:
        with Image.open(path) as img:
            img = _to_rgb(img)
            if max(img.size) > AI_MAX_PX:
                img.thumbnail((AI_MAX_PX, AI_MAX_PX), Image.LANCZOS)
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=85)
            return base64.standard_b64encode(buf.getvalue()).decode()

    def _analyze(
        self, path: Path, tw: int, th: int, iw: int, ih: int
    ) -> dict:
        ratio = tw / th
        b64 = self._encode_for_api(path)

        prompt = f"""You are an expert image cropping assistant.
Analyze the image and identify the main subject for smart cropping.

Target output ratio: {tw}:{th}  (width/height = {ratio:.4f})
Original image size: {iw}×{ih} px

Return ONLY a JSON object with these exact keys:
{{
  "subject_box": {{
    "x1": <float 0-1, left edge of subject>,
    "y1": <float 0-1, top edge of subject>,
    "x2": <float 0-1, right edge of subject>,
    "y2": <float 0-1, bottom edge of subject>
  }},
  "optimal_crop": {{
    "x1": <float 0-1, left edge of best crop>,
    "y1": <float 0-1, top edge of best crop>,
    "x2": <float 0-1, right edge of best crop>,
    "y2": <float 0-1, bottom edge of best crop>
  }},
  "confidence": <float 0-1>,
  "subject_description": "<brief description>",
  "notes": "<concerns, ambiguities, or empty string>"
}}

Rules:
- optimal_crop MUST respect the aspect ratio {ratio:.4f} (width/height)
- Centre the crop on the most visually important region
- If multiple competing subjects or the choice is unclear, set confidence < 0.70
- Return ONLY the JSON, no markdown, no other text."""

        response = self._client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            thinking={"type": "adaptive"},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )

        text = next(b.text for b in response.content if b.type == "text")
        text = text.strip()
        # Strip possible markdown fences
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1].lstrip("json").strip() if len(parts) > 1 else text
        return json.loads(text)

    # ─────────────────────────────────────────────── alert dialog ─

    def _ask_user(
        self,
        path: Path,
        analysis: dict,
        iw: int,
        ih: int,
        tw: int,
        th: int,
    ) -> str:
        result = {"choice": None}
        event = threading.Event()

        def _show():
            dlg = tk.Toplevel(self.root)
            dlg.title("Choix de recadrage requis")
            dlg.geometry("720x520")
            dlg.resizable(False, False)
            dlg.grab_set()
            dlg.transient(self.root)

            pad = ttk.Frame(dlg, padding=14)
            pad.pack(fill=tk.BOTH, expand=True)

            ttk.Label(
                pad,
                text=f"⚠  Choix ambigu : {path.name}",
                font=("Helvetica", 13, "bold"),
            ).pack(pady=(0, 4))

            info = (
                f"Sujet détecté : {analysis.get('subject_description', '–')}\n"
                f"Confiance : {analysis.get('confidence', 0):.0%}\n"
            )
            if analysis.get("notes"):
                info += f"Note IA : {analysis['notes']}"
            ttk.Label(pad, text=info, wraplength=680, justify=tk.LEFT).pack(pady=4)

            # previews
            preview_frame = ttk.Frame(pad)
            preview_frame.pack(fill=tk.BOTH, expand=True, pady=8)

            PREV = (300, 210)
            try:
                with Image.open(path) as img:
                    img = _to_rgb(img)

                    ai_box = _ai_crop_box(analysis, iw, ih, tw, th)
                    ctr_box = _center_crop_box(iw, ih, tw / th)

                    ai_prev = ImageTk.PhotoImage(img.crop(ai_box).resize(PREV, Image.LANCZOS))
                    ctr_prev = ImageTk.PhotoImage(
                        img.crop(ctr_box).resize(PREV, Image.LANCZOS)
                    )

                for photo, label_text in [
                    (ai_prev, "Recadrage IA"),
                    (ctr_prev, "Recadrage centré"),
                ]:
                    col = ttk.Frame(preview_frame)
                    col.pack(side=tk.LEFT, expand=True)
                    ttk.Label(col, text=label_text, font=("Helvetica", 11, "bold")).pack()
                    lbl = ttk.Label(col, image=photo)
                    lbl.image = photo  # keep reference
                    lbl.pack()

            except Exception as exc:
                ttk.Label(preview_frame, text=f"Aperçu indisponible : {exc}").pack()

            # buttons
            btns = ttk.Frame(pad)
            btns.pack(pady=8)

            def choose(c):
                result["choice"] = c
                event.set()
                dlg.destroy()

            ttk.Button(btns, text="Utiliser le recadrage IA", command=lambda: choose("ai")).pack(
                side=tk.LEFT, padx=5
            )
            ttk.Button(
                btns, text="Recadrage centré", command=lambda: choose("center")
            ).pack(side=tk.LEFT, padx=5)
            ttk.Button(btns, text="Ignorer cette image", command=lambda: choose("skip")).pack(
                side=tk.LEFT, padx=5
            )
            ttk.Button(
                btns,
                text="IA pour toutes les suivantes",
                command=lambda: choose("ai_all"),
            ).pack(side=tk.LEFT, padx=5)

            def _on_close():
                result["choice"] = "skip"
                event.set()
                dlg.destroy()

            dlg.protocol("WM_DELETE_WINDOW", _on_close)

        self.root.after(0, _show)
        event.wait()
        return result["choice"]


# ─────────────────────────────────────────────────────────── helpers ──

def _to_rgb(img: Image.Image) -> Image.Image:
    if img.mode not in ("RGB",):
        return img.convert("RGB")
    return img.copy()


def _ai_crop_box(
    analysis: dict, iw: int, ih: int, tw: int, th: int
) -> tuple[int, int, int, int]:
    """Convert fractional optimal_crop to pixel box, enforcing exact aspect ratio."""
    crop = analysis.get("optimal_crop", {"x1": 0, "y1": 0, "x2": 1, "y2": 1})
    target_ratio = tw / th

    x1 = int(crop["x1"] * iw)
    y1 = int(crop["y1"] * ih)
    x2 = int(crop["x2"] * iw)
    y2 = int(crop["y2"] * ih)

    x1, y1, x2, y2 = max(0, x1), max(0, y1), min(iw, x2), min(ih, y2)

    cw, ch = x2 - x1, y2 - y1
    if cw <= 0 or ch <= 0:
        return _center_crop_box(iw, ih, target_ratio)

    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    current_ratio = cw / ch

    if current_ratio > target_ratio:
        new_w, new_h = cw, cw / target_ratio
    else:
        new_w, new_h = ch * target_ratio, ch

    x1 = int(cx - new_w / 2)
    y1 = int(cy - new_h / 2)
    x2 = int(cx + new_w / 2)
    y2 = int(cy + new_h / 2)

    # Clamp while preserving size
    if x1 < 0:
        x2 -= x1
        x1 = 0
    if y1 < 0:
        y2 -= y1
        y1 = 0
    if x2 > iw:
        x1 -= x2 - iw
        x2 = iw
    if y2 > ih:
        y1 -= y2 - ih
        y2 = ih

    return (max(0, x1), max(0, y1), min(iw, x2), min(ih, y2))


def _center_crop_box(iw: int, ih: int, target_ratio: float) -> tuple[int, int, int, int]:
    img_ratio = iw / ih
    if img_ratio > target_ratio:
        new_w = int(ih * target_ratio)
        new_h = ih
    else:
        new_w = iw
        new_h = int(iw / target_ratio)
    x1 = (iw - new_w) // 2
    y1 = (ih - new_h) // 2
    return (x1, y1, x1 + new_w, y1 + new_h)


# ─────────────────────────────────────────────────────────── entry ───

def main():
    root = tk.Tk()
    app = SmartCropApp(root)  # noqa: F841

    # Centre window
    root.update_idletasks()
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    w, h = root.winfo_width(), root.winfo_height()
    root.geometry(f"+{(sw - w) // 2}+{(sh - h) // 2}")

    root.mainloop()


if __name__ == "__main__":
    main()
