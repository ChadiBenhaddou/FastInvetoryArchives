"""Runs a script or a module with the packages of the portable mode ONLY, on top of the standard library.

  python -S pyrun.py <packages folder> script.py [args]
  python -S pyrun.py <packages folder> -m module [args]

-S keeps the PC's own Python packages (site-packages) out of sys.path: with them, a different
numpy or a torch installed on the PC would be imported instead of ours. The packages folder is
added with site.addsitedir so its .pth files still apply. Extra folders come from PYTHONPATH.
"""

import os
import runpy
import site
import sys


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    site.addsitedir(sys.argv[1])
    if sys.argv[2] == "-m":
        sys.argv = sys.argv[3:]
        runpy.run_module(sys.argv[0], run_name="__main__", alter_sys=True)
    else:
        sys.argv = sys.argv[2:]
        sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
        runpy.run_path(sys.argv[0], run_name="__main__")


if __name__ == "__main__":
    main()
