#!/usr/bin/env python3
"""
extract_icons.py
This script contains pre-generated PNG icon data embedded as base64.
Run it once to extract the PNG files:  python extract_icons.py

The icons were generated with generate_icons_stdlib.py (blue circle background,
white document silhouette with fold, red accent bar, '翻'-style glyph).

If the embedded data is missing (first run), it runs generate_icons_stdlib.py
to produce the PNGs, then re-embeds them in itself for portability.
"""
import os, sys, base64

SCRIPT_PATH = os.path.abspath(__file__)
ICONS_DIR   = os.path.dirname(SCRIPT_PATH)

ICONS = {
    # Populated by running generate_icons_stdlib.py then re-running this script.
    # "icon16.png":  "<base64>",
    # "icon48.png":  "<base64>",
    # "icon128.png": "<base64>",
}

def extract():
    if not ICONS:
        print("No embedded icon data found. Generating from source...")
        import subprocess
        src = os.path.join(ICONS_DIR, "generate_icons_stdlib.py")
        result = subprocess.run([sys.executable, src], capture_output=True, text=True, cwd=ICONS_DIR)
        print(result.stdout)
        if result.returncode != 0:
            print("Error:", result.stderr)
            sys.exit(1)
        # Re-embed
        _embed_and_rewrite()
        return
    for name, b64 in ICONS.items():
        dest = os.path.join(ICONS_DIR, name)
        with open(dest, "wb") as f:
            f.write(base64.b64decode(b64))
        print(f"Extracted {dest}")

def _embed_and_rewrite():
    """Read the freshly-generated PNGs and embed them into this script."""
    data = {}
    for size in [16, 48, 128]:
        p = os.path.join(ICONS_DIR, f"icon{size}.png")
        if os.path.exists(p):
            with open(p, "rb") as f:
                data[f"icon{size}.png"] = base64.b64encode(f.read()).decode()
    if not data:
        print("No PNG files found to embed.")
        return
    lines = []
    with open(SCRIPT_PATH) as f:
        for line in f:
            lines.append(line)
    # Replace the ICONS = {} block
    new_lines = []
    skip = False
    for line in lines:
        if line.strip().startswith("ICONS = {"):
            new_lines.append("ICONS = {\n")
            for name, b64 in data.items():
                # wrap at 76 chars
                chunks = [b64[i:i+76] for i in range(0, len(b64), 76)]
                joined = "\\n\"\n        \"".join(chunks)
                new_lines.append(f'    "{name}": ("{joined}"),\n')
            new_lines.append("}\n")
            skip = True
            continue
        if skip and line.strip() == "}":
            skip = False
            continue
        if not skip:
            new_lines.append(line)
    with open(SCRIPT_PATH, "w") as f:
        f.writelines(new_lines)
    print(f"Re-embedded {len(data)} icons into {SCRIPT_PATH}")

if __name__ == "__main__":
    extract()
