<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Code Rules

## Code Style

- Comments in English only.
- Prefer functional programming over OOP.
- Use OOP classes only for connectors and interfaces to external systems.
- Write pure functions: only modify return values, never input parameters or global state.
- Follow DRY, KISS, and YAGNI principles.
- Use strict typing everywhere: function returns, variables, and collections.
- Check if logic already exists before writing new code.
- Avoid untyped variables and generic types.
- Never use default parameter values; make all parameters explicit.
- Create proper type definitions for complex data structures.
- Keep all imports at the top of the file.
- Write simple single-purpose functions. Avoid multi-mode behavior and flag parameters that switch logic.

## Error Handling

### TypeScript

- Never use `try/catch` blocks in TypeScript code.
- Treat errors as values. Return typed `Error | T` unions from functions.
- Use the `errore` package for type-safe errors.
- Before using `errore` in a session, read the full README with:

```sh
curl -fs https://raw.githubusercontent.com/remorses/errore/refs/heads/main/README.md
```

- Always import `errore` with a namespace import:

```ts
import * as errore from "errore";
```

- Use specific tagged error types that clearly indicate what went wrong.
- Use `errore.createTaggedError` for typed project errors.
- Use `errore.try(() => JSON.parse(value))` for synchronous external functions that may throw.
- Use `errore.tryAsync(...)` for async external functions we do not control.
- Never silently ignore errors.
- Do not use catch-all handlers that hide the root cause.
- Error messages should be clear and actionable.
- Do not add fallbacks unless explicitly requested.
- Fix root causes, not symptoms.
- External API or service calls should use retries with warnings, then return the last typed error.
- Error values must include enough context to debug, including request params, response body, and status codes when available.
- Logging should use structured fields instead of interpolating dynamic values into message strings.

## Tooling and Dependencies

- Prefer modern package management files like `pyproject.toml` and `package.json`.
- Install dependencies in project environments, not globally.
- Add dependencies to project config files, not as one-off manual installs.
- Read installed dependency source code when needed instead of guessing behavior.

## Secrets And Environment

- This project uses Doppler to manage secrets with one project and three environments: `dev`, `preview`, and `production`.
- The `dev` environment is already selected and implicit in Doppler calls.
- Do not read secrets with `process.env` directly in TypeScript.
- Find the closest `env.ts` file that exports a typed `env` object and use that.
- If no `env.ts` exists near the code that needs secrets, create one before using secrets.
- The `env.ts` file is the visible contract for which secrets exist and which need to be added.
- Do not run mutating Doppler commands.
- For tests or scripts that already wrap Doppler, use the package script rather than invoking Doppler directly.

## Long Strings

- Use `string-dedent` for long strings created inside functions.
- Import it as:

```ts
import dedent from "string-dedent";
```

- Template strings passed to `dedent` must start and end with a newline:

```ts
const content: string = dedent`
  some content
`;
```

- When creating code snippets, alias `dedent` to a syntax name for editor highlighting:

```ts
const html = dedent;
const javascript = dedent;
```

## Testing

- Respect the current repository testing strategy and existing test suite.
- Do not add new unit tests by default.
- When tests are needed, prefer integration, end-to-end, or smoke tests that validate real behavior.
- Use unit tests only rarely, mainly for stable datasets or pure data transformations.
- Never add unit tests just to increase coverage numbers.
- Avoid mocks when real calls are practical.
- It is usually better to spend a little money on real API or service calls than to maintain fragile mock-based coverage.
- Add only the minimum test coverage needed for the requested change.
- Never test React components or React hooks.
- Put as much logic as possible in React-independent functions and test those only when needed.
- Prefer `toMatchInlineSnapshot()` for complex non-obvious output; leave snapshots empty first, run the update command, then read the updated test file.
- Never write inline snapshot content manually.
- Use `vitest` or `bun test` from the current package directory.
- Always pass `--run` to `vitest` or test scripts that would otherwise watch forever.
- Do not use expect or assertion timeouts longer than 5 seconds unless required.
- Test timeouts may be increased up to 1 minute only when required.
- Do not create placeholder tests that test nothing.
- Use `describe` and `test`; avoid lifecycle hooks unless strictly required.
- Never use mocks when real calls are practical.
- Do not write tests that call Prisma, mutate databases, or send emails unless explicitly asked.

## Codex Workflow

- Inspect the repository before editing.
- Read active `AGENTS.md` files before making assumptions.
- Keep changes minimal and directly related to the current request.
- Match the existing repository style even when it differs from personal preference.
- Do not revert unrelated changes.
- Prefer `rg` for code search.
- Use non-interactive commands with flags.
- Always use non-interactive git diff: `git --no-pager diff` or `git diff | cat`.
- Run relevant tests or validation commands after code changes when the project already defines them.
- Never start the development server with `pnpm dev` yourself.
- For TypeScript code changes, run the package typecheck script when it exists. If no typecheck script exists, run the package TypeScript compiler.

## GitHub Repository Access

- When listing, searching, or reading GitHub repository files, use GitChamber.
- Before using GitChamber in a session, read its usage docs:

```sh
curl -fs https://gitchamber.com
```

- Always use `curl` for GitChamber responses.
- Prefer GitChamber over `raw.github.com`, GitHub web pages, or generic web search for repository files.
- GitChamber base URL format:

```text
https://gitchamber.com/repos/{owner}/{repo}/{branch}/
```

- List files:

```text
https://gitchamber.com/repos/facebook/react/main/files
```

- Search files:

```text
https://gitchamber.com/repos/facebook/react/main/search/useState
```

- Read file lines:

```text
https://gitchamber.com/repos/facebook/react/main/files/README.md?start=10&end=50
```

- Use `limit`, `offset`, `start`, and `end` pagination to control context.
- Use custom `glob` filters only when necessary and keep the same `glob` across list, read, and search operations for a repository.

## AI SDK

- Use the Vercel AI SDK, npm package `ai`, for all LLM interactions.
- Never use the OpenAI SDK or provider-specific SDKs directly.
- Before AI SDK work in a session, fetch the latest AI SDK docs through GitChamber:

```sh
curl -fs "https://gitchamber.com/repos/vercel/ai/main/files"
```

- Use GitChamber to read the relevant AI SDK markdown docs with `curl`.
- Prefer `streamText` over `generateText`.
- Use `generateText` only when the model is small/fast and the code does not need streaming tokens or preview output.
- Prefer streaming structured output over non-streamed structured output when the UI benefits from progressive updates.
- Keep provider/model configuration centralized and typed.

## React

- Hooks, including every function starting with `use`, must only be called in component render scope.
- Hooks must never be called inside closures, event handlers, conditionals, or loops.
- Put all hooks at the start of component functions.
- Put longer hooks later within the hook section.
- Put non-hook logic after the hook section.
- Avoid `useEffect` unless strictly necessary.
- Before adding `useEffect`, reason carefully whether the logic can live in the event/server function that changes the dependency instead.
- Minimize `useState`.
- If state can be derived from existing state, loader data, params, store data, or local variables, compute it during render.
- Avoid `useCallback` except for ref props that require memoized functions.
- Never pass functions to `useEffect` or `useMemo` dependency arrays.
- Do not add custom hooks unless explicitly asked.
- Prefer generic React-independent functions over custom hooks.
- Do not treat render-local state as truthful when sending server requests. For global state, read the latest value with `useStore.getState()`.
- `useLoaderData`, `useRouteLoaderData`, and `useParams` values are acceptable server-call inputs.
- When using `useRef` with a generic type, pass `undefined`: `useRef<number>(undefined)`.
- When using `&&` in JSX, ensure the left side cannot render `0`; wrap numeric checks with `Boolean(...)`.

## Components And State

- Current repo caveat: this repo currently uses root `components/`, `components/ui/`, `lib/`, and `hooks/`. Follow the existing structure unless the repo is migrated to `src/`.
- If a `src/` structure exists, place new components in `src/components`.
- Put shadcn components in `src/components/ui` or the repo's configured shadcn `ui` alias.
- Do not hand-write new shadcn components. Use the local/global `shadcn` CLI.
- Before creating buttons, tooltips, scroll areas, or similar UI, inspect existing `components/ui` and `components`.
- Component filenames must be kebab case.
- Do not create a new component file for code used by only one component or route. Colocate it in the same file.
- Put non-component code in `lib` or `src/lib`, matching the repo structure.
- Do not create new hook files. If hooks are explicitly requested, use the existing hook convention for the repo.
- Zustand is the preferred global React state solution when global state is needed.
- Do not add Zustand setter methods like `setVariable` to state types. Use `useStore.setState(...)` directly.
- Zustand already merges partial state. Do not spread `getInitialState()` into every update unless resetting state.
- Minimize props. Prefer route data or global state for deeply nested data when appropriate.

## Uncontrolled Inputs

- Do not track uncontrolled component state in React unless the value must render live.
- Use `defaultValue` or `initialValue` to set initial uncontrolled values.
- Read uncontrolled values from refs in event handlers.
- Programmatically assign uncontrolled values through refs when needed.
- Do not add `useEffect` just to synchronize uncontrolled input values with React state.

## Styling

- Always use Tailwind for styling.
- This project uses Tailwind v4. It does not use `tailwind.config.js`; configuration lives in CSS files.
- If Tailwind v4 behavior is unclear, read:

```sh
curl -fs https://tailwindcss.com/docs/upgrade-guide
```

- Prefer shadcn theme colors over Tailwind default colors.
- Prefer simple `flex`, `grid`, and `gap` layouts.
- Avoid margins for internal spacing; use flex gaps, grid gaps, or explicit spacer elements.
- Prefer `flex flex-col gap-3` over `space-y-3`, and the same pattern in the x direction.
- Prefer `grow` over `flex-1`.
- Keep breakpoints simple.
- Use spacing scale multiples of 4 when practical for margin, padding, gaps, widths, and heights.
- Prefer `size-4` over `w-4 h-4`.
- Use `cn("class-1", condition && "class-2")` to join classes.
- Do not use template string class assembly when `cn(...)` works.
- Icons must come from `@heroicons/react` when available.
- Import Heroicons with names ending in `Icon`, for example `ShieldExclamationIcon`.

## TypeScript

- Always use normal static imports instead of dynamic imports unless an ESM/CommonJS boundary forces otherwise.
- Never use `require`.
- Never use `any`. If tempted to use `any`, inspect available types and `.d.ts` files first.
- Never write `(x as any).field` or `'field' in x` before checking whether the code compiles without it.
- Use a single object argument for new functions that accept more than one argument.
- Always add block bodies to arrow functions.
- Prefer `.map`, `.filter`, `.reduce`, and `.flatMap` over `.forEach` and `for...of` loops.
- Always specify the type when creating arrays, especially empty arrays.
- Use a guarded helper like `isTruthy` instead of `.filter(Boolean)` when TypeScript needs narrowing.
- Use early returns. Avoid unnecessary `else` blocks and deep nesting.
- Do not declare uninitialized variables that are assigned later in flow. Use a typed IIFE instead.
- Prefer `new URL(path, baseUrl).toString()` for URLs instead of string interpolation.
- For Node built-ins, import the module namespace, not named exports: `import fs from "node:fs"`.
- Never pass a string to `AbortController.abort()`. Pass an `Error` instance as the reason.
- If an `Error` must be wrapped, use `{ cause }` instead of interpolating the error into the message.
- Do not add getters or setters for simple private fields. Make the field public when direct access is fine.
- Do not add new `tsconfig` path aliases to share workspace package code. Add a workspace dependency instead.
- Prefer configured absolute imports over relative imports. This repo currently has the `@/*` alias.

## Documentation

- Code is the primary documentation; use clear naming, types, and docstrings.
- Keep documentation in docstrings of the functions or classes they describe, not in separate files.
- Use separate docs files only when a concept cannot be expressed clearly in code.
- Never duplicate documentation across files.
- Store knowledge as current state, not as a changelog of modifications.
- Minimize comments when code is self-explanatory.
- Use comments only when requested or when context would otherwise be lost.
- When a detailed research prompt drives non-obvious code, preserve the durable current-state context in short code comments.
- Never write comments that reference old/generated iterations of the code.

## Retryable, Resumable, Idempotent Tasks

- Long-running tasks must be resumable, retryable, idempotent, and single-flight.
- Checkpoint progress frequently with a cursor, step, or event sequence.
- Use deterministic ordering so resume can skip until the last cursor.
- Side effects must be at-least-once safe and deduped by `task_id` plus sequence or event ID.
- Every retry payload must carry resume information explicitly.
- Prevent concurrent execution per `task_id` with a lease or lock with TTL and heartbeat.
- Use deterministic upserts for writes.
- Treat transport, model, and API timeouts as retriable.
- Treat invalid input as terminal.
- Log structured fields: `task_id`, `step`, `cursor`, `retry_count`, and `lease_owner`.
- For AI chat or interactive flows, prefer client-held resume state when model support allows it.
- For background jobs or fixed retry bodies, use server-held task state.

## Vercel CLI

- Use the Vercel CLI to list deployments, inspect build status, and stream runtime logs.
- List deployments with `vercel list`, `vercel list --prod`, or `vercel list --limit 5`.
- Inspect deployments with `vercel inspect <deployment-url-or-id>`.
- Inspect build logs with `vercel inspect <deployment-url-or-id> --logs --wait`.
- Runtime logs stream only new logs from command start; they do not fetch historical logs.
- Use `vercel logs <deployment-url-or-id> --json` for structured runtime log streaming.
- The deprecated `--since`, `--limit`, and `--follow` runtime log options are ignored.
- Use `tmux` for background log streaming when needed.

## Three.js

- For Three.js manual pages, list available docs with:

```sh
curl -Ls "https://gitchamber.com/repos/mrdoob/three.js/dev/files?glob=manual/en/**/*.html"
```

- For Three.js Shading Language, read:

```sh
curl -L https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language.md
```

## Zod

- When creating a complex type from a Prisma table, do not recreate the table structure in a new Zod schema.
- Use `z.any() as ZodType<PrismaTable>` for type safety without duplicating Prisma schema structure.
- For Zod v4 to JSON Schema conversion, use the built-in `toJSONSchema` from `zod`.
- Do not use `zod-to-json-schema`.

## Commits

- Never create a git commit unless explicitly asked.
- Prefer `git merge` over `git squash` whenever possible, unless explicitly asked for squash.
- Uncommitted changes are the user's review state; they read the diff before deciding what to commit.
- Keep changes uncommitted until asked, so the diff stays clean and reviewable.
