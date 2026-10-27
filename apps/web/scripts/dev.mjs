import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function nextDevArguments(args) {
  const forwarded = [];
  let explicitHost = false;
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === "--strictPort" || argument.startsWith("--strictPort="))
      continue;
    if (argument === "--host") {
      explicitHost = true;
      forwarded.push("--hostname", args[++i] || "0.0.0.0");
    } else if (argument.startsWith("--host=")) {
      explicitHost = true;
      forwarded.push("--hostname", argument.slice("--host=".length));
    } else {
      if (argument === "--hostname" || argument.startsWith("--hostname="))
        explicitHost = true;
      forwarded.push(argument);
    }
  }
  return [
    "dev",
    ...(explicitHost ? [] : ["--hostname", "0.0.0.0"]),
    ...forwarded,
  ];
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const require = createRequire(import.meta.url);
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const child = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      ...nextDevArguments(process.argv.slice(2)),
    ],
    {
      cwd: webRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
  });
}
