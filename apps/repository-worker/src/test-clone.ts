import * as path from "path";
import { fileURLToPath } from "url";
import { crawlDirectory, detectFrameworks } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function test() {
  console.log("=== Testing Repository Ingestion MVP Logic ===");

  const workspaceRoot = path.resolve(__dirname, "../../..");
  console.log(`\nWorkspace Root: ${workspaceRoot}`);

  // Test framework detection
  console.log("\nDetecting frameworks in workspace root...");
  const frameworks = detectFrameworks(workspaceRoot);
  console.log("Detected Frameworks:", frameworks);

  // Test directory crawling
  const workerSrcDir = path.resolve(__dirname);
  console.log(`\nCrawling directory: ${workerSrcDir}`);
  const files = crawlDirectory(workerSrcDir, workerSrcDir);
  console.log(`Crawled ${files.length} files:`);
  for (const file of files) {
    console.log(` - Path: ${file.path}`);
    console.log(`   Size: ${file.sizeBytes} bytes`);
    console.log(`   Language: ${file.language}`);
    console.log(`   Hash: ${file.hash.slice(0, 16)}...`);
  }
}

test();
