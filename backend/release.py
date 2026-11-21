"""Build the portable challenge release from verified workspace artifacts."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / "inputs" / "sprintd-basel-green-ai-data-main"


def include(with_bundle):
    for folder in ("frontend", "dist", "demo-data", "submission", "challenge-results", "templates", ".github", "bonus-evidence"):
        yield from (path for path in (ROOT / folder).rglob("*") if path.is_file())
    for p in sorted(INPUT.rglob("*")):
        if p.parent.name != "documents" and p.suffix in (".csv", ".jsonl", ".md"):
            yield p
    yield from ROOT.glob("*.py")
    for name in ("schema-v13.json", "factors.json", "challenge-policy.json", "README.md", "PITCH.md", "Dockerfile",
                 "launch-challenge.cmd", ".dockerignore", ".gitignore"):
        p = ROOT / name
        if p.is_file():
            yield p
    if with_bundle and (ROOT / "GreenOps-Basel.bundle").is_file():
        yield ROOT / "GreenOps-Basel.bundle"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "GreenOps-Basel.zip")
    parser.add_argument("--no-bundle", action="store_true", help="Exclude Git history when packaging uncommitted source changes.")
    args = parser.parse_args()
    if not (INPUT / "azure_costs.csv").is_file() or not (ROOT / "challenge-results" / "manifest.json").is_file():
        raise SystemExit("Official case files and regenerated reports are required for the full release.")
    destination = args.output
    temporary = destination.with_suffix(".zip.build")
    content = sorted(set(include(not args.no_bundle)))
    with ZipFile(temporary, "w", ZIP_DEFLATED, compresslevel=6) as archive:
        for path in content:
            archive.write(path, path.relative_to(ROOT).as_posix())
    with ZipFile(temporary) as archive:
        broken = archive.testzip()
        if broken:
            raise ValueError(f"Integrity check failed for {broken}")
    temporary.replace(destination)
    print(f"{destination.name}: verified {len(content)} files and {destination.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
