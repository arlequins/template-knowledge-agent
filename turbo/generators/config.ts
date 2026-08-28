import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import type { PlopTypes } from "@turbo/gen";

const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

function packageScope() {
  const packageJson = JSON.parse(
    readFileSync("packages/ui/package.json", "utf8"),
  ) as { name: string };
  return packageJson.name.slice(0, packageJson.name.indexOf("/"));
}

function sanitizeName(value: string) {
  const scope = packageScope();
  const name = value.startsWith(`${scope}/`)
    ? value.slice(scope.length + 1)
    : value;
  if (!SLUG_PATTERN.test(name)) {
    throw new Error("Name must be a lowercase kebab-case slug");
  }
  return name;
}

function camelCase(value: string) {
  return value.replace(/-([a-z0-9])/g, (_, character: string) =>
    character.toUpperCase(),
  );
}

function pascalCase(value: string) {
  const camel = camelCase(value);
  return camel[0]?.toUpperCase() + camel.slice(1);
}

function scaffoldActions(kind: "apps" | "packages") {
  const template = kind === "apps" ? "app" : "package";
  return [
    {
      type: "add",
      path: `${kind}/{{ name }}/package.json`,
      templateFile: `templates/${template}/package.json.hbs`,
    },
    {
      type: "add",
      path: `${kind}/{{ name }}/tsconfig.json`,
      templateFile: `templates/${template}/tsconfig.json.hbs`,
    },
    {
      type: "add",
      path: `${kind}/{{ name }}/src/index.ts`,
      templateFile: `templates/${template}/index.ts.hbs`,
    },
    () => {
      execFileSync("pnpm", ["install", "--no-frozen-lockfile"], {
        stdio: "inherit",
      });
      return `${kind === "apps" ? "Application" : "Package"} scaffolded`;
    },
  ];
}

function addDomainToContract(domain: string) {
  const path = "packages/trpc/src/contract.test.ts";
  const source = readFileSync(path, "utf8");
  const match =
    source.match(/expect\(names\)\.toEqual\((\[[\s\S]*?\])\)/) ??
    source.match(/expect\.arrayContaining\((\[[^\]]+\])\)/);
  if (!match?.[1]) throw new Error("Unable to update the tRPC contract test");
  const routers = [...match[1].matchAll(/"([^"]+)"/g)].flatMap((entry) =>
    entry[1] ? [entry[1]] : [],
  );
  const next = [...new Set([...routers, camelCase(domain)])].sort();
  writeFileSync(path, source.replace(match[1], JSON.stringify(next)), "utf8");
}

function exportFeatureFromService(name: string) {
  const path = "packages/service/src/index.ts";
  const pascalName = pascalCase(name);
  const additions = [
    `export type { ${pascalName}Input, ${pascalName}Result } from "./features/${name}/domain";`,
    `export type { ${pascalName}Port } from "./features/${name}/application/ports/${name}-port";`,
    `export type { ${pascalName}Service } from "./features/${name}/application/use-cases/${name}";`,
    `export { create${pascalName}Service } from "./features/${name}/application/use-cases/${name}";`,
  ];
  const source = readFileSync(path, "utf8");
  writeFileSync(path, `${source.trimEnd()}\n${additions.join("\n")}\n`, "utf8");
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setHelper("scope", packageScope);
  plop.setHelper("camelCase", camelCase);
  plop.setHelper("pascalCase", pascalCase);
  plop.setHelper("procedure", (kind: string) =>
    kind === "query" ? "query" : "mutation",
  );

  const namePrompt = {
    type: "input" as const,
    name: "name",
    message: "Name (lowercase kebab-case)",
    filter: sanitizeName,
  };

  plop.setGenerator("app", {
    description: "Generate a TypeScript application workspace",
    prompts: [namePrompt],
    actions: scaffoldActions("apps"),
  });

  plop.setGenerator("package", {
    description: "Generate a compiled TypeScript package workspace",
    prompts: [namePrompt],
    actions: scaffoldActions("packages"),
  });

  plop.setGenerator("domain", {
    description:
      "Compatibility alias: generate a command feature slice (use feature for new work)",
    prompts: [namePrompt],
    actions: [
      ...[
        ["features/{{ name }}/domain.ts", "domain.ts.hbs"],
        [
          "features/{{ name }}/application/ports/{{ name }}-port.ts",
          "port.ts.hbs",
        ],
        [
          "features/{{ name }}/application/use-cases/{{ name }}.ts",
          "usecase.ts.hbs",
        ],
        ["features/{{ name }}/{{ name }}.test.ts", "test.ts.hbs"],
        ["features/{{ name }}/adapters/{{ name }}.ts", "adaptor.ts.hbs"],
        ["features/{{ name }}/composition.ts", "composition.ts.hbs"],
        ["features/{{ name }}/router.ts", "router.ts.hbs"],
      ].map(([path, template]) => ({
        type: "add",
        path:
          path.startsWith("features/{{ name }}/application") ||
          path.startsWith("features/{{ name }}/domain") ||
          path.endsWith("{{ name }}.test.ts")
            ? `packages/service/src/${path}`
            : `packages/trpc/src/${path}`,
        templateFile: `templates/feature/${template}`,
      })),
      {
        type: "modify",
        path: "packages/trpc/src/root.ts",
        pattern: /import \{ createTRPCRouter \} from "\.\/trpc";/,
        template:
          'import { {{ camelCase name }}Router } from "./features/{{ name }}/router";\nimport { createTRPCRouter } from "./trpc";',
      },
      {
        type: "modify",
        path: "packages/trpc/src/root.ts",
        pattern: /export const AppRouter = createTRPCRouter\(\{\n/,
        template:
          "export const AppRouter = createTRPCRouter({\n  {{ camelCase name }}: {{ camelCase name }}Router,\n",
      },
      (answers) => {
        const name = sanitizeName(String(answers.name));
        exportFeatureFromService(name);
        addDomainToContract(name);
        execFileSync("pnpm", ["check:fix"], { stdio: "inherit" });
        execFileSync("pnpm", ["architecture:check"], { stdio: "inherit" });
        return "Domain module scaffolded and registered";
      },
    ],
  });

  plop.setGenerator("feature", {
    description:
      "Generate an independent feature slice with domain, application, adapter, composition, and delivery layers",
    prompts: [
      namePrompt,
      {
        type: "list",
        name: "kind",
        message: "Operation kind",
        choices: ["command", "query"],
        default: "command",
      },
    ],
    actions: [
      ...[
        ["features/{{ name }}/domain.ts", "domain.ts.hbs"],
        [
          "features/{{ name }}/application/ports/{{ name }}-port.ts",
          "port.ts.hbs",
        ],
        [
          "features/{{ name }}/application/use-cases/{{ name }}.ts",
          "usecase.ts.hbs",
        ],
        ["features/{{ name }}/{{ name }}.test.ts", "test.ts.hbs"],
      ].map(([path, template]) => ({
        type: "add",
        path: `packages/service/src/${path}`,
        templateFile: `templates/feature/${template}`,
      })),
      ...[
        ["features/{{ name }}/adapters/{{ name }}.ts", "adaptor.ts.hbs"],
        ["features/{{ name }}/composition.ts", "composition.ts.hbs"],
        ["features/{{ name }}/router.ts", "router.ts.hbs"],
      ].map(([path, template]) => ({
        type: "add",
        path: `packages/trpc/src/${path}`,
        templateFile: `templates/feature/${template}`,
      })),
      {
        type: "modify",
        path: "packages/trpc/src/root.ts",
        pattern: /import \{ createTRPCRouter \} from "\.\/trpc";/,
        template:
          'import { {{ camelCase name }}Router } from "./features/{{ name }}/router";\nimport { createTRPCRouter } from "./trpc";',
      },
      {
        type: "modify",
        path: "packages/trpc/src/root.ts",
        pattern: /export const AppRouter = createTRPCRouter\(\{\n/,
        template:
          "export const AppRouter = createTRPCRouter({\n  {{ camelCase name }}: {{ camelCase name }}Router,\n",
      },
      (answers) => {
        const name = sanitizeName(String(answers.name));
        exportFeatureFromService(name);
        addDomainToContract(name);
        execFileSync("pnpm", ["check:fix"], { stdio: "inherit" });
        execFileSync("pnpm", ["architecture:check"], { stdio: "inherit" });
        return "Feature slice scaffolded, registered, and checked";
      },
    ],
  });
}
