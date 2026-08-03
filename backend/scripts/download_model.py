"""Download the ONNX cross-encoder used for neural reranking.

Run once after installing dependencies:

    python scripts/download_model.py

Without this the reranker is unavailable and search falls back to
BM25 + PageRank ordering only.
"""
import os
import sys

from huggingface_hub import hf_hub_download

REPO = "Xenova/ms-marco-MiniLM-L-6-v2"
DEFAULT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models", "reranker"
)


def main() -> int:
    target = os.environ.get("RERANKER_MODEL_DIR", DEFAULT_DIR)
    os.makedirs(os.path.join(target, "onnx"), exist_ok=True)

    print(f"Downloading {REPO} to {target} ...")
    hf_hub_download(REPO, "onnx/model.onnx", local_dir=target)
    hf_hub_download(REPO, "tokenizer.json", local_dir=target)

    model_path = os.path.join(target, "onnx", "model.onnx")
    if not os.path.exists(model_path):
        print(f"ERROR: expected model at {model_path} but it is missing.", file=sys.stderr)
        return 1

    print("Reranker model ready.")
    print(f"Set RERANKER_MODEL_DIR={target} if you run from a different directory.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
