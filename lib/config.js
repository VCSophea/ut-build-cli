const { existsSync, readFileSync, writeFileSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");
const { die, warn } = require("./utils");

// * Parse .env file
const loadConfig = (projectRoot) => {
  const envFile = path.join(projectRoot, ".env");
  const envContent = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";

  const get = (k) => {
    const line = envContent.split(/\r?\n/).find((l) => new RegExp(`^\\s*${k}\\s*=`).test(l));
    if (!line) return "";
    const val = line.slice(line.indexOf("=") + 1).replace(/\s+#.*$/, "").trim();
    return (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")) ? val.slice(1, -1) : val;
  };

  const config = {
    name: get("APP_NAME"),
    version: get("APP_VERSION"),
    description: get("APP_DESCRIPTION") || "",
    appEnv: (get("APP_ENV") || "local").toLowerCase(),
    dockerRegistry: get("DOCKER_REGISTRY") || "",
    uploadDir: get("FILE_UPLOAD_VOLUME") || "uploads",
    serverPort: get("SERVER_PORT") || "8080",
    get
  };

  if (!config.name || !config.version) {
    die("Missing required parameters (APP_NAME, APP_VERSION) in .env file");
  }

  config.registryPrefix = config.dockerRegistry ? `${config.dockerRegistry.replace(/\/$/, "")}/` : "";
  return config;
};

// * Synchronize pom.xml project metadata
const syncPom = (projectRoot, config) => {
  const pomPath = path.join(projectRoot, "pom.xml");
  if (!existsSync(pomPath)) return;
  try {
    const parts = readFileSync(pomPath, "utf8").split("</parent>");
    const block = (parts[1] || parts[0])
      .replace(/<artifactId>.*?<\/artifactId>/, `<artifactId>${config.name}<\/artifactId>`)
      .replace(/<version>.*?<\/version>/, `<version>${config.version}<\/version>`)
      .replace(/<name>.*?<\/name>/, `<name>${config.name}<\/name>`)
      .replace(/<description>.*?<\/description>/, `<description>${config.description}<\/description>`);
    writeFileSync(pomPath, parts[1] ? parts[0] + "</parent>" + block : block);
  } catch (e) {
    warn(`pom.xml metadata sync skipped: ${e.message}`);
  }
};

// * Database reachability check & config resolution
const isDbReachable = (host, port = 3306) => {
  if (!host) return false;
  return spawnSync(process.execPath, ["-e", `const s=require("net").connect(${port},${JSON.stringify(host)});s.setTimeout(2000);s.on("connect",()=>{s.destroy();process.exit(0);});s.on("timeout",()=>{s.destroy();process.exit(1);});s.on("error",()=>{s.destroy();process.exit(1);});`], { stdio: "ignore" }).status === 0;
};

const resolveDbConfig = (config, key, allowFallback = true) => {
  const url = config.get(`DB_URL_${key}`);
  const user = config.get(`DB_USERNAME_${key}`);
  const password = config.get(`DB_PASSWORD_${key}`);
  if (!url || !user) return null;

  let jdbcUrl = url.replace("r2dbc:", "jdbc:").split("?")[0];
  const host = jdbcUrl.match(/^jdbc:[^:]+:\/\/([^/:?]+)/i)?.[1] || "";
  const port = parseInt(jdbcUrl.match(/^jdbc:[^:]+:\/\/[^/:]+:(\d+)/i)?.[1] || "3306", 10);
  const effectiveHost = host === "host.docker.internal" ? "127.0.0.1" : host;
  if (host === "host.docker.internal") jdbcUrl = jdbcUrl.replace("host.docker.internal", "127.0.0.1");

  if (jdbcUrl && effectiveHost && isDbReachable(effectiveHost, port)) {
    return { envKey: key, url, jdbcUrl, user, password, schema: url.split("/").pop()?.split("?")[0] ?? "" };
  }
  if (allowFallback && key !== "DEV") {
    const fallback = resolveDbConfig(config, "DEV", false);
    if (fallback) {
      warn(`DB '${host}:${port}' unreachable for ${key}. Falling back to DEV.`);
      return fallback;
    }
  }
  return { envKey: key, url, jdbcUrl, user, password, schema: url.split("/").pop()?.split("?")[0] ?? "" };
};

module.exports = { loadConfig, syncPom, resolveDbConfig };
