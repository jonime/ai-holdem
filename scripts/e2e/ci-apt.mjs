import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Ubuntu 24.04 hosted runners use deb822 sources. Change only their URI fields;
// retain suites, components, architectures and Ubuntu's signing key unchanged.
export function ubuntuSourcesOverHTTPS(source) {
  let fields = 0;
  const result = source.replace(/^URIs:([^\r\n]*)/gm, (_, value) => {
    fields++;
    const uris = value.trim().split(/\s+/).map(uri => {
      if (uri === "mirror+file:/etc/apt/apt-mirrors.txt") return "https://archive.ubuntu.com/ubuntu/";
      const match = /^https?:\/\/(azure\.archive|archive|security)\.ubuntu\.com\/ubuntu\/?$/.exec(uri);
      if (!match) throw new Error("Unexpected Ubuntu apt URI; review the pinned runner's sources.");
      return `https://${match[1] === "security" ? "security" : "archive"}.ubuntu.com/ubuntu/`;
    });
    return `URIs: ${uris.join(" ")}`;
  });
  if (!fields) throw new Error("Ubuntu deb822 apt sources have no URI fields.");
  return result;
}

// Written to apt.conf.d because Playwright elevates apt with sudo, which may
// discard environment overrides. A late filename wins over runner defaults.
export const aptDownloadConfiguration = `Acquire::Retries "2";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
`;

export function configureCIApt(aptDirectory = "/etc/apt", env = process.env, platform = process.platform) {
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true" || platform !== "linux") {
    throw new Error("Apt preparation is only for the Ubuntu GitHub Actions integration runner.");
  }
  const sourcePath = join(aptDirectory, "sources.list.d/ubuntu.sources");
  const sources = ubuntuSourcesOverHTTPS(readFileSync(sourcePath, "utf8"));
  writeFileSync(sourcePath, sources);
  writeFileSync(join(aptDirectory, "apt.conf.d/zzzz-ai-holdem-downloads"), aptDownloadConfiguration);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  configureCIApt();
  console.log("Ubuntu HTTPS archives configured; apt connection/data timeouts are 30 seconds with two download retries.");
}
