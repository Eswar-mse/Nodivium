"""Check that the release wheel contains the command and browser assets."""

from pathlib import Path
import sys
from zipfile import ZipFile


def main() -> None:
    wheel_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("dist")
    wheels = list(wheel_dir.glob("nodivium-*.whl"))
    if len(wheels) != 1:
        raise SystemExit(f"Expected one Nodivium wheel in {wheel_dir}/, found {len(wheels)}")
    with ZipFile(wheels[0]) as archive:
        members = set(archive.namelist())
        required = {
            "nodivium/__init__.py",
            "nodivium/cli.py",
            "nodivium/web.py",
            "nodivium/static/index.html",
            "nodivium/static/styles.css",
            "nodivium/static/app.js",
            "nodivium/static/assets/nodivium-mark.png",
            "nodivium/static/vendor/molstar.js",
            "nodivium/static/vendor/molstar.css",
        }
        missing = required - members
        if missing:
            raise SystemExit(f"Wheel is missing: {', '.join(sorted(missing))}")
        entry_points = next(name for name in members if name.endswith(".dist-info/entry_points.txt"))
        if "nodivium = nodivium.cli:main" not in archive.read(entry_points).decode():
            raise SystemExit("Wheel has no Nodivium CLI entry point")
        if "Nodivium" not in archive.read("nodivium/static/index.html").decode():
            raise SystemExit("Wheel contains stale web branding")
    print(f"Wheel contents and CLI entry point verified: {wheels[0].name}")


if __name__ == "__main__":
    main()
