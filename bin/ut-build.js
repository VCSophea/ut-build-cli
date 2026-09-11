#!/usr/bin/env node

const path = require("path");
const { existsSync, readdirSync, rmSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } = require("fs");
const { spawnSync, execSync } = require("child_process");
const { IS_WIN, die, warn, info, success, run, resolveMaven, setupJdk } = require("../lib/utils");
const { loadConfig, syncPom, resolveDbConfig } = require("../lib/config");
const { ENV_SPECS, generateComposeYml, generateAllTemplates, generateDockerfile } = require("../lib/docker");

const projectRoot = process.cwd();
const cmd = (process.argv[2] || "help").toLowerCase();

// * Show help guide
if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(`
\x1b[36m=======================================================
 🚀 UT-BUILD CLI - Spring Boot API Build & Release Tool
=======================================================\x1b[0m

\x1b[1mUsage:\x1b[0m
  ut-build <command> [options]

\x1b[1mAvailable Commands:\x1b[0m
  \x1b[32mbuild\x1b[0m, \x1b[32mrebuild\x1b[0m     Compile Spring Boot, build jar, bundle zip with Dockerfile & compose
  \x1b[32mrelease\x1b[0m            Build + tag Docker image + push to registry + bundle zip
  \x1b[32mstart\x1b[0m              Run Spring Boot locally (auto-resolves JDK 25)
  \x1b[32mcodegen\x1b[0m            Generate docker-compose templates & jOOQ classes
  \x1b[32mtest\x1b[0m               Run Maven test suite
  \x1b[32mcompose\x1b[0m [up|down]  Run Docker compose for the current APP_ENV
  \x1b[32mdeploy\x1b[0m             Verify release package and show deployment guide
  \x1b[32mclean\x1b[0m              Clean target, release, deploy, and maven artifacts
  \x1b[32minit\x1b[0m               Configure or update current project's package.json scripts

\x1b[36m=======================================================\x1b[0m
`);
  process.exit(0);
}

// * Command: init (Configure package.json in current project)
if (cmd === "init") {
  const pkgPath = path.join(projectRoot, "package.json");
  let pkg = {};
  if (existsSync(pkgPath)) {
    try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")); } catch (_) {}
  }
  pkg.scripts = {
    start: "ut-build start",
    codegen: "ut-build codegen",
    test: "ut-build test",
    build: "ut-build build",
    rebuild: "yarn clean && yarn build",
    release: "ut-build release",
    deploy: "ut-build deploy",
    compose: "ut-build compose",
    restart: "yarn clean && yarn codegen && yarn start",
    clean: "ut-build clean"
  };
  if (!pkg.devDependencies) pkg.devDependencies = {};
  pkg.devDependencies["ut-build-cli"] = "git+https://github.com/VCSophea/ut-build-cli.git";
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  success("Configured package.json with standard ut-build scripts!");
  process.exit(0);
}

// * Setup JDK & Maven
setupJdk();
const mvn = resolveMaven(projectRoot);

// * Command: clean
if (cmd === "clean") {
  console.log("🧹 Cleaning project...");
  run(mvn, ["clean", "-q"], projectRoot);
  ["release", "target", "uploads", "deploy", "templates"].forEach((dir) => {
    const p = path.join(projectRoot, dir);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  });
  success("Clean complete.");
  process.exit(0);
}

// * Load Project Configuration from .env
const config = loadConfig(projectRoot);
syncPom(projectRoot, config);

// * Command: codegen
if (cmd === "codegen") {
  console.log("📁 Generating docker-compose templates...");
  generateAllTemplates(projectRoot, config);
  success("Templates generated successfully.");

  const db = resolveDbConfig(config, config.appEnv.toUpperCase());
  if (!db?.url || !db?.user) {
    die("Missing DB config in .env for jOOQ codegen");
  }
  console.log("🧬 Generating jOOQ classes...");
  run(mvn, [
    "-Djooq.codegen.skip=false",
    `-Djooq.codegen.jdbc.url=${db.jdbcUrl}`,
    `-Djooq.codegen.jdbc.user=${db.user}`,
    `-Djooq.codegen.jdbc.password=${db.password}`,
    `-Djooq.codegen.jdbc.schema=${db.schema}`,
    "-DskipTests",
    "generate-sources",
    "-q"
  ], projectRoot);
  success("jOOQ generation complete.");
  process.exit(0);
}

// * Command: test
if (cmd === "test") {
  run(mvn, ["test"], projectRoot);
  process.exit(0);
}

// * Command: start
if (cmd === "start") {
  console.log("📦 Resolving dependencies & starting application...");
  run(mvn, ["dependency:resolve", "-q"], projectRoot);
  run(mvn, ["clean", "compile", "-DskipTests", "-Djooq.codegen.skip=true", "-q"], projectRoot);
  run(mvn, ["spring-boot:run"], projectRoot);
  process.exit(0);
}

// * Command: compose
if (cmd === "compose") {
  generateAllTemplates(projectRoot, config);
  const uploadVolume = config.uploadDir;
  if (uploadVolume) {
    try {
      execSync(`docker volume inspect ${uploadVolume} >/dev/null 2>&1 || docker volume create ${uploadVolume}`, { stdio: "ignore" });
    } catch (_) {}
  }
  const templateCompose = path.join(projectRoot, "templates", config.appEnv, "docker-compose.yml");
  const fallbackCompose = path.join(projectRoot, "templates", "local", "docker-compose.yml");
  const composeFile = existsSync(templateCompose) ? templateCompose : (existsSync(fallbackCompose) ? fallbackCompose : path.join(projectRoot, "docker-compose.yml"));

  const action = (process.argv[3] || "up").toLowerCase();
  const cmdBase = ["compose", "--project-directory", projectRoot, "-f", composeFile];
  let dockerCmd = [];
  if (action === "down") dockerCmd = [...cmdBase, "down"];
  else if (action === "restart") dockerCmd = [...cmdBase, "restart"];
  else dockerCmd = [...cmdBase, "up", "-d"];

  console.log(`🐳 Running: docker ${dockerCmd.join(" ")}`);
  spawnSync("docker", dockerCmd, { stdio: "inherit", cwd: projectRoot });
  process.exit(0);
}

// * Command: deploy
if (cmd === "deploy") {
  const zipName = `${config.name}##V${config.version}.zip`;
  const zipPath = path.join(projectRoot, "release", zipName);
  if (!existsSync(zipPath)) {
    die(`Release package not found at: ${zipPath}\n💡 Run 'ut-build release' or 'ut-build build' first.`);
  }
  console.log(`🚀 Ready to deploy: ${zipName}`);
  console.log(`📋 Instructions:`);
  console.log(`   1. Transfer release/${zipName} to your server.`);
  console.log(`   2. Extract and run 'docker compose up -d'.`);
  process.exit(0);
}

// * Commands: build / rebuild / release
if (cmd === "build" || cmd === "rebuild" || cmd === "release") {
  generateAllTemplates(projectRoot, config);
  console.log(`\n🚀 Compiling ${config.name} V${config.version} [${config.appEnv}]...`);
  run(mvn, ["clean", "install", "-Dmaven.test.skip=true", "-q"], projectRoot);

  const targetDir = path.join(projectRoot, "target");
  const deployDir = path.join(projectRoot, "deploy");
  const releaseDir = path.join(projectRoot, "release");

  const jar = readdirSync(targetDir).find((f) => f.endsWith(".jar") && !f.includes("original"));
  if (!jar) die("Build failed: JAR not found in target directory");

  // * Prepare deploy bundle
  if (existsSync(deployDir)) rmSync(deployDir, { recursive: true, force: true });
  mkdirSync(deployDir, { recursive: true });

  copyFileSync(path.join(targetDir, jar), path.join(deployDir, "app.jar"));
  const envFile = path.join(projectRoot, ".env");
  if (existsSync(envFile)) copyFileSync(envFile, path.join(deployDir, ".env"));

  const spec = ENV_SPECS[config.appEnv] || ENV_SPECS.local;
  const composeContent = (cmd === "build" || cmd === "rebuild")
    ? generateComposeYml(config, config.appEnv, spec, "build")
    : generateComposeYml(config, config.appEnv, spec, "image");
  writeFileSync(path.join(deployDir, "docker-compose.yml"), composeContent);

  generateDockerfile(deployDir, config);

  // * Docker image tagging & push (release only)
  const tagVersion = `${config.registryPrefix}${config.name}:v${config.version}`;
  const tagEnv = `${config.registryPrefix}${config.name}:${config.appEnv}`;

  if (cmd === "release") {
    console.log(`\n🐳 Building Docker image:\n   🏷️  ${tagVersion}\n   🏷️  ${tagEnv}`);
    run(`docker build -t ${tagVersion} -t ${tagEnv} .`, [], deployDir);

    if (config.dockerRegistry) {
      console.log(`\n🚀 Pushing Docker images to ${config.dockerRegistry} [${config.appEnv.toUpperCase()}]...`);
      run(`docker push ${tagVersion}`, [], deployDir);
      run(`docker push ${tagEnv}`, [], deployDir);
      success(`Pushed successfully:\n  - ${tagVersion}\n  - ${tagEnv}`);
    }
  }

  // * Package release ZIP archive
  if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });
  const zipName = `${config.name}##V${config.version}.zip`;
  const zipPath = path.join(releaseDir, zipName);

  console.log(`\n📦 Creating release archive: release/${zipName}...`);
  if (existsSync(zipPath)) rmSync(zipPath, { force: true });

  if (IS_WIN) {
    run("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path (Get-ChildItem -Path '${deployDir}' -Force) -DestinationPath '${zipPath}' -Force`], projectRoot);
  } else {
    run(`cd "${deployDir}" && zip -r "${zipPath}" .env app.jar Dockerfile docker-compose.yml`, [], projectRoot);
  }

  // * Cleanup intermediate deploy folder and templates
  if (existsSync(deployDir)) rmSync(deployDir, { recursive: true, force: true });
  const templatesDir = path.join(projectRoot, "templates");
  if (existsSync(templatesDir)) rmSync(templatesDir, { recursive: true, force: true });
  run(mvn, ["clean", "-q"], projectRoot);

  success(`Release archive ready: release/${zipName}`);
  process.exit(0);
}

die(`Unknown command: ${cmd}. Run 'ut-build help' for usage.`);
