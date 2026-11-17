"""Núcleo do MVP TransLog, separado da entrada do ADK."""

import os
from pathlib import Path
import sys

# Python embarcado no Windows pode carregar a DLL do Python da base em vez da
# venv. Registrar somente o runtime instalado nesta venv, sem alterar o PATH.
_DLL_HANDLES = []
if os.name == "nt" and hasattr(os, "add_dll_directory"):
    for _directory in (Path(sys.prefix), Path(sys.prefix) / "Scripts"):
        if (_directory / "msvcp140.dll").exists():
            _DLL_HANDLES.append(os.add_dll_directory(str(_directory)))
