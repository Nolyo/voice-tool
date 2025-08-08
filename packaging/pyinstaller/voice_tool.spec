# -*- mode: python ; coding: utf-8 -*-

import os
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules


block_cipher = None


def _compute_project_root() -> str:
    """Tente de déterminer de manière robuste la racine du projet.

    Ordre de détection:
      1) Dossier parent de ce .spec (si __file__ disponible)
      2) Chemin passé en CLI à PyInstaller (sys.argv avec un .spec)
      3) Dossiers à partir du cwd en remontant
    La racine est le premier dossier contenant 'main.py'.
    """
    candidates: list[Path] = []

    # 1) Basé sur __file__ si disponible
    try:
        spec_dir = Path(__file__).resolve().parent
        candidates.extend([spec_dir, spec_dir.parent, spec_dir.parent.parent])
    except NameError:
        spec_dir = None

    # 2) Basé sur sys.argv (pyinstaller path/to/spec)
    try:
        for arg in getattr(sys, 'argv', []):
            if isinstance(arg, str) and arg.lower().endswith('.spec'):
                p = Path(arg)
                if not p.is_absolute():
                    p = (Path.cwd() / p).resolve()
                if p.exists():
                    ad = p.parent
                    candidates.extend([ad, ad.parent, ad.parent.parent])
                    break
    except Exception:
        pass

    # 3) Basé sur cwd et ses parents
    try:
        candidates.extend([Path.cwd(), Path.cwd().parent, Path.cwd().parent.parent])
    except Exception:
        pass

    # Filtrer doublons tout en gardant l'ordre
    seen = set()
    unique_candidates: list[Path] = []
    for c in candidates:
        try:
            rc = c.resolve()
        except Exception:
            continue
        if rc not in seen:
            seen.add(rc)
            unique_candidates.append(rc)

    # Chercher le premier contenant main.py
    for base in unique_candidates:
        try:
            if (base / 'main.py').exists():
                return str(base)
        except Exception:
            pass

    # Fallback: cwd
    return str(Path.cwd().resolve())


# Paramétrage principal
PROJECT_ROOT = _compute_project_root()
MAIN_SCRIPT = str(Path(PROJECT_ROOT) / 'main.py')
ICON_PATH = str(Path(PROJECT_ROOT) / 'voice_tool_icon.ico')

# Choix du mode de sortie: exe unique (onefile) ou dossier (onefolder)
ONEFILE = True


# Datas (inclure les WAV d'assets)
datas = []
datas += collect_data_files('voice_tool', includes=['assets/sounds/*.wav'])

# Imports cachés éventuels
hiddenimports = []
hiddenimports += collect_submodules('google')
hiddenimports += collect_submodules('google.cloud')
hiddenimports += collect_submodules('pynput')


a = Analysis(
    [MAIN_SCRIPT],
    pathex=[PROJECT_ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

if ONEFILE:
    # Exécutable unique (onefile)
    exe = EXE(
        pyz,
        a.scripts,
        a.binaries,
        a.zipfiles,
        a.datas,
        [],
        name='Voice Tool',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=False,
        disable_windowed_traceback=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon=ICON_PATH,
    )
else:
    # Dossier (onefolder)
    exe = EXE(
        pyz,
        a.scripts,
        [],
        exclude_binaries=True,
        name='Voice Tool',
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=False,
        disable_windowed_traceback=False,
        target_arch=None,
        codesign_identity=None,
        entitlements_file=None,
        icon=ICON_PATH,
    )

    coll = COLLECT(
        exe,
        a.binaries,
        a.zipfiles,
        a.datas,
        strip=False,
        upx=True,
        upx_exclude=[],
        name='voice-tool'
    )


