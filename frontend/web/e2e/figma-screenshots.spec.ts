import { type Page, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

type Theme = "light" | "dark";
type ScreenshotTarget = {
  name: string;
  route: string;
  authenticated?: boolean;
};

const outputDir = path.resolve(process.cwd(), "../../artifacts/figma-screenshots");
const timestamp = "2026-06-08T12:00:00.000Z";
const screenshotTargets: ScreenshotTarget[] = [
  { name: "public-landing", route: "/", authenticated: false },
  { name: "public-demo-join", route: "/demo?mock=1", authenticated: false },
  { name: "public-retro-board", route: "/r/demo-retro?mock=1", authenticated: false },
  { name: "cms-login", route: "/cms", authenticated: false },
  { name: "cms-overview", route: "/cms" },
  { name: "cms-sessions", route: "/cms/sessions" },
  { name: "cms-users", route: "/cms/users" },
  { name: "cms-tokens", route: "/cms/tokens" },
  { name: "cms-events", route: "/cms/events" },
  { name: "cms-planner-list", route: "/cms/planner" },
  { name: "cms-planner-new", route: "/cms/planner/new" },
  { name: "cms-retro-list", route: "/cms/retro" },
  { name: "cms-retro-new", route: "/cms/retro/new" },
  { name: "cms-access-roles", route: "/cms/access/roles" },
  { name: "cms-access-role-new", route: "/cms/access/roles/new" },
  { name: "cms-access-users", route: "/cms/access/users" },
  { name: "cms-access-user-new", route: "/cms/access/users/new" },
  { name: "cms-access-permissions", route: "/cms/access/permissions" },
  { name: "cms-access-teams", route: "/cms/access/teams" },
];

const responsiveViewports = [
  { key: "1280", width: 1280, height: 1000 },
  { key: "768", width: 768, height: 1100 },
  { key: "390", width: 390, height: 900 },
];

const teams = [
  {
    id: 1,
    slug: "igaming-rip",
    name: "iGaming RIP",
    description: "Основная продуктовая команда",
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: 2,
    slug: "platform",
    name: "Platform Core",
    description: "Платформа и интеграции",
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
  },
];

const permissions = [
  "cms.overview.view",
  "cms.sessions.view",
  "cms.users.view",
  "cms.tokens.view",
  "cms.events.view",
  "cms.access.view",
  "cms.access.manage",
  "cms.tasks.manage",
  "app.sessions.manage",
  "cms.planner.view",
  "cms.retro.view",
  "cms.retro.manage",
  "cms.retro.analyze",
];

const pages = [
  { key: "overview", label: "Сводка", path: "/cms", permission_key: "cms.overview.view", sort_order: 10 },
  { key: "planner", label: "Калькулятор", path: "/cms/planner", permission_key: "cms.planner.view", sort_order: 20 },
  { key: "sessions", label: "Сессии", path: "/cms/sessions", permission_key: "cms.sessions.view", sort_order: 30 },
  { key: "retro", label: "Ретро", path: "/cms/retro", permission_key: "cms.retro.view", sort_order: 40 },
  { key: "users", label: "Участники", path: "/cms/users", permission_key: "cms.users.view", sort_order: 50 },
  { key: "tokens", label: "Invite-ссылки", path: "/cms/tokens", permission_key: "cms.tokens.view", sort_order: 60 },
  { key: "events", label: "Журнал", path: "/cms/events", permission_key: "cms.events.view", sort_order: 70 },
  { key: "access", label: "Доступы", path: "/cms/access", permission_key: "cms.access.view", sort_order: 80 },
];

const principal = {
  id: 1,
  username: "admin",
  display_name: "Павел",
  is_superuser: true,
  permissions,
  pages,
  roles: [{ id: 1, key: "superadmin", name: "Super Admin", is_system: true }],
  teams,
  team_ids: teams.map((team) => team.id),
  theme_preference: "dark",
};

const roles = [
  {
    id: 1,
    key: "superadmin",
    name: "Super Admin",
    description: "Полный доступ ко всем разделам CMS",
    is_system: true,
    created_at: timestamp,
    updated_at: timestamp,
    permission_keys: permissions,
  },
  {
    id: 2,
    key: "facilitator",
    name: "Фасилитатор",
    description: "Управляет planning sessions и ретро своей команды",
    is_system: false,
    created_at: timestamp,
    updated_at: timestamp,
    permission_keys: ["cms.sessions.view", "app.sessions.manage", "cms.retro.view", "cms.retro.manage"],
  },
];

const admins = [
  {
    id: 1,
    username: "admin",
    display_name: "Павел",
    is_active: true,
    is_superuser: true,
    created_at: timestamp,
    updated_at: timestamp,
    last_login_at: timestamp,
    roles: [{ id: 1, key: "superadmin", name: "Super Admin", is_system: true }],
    teams,
    team_ids: [1, 2],
  },
  {
    id: 2,
    username: "lead.igaming",
    display_name: "Лид iGaming",
    is_active: true,
    is_superuser: false,
    created_at: timestamp,
    updated_at: timestamp,
    last_login_at: timestamp,
    roles: [{ id: 2, key: "facilitator", name: "Фасилитатор", is_system: false }],
    teams: [teams[0]],
    team_ids: [1],
  },
];

const sessions = [
  {
    id: 101,
    session_key: "igaming-rip-sprint-42",
    title: "iGaming RIP · Sprint 42 Planning",
    team_id: 1,
    team: { id: 1, slug: "igaming-rip", name: "iGaming RIP" },
    chat_id: 100101,
    topic_id: null,
    current_task_id: "PP-1488",
    tasks_version: 8,
    participants_count: 9,
    tasks_queue_count: 12,
    history_count: 18,
    last_batch_count: 5,
    total_tasks: 30,
    total_votes: 74,
    batch_completed: false,
    is_active: true,
    current_batch_id: "batch-42",
    current_batch_started_at: timestamp,
    updated_at: timestamp,
  },
  {
    id: 102,
    session_key: "legacy-session",
    title: "Legacy shared planning",
    team_id: null,
    team: null,
    chat_id: 100102,
    topic_id: null,
    current_task_id: null,
    tasks_version: 3,
    participants_count: 5,
    tasks_queue_count: 0,
    history_count: 11,
    last_batch_count: 0,
    total_tasks: 11,
    total_votes: 36,
    batch_completed: true,
    is_active: false,
    current_batch_id: null,
    current_batch_started_at: null,
    updated_at: timestamp,
  },
];

const sprintPayload = {
  working_days: 10,
  average_capacity: 0,
  buffer_percent: 20,
  tracks: [
    { id: "backend", label: "Backend" },
    { id: "frontend", label: "Frontend" },
    { id: "qa", label: "QA" },
  ],
  velocity_history: [
    { label: "Sprint 39", by_track: { backend: 34, frontend: 29, qa: 18 } },
    { label: "Sprint 40", by_track: { backend: 38, frontend: 31, qa: 20 } },
    { label: "Sprint 41", by_track: { backend: 35, frontend: 33, qa: 19 } },
  ],
  roles: [
    { name: "Backend", headcount: 3, absences: 1, track_id: "backend" },
    { name: "Frontend", headcount: 2, absences: 0, track_id: "frontend" },
    { name: "QA", headcount: 2, absences: 1, track_id: "qa" },
  ],
  actual_by_track: { backend: 36, frontend: 32, qa: 19 },
  notes: "Фикстура для Figma export",
  result_summary: "Рекомендация: 87 SP",
};

const sprintPlans = [
  {
    id: 401,
    name: "iGaming RIP · Sprint 42",
    payload: sprintPayload,
    team_id: 1,
    team: { id: 1, slug: "igaming-rip", name: "iGaming RIP" },
    created_by: 1,
    created_by_username: "admin",
    created_by_display_name: "Павел",
    created_at: timestamp,
    updated_at: timestamp,
  },
];

const retroConfig = {
  sections: [
    { section_id: "went-well", title: "Что прошло хорошо" },
    { section_id: "improve", title: "Что улучшить" },
    { section_id: "actions", title: "Идеи и действия" },
  ],
  votes_per_person: 5,
  default_section_seconds: 300,
};

const retros = [
  {
    id: 501,
    title: "iGaming RIP · Sprint 41 Retro",
    status: "live",
    team_id: 1,
    team: { id: 1, slug: "igaming-rip", name: "iGaming RIP" },
    config: retroConfig,
    snapshot: null,
    ai_summary: {
      mood: "positive",
      severity: "medium",
      highlights: ["Команда быстро закрыла критичный релиз", "QA подключились раньше обычного"],
      risks: ["Много ручной регрессии перед релизом"],
      actions: ["Автоматизировать smoke для платежного флоу"],
      summary: "Команда в хорошем тонусе, основной риск — ручная регрессия.",
    },
    created_by: 1,
    created_by_username: "admin",
    created_by_display_name: "Павел",
    created_at: timestamp,
    updated_at: timestamp,
  },
];

const liveRetro = {
  phase: "collecting",
  active_section_id: "improve",
  cards: [
    { id: "c1", section_id: "went-well", text: "Быстро договорились по скоупу", author: "Аня", votes: 3 },
    { id: "c2", section_id: "improve", text: "Слишком поздно нашли проблему в интеграции", author: "Игорь", votes: 5 },
    { id: "c3", section_id: "actions", text: "Добавить checklist для релизов", author: "Мария", votes: 2 },
  ],
  groups: [],
  action_items: [{ id: "a1", text: "Собрать release checklist", assignee: "Мария" }],
  participants: 8,
  updated_at: timestamp,
};

const participants = [
  { user_id: "11", name: "Анна", role: "PM", is_web: true, first_seen_at: timestamp, last_seen_at: timestamp },
  { user_id: "12", name: "Игорь", role: "Backend", is_web: true, first_seen_at: timestamp, last_seen_at: timestamp },
  { user_id: "13", name: "Мария", role: "QA", is_web: false, first_seen_at: timestamp, last_seen_at: timestamp },
];

const auditEvents = [
  {
    id: 1,
    actor: "admin",
    action: "cms.team.create",
    status: "ok",
    detail: { team_id: 1, name: "iGaming RIP" },
    ip: "127.0.0.1",
    created_at: timestamp,
  },
  {
    id: 2,
    actor: "lead.igaming",
    action: "cms.session.close",
    status: "ok",
    detail: { session_id: 101 },
    ip: "127.0.0.1",
    created_at: timestamp,
  },
];

function pageResult<T>(items: T[]) {
  return { items, next_cursor: null, limit: 50 };
}

async function installTheme(page: Page, theme: Theme, authenticated = true) {
  await page.addInitScript(
    ({ nextTheme, auth }) => {
      window.localStorage.setItem("pp_theme", nextTheme);
      if (auth) {
        window.localStorage.setItem("planning_poker_cms_auth", "1");
      } else {
        window.localStorage.removeItem("planning_poker_cms_auth");
      }
      document.documentElement.setAttribute("data-theme", nextTheme);
      document.documentElement.style.colorScheme = nextTheme;
    },
    { nextTheme: theme, auth: authenticated },
  );
}

async function mockCms(page: Page, theme: Theme) {
  await page.route("**/api/v1/cms/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname.replace("/api/v1/cms", "");
    const method = request.method();
    const fulfill = (json: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });

    if (pathname === "/auth/me" && method === "GET") return fulfill({ ...principal, theme_preference: theme });
    if (pathname === "/auth/login" && method === "POST") return fulfill({ ok: true, expires_in: 86_400 });
    if (pathname === "/auth/logout" && method === "POST") return fulfill({ ok: true });
    if (pathname === "/auth/me/preferences" && method === "PATCH") return fulfill({ ok: true });
    if (pathname === "/overview") {
      return fulfill({
        total_sprint_plans: 7,
        total_sessions: 24,
        active_sessions: 3,
        total_retros: 9,
        live_retros: 1,
        total_votes: 428,
        total_tasks: 136,
        total_users: 57,
        web_users: 42,
        active_web_tokens: 6,
        total_web_tokens: 18,
        votes_rows: 428,
      });
    }
    if (pathname === "/teams") return fulfill(pageResult(teams));
    if (pathname === "/sessions") return fulfill(pageResult(sessions));
    if (/^\/sessions\/\d+$/.test(pathname)) return fulfill({ ...sessions[0], raw: {} });
    if (/^\/sessions\/\d+\/participants$/.test(pathname)) return fulfill(pageResult(participants));
    if (/^\/sessions\/\d+\/tasks$/.test(pathname)) {
      return fulfill(pageResult([
        { id: 1, session_id: 101, task_uid: "PP-1488", bucket: "queue", bucket_index: 0, jira_key: "PP-1488", summary: "Payment routing revamp", url: null, story_points: 8, source: "jira", votes_count: 6, numeric_avg: 7.5, numeric_max: 8, completed_at: null, updated_at: timestamp },
        { id: 2, session_id: 101, task_uid: "PP-1490", bucket: "history", bucket_index: 1, jira_key: "PP-1490", summary: "Bonus rules cleanup", url: null, story_points: 5, source: "jira", votes_count: 7, numeric_avg: 5, numeric_max: 8, completed_at: timestamp, updated_at: timestamp },
      ]));
    }
    if (pathname === "/users") return fulfill(pageResult(participants));
    if (pathname === "/web-tokens") {
      return fulfill(pageResult([
        { id: 1, token_prefix: "abc123", token_hash: "hash", chat_id: 100101, topic_id: null, session_key: "igaming-rip-sprint-42", participants_joined: 8, created_at: timestamp, expires_at: "2026-06-15T12:00:00.000Z", last_seen_at: timestamp, is_active: true },
        { id: 2, token_prefix: "old456", token_hash: "hash2", chat_id: 100102, topic_id: null, session_key: "legacy-session", participants_joined: 4, created_at: timestamp, expires_at: "2026-06-01T12:00:00.000Z", last_seen_at: timestamp, is_active: false },
      ]));
    }
    if (pathname === "/events") return fulfill(pageResult(auditEvents));
    if (pathname === "/access/permissions") {
      return fulfill({ items: permissions.map((key) => ({ key, label: key, description: `Право ${key}` })) });
    }
    if (pathname === "/access/pages") return fulfill({ items: pages });
    if (pathname === "/access/roles") return fulfill({ items: roles });
    if (pathname === "/access/admins") return fulfill(pageResult(admins));
    if (pathname === "/sprint-plans") return fulfill({ items: sprintPlans });
    if (pathname === "/sprint-plans/401") return fulfill(sprintPlans[0]);
    if (pathname === "/retros") return fulfill({ items: retros });
    if (pathname === "/retros/501") return fulfill({ ...retros[0], live: liveRetro });

    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, items: [] }) });
  });
}

async function capture(page: Page, theme: Theme, name: string, route: string, authenticated = true) {
  await installTheme(page, theme, authenticated);
  await mockCms(page, theme);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(outputDir, theme, `${name}.png`), fullPage: true });
}

async function captureResponsive(page: Page, theme: Theme, target: ScreenshotTarget, viewport: { key: string; width: number; height: number }) {
  await installTheme(page, theme, target.authenticated !== false);
  await mockCms(page, theme);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(target.route);
  await page.waitForLoadState("networkidle");
  const filePath = path.join(outputDir, theme, `viewport-${viewport.key}`, `${target.name}.png`);
  mkdirSync(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true });
}

async function captureButtonStates(page: Page, theme: Theme) {
  await installTheme(page, theme, false);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.setContent(`
    <main class="min-h-screen-mobile app-gradient-bg p-10 text-ink">
      <section class="mx-auto max-w-5xl rounded-lg border border-line bg-surface p-6 shadow-card">
        <h1 class="text-3xl font-bold text-ink">Button states · ${theme}</h1>
        <p class="mt-2 text-sm text-ink3">Состояния для переноса в Figma: default, hover, active, focus, disabled, loading.</p>
        <div class="mt-8 grid gap-6">
          ${["primary", "secondary", "ghost", "danger", "success"].map((variant) => buttonRow(variant)).join("")}
        </div>
      </section>
    </main>
  `);
  await page.screenshot({ path: path.join(outputDir, theme, "ui-button-states.png"), fullPage: true });
}

function buttonRow(variant: string) {
  const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold leading-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";
  const variants: Record<string, string> = {
    primary: "border-blue bg-blue text-white",
    secondary: "border-line bg-surface text-ink2",
    ghost: "border-transparent bg-transparent text-ink3",
    danger: "border-red/20 bg-red/5 text-red",
    success: "border-green/30 bg-green/10 text-green",
  };
  const hover: Record<string, string> = {
    primary: "border-blue bg-blue2 text-white",
    secondary: "border-ink4 bg-line2 text-ink2",
    ghost: "border-transparent bg-line2 text-ink",
    danger: "border-red/20 bg-red/10 text-red",
    success: "border-green/30 bg-green/15 text-green",
  };
  return `
    <div class="grid grid-cols-[140px_repeat(6,minmax(0,1fr))] items-center gap-3">
      <div class="text-sm font-bold text-ink">${variant}</div>
      <button class="${base} ${variants[variant]}">Default</button>
      <button class="${base} ${hover[variant]}">Hover</button>
      <button class="${base} ${hover[variant]} scale-[0.98]">Active</button>
      <button class="${base} ${variants[variant]} ring-2 ring-blue/30 ring-offset-2 ring-offset-canvas">Focus</button>
      <button class="${base} ${variants[variant]} pointer-events-none cursor-not-allowed opacity-45">Disabled</button>
      <button class="${base} ${variants[variant]} pointer-events-none cursor-not-allowed opacity-80" aria-busy="true">
        <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
        Loading
      </button>
    </div>
  `;
}

async function captureStateBoard(page: Page, theme: Theme, name: string, title: string, body: string) {
  await installTheme(page, theme, false);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  await page.setContent(`
    <main class="min-h-screen-mobile app-gradient-bg p-10 text-ink">
      <section class="mx-auto max-w-5xl rounded-lg border border-line bg-surface p-6 shadow-card">
        <p class="text-xs font-semibold uppercase tracking-wide text-ink3">Figma state reference · ${theme}</p>
        <h1 class="mt-2 text-3xl font-bold text-ink">${title}</h1>
        <div class="mt-8">${body}</div>
      </section>
    </main>
  `);
  await page.screenshot({ path: path.join(outputDir, theme, `${name}.png`), fullPage: true });
}

async function captureUiStates(page: Page, theme: Theme) {
  await captureStateBoard(
    page,
    theme,
    "ui-state-loading",
    "Loading states",
    `
      <div class="grid gap-5">
        <div class="rounded-lg border border-line bg-canvas/40 p-4">
          <div class="h-4 w-48 animate-[skeleton-shimmer_1.2s_ease-in-out_infinite] rounded bg-line2"></div>
          <div class="mt-4 grid grid-cols-4 gap-3">
            <div class="h-24 rounded-lg bg-line2"></div>
            <div class="h-24 rounded-lg bg-line2"></div>
            <div class="h-24 rounded-lg bg-line2"></div>
            <div class="h-24 rounded-lg bg-line2"></div>
          </div>
        </div>
        <div class="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
          <span class="h-5 w-5 animate-spin rounded-full border-2 border-blue border-t-transparent"></span>
          <span class="font-semibold text-ink">Загружаем данные CMS</span>
        </div>
      </div>
    `,
  );
  await captureStateBoard(
    page,
    theme,
    "ui-state-empty",
    "Empty states",
    `
      <div class="rounded-lg border border-dashed border-line bg-canvas/40 p-10 text-center">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-line2 text-2xl">∅</div>
        <h2 class="mt-4 text-xl font-bold text-ink">Пока нет ретроспектив</h2>
        <p class="mx-auto mt-2 max-w-md text-sm text-ink3">Создайте первое ретро — настройте секции и пригласите команду.</p>
        <button class="mt-5 inline-flex min-h-11 items-center rounded-lg border border-blue bg-blue px-4 text-sm font-semibold text-white">Создать ретро</button>
      </div>
    `,
  );
  await captureStateBoard(
    page,
    theme,
    "ui-state-error",
    "Error states",
    `
      <div class="grid gap-4">
        <div class="rounded-lg border border-red/30 bg-red/10 p-4 text-red">
          <h2 class="font-bold">Не удалось загрузить данные</h2>
          <p class="mt-1 text-sm">HTTP 500. Попробуйте обновить страницу или проверьте логи voting-service.</p>
        </div>
        <label class="block space-y-1.5">
          <span class="text-sm font-semibold text-ink3">Название команды</span>
          <input class="min-h-11 w-full rounded-lg border border-red bg-surface px-3 py-2.5 text-ink outline-none ring-2 ring-red/20" value="" placeholder="iGaming RIP" />
          <span class="text-xs font-medium text-red">Название обязательно</span>
        </label>
      </div>
    `,
  );
  await captureStateBoard(
    page,
    theme,
    "ui-state-modal",
    "Modal state",
    `
      <div class="relative min-h-[520px] overflow-hidden rounded-lg border border-line bg-canvas/60 p-8">
        <div class="grid grid-cols-3 gap-4 opacity-35">
          <div class="h-36 rounded-lg bg-line2"></div><div class="h-36 rounded-lg bg-line2"></div><div class="h-36 rounded-lg bg-line2"></div>
          <div class="h-36 rounded-lg bg-line2"></div><div class="h-36 rounded-lg bg-line2"></div><div class="h-36 rounded-lg bg-line2"></div>
        </div>
        <div class="absolute inset-0 flex items-center justify-center bg-black/45 p-6">
          <div class="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-card">
            <h2 class="text-lg font-bold text-ink">Удалить ретро?</h2>
            <p class="mt-2 text-sm text-ink3">Ретро «iGaming RIP · Sprint 41 Retro» будет удалено из CMS.</p>
            <div class="mt-5 flex justify-end gap-2">
              <button class="inline-flex min-h-11 items-center rounded-lg border border-transparent px-4 text-sm font-semibold text-ink3">Отмена</button>
              <button class="inline-flex min-h-11 items-center rounded-lg border border-red/20 bg-red/5 px-4 text-sm font-semibold text-red">Удалить</button>
            </div>
          </div>
        </div>
      </div>
    `,
  );
  await captureStateBoard(
    page,
    theme,
    "ui-state-dropdown",
    "Dropdown state",
    `
      <div class="grid max-w-xl gap-6">
        <label class="block space-y-1.5">
          <span class="text-sm font-semibold text-ink3">Команда</span>
          <div class="relative">
            <button class="flex min-h-11 w-full items-center justify-between rounded-lg border border-blue bg-surface px-3 py-2.5 text-left text-ink ring-2 ring-blue/20">
              iGaming RIP
              <span class="text-ink3">⌄</span>
            </button>
            <div class="absolute z-10 mt-2 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-card">
              <div class="bg-line2 px-3 py-2 text-sm font-semibold text-ink">iGaming RIP</div>
              <div class="px-3 py-2 text-sm text-ink2">Platform Core</div>
              <div class="px-3 py-2 text-sm text-ink2">Без команды</div>
            </div>
          </div>
        </label>
      </div>
    `,
  );
  await captureStateBoard(
    page,
    theme,
    "ui-state-form-controls",
    "Form control states",
    `
      <div class="grid grid-cols-2 gap-5">
        <label class="block space-y-1.5"><span class="text-sm font-semibold text-ink3">Default</span><input class="min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink" value="iGaming RIP" /></label>
        <label class="block space-y-1.5"><span class="text-sm font-semibold text-ink3">Focus</span><input class="min-h-11 w-full rounded-lg border border-blue bg-surface px-3 py-2.5 text-ink ring-2 ring-blue/20" value="iGaming RIP" /></label>
        <label class="block space-y-1.5"><span class="text-sm font-semibold text-ink3">Error</span><input class="min-h-11 w-full rounded-lg border border-red bg-surface px-3 py-2.5 text-ink ring-2 ring-red/20" value="" /><span class="text-xs font-medium text-red">Заполните поле</span></label>
        <label class="block space-y-1.5"><span class="text-sm font-semibold text-ink3">Disabled</span><input disabled class="min-h-11 w-full rounded-lg border border-line bg-line2 px-3 py-2.5 text-ink4" value="Недоступно" /></label>
      </div>
    `,
  );
}

test.describe("Figma screenshot export", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    mkdirSync(path.join(outputDir, "light"), { recursive: true });
    mkdirSync(path.join(outputDir, "dark"), { recursive: true });
  });

  for (const theme of ["light", "dark"] as const) {
    test(`exports ${theme} screens`, async ({ page }) => {
      for (const target of screenshotTargets) {
        await capture(page, theme, target.name, target.route, target.authenticated !== false);
      }

      for (const viewport of responsiveViewports) {
        for (const target of screenshotTargets) {
          await captureResponsive(page, theme, target, viewport);
        }
      }

      await captureButtonStates(page, theme);
      await captureUiStates(page, theme);
    });
  }
});
