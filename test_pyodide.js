import { loadPyodide } from "pyodide";
import * as fs from "fs/promises";

async function main() {
    const pyodide = await loadPyodide();
    
    const scripts = [
        "inputxml_to_cii2019.py",
        "cii_syntax_check_2019.py",
        "cii2019_section_rules.py",
        "cii2019_miscel_hardener.py",
        "inputxml_to_cii2019_config.json"
    ];
    
    for (const s of scripts) {
        const scriptText = await fs.readFile("./converters/scripts/" + s, "utf8");
        pyodide.FS.writeFile("/" + s, scriptText);
    }
    pyodide.runPython(`
import sys
if "/" not in sys.path: sys.path.insert(0, "/")
`);
    
    const xmlText = await fs.readFile("C:/Users/reall/Downloads/pipeline-3d-model.xml");
    pyodide.FS.writeFile("/input.xml", xmlText);
    
    const RUN_SNIPPET = `
import runpy
import sys
import traceback

exit_code = 0
sys.argv = list(job_argv)
try:
    runpy.run_path(job_script_path, run_name="__main__")
except SystemExit as exc:
    code = exc.code
    if code is None:
        exit_code = 0
    elif isinstance(code, int):
        exit_code = code
    else:
        exit_code = 1
except Exception as e:
    traceback.print_exc()
    exit_code = 1
exit_code
    `;
    
    // First run the generator
    pyodide.globals.set("job_script_path", "/inputxml_to_cii2019.py");
    pyodide.globals.set("job_argv", ["/inputxml_to_cii2019.py", "--input", "/input.xml", "--output", "/output.cii"]);
    await pyodide.runPythonAsync(RUN_SNIPPET);
    
    // Now run the hardener
    pyodide.globals.set("job_script_path", "/cii2019_miscel_hardener.py");
    pyodide.globals.set("job_argv", ["/cii2019_miscel_hardener.py", "--input", "/output.cii", "--output", "/output.cii", "--input-xml", "/input.xml", "--strict"]);
    
    try {
        const exitCode = await pyodide.runPythonAsync(RUN_SNIPPET);
        console.log("Hardener Exit code:", exitCode);
        
        const output = pyodide.FS.readFile("/output.cii", { encoding: "utf8" });
        console.log("Output file generated. Length:", output.length);
    } catch (e) {
        console.error("Pyodide error in hardener:", e);
    }
}

main().catch(console.error);
