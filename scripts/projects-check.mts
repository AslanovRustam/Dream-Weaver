// Проверка «Моих проектов» для лендингов и плейблов (src/lib/projects.ts) без
// базы и браузера: /api/projects подменён памятью с той же логикой ответов,
// localStorage — картой.
//
//   npx tsx scripts/projects-check.mts
//
// Что ловит: сохранение берёт свежий черновик нужного редактора, повторное
// скачивание обновляет ту же запись, «Новый» начинает новую, без таблицы (503)
// и у гостя ничего не ломается; открытие кладёт черновик в ключ редактора
// (у сцен — свой ключ лендинга и плейбла и выбранная сцена) и ведёт куда надо;
// проект привязывается к активному рабочему пространству.

const store = new Map<string, string>();
const ls = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
g.window = { localStorage: ls, dispatchEvent: () => true, addEventListener: () => {}, location: { href: "http://localhost/" } };
g.localStorage = ls;

let tableExists = true;
const rows = new Map<string, { kind: string; scene: string; name: string; data: unknown }>();
const puts: { id: string; kind: string; scene: string; name: string; data: unknown }[] = [];
g.fetch = async (path: string, init: { method?: string; body?: string } = {}) => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (!String(path).startsWith("/api/projects")) return json(404, {});
  if (!tableExists) return json(503, { error: "projects_unavailable" });
  const method = (init.method || "GET").toUpperCase();
  const url = new URL(String(path), "http://x");
  if (method === "PUT") {
    const p = (JSON.parse(init.body || "{}") as { project: { id: string; kind: string; scene: string; name: string; data: unknown } }).project;
    puts.push(p);
    rows.set(p.id, { kind: p.kind, scene: p.scene, name: p.name, data: p.data });
    return json(200, { ok: true });
  }
  if (method === "GET" && url.searchParams.get("id")) {
    const r = rows.get(url.searchParams.get("id")!);
    return r ? json(200, { project: r }) : json(404, { error: "Проект не найден" });
  }
  return json(200, { projects: [] });
};

const { saveProject, openProject, forgetProject, projectDraftKey, projectThumb, projectCaption, PROJECT_KINDS } = await import("../src/lib/projects");
const { readProjectMap, writeActiveWorkspaceId } = await import("../src/lib/workspaces");

let failed = 0;
let passed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) passed++;
  else {
    failed++;
    console.log(`✗ ${name}${extra ? " — " + extra : ""}`);
  }
};

const uid = "user-1";
writeActiveWorkspaceId(uid, "ws-2");

// ---- гость и таблицы нет
ls.setItem("dw_wheel_draft", JSON.stringify({ headline: "A" }));
check("гость — не сохраняем", (await saveProject({ kind: "landing-wheel", name: "x", uid: null })) === "unavailable" && puts.length === 0);
tableExists = false;
check("без таблицы — unavailable", (await saveProject({ kind: "landing-wheel", name: "x", uid })) === "unavailable");
check("без таблицы — id не запомнен", ls.getItem("dw_wheel_draft__project") === null);
tableExists = true;

// ---- сохранение колеса: свежий черновик, тот же id при повторе
ls.setItem("dw_wheel_draft", JSON.stringify({ headline: "Spin", bgImage: "data:image/png;base64,AA" }));
check("сохранили колесо", (await saveProject({ kind: "landing-wheel", name: "Spin — Brand", uid })) === "saved");
const first = puts.at(-1)!;
check("в проекте — черновик колеса", JSON.stringify(first.data) === ls.getItem("dw_wheel_draft") && first.kind === "landing-wheel" && first.name === "Spin — Brand");
ls.setItem("dw_wheel_draft", JSON.stringify({ headline: "Spin 2" }));
await saveProject({ kind: "landing-wheel", name: "Spin 2 — Brand", uid });
check("повторное скачивание — та же запись", puts.at(-1)!.id === first.id && (rows.get(first.id)!.data as { headline: string }).headline === "Spin 2");
check("привязан к активному пространству", readProjectMap(uid)[first.id] === "ws-2");
forgetProject(projectDraftKey("landing-wheel"));
await saveProject({ kind: "landing-wheel", name: "Новый", uid });
check("после «Новый» — новая запись", puts.at(-1)!.id !== first.id);

// ---- нет черновика — ошибка, не пустой проект
store.delete("dw_slot_draft");
check("нет черновика — error", (await saveProject({ kind: "landing-slot", name: "x", uid })) === "error");

// ---- сцены: лендинг и плейбл — разные ключи
ls.setItem("dw_scene_draft_chests_landing", JSON.stringify({ lang: "ru", extras: { lang: "ru" } }));
ls.setItem("dw_scene_draft_chests", JSON.stringify({ lang: "en" }));
await saveProject({ kind: "landing-scene", scene: "chests", name: "Сундуки", uid });
const sceneLanding = puts.at(-1)!;
check("лендинг на сцене — черновик лендинга", (sceneLanding.data as { lang: string }).lang === "ru" && sceneLanding.scene === "chests");
await saveProject({ kind: "playable", scene: "chests", name: "Сундуки", uid });
const playable = puts.at(-1)!;
check("плейбл — свой черновик и своя запись", (playable.data as { lang: string }).lang === "en" && playable.id !== sceneLanding.id);

// ---- открытие из истории
store.clear();
check("открыть колесо → /wheel", (await openProject(first.id)) === "/wheel");
check("черновик колеса на месте", (JSON.parse(ls.getItem("dw_wheel_draft")!) as { headline: string }).headline === "Spin 2");
check("редактор помнит id", ls.getItem("dw_wheel_draft__project") === first.id);
check("лендинг на сцене → /landing/scene?pick=scene-chests", (await openProject(sceneLanding.id)) === "/landing/scene?pick=scene-chests");
check("черновик лендинга сцены — в ключе _landing", ls.getItem("dw_scene_draft_chests_landing") !== null && ls.getItem("dw_scene_draft_chests") === null);
check("плейбл → /playable?pick=scene-chests", (await openProject(playable.id)) === "/playable?pick=scene-chests");
check("плейбл — выбрана сцена", ls.getItem("dw_playable_pick") === "scene-chests");
let threw = false;
try {
  await openProject("prj_missing");
} catch {
  threw = true;
}
check("несуществующий проект — понятная ошибка", threw);

// ---- справочники на каждый вид
for (const k of PROJECT_KINDS) {
  check(`${k}: ключ, картинка, подпись`, !!projectDraftKey(k, "safe") && projectThumb(k, "safe").startsWith("/") && !!projectCaption(k));
}

console.log(failed ? `\n${failed} провалено, ${passed} прошло` : `✓ все ${passed} проверок прошли`);
process.exit(failed ? 1 : 0);
