import { VERSION, SAVE_KEY, LEGACY_KEY, SETTINGS_KEY, fresh, defaults, preferences, clock,
  readSave, collect, unlock, send, resolveCall, hangUp, tick, archiveOpen, nextLead, replied, compare } from "./game.mjs";
import { story } from "./people.mjs";
import { photos, articles, oldNotes } from "./materials.mjs";
import { view, threads } from "./views.mjs";

const phone = document.querySelector("#phone");
const screen = document.querySelector("#screen");
const status = document.querySelector("#status");
const system = document.querySelector("#system");
const notice = document.querySelector("#notice");
const load = key => { try { return localStorage.getItem(key); } catch { return null; } };
const draftSave = load(SAVE_KEY);
let saved = readSave(draftSave);
let settings = preferences(load(SETTINGS_KEY));
let state = fresh();
let started = false;
let current = "splash";
let timer, idleTimer, noticeTimer, ringingTimer, audio, startPoint;
let storageFailed = false;
let practice = null;
const ui = {
  notice: draftSave && !saved ? "Сохранение повреждено или несовместимо. Можно начать новую игру."
    : !saved && load(LEGACY_KEY) ? "Найдено сохранение 1.0. Сценарий изменился, поэтому понадобится новая игра." : "",
  hasSave: Boolean(saved), thread: "unknown", draft: "", photo: 0, zoom: false, metadata: false,
  article: "update", articleBack: "feed", note: "", clue: "", callLine: 0, settingsBack: "menu",
  journalCoach: false, search: "", sequence: [],
};

const systemIcons = '<svg aria-hidden="true" viewBox="0 0 58 17" fill="currentColor"><rect x="0" y="12" width="3" height="4" rx="1"/><rect x="4" y="9" width="3" height="7" rx="1"/><rect x="8" y="6" width="3" height="10" rx="1"/><rect x="12" y="3" width="3" height="13" rx="1"/><path d="M19 7c5-5 10-5 15 0l-1.7 1.7c-4-3.7-7.6-3.7-11.6 0zM22 10c3-2.8 6-2.8 9 0l-1.7 1.6c-2-1.6-3.6-1.6-5.6 0zm3 3c1.1-1.1 2-1.1 3 0l-1.5 1.5z"/><rect x="38" y="4" width="17" height="11" rx="2.5" fill="none" stroke="currentColor"/><rect x="40" y="6" width="8" height="7" rx="1"/><rect x="56" y="7.2" width="1.5" height="4.6" rx=".6"/></svg>';
const shellViews = ["splash", "menu", "about", "intro", "ending", "summary"];
const isGame = () => started && !shellViews.includes(current) && !(current === "settings" && ui.settingsBack === "menu");
const delay = () => ({ normal: 1600, fast: 380, instant: 0 })[settings.speed];

function notify(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  noticeTimer = setTimeout(() => { notice.textContent = ""; }, 3900);
}

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch {
    if (!storageFailed) notify("Сохранение недоступно. Можно играть, пока эта вкладка открыта.");
    storageFailed = true;
  }
}

function persist() {
  if (practice) return;
  saved = state;
  ui.hasSave = true;
  ui.notice = "";
  store(SAVE_KEY, state);
}

function tone(kind) {
  if (!settings.volume) return;
  try {
    if (!audio || audio.state !== "running") return;
    const frequencies = { message: [660, 880], send: [420, 540], ring: [480, 600, 480], unlock: [350] };
    for (const [i, frequency] of frequencies[kind].entries()) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const at = audio.currentTime + i * .12;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.exponentialRampToValueAtTime(settings.volume / 650 + .001, at + .024);
      gain.gain.exponentialRampToValueAtTime(.001, at + .115);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + .12);
    }
  } catch {}
}

function unlockAudio() {
  if (!settings.volume) return;
  try {
    const Context = window.AudioContext ?? window.webkitAudioContext;
    if (!Context) return;
    audio ??= new Context();
    if (audio.state === "suspended") audio.resume().catch(() => {});
  } catch {}
}

function idle() {
  clearTimeout(idleTimer);
  if (!settings.hints || !isGame() || state.pending.length || state.call === "ringing" ||
      current === "active" || state.tutorial !== "done") return;
  idleTimer = setTimeout(() => notify(nextLead(state)), 52000);
}

function markRead() {
  const entry = threads(state).find(item => item.who === ui.thread);
  if (entry && state.read[ui.thread] !== entry.time) {
    state.read[ui.thread] = entry.time;
    persist();
  }
}

function render(next = current, focus = true) {
  if (next !== current) {
    clearTimeout(noticeTimer);
    notice.textContent = "";
  }
  current = next;
  if (next === "ending" && state.segment !== "S016") { state.segment = "S016"; persist(); }
  const systemVisible = !shellViews.includes(next);
  phone.dataset.page = next;
  status.hidden = !systemVisible;
  status.innerHTML = practice ? `<button class="practice-exit" data-action="leave-practice">Выйти из обучения</button>${systemIcons}` : next === "lock" ? `<span></span>${systemIcons}`
    : `<span>${clock(started ? state.minute : 0)}</span>${systemIcons}`;
  system.hidden = !systemVisible || (next === "settings" && ui.settingsBack === "menu");
  system.querySelector("button").disabled = ["ringing", "active"].includes(next);
  system.querySelector("button").setAttribute("aria-label", next === "lock" ? "Разблокировать телефон" : "На домашний экран");
  const oldScroll = screen.scrollTop;
  screen.innerHTML = view(next, state, settings, ui);
  if (next === "thread") screen.scrollTop = screen.scrollHeight;
  else screen.scrollTop = focus ? 0 : oldScroll;
  if (next === "messages" && ui.search) {
    screen.querySelector("#chat-search").value = ui.search;
    filterChats();
  }
  if (focus) screen.querySelector("h1")?.focus({ preventScroll: true });
  idle();
}

function schedule() {
  clearTimeout(timer);
  if (!started) return;
  const due = Math.min(...state.pending.map(event => event.at));
  if (Number.isFinite(due)) timer = setTimeout(update, Math.max(0, due - Date.now()));
}

function startRinging() {
  if (current !== "ringing") render("ringing");
  clearInterval(ringingTimer);
  tone("ring");
  ringingTimer = setInterval(() => tone("ring"), 2600);
}

function update() {
  const oldCall = state.call;
  if (tick(state, Date.now(), delay())) {
    if (state.tutorial === "wait" && replied(state, "knock")) state.tutorial = "home";
    persist();
    if (state.ending && !shellViews.includes(current)) render("ending");
    else if (state.call === "ringing" && oldCall !== "ringing" && isGame()) startRinging();
    else if (isGame()) {
      tone("message");
      if (current === "thread") markRead();
      if (["thread", "messages", "home"].includes(current) && document.activeElement?.id !== "chat-search") render(current, false);
      if (current !== "thread") notify("Новое сообщение");
    }
  }
  schedule();
}

function changed() {
  persist();
  schedule();
  idle();
}

function newRun() {
  if (practice) leavePractice();
  if (ui.hasSave && !window.confirm("Начать заново? Текущее прохождение и заметки будут удалены.")) return;
  clearTimeout(timer);
  clearInterval(ringingTimer);
  ui.draft = "";
  ui.search = "";
  ui.sequence = [];
  state = fresh();
  started = true;
  persist();
  render("intro");
}

function resume() {
  if (!saved) return;
  state = saved;
  ui.sequence = [];
  started = true;
  const page = state.ending ? "ending" : state.location === "phone" ? "home" : state.location;
  render(page);
  if (state.call === "ringing") startRinging();
  if (state.call === "active") {
    ui.callLine = 0;
    render("active");
  }
  update();
}

function open(next) {
  if (next === "settings") ui.settingsBack = shellViews.includes(current) ? "menu" : "home";
  if (["archive", "compare"].includes(next) && !archiveOpen(state)) return;
  if (next === "menu") {
    if (practice) leavePractice();
    clearInterval(ringingTimer);
    clearTimeout(timer);
    started = false;
  }
  if (next === "lock") {
    state.location = "lock";
    changed();
  }
  if (next === "messages" && state.tutorial === "messages") {
    state.tutorial = "thread";
    persist();
  }
  ui.journalCoach = next === "journal" && state.tutorial === "journal";
  if (ui.journalCoach) {
    state.tutorial = "done";
    persist();
  }
  if (next === "transit") {
    state.history = [...state.history.filter(item => item !== next), next];
    changed();
  }
  if (next === "thread") markRead();
  render(next);
}

function goHome() {
  if (current === "lock" && unlock(state)) {
    changed();
    tone("unlock");
    render("home");
    return;
  }
  if (!isGame() || ["ringing", "active"].includes(current)) return;
  if (state.tutorial === "home") {
    state.tutorial = state.clues.includes("photo") ? "journal" : "photo";
    persist();
  }
  ui.draft = "";
  render("home");
}

function inspectPhoto(index) {
  ui.photo = (index + photos.length) % photos.length;
  ui.zoom = false;
  ui.metadata = false;
  if (state.tutorial === "photo" && photos[ui.photo].id === "parking") {
    state.tutorial = "save";
    persist();
  }
  render("photo");
}

function filterChats() {
  const needle = ui.search.trim().toLocaleLowerCase("ru");
  let visible = 0;
  for (const row of screen.querySelectorAll(".chat-row")) {
    row.hidden = !row.dataset.search.toLocaleLowerCase("ru").includes(needle);
    if (!row.hidden) visible++;
  }
  screen.querySelector("#no-results").hidden = visible > 0;
}

function changeSetting(name, value) {
  settings = { ...defaults, ...settings, [name]: value };
  if (!practice) store(SETTINGS_KEY, settings);
  phone.classList.toggle("reduce", !settings.motion);
  idle();
}

function repeatTutorial() {
  if (practice) return;
  practice = { state, started, page: current, settings, settingsBack: ui.settingsBack };
  state = fresh();
  state.location = "lock";
  settings = { ...settings, hints: true };
  started = true;
  ui.draft = "";
  render("lock");
  schedule();
}

function leavePractice() {
  if (!practice) return;
  clearTimeout(timer);
  clearInterval(ringingTimer);
  const previous = practice;
  practice = null;
  state = previous.state;
  settings = previous.settings;
  phone.classList.toggle("reduce", !settings.motion);
  started = previous.started;
  ui.settingsBack = previous.settingsBack;
  ui.draft = "";
  render(previous.page);
  update();
}

const handlers = {
  open, home: goHome, unlock: goHome, new: newRun, continue: resume, teach: repeatTutorial, "leave-practice": leavePractice,
  skip: () => { state.tutorial = "done"; persist(); render(current, false); },
  thread: id => {
    if (!threads(state).some(item => item.who === id)) return;
    ui.thread = id;
    ui.draft = "";
    if (id === "unknown" && state.tutorial === "thread") state.tutorial = "choose";
    markRead();
    persist();
    render("thread");
  },
  select: id => {
    ui.draft = id;
    if (state.tutorial === "choose") {
      state.tutorial = "send";
      persist();
    }
    render("thread", false);
    screen.querySelector(".send").focus({ preventScroll: true });
  },
  send: () => {
    const [node, choice] = ui.draft.split(":");
    if (!Object.hasOwn(story, node) || story[node].who !== ui.thread || !send(state, node, choice, Date.now(), delay())) return;
    ui.draft = "";
    if (node === "knock" && state.tutorial === "send") state.tutorial = "wait";
    markRead();
    tone("send");
    changed();
    render("thread", false);
  },
  photo: id => inspectPhoto(photos.findIndex(p => p.id === id)),
  "photo-step": offset => inspectPhoto(ui.photo + Number(offset)),
  zoom: () => { ui.zoom = !ui.zoom; render("photo", false); screen.querySelector('[data-action="zoom"]').focus(); },
  metadata: () => { ui.metadata = !ui.metadata; render("photo", false); screen.querySelector('[data-action="metadata"]').focus(); },
  collect: id => {
    if (!collect(state, id, Date.now(), delay())) return;
    if (id === "photo" && ["photo", "save"].includes(state.tutorial)) state.tutorial = "journal";
    changed();
    notify("Добавлено в журнал");
    render(current, false);
    screen.querySelector(".saved")?.focus({ preventScroll: true });
  },
  "order-add": id => {
    if (ui.sequence.length < 4 && !ui.sequence.includes(id)) ui.sequence.push(id);
    render("compare", false);
  },
  "order-undo": () => { ui.sequence.pop(); render("compare", false); },
  "compare-order": () => {
    if (!compare(state, "order", ui.sequence.join(":"), Date.now(), delay())) {
      notify("Посмотри, что было раньше — отметка в журнале или доставка снимка.");
      return;
    }
    changed();
    render("compare", false);
  },
  compare: id => {
    const [question, choice] = id.split(":");
    if (!compare(state, question, choice, Date.now(), delay())) {
      notify(question === "timestamps" ? "Сравни время создания оригинала и время доставки копии."
        : "Сверь слова Дениса с тем, что записал Павел.");
      return;
    }
    changed();
    render("compare", false);
  },
  clue: id => { if (state.clues.includes(id)) { ui.clue = id; render("clue"); } },
  call: id => {
    if (!resolveCall(state, id === "accept", Date.now(), delay())) return;
    clearInterval(ringingTimer);
    ui.callLine = 0;
    changed();
    render(id === "accept" ? "active" : "calls");
  },
  "call-next": () => { ui.callLine++; render("active", false); },
  hang: () => { if (hangUp(state, Date.now(), delay())) { changed(); render("calls"); } },
  article: id => {
    if (!Object.hasOwn(articles, id)) return;
    ui.articleBack = ["feed", "feedArchive", "history"].includes(current) ? current : "feed";
    ui.article = id;
    state.history = [...state.history.filter(item => item !== id), id];
    changed();
    render("article");
  },
  note: id => {
    if (!Object.hasOwn(oldNotes, id) && !state.notes.some(item => item.id === id)) return;
    ui.note = id;
    render("note");
  },
  "note-new": () => {
    const at = Date.now();
    ui.note = globalThis.crypto?.randomUUID?.() ?? `note-${at}-${state.notes.length}`;
    state.notes.push({ id: ui.note, title: "", text: "", created: at, updated: at });
    changed();
    render("note");
    screen.querySelector("#note-title").focus();
  },
};

phone.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  unlockAudio();
  idle();
  handlers[button.dataset.action]?.(button.dataset.id);
});

phone.addEventListener("input", event => {
  const { id, value, checked } = event.target;
  if (id === "chat-search") { ui.search = value; filterChats(); }
  if (id === "volume") changeSetting(id, Number(value));
  if (id === "hints" || id === "motion") changeSetting(id, checked);
  if (id === "speed") {
    changeSetting(id, value);
    for (const item of state.pending) item.at = Math.min(item.at, Date.now() + delay());
    if (started) changed();
  }
  if (id === "note-title" || id === "note-text") {
    const note = state.notes.find(item => item.id === ui.note);
    note[id === "note-title" ? "title" : "text"] = value;
    note.updated = Date.now();
    persist();
  }
});

phone.addEventListener("pointerdown", event => {
  if (current === "lock" || event.target.closest("#system")) startPoint = { y: event.clientY, x: event.clientX, id: event.pointerId };
});
phone.addEventListener("pointerup", event => {
  if (startPoint?.id === event.pointerId && startPoint.y - event.clientY > 45 && Math.abs(startPoint.x - event.clientX) < 100) {
    unlockAudio();
    goHome();
  }
  startPoint = null;
});
phone.addEventListener("pointercancel", () => { startPoint = null; });
document.addEventListener("visibilitychange", () => { if (!document.hidden && started) update(); });
window.addEventListener("pageshow", () => { if (started) update(); });

phone.classList.toggle("reduce", !settings.motion);
setTimeout(() => render("menu"), settings.motion && !matchMedia("(prefers-reduced-motion: reduce)").matches ? 2050 : 120);
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
