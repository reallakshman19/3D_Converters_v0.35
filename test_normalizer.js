import { normalizeInputXmlAttributeNames } from "./converters/inputxml-field-adapter.js";
import * as fs from "fs/promises";

async function main() {
    const xmlText = await fs.readFile("C:/Users/reall/Downloads/pipeline-3d-model.xml", "utf8");
    console.log("Read XML.");
    const result = normalizeInputXmlAttributeNames(xmlText);
    console.log("Normalized.", result.renamed.length);
}

main().catch(console.error);
