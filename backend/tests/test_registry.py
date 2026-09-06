"""
Unit test murni buat model registry -- dasarnya MODELS/MODE_TO_BACKEND_MODEL_ID
di 01-config.js & 07-providers.js (lihat komentar registry.py), BUKAN dikarang.
"""
from app.providers.registry import DEFAULT_MODEL_ID, MODEL_REGISTRY, resolve_chain

KNOWN_PROVIDERS = {"gemini", "groq"}


def test_all_known_model_ids_resolve_to_non_empty_chain():
    for model_id in MODEL_REGISTRY:
        chain = resolve_chain(model_id)
        assert len(chain) >= 1, f"{model_id} harus punya minimal 1 langkah fallback"


def test_unknown_model_id_falls_back_to_default():
    chain = resolve_chain("model-ngasal-yang-gak-ada")
    assert chain == MODEL_REGISTRY[DEFAULT_MODEL_ID]


def test_every_step_uses_known_provider_and_positive_max_tokens():
    for model_id, chain in MODEL_REGISTRY.items():
        for step in chain:
            assert step.provider in KNOWN_PROVIDERS, f"{model_id}: provider '{step.provider}' gak dikenal"
            assert step.max_tokens > 0, f"{model_id}: max_tokens harus positif"
            assert step.model, f"{model_id}: nama model gak boleh kosong"


def test_vaeltrix_max_has_multi_step_fallback():
    # vaeltrix-max sengaja dirancang berlapis (pro-preview -> pro -> flash) --
    # kalau ini nyusut jadi 1 langkah lagi, berarti fallback-nya ke-delete
    # gak sengaja pas ada perubahan lain.
    assert len(MODEL_REGISTRY["vaeltrix-max"]) >= 2
