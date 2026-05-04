import re, sys
for path in sys.argv[1:]:
    with open(path, encoding="utf-8") as f:
        src = f.read()
    s = re.sub(r"//[^\n]*", "", src)
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)
    s = re.sub(r"`(?:[^\\`]|\\.)*`", '""', s, flags=re.DOTALL)
    s = re.sub(r"'(?:[^\\']|\\.)*'", '""', s)
    s = re.sub(r'"(?:[^\\"]|\\.)*"', '""', s)
    print(path)
    print("  { } :", s.count("{"), s.count("}"))
    print("  ( ) :", s.count("("), s.count(")"))
    print("  [ ] :", s.count("["), s.count("]"))
