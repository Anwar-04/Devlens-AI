"use client";

import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookText,
  Boxes,
  Braces,
  CheckCircle2,
  Clock3,
  Code2,
  Cog,
  Compass,
  Database,
  File,
  FileCode2,
  FileText,
  Fingerprint,
  Folder,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link,
  ListChecks,
  ListOrdered,
  Loader2,
  Monitor,
  Network,
  PlayCircle,
  Route,
  Rows3,
  Search,
  Send,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TableProperties,
  TestTube2,
  Variable,
  Workflow,
  Wrench,
  XCircle,
} from "lucide-react";

export type DevLensIconTone =
  | "primary"
  | "code"
  | "success"
  | "warning"
  | "danger"
  | "muted";

export const iconToneClasses: Record<
  DevLensIconTone,
  { text: string; soft: string; border: string }
> = {
  primary: {
    text: "text-signal",
    soft: "bg-signal/10",
    border: "border-signal/20",
  },
  code: {
    text: "text-blue-700",
    soft: "bg-blue-50",
    border: "border-blue-200",
  },
  success: {
    text: "text-mint",
    soft: "bg-mint/10",
    border: "border-mint/20",
  },
  warning: {
    text: "text-amber",
    soft: "bg-amber/10",
    border: "border-amber/20",
  },
  danger: {
    text: "text-red-700",
    soft: "bg-red-50",
    border: "border-red-200",
  },
  muted: {
    text: "text-graphite",
    soft: "bg-cloud",
    border: "border-line",
  },
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function DevLensIcon({
  icon: Icon,
  tone = "muted",
  size = 16,
  framed = false,
  className,
  label,
}: {
  icon: LucideIcon;
  tone?: DevLensIconTone;
  size?: number;
  framed?: boolean;
  className?: string;
  label?: string;
}) {
  const toneClasses = iconToneClasses[tone];
  const icon = (
    <Icon
      size={size}
      strokeWidth={2}
      aria-hidden={label ? undefined : true}
      className={joinClasses("shrink-0", framed ? toneClasses.text : "", className)}
    />
  );

  if (!framed) return icon;

  return (
    <span
      aria-label={label}
      className={joinClasses(
        "grid shrink-0 place-items-center rounded-md border",
        size <= 14 ? "h-7 w-7" : "h-8 w-8",
        toneClasses.soft,
        toneClasses.border,
        toneClasses.text,
      )}
    >
      {icon}
    </span>
  );
}

export const devlensIcons = {
  product: {
    assistant: Sparkles,
    repository: GitPullRequest,
    branch: GitBranch,
    guide: BookOpen,
    files: FileCode2,
    search: Search,
    walkthrough: Compass,
    citations: FileText,
    send: Send,
  },
  engineering: {
    architecture: Network,
    route: Route,
    controller: Braces,
    service: Cog,
    workflow: Workflow,
    middleware: Layers,
    middlewareSecurity: Shield,
    database: Database,
    model: TableProperties,
    schema: Rows3,
    validation: ShieldCheck,
    authentication: Fingerprint,
    configuration: SlidersHorizontal,
    entryPoint: PlayCircle,
    tests: TestTube2,
    function: Braces,
    class: Boxes,
    variable: Variable,
    reference: Link,
    api: Route,
    ui: Monitor,
    components: LayoutDashboard,
    package: Boxes,
    tools: Wrench,
  },
  guide: {
    overview: BookOpen,
    purpose: Compass,
    readingPath: ListOrdered,
    architecture: Network,
    features: CheckCircle2,
    modules: Boxes,
  },
  metrics: {
    repository: GitPullRequest,
    languages: Code2,
    frameworks: Boxes,
    files: FolderOpen,
    complexity: BarChart3,
    onboarding: Clock3,
  },
  status: {
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
    notice: AlertCircle,
    loading: Loader2,
    pending: Clock3,
    progress: ListChecks,
  },
  fileTree: {
    folder: Folder,
    folderOpen: FolderOpen,
    file: File,
    code: FileCode2,
    markdown: FileText,
    readme: BookText,
    json: Braces,
    env: KeyRound,
    sql: Database,
    tests: TestTube2,
    config: SlidersHorizontal,
    routes: Route,
    controllers: Braces,
    services: Cog,
    middleware: Shield,
    models: TableProperties,
    database: Database,
    validation: ShieldCheck,
    docs: BookOpen,
    views: LayoutDashboard,
  },
} as const;

export type ExplorerIconMeta = {
  icon: LucideIcon;
  tone: DevLensIconTone;
  label: string;
};

export function getExplorerIconMeta(
  path: string,
  kind: "file" | "folder",
): ExplorerIconMeta {
  const name = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase();
  const normalized = path.toLowerCase();

  if (kind === "folder") {
    if (/routes?|routers?/.test(name)) {
      return { icon: devlensIcons.fileTree.routes, tone: "code", label: "Routes folder" };
    }
    if (/controllers?/.test(name)) {
      return { icon: devlensIcons.fileTree.controllers, tone: "code", label: "Controllers folder" };
    }
    if (/services?/.test(name)) {
      return { icon: devlensIcons.fileTree.services, tone: "code", label: "Services folder" };
    }
    if (/middlewares?/.test(name)) {
      return { icon: devlensIcons.fileTree.middleware, tone: "warning", label: "Middleware folder" };
    }
    if (/models?|schemas?/.test(name)) {
      return { icon: devlensIcons.fileTree.models, tone: "code", label: "Model or schema folder" };
    }
    if (/db|database|prisma|drizzle|migrations?/.test(name)) {
      return { icon: devlensIcons.fileTree.database, tone: "code", label: "Database folder" };
    }
    if (/validators?|validation/.test(name)) {
      return { icon: devlensIcons.fileTree.validation, tone: "success", label: "Validation folder" };
    }
    if (/config|settings/.test(name)) {
      return { icon: devlensIcons.fileTree.config, tone: "warning", label: "Configuration folder" };
    }
    if (/tests?|__tests__|specs?/.test(name)) {
      return { icon: devlensIcons.fileTree.tests, tone: "success", label: "Tests folder" };
    }
    if (/docs?|documentation/.test(name)) {
      return { icon: devlensIcons.fileTree.docs, tone: "primary", label: "Documentation folder" };
    }
    if (/views?|components?|ui|pages?/.test(name)) {
      return { icon: devlensIcons.fileTree.views, tone: "primary", label: "UI folder" };
    }
    return { icon: devlensIcons.fileTree.folder, tone: "warning", label: "Folder" };
  }

  if (name === "readme.md") {
    return { icon: devlensIcons.fileTree.readme, tone: "primary", label: "README" };
  }
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(name)) {
    return { icon: devlensIcons.fileTree.tests, tone: "success", label: "Test file" };
  }
  if (/route|router/.test(normalized)) {
    return { icon: devlensIcons.fileTree.routes, tone: "code", label: "Route file" };
  }
  if (/controller/.test(normalized)) {
    return { icon: devlensIcons.fileTree.controllers, tone: "code", label: "Controller file" };
  }
  if (/service/.test(normalized)) {
    return { icon: devlensIcons.fileTree.services, tone: "code", label: "Service file" };
  }
  if (/middleware/.test(normalized)) {
    return { icon: devlensIcons.fileTree.middleware, tone: "warning", label: "Middleware file" };
  }
  if (/validator|validation/.test(normalized)) {
    return { icon: devlensIcons.fileTree.validation, tone: "success", label: "Validation file" };
  }
  if (/model|schema/.test(normalized)) {
    return { icon: devlensIcons.fileTree.models, tone: "code", label: "Model or schema file" };
  }
  if (/\.(sql)$/.test(name) || /db|database|prisma|drizzle/.test(normalized)) {
    return { icon: devlensIcons.fileTree.database, tone: "code", label: "Database file" };
  }
  if (name.includes(".env")) {
    return { icon: devlensIcons.fileTree.env, tone: "danger", label: "Environment file" };
  }
  if (/config|rc$|\.config\./.test(normalized)) {
    return { icon: devlensIcons.fileTree.config, tone: "warning", label: "Configuration file" };
  }
  if (/\.(tsx?|jsx?)$/.test(name)) {
    return { icon: devlensIcons.fileTree.code, tone: "code", label: "Code file" };
  }
  if (name.endsWith(".json")) {
    return { icon: devlensIcons.fileTree.json, tone: "success", label: "JSON file" };
  }
  if (name.endsWith(".md") || name.endsWith(".mdx")) {
    return { icon: devlensIcons.fileTree.markdown, tone: "muted", label: "Markdown file" };
  }
  return { icon: devlensIcons.fileTree.file, tone: "muted", label: "File" };
}

