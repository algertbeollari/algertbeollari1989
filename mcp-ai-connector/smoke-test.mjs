import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["index.js"],
});

const client = new Client({ name: "smoke-test", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log(
  "Registered tools:",
  tools.tools.map((t) => t.name)
);

const status = await client.callTool({ name: "list_connectors", arguments: {} });
console.log("\nlist_connectors output:\n" + status.content[0].text);

const missing = await client.callTool({
  name: "ask_claude",
  arguments: { prompt: "hi" },
});
console.log("\nask_claude with no key (expect graceful error):");
console.log(JSON.stringify(missing, null, 2));

const combo = await client.callTool({
  name: "omniroute",
  arguments: { prompt: "hi" },
});
console.log("\nomniroute with no keys configured (expect all FAILED, combo skipped):");
console.log(combo.content[0].text);
console.log("isError:", combo.isError);

await client.close();
process.exit(0);
