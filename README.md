# 🚀 ut-build-cli

> **Universal Build, Codegen, Release & Docker Orchestration CLI for Spring Boot APIs**  
> Maintained by **UDAYA Technology**. Works seamlessly across **macOS, Linux, and Windows**.

---

## 📌 Overview

`ut-build` is a single centralized command-line tool designed to replace repetitive local build scripts across all UDAYA Spring Boot microservices and APIs. It standardizes:
- ☕ **JDK Discovery**: Automatically finds and activates **JDK 25** (with fallback to 23/21/17) on macOS & Windows.
- 🐳 **Watchtower Support**: Generates `docker-compose.yml` with container labels (`com.centurylinklabs.watchtower.enable=true`) and image tags for zero-downtime auto-updates.
- 📦 **Multi-stage Packaging**: Builds optimized Spring Boot layer-extracted Dockerfiles and deployment ZIP packages ready for production servers.
- 🧬 **jOOQ Code Generation**: Validates database reachability before generating jOOQ classes.
- 🔁 **Environment Sync**: Synchronizes `pom.xml` metadata with your `.env` configuration.

---

## 🚀 Installation

### Option A: Install Globally (Run anywhere in terminal)
```bash
npm install -g git+https://github.com/VCSophea/ut-build-cli.git
# or
yarn global add git+https://github.com/VCSophea/ut-build-cli.git
```

### Option B: Add to a Project (Recommended for Team & CI/CD)
Inside your Spring Boot API repository:
```bash
yarn add -D git+https://github.com/VCSophea/ut-build-cli.git
# or
npm install --save-dev git+https://github.com/VCSophea/ut-build-cli.git
```

---

## ⚡ Quick Start: Adopt in Any API Project

In any existing or new Spring Boot API directory, run:
```bash
ut-build init
```
This will automatically configure `package.json` with standard commands:
```json
{
  "scripts": {
    "start": "ut-build start",
    "codegen": "ut-build codegen",
    "test": "ut-build test",
    "build": "ut-build build",
    "rebuild": "yarn clean && yarn build",
    "release": "ut-build release",
    "deploy": "ut-build deploy",
    "compose": "ut-build compose",
    "restart": "yarn clean && yarn codegen && yarn start",
    "clean": "ut-build clean"
  },
  "devDependencies": {
    "ut-build-cli": "git+https://github.com/VCSophea/ut-build-cli.git"
  }
}
```

---

## 🛠️ Command Reference

| Command | Shorthand | Description |
| :--- | :--- | :--- |
| `ut-build build` | `yarn build` | Compiles Spring Boot application, generates Watchtower-ready compose, and packages release ZIP. |
| `ut-build release` | `yarn release` | Compiles jar, builds Docker image, tags & pushes to container registry, and creates release archive. |
| `ut-build start` | `yarn start` | Starts Spring Boot app locally with auto-detected JDK 25. |
| `ut-build codegen` | `yarn codegen` | Validates DB connectivity and executes jOOQ source generation. |
| `ut-build test` | `yarn test` | Executes Maven unit tests. |
| `ut-build compose [up|down|restart]` | `yarn compose` | Runs Docker Compose with the profile specified in `APP_ENV`. |
| `ut-build deploy` | `yarn deploy` | Verifies release ZIP and shows server deployment instructions. |
| `ut-build clean` | `yarn clean` | Cleans Maven target, release archives, and temporary build folders. |
| `ut-build init` | — | Automatically configures current project's `package.json`. |

---

## ⚙️ Environment Configuration (`.env`)

`ut-build` automatically reads your project's `.env` file:

```dotenv
APP_NAME=my-api
APP_VERSION=1.00
APP_DESCRIPTION="My Spring Boot API"
APP_ENV=prod # local, dev, qa, prod
SERVER_PORT=8080
FILE_UPLOAD_VOLUME=my_uploads
DOCKER_REGISTRY=ghcr.io/vcsophea
```

---

## 💻 Cross-Platform Support

- **macOS**: Auto-resolves JDK via `/usr/libexec/java_home -v 25` (and 23/21/17).
- **Windows**: Auto-resolves Scoop JDK installations (`scoop/apps/openjdk*`), uses `mvnw.cmd`, and compresses archives via native PowerShell.
- **Linux / CI**: Standard Maven wrapper and environment resolution.

---

## 📄 License
ISC © [UDAYA Technology](https://udaya-tech.com) & VCSophea
