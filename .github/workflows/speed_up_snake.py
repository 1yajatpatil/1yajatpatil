import glob
import re

FACTOR = 0.4  # lower = faster; scales every animation duration uniformly


def scale(match: "re.Match[str]") -> str:
    return f"{max(1, int(int(match.group(1)) * FACTOR))}ms"


for path in glob.glob("dist/*.svg"):
    with open(path) as f:
        content = f.read()

    content = re.sub(r"(\d+)ms", scale, content)

    with open(path, "w") as f:
        f.write(content)
