# cogability-packages

Monorepo for the two npm packages CogAbility publishes for client integration:

- **`@cogability/sdk`** — framework-agnostic JavaScript SDK for the CogAbility platform. Three HTTP clients (`CamClient`, `CmgClient`, `AuthClient`), session adapters, and SSE parser. Browser + Node.js. Used by React, Vue, vanilla JS, and Node agent consumers.
- **`@cogability/membership-kit`** — React 19 components, hooks, pages, and an `AuthProvider` for building a CogAbility-powered membership site. Built on top of `@cogability/sdk`.

These packages are consumed by:
- [`cogbot-membership-website-template`](https://github.com/CogAbility/cogbot-membership-website-template) — the canonical example/starter site (currently branded as the BAB "Build a Brain" project).
- Any client deploying a custom site against CogAbility (Lovable, Vercel, Netlify, Vue, vanilla JS — anywhere npm packages can be installed).

The packages source lived inside the template repo originally as workspace packages. It was extracted here so the template can stay a clean single-app Vite project, importable to AI builders like Lovable without monorepo gymnastics.

---

## Repository layout

```
cogability-packages/
  package.json              <- root workspace config
  packages/
    sdk/                    <- @cogability/sdk source
      package.json
      README.md
      src/
        index.js
        cam-client.js
        cmg-client.js
        auth-client.js
        session-store.js
        sse-parser.js
        types.js
    membership-kit/         <- @cogability/membership-kit source
      package.json
      src/
        index.js
        App.jsx
        auth/
        components/
        config/
        hooks/
        pages/
        services/
```

## Local development

```bash
npm install
```

`npm install` at the root sets up workspace symlinks so `membership-kit` resolves `@cogability/sdk` to the local `packages/sdk/` source instead of the published npm version. Edit either package's source freely; consumers in this repo see the changes immediately.

### Running tests

Unit tests use [Vitest](https://vitest.dev/) across both packages:

```bash
npm test          # run all tests once
npm run test:watch  # watch mode for development
```

The test suite covers:

- **`@cogability/sdk`** — `cam-client.chatid.test.js` (chat_id lifecycle: `_getChatId`, `rotateChatId`, `_buildMessageBody`) and `cam-client.history.test.js` (`fetchConversationHistory` URL/query params/error handling via mocked `fetch`).
- **`@cogability/membership-kit`** — `useBuddyChat.test.jsx` (retry ordering, message clearing, greeting refresh, `fetchConversationHistory` delegation) using React Testing Library + jsdom.

(A `playground/` Vite app for hot-reloaded local testing of the kit will be added as a follow-up.)

## CI/CD

Jenkins (`apps/cogability-packages`, a multibranch pipeline driven by [`Jenkinsfile.groovy`](Jenkinsfile.groovy)) builds every branch and PR on push, and publishes from `main`:

- **Pre-Build** — `npm ci` (see the lockfile note below), then resolves the target version for each package from its two build parameters, `SDK_BUMP_TYPE` and `KIT_BUMP_TYPE` (`none | patch | minor | major`). `none` publishes whatever version is already committed in `package.json` with no bump/commit/tag.
- **Test** — `npm test` (Vitest, both packages). A branch/PR build stops here.
- **Publish** *(main only)* — for each package, publishes to npm only if that exact version isn't already there (idempotent — re-running or re-triggering is always safe), commits any version bumps back to `main`, and tags what it actually published (`sdk-vX.Y.Z`, `membership-kit-vX.Y.Z`).
- **Approval for Production** *(main only, kit published)* — a 30-minute manual gate in the Jenkins UI to also bump `cogbot-membership-website-template`'s `@cogability/membership-kit` dependency and push (triggers its Netlify redeploy). Declining or letting it time out just skips this — the npm publish already happened either way.

**Keep `package-lock.json` in sync.** CI runs `npm ci`, which fails hard (`EUSAGE`) on any drift between it and the `package.json` files — this bit us once already (the lockfile pinned `@cogability/sdk` at `0.2.0` for months across several real bumps because nothing ever ran `npm ci` against it). After bumping a version or changing a workspace package's dependency range, always run `npm install` at the root and commit the resulting lockfile. If `membership-kit`'s `dependencies."@cogability/sdk"` range doesn't cover the SDK's current workspace version, npm will silently install a separate stale copy from the registry instead of linking to local `packages/sdk/` — check `package-lock.json` for a `packages/membership-kit/node_modules/@cogability/sdk` entry (there shouldn't be one) if a change to one package doesn't seem to reach the other in a consumer.

### Triggering a release

Bump whichever package(s) changed in a PR (semver — patch for fixes, minor for additive changes, major for breaking changes) and update `membership-kit`'s `dependencies."@cogability/sdk"` range if both changed, then merge to `main` — CI publishes it automatically with `SDK_BUMP_TYPE=none` / `KIT_BUMP_TYPE=none` (the default) since the version is already committed. Alternatively, trigger `apps/cogability-packages/main` in Jenkins directly with `SDK_BUMP_TYPE`/`KIT_BUMP_TYPE` set to have it bump, commit, tag, and publish for you.

Verify with `npm view @cogability/<name> version` from outside the workspace.

### CRITICAL: never `npm unpublish`

npm permanently reserves any version number that has ever been published, even if you `npm unpublish` it within the 72-hour retention window. Re-publishing the same version after an unpublish will silently no-op (the API returns `PUT 200` but the version never reappears in the packument). This bit us when bootstrapping `@cogability/sdk@0.1.0` — we had to skip to `0.1.1`.

If a published version is broken, **publish a new version with the fix**. Use `npm deprecate @cogability/<name>@<bad-version> "reason"` to mark the broken one in the registry instead of unpublishing.

### Test that a fresh install works

After publishing, run from the repo root:

```bash
npm run test:install
```

This installs both packages into a clean tmp directory from the public registry, then `require()`s `@cogability/sdk` and prints its exports. Catches packument propagation issues, missing dist files, broken `exports` paths, etc.

## Versioning policy

- Both packages are pre-1.0 (`0.x.y`). Caret ranges on `0.x.y` are tighter than on `1.x.y`: `^0.1.0` allows `>=0.1.0 <0.2.0`, NOT `<1.0.0`.
- Treat `0.x.0 → 0.x+1.0` bumps as potentially breaking.
- Once an API surface is stable, cut a `1.0.0` release and switch to standard semver.

## Consumers

Consumers `npm install` like any other package. No special configuration:

```bash
npm install @cogability/sdk @cogability/membership-kit
```

See:
- [`packages/sdk/README.md`](packages/sdk/README.md) for SDK usage examples (React, Vue, vanilla JS, Node.js agents).
- [`cogbot-membership-website-template`](https://github.com/CogAbility/cogbot-membership-website-template) for a complete React reference site.
- [`cogbot-membership-website-template/deployment_guidance.md`](https://github.com/CogAbility/cogbot-membership-website-template/blob/main/deployment_guidance.md) for end-to-end deploy walkthroughs covering three integration paths: forking the template to Lovable / Vercel / Netlify / Cloudflare Pages, adding CogBot to an existing Lovable site via the SDK, or using the SDK from any other framework or Node agent. Also includes the shared backend allowlisting process (CAM CORS, CMG \`ALLOWED_ORIGINS\`, App ID redirect URLs) and a troubleshooting table.
