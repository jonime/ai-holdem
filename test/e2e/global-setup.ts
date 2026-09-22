import { execFileSync } from "node:child_process";

export default function globalSetup(): void {
  execFileSync("supabase", ["db", "reset", "--local", "--yes"], {
    stdio: "inherit",
  });
}
