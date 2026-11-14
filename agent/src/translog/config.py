"""Configuração local: caminhos relativos à raiz, nunca ao terminal atual."""

from dataclasses import dataclass
import json
import os
from pathlib import Path

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[2]


def resolve_path(value: str) -> Path:
    path = Path(value).expanduser()
    return path if path.is_absolute() else ROOT / path


@dataclass(frozen=True)
class Settings:
    backend: str
    orders_path: Path
    origin: str
    encoding: str
    delimiter: str
    column_map: dict[str, str]
    knowledge_dir: Path
    model_cache: Path
    allow_demo: bool
    model: str

    @classmethod
    def from_env(cls):
        load_dotenv(ROOT / ".env", override=False)
        backend = os.getenv("TRANSLOG_ORDER_BACKEND", "csv")
        origin = os.getenv("TRANSLOG_DATA_ORIGIN", "sample")
        if backend not in {"csv", "sql_pending"}:
            raise ValueError("TRANSLOG_ORDER_BACKEND deve ser csv ou sql_pending.")
        if origin not in {"sample", "silver", "gold"}:
            raise ValueError("TRANSLOG_DATA_ORIGIN deve ser sample, silver ou gold.")
        delimiter = os.getenv("TRANSLOG_CSV_DELIMITER", ",")
        if len(delimiter) != 1:
            raise ValueError("O separador CSV deve conter um caractere.")
        mapping_path = os.getenv("TRANSLOG_COLUMN_MAP", "").strip()
        mapping = json.loads(resolve_path(mapping_path).read_text(encoding="utf-8-sig")) if mapping_path else {}
        if not isinstance(mapping, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in mapping.items()):
            raise ValueError("O mapa de colunas precisa ser um objeto JSON de textos.")
        return cls(
            backend=backend,
            orders_path=resolve_path(os.getenv("TRANSLOG_ORDERS_CSV", "data/samples/orders.csv")),
            origin=origin,
            encoding=os.getenv("TRANSLOG_CSV_ENCODING", "utf-8-sig"),
            delimiter=delimiter,
            column_map=mapping,
            knowledge_dir=resolve_path(os.getenv("TRANSLOG_KNOWLEDGE_DIR", ".state/chroma")),
            model_cache=resolve_path(os.getenv("TRANSLOG_MODEL_CACHE", ".cache/models")),
            allow_demo=os.getenv("TRANSLOG_ALLOW_DEMO_KNOWLEDGE", "false").lower() == "true",
            model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
        )
