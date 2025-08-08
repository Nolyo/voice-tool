# -*- mode: python ; coding: utf-8 -*-

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules


block_cipher = None


# Références de chemins (ce fichier est dans packaging/pyinstaller/)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir, os.pardir))
MAIN_SCRIPT = os.path.join(PROJECT_ROOT, 'main.py')
ICON_PATH = os.path.join(PROJECT_ROOT, 'voice_tool_icon.ico')


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


