import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";

const { AGENT_ID, ENV_ID, GITHUB_TOKEN } = process.env;
if (!AGENT_ID || !ENV_ID || !GITHUB_TOKEN) {
  console.error("Set AGENT_ID, ENV_ID, GITHUB_TOKEN in your environment.");
  process.exit(1);
}

const scenario =
  process.argv.slice(2).join(" ") ||
  "What if I wait to retire until I'm 70, all other things being equal?";

const client = new Anthropic();

const session = await client.beta.sessions.create({
  agent: AGENT_ID,
  environment_id: ENV_ID,
  title: `Scenario: ${scenario.slice(0, 60)}`,
  resources: [
    {
      type: "github_repository",
      url: "https://github.com/chaddell-droid/financial-model",
      authorization_token: GITHUB_TOKEN,
      checkout: { type: "branch", name: "main" },
    },
  ],
});
console.log(`Session: ${session.id}\n`);

const stream = await client.beta.sessions.events.stream(session.id);

await client.beta.sessions.events.send(session.id, {
  events: [{ type: "user.message", content: [{ type: "text", text: scenario }] }],
});

for await (const event of stream) {
  switch (event.type) {
    case "agent.message":
      for (const b of event.content) if (b.type === "text") process.stdout.write(b.text);
      break;
    case "agent.tool_use":
      process.stdout.write(`\n[tool: ${event.name ?? "?"}]\n`);
      break;
    case "session.error":
      console.error("\n[session.error]", event.error?.message);
      break;
    case "session.status_terminated":
      console.log("\n[terminated]");
      break;
    case "session.status_idle":
      if (event.stop_reason?.type !== "requires_action") {
        console.log(`\n[idle: ${event.stop_reason?.type}]`);
      }
      break;
  }
  if (
    event.type === "session.status_terminated" ||
    (event.type === "session.status_idle" && event.stop_reason?.type !== "requires_action")
  )
    break;
}

await new Promise((r) => setTimeout(r, 2000));

const outDir = "./scenario-outputs";
fs.mkdirSync(outDir, { recursive: true });

let downloaded = 0;
for await (const f of client.beta.files.list({
  scope_id: session.id,
  betas: ["managed-agents-2026-04-01"],
})) {
  const safeName = path.basename(f.filename);
  if (!safeName || safeName === "." || safeName === "..") continue;
  const resp = await client.beta.files.download(f.id);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(path.join(outDir, safeName), buf);
  console.log(`Saved: ${outDir}/${safeName} (${f.size_bytes} bytes)`);
  downloaded++;
}
console.log(`\nDone. ${downloaded} file(s) in ${outDir}/`);
