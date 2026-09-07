const { execSync, spawnSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const IS_WIN = process.platform === "win32";

// * Logging helpers
const die = (msg) => { console.error(`\x1b[31m❌ ${msg}\x1b[0m`); process.exit(1); };
const warn = (msg) => console.warn(`\x1b[33m⚠️  ${msg}\x1b[0m`);
const info = (msg) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`);
const success = (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`);

// * Shell command execution with sensitive argument masking
const run = (cmd, args = [], cwd = process.cwd()) => {
  if (!args.length) {
    const res = spawnSync(IS_WIN ? "cmd" : "/bin/sh", [IS_WIN ? "/C" : "-c", cmd], { stdio: "inherit", cwd });
    if (res.status !== 0) die(`Command failed (${res.status}): ${cmd}`);
    return;
  }
  const printable = `${cmd} ${args.map((a) => String(a).startsWith("-Djooq.codegen.jdbc.password=") ? "-Djooq.codegen.jdbc.password=******" : a).join(" ")}`;
  const res = (IS_WIN && cmd.toLowerCase().endsWith(".cmd"))
    ? spawnSync("powershell", ["-NoProfile", "-Command", `Set-Location '${cwd}'; & '${cmd}' ${args.map(a => `'${String(a).replace(/'/g, "''")}'`).join(" ")}; exit $LASTEXITCODE`], { stdio: "inherit", cwd })
    : spawnSync(cmd, args, { stdio: "inherit", cwd, shell: false });
  if (res.status !== 0) die(`Command failed (${res.status}): ${printable}`);
};

// * Maven executable resolution
const resolveMaven = (projectRoot) => {
  const w = path.join(projectRoot, IS_WIN ? "mvnw.cmd" : "mvnw");
  if (existsSync(w)) {
    if (!IS_WIN) {
      try { spawnSync("chmod", ["+x", w]); } catch (_) {}
    }
    return IS_WIN ? w : "./mvnw";
  }
  return "mvn";
};

// * JDK discovery & setup (Prioritizes JDK 25 -> 23 -> 21 -> 17)
const setupJdk = () => {
  if (process.platform === "darwin") {
    for (const v of ["25", "23", "21", "17"]) {
      try {
        const home = execSync(`/usr/libexec/java_home -v ${v} 2>/dev/null`, { encoding: "utf8" }).trim();
        if (home) {
          process.env.JAVA_HOME = home;
          process.env.PATH = `${path.join(home, "bin")}${path.delimiter}${process.env.PATH}`;
          console.log(`☕ Using JDK ${v}: ${home}`);
          return home;
        }
      } catch (_) {}
    }
  } else if (IS_WIN) {
    // 1. Check Scoop
    const scoop = path.join(process.env.USERPROFILE || "", "scoop", "apps");
    const scoopCandidates = ["openjdk25", "openjdk23", "openjdk21", "openjdk17", "temurin-jdk", "oraclejdk-25"]
      .map((d) => path.join(scoop, d, "current"))
      .find((c) => existsSync(path.join(c, "bin", "java.exe")));
    
    // 2. Check standard Program Files
    const progDirs = [
      process.env["ProgramFiles"],
      process.env["ProgramFiles(x86)"],
      "C:\\Program Files"
    ].filter(Boolean);
    
    let progCandidate = null;
    for (const p of progDirs) {
      for (const vendor of ["Java", "Eclipse Adoptium", "BellSoft", "Microsoft"]) {
        const vendorDir = path.join(p, vendor);
        if (existsSync(vendorDir)) {
          try {
            const sub = fs.readdirSync(vendorDir).sort().reverse();
            const found = sub.find((s) => existsSync(path.join(vendorDir, s, "bin", "java.exe")));
            if (found) {
              progCandidate = path.join(vendorDir, found);
              break;
            }
          } catch (_) {}
        }
      }
      if (progCandidate) break;
    }

    const home = scoopCandidates || progCandidate || (process.env.JAVA_HOME && existsSync(path.join(process.env.JAVA_HOME, "bin", "java.exe")) ? process.env.JAVA_HOME : null);
    if (home) {
      process.env.JAVA_HOME = home;
      process.env.PATH = `${path.join(home, "bin")}${path.delimiter}${process.env.PATH}`;
      console.log(`☕ Using JDK: ${home}`);
      return home;
    }
  }
  return null;
};

module.exports = { IS_WIN, die, warn, info, success, run, resolveMaven, setupJdk };
