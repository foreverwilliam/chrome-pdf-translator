#!/usr/bin/env python3
"""
run_me_first.py
Generates the PNG icons by running the stdlib script.
Double-click this in Windows Explorer or run: python run_me_first.py
"""
import subprocess, sys, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
result = subprocess.run([sys.executable, "generate_icons_stdlib.py"], capture_output=True, text=True)
print(result.stdout)
if result.returncode != 0:
    print("Error:", result.stderr)
    input("Press Enter to exit...")
else:
    print("All done! PNG files are in this folder.")
    input("Press Enter to exit...")
