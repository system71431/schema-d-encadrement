const { parse } = require("@babel/parser");
const fs = require("fs");
const files = ["app.jsx", "schema.jsx", "editor.jsx", "panel.jsx"];
let ok = true;
for (const f of files) {
  try {
    const src = fs.readFileSync(f, "utf-8");
    parse(src, { sourceType: "script", plugins: ["jsx"], errorRecovery: false });
    console.log(f, "OK (" + src.length + " chars)");
  } catch (e) {
    ok = false;
    console.log(f, "ERROR at line", e.loc && e.loc.line, "col", e.loc && e.loc.column, ":", e.message);
  }
}
process.exit(ok ? 0 : 1);
