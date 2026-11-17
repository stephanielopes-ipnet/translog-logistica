import json

import pytest

from translog.knowledge import KnowledgeError, KnowledgeStore, read_documents


class TinyEmbeddings:
    """Embedding determinístico só para testar persistência/reindexação sem rede."""
    def __call__(self, input):
        words = ["prazo", "endereço", "contato", "tentativa"]
        return [[float(word in text.lower()) + 0.01 for word in words] for text in input]

    def embed_query(self, input):
        return self(input)

    @staticmethod
    def name():
        return "translog-test-only"


def document(id="faq-1", text="Consulte o prazo do pedido.", kind="faq", status="approved"):
    return {"id": id, "title": "Consulta de prazo", "text": text, "kind": kind,
            "source": "Equipe TransLog", "version": "1", "status": status,
            "approved_by": "Stephanie" if status == "approved" else ""}


def write(path, documents):
    path.write_text(json.dumps(documents, ensure_ascii=False), encoding="utf-8")
    return path


def test_only_reviewed_documents_are_accepted_for_real_index(tmp_path):
    source = write(tmp_path / "docs.json", [document(status="demo")])
    with pytest.raises(KnowledgeError, match="aprova|revisa|demo"):
        read_documents(source, demo=False)
    assert read_documents(source, demo=True)[0]["status"] == "demo"


def test_approved_content_requires_approver_and_unique_ids(tmp_path):
    first = document()
    first["approved_by"] = ""
    with pytest.raises(KnowledgeError):
        read_documents(write(tmp_path / "one.json", [first]), demo=False)
    with pytest.raises(KnowledgeError, match="duplicad"):
        read_documents(write(tmp_path / "two.json", [document(), document()]), demo=False)


def test_reindex_is_idempotent_and_removes_retired_documents(tmp_path):
    source = write(tmp_path / "docs.json", [document(), document("policy-1", "Atualize o endereço pelo contato.", "policy")])
    store = KnowledgeStore(tmp_path / "index", embedding_function=TinyEmbeddings())
    assert store.index(source)["count"] == 2
    assert store.index(source)["count"] == 2
    write(source, [document()])
    assert store.index(source)["count"] == 1
    result = store.search("prazo")
    assert result["status"] == "retrieved"
    assert len(result["passages"]) == 1
    assert result["passages"][0]["id"] == "faq-1"
    assert result["passages"][0]["source"] == "Equipe TransLog"


def test_invalid_reindex_preserves_previous_valid_revision(tmp_path):
    source = write(tmp_path / "docs.json", [document()])
    store = KnowledgeStore(tmp_path / "index", embedding_function=TinyEmbeddings())
    store.index(source)
    write(source, [document(status="draft")])
    with pytest.raises(KnowledgeError):
        store.index(source)
    assert store.search("prazo")["passages"][0]["id"] == "faq-1"


def test_demo_and_approved_indices_are_separate(tmp_path):
    source = write(tmp_path / "demo.json", [document(status="demo")])
    store = KnowledgeStore(tmp_path / "index", embedding_function=TinyEmbeddings())
    store.index(source, demo=True)
    assert store.search("prazo")["status"] == "unavailable"
    result = store.search("prazo", demo=True)
    assert result["source"]["is_simulated"] is True
    assert result["passages"][0]["status"] == "demo"


def test_empty_index_does_not_invent_policies_or_download_models(tmp_path):
    store = KnowledgeStore(tmp_path / "index")
    assert store.search("indenização")["status"] == "unavailable"


def test_withdrawing_last_policy_clears_active_knowledge(tmp_path):
    source = write(tmp_path / "docs.json", [document("last-policy", "Política retirada.", "policy")])
    store = KnowledgeStore(tmp_path / "index", embedding_function=TinyEmbeddings())
    store.index(source)
    write(source, [])
    assert store.index(source)["count"] == 0
    assert store.search("prazo")["status"] == "not_found"
    assert store.search("prazo")["passages"] == []


def test_malformed_demo_metadata_is_a_validation_error(tmp_path):
    item = document(status="demo")
    item["approved_by"] = None
    with pytest.raises(KnowledgeError):
        read_documents(write(tmp_path / "docs.json", [item]), demo=True)
