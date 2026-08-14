import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const REPO = path.join(process.cwd(), "..");

function readRepo(rel: string): string {
  return readFileSync(path.join(REPO, rel), "utf8");
}

function assigned(toml: string, key: string): string | undefined {
  const match = toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match?.[1];
}

describe("Railway config isolation — tradingview-mcp vs backend", () => {
  it("root railway.toml still builds the Next.js backend image only", () => {
    const toml = readRepo("railway.toml");
    expect(assigned(toml, "dockerfilePath")).toBe("./backend.Dockerfile");
    expect(toml).toMatch(/tradingview-mcp must use \/railway\.tradingview-mcp\.toml/);
  });

  it("railway.tradingview-mcp.toml builds Dockerfile.mcp and starts the MCP server", () => {
    const toml = readRepo("railway.tradingview-mcp.toml");
    expect(assigned(toml, "dockerfilePath")).toBe("./Dockerfile.mcp");
    expect(assigned(toml, "startCommand")).toBe("node mcp-http-server.js");
  });

  it("root railway.json startCommand remains npm start for the API, not MCP", () => {
    const json = JSON.parse(readRepo("railway.json"));
    expect(json.deploy.startCommand).toBe("npm start");
  });

  it("Dockerfile.mcp CMD is the MCP HTTP/browser runtime", () => {
    const docker = readRepo("Dockerfile.mcp");
    expect(docker).toContain('CMD ["node", "mcp-http-server.js"]');
    expect(docker).toMatch(/chromium/i);
    expect(docker).toMatch(/\/data\/tradingview-profile/);
    expect(docker).toMatch(/CDP_HOST=127\.0\.0\.1/);
    expect(docker).not.toMatch(/EXPOSE 9222/);
    expect(docker).not.toMatch(/CMD \["npm", "start"\]/);
    expect(docker).not.toMatch(/CMD \["node", "server\.js"\]/);
  });

  it("backend.Dockerfile still starts Next.js and is unused by the MCP toml", () => {
    const docker = readRepo("backend.Dockerfile");
    expect(docker).toContain('CMD ["npm", "start"]');
    expect(assigned(readRepo("railway.tradingview-mcp.toml"), "dockerfilePath")).toBe(
      "./Dockerfile.mcp"
    );
  });
});
