import { story } from "./people.mjs";
import { clues } from "./materials.mjs";

export const VERSION = "1.1";
export const SAVE_KEY = "lastseen_episode01";
export const LEGACY_KEY = "lastseen_save";
export const SETTINGS_KEY = "lastseen_preferences";
export const defaults = { volume: 35, speed: "normal", hints: true, motion: true };
const own = (object, id) => typeof id === "string" && Object.hasOwn(object, id);

export function fresh() {
  return {
    version: 2, segment: "S001", unlocked: {}, answers: {}, read: {}, clues: [],
    relations: {}, comparisons: [], pending: [], call: null, callAt: null, ending: null, notes: [], history: [],
    tutorial: "unlock", location: "intro", minute: 0,
  };
}

export function preferences(raw) {
  try {
    const data = JSON.parse(raw);
    return {
      volume: Number.isFinite(data?.volume) ? Math.max(0, Math.min(100, data.volume)) : defaults.volume,
      speed: ["normal", "fast", "instant"].includes(data?.speed) ? data.speed : defaults.speed,
      hints: typeof data?.hints === "boolean" ? data.hints : defaults.hints,
      motion: typeof data?.motion === "boolean" ? data.motion : defaults.motion,
    };
  } catch { return { ...defaults }; }
}

export const clock = minute => `${Math.floor((1301 + minute) / 60)}:${String((1301 + minute) % 60).padStart(2, "0")}`;
const hasClues = (state, ...ids) => ids.every(id => state.clues.includes(id));
export const replied = (state, id) => Boolean(state.answers[id]?.ready);
export const archiveOpen = state => replied(state, "nia");
export const corroborated = state => state.call === "accepted" || state.relations.unknown >= 1 ||
  state.relations.mark >= 1 || hasClues(state, "update", "note");
export function responseLines(state, id) {
  const choice = state.answers[id].choice;
  if (id === "record" && state.answers[id].provisional) {
    return [
      "Оригинал получила. Второй источник сейчас недоступен. Дам осторожную цитату, сведения помечу как предварительные.",
      "Через полчаса выйдет короткое обновление. Полный материал пока держу в черновике.",
    ];
  }
  return story[id].choices[choice].lines;
}
const mark = (state, segment) => { if (segment > state.segment) state.segment = segment; };
const reveal = (state, id) => {
  if (Object.hasOwn(state.unlocked, id)) return;
  state.unlocked[id] = { mark: -43, alina: -149 }[id] ?? ++state.minute;
};

function advance(state, at, delay) {
  if (replied(state, "knock")) {
    mark(state, "S004");
    reveal(state, "mark");
    reveal(state, "alina");
  }
  if (replied(state, "mark") && replied(state, "alina")) {
    mark(state, "S006");
    if (state.clues.length) mark(state, "S007");
    if (hasClues(state, "news")) mark(state, "S008");
  }
  if (replied(state, "mark") && replied(state, "alina") && hasClues(state, "photo", "call", "news")) {
    mark(state, "S009");
    reveal(state, "claim");
  }
  if (replied(state, "claim") && !state.call) {
    mark(state, "S010");
    state.call = "scheduled";
    state.pending.push({ kind: "call", at: at + delay });
  }
  if (["accepted", "declined"].includes(state.call)) {
    mark(state, "S011");
    reveal(state, "pavel");
    reveal(state, "alinaAgain");
  }
  if (replied(state, "pavel") && hasClues(state, "ledger")) {
    reveal(state, "denis");
    reveal(state, "markAgain");
  }
  if (replied(state, "denis") && replied(state, "markAgain") && replied(state, "alinaAgain") && hasClues(state, "flat")) reveal(state, "veraAgain");
  if (replied(state, "veraAgain")) reveal(state, "nia");
  if (archiveOpen(state)) mark(state, "S012");
  if (archiveOpen(state) && state.comparisons.length === 3 && hasClues(state, "export", "account", "witness")) {
    mark(state, "S013");
    reveal(state, "record");
  }
  if (replied(state, "record")) {
    const final = state.answers.record.choice;
    state.ending = final === "withdraw" ? "blocked" : final === "blame" || state.answers.record.provisional ? "wrong" : "truth";
    mark(state, "S015");
  }
}

export function availableClue(state, id) {
  if (!own(clues, id) || state.ending || !Object.hasOwn(state.unlocked, "knock")) return false;
  const gates = { ledger: replied(state, "pavel"), witness: replied(state, "denis"),
    account: replied(state, "markAgain"), export: archiveOpen(state) };
  return gates[id] ?? true;
}

export function send(state, id, choice, at, delay) {
  if (state.ending || !own(state.unlocked, id) || !own(story[id].choices, choice) || state.answers[id]) return false;
  const response = story[id].choices[choice];
  state.answers[id] = {
    choice, ready: false, shown: 0, sent: ++state.minute, received: null,
    provisional: id === "record" && choice === "source" && !corroborated(state),
  };
  state.relations[story[id].who] = (state.relations[story[id].who] ?? 0) + response.trust;
  state.pending.push({ kind: "reply", id, at: at + delay });
  if (id === "knock") mark(state, "S003");
  if (id === "alina") mark(state, "S005");
  if (id === "record") mark(state, "S014");
  return true;
}

export function collect(state, id, at = Date.now(), delay = 1100) {
  if (!availableClue(state, id) || state.clues.includes(id)) return false;
  state.clues.push(id);
  advance(state, at, delay);
  return true;
}

export function unlock(state) {
  if (state.location !== "lock") return false;
  state.location = "phone";
  if (!Object.hasOwn(state.unlocked, "knock")) {
    state.unlocked.knock = 0;
    mark(state, "S002");
  }
  if (state.tutorial === "unlock") state.tutorial = "messages";
  return true;
}

export function resolveCall(state, accept, at, delay) {
  if (state.call !== "ringing" || state.ending) return false;
  state.call = accept ? "active" : "declined";
  if (!accept) advance(state, at, delay);
  return true;
}

export function hangUp(state, at, delay) {
  if (state.call !== "active") return false;
  state.call = "accepted";
  advance(state, at, delay);
  return true;
}

export function tick(state, at, delay) {
  let changed = false;
  while (state.pending.length) {
    const index = state.pending.findIndex(item => item.at <= at);
    if (index < 0) break;
    const [event] = state.pending.splice(index, 1);
    changed = true;
    if (event.kind === "call" && state.call === "scheduled") {
      state.call = "ringing";
      state.callAt = ++state.minute;
    }
    if (event.kind === "reply" && state.answers[event.id] && !state.answers[event.id].ready) {
      const answer = state.answers[event.id];
      const lines = responseLines(state, event.id);
      answer.received = ++state.minute;
      answer.shown++;
      answer.ready = answer.shown === lines.length;
      if (!answer.ready) state.pending.push({ ...event, at: event.at + Math.round(delay * .65) });
    }
    advance(state, event.at, delay);
  }
  return changed;
}

export function readSave(raw) {
  try {
    const state = JSON.parse(raw);
    if (state?.version !== 2 || !["intro", "lock", "phone"].includes(state.location) ||
      !["unlock","messages","thread","choose","send","wait","home","photo","save","journal","done"].includes(state.tutorial) ||
      !/^S0(0[1-9]|1[0-6])$/.test(state.segment) || ![null,"scheduled","ringing","active","declined","accepted"].includes(state.call) ||
      ![null,"blocked","wrong","truth"].includes(state.ending) || !Number.isInteger(state.minute) ||
      state.minute < 0 || state.minute > 140 || !state.answers || !state.unlocked || !state.read || !state.relations ||
      !Array.isArray(state.comparisons) || !state.comparisons.every(id => ["timestamps", "witness", "order"].includes(id)) ||
      new Set(state.comparisons).size !== state.comparisons.length || !Array.isArray(state.clues) || !Array.isArray(state.notes) || !Array.isArray(state.pending) || !Array.isArray(state.history)) return null;
    if (!state.clues.every(id => own(clues, id)) || new Set(state.clues).size !== state.clues.length) return null;
    if (!Object.entries(state.unlocked).every(([id, time]) => own(story, id) && Number.isInteger(time) && time >= -149 && time <= state.minute)) return null;
    if (!Object.entries(state.answers).every(([id, answer]) => own(state.unlocked, id) && own(story[id].choices, answer?.choice) &&
      typeof answer.ready === "boolean" && typeof answer.provisional === "boolean" && Number.isInteger(answer.sent) && Number.isInteger(answer.shown) &&
      answer.shown >= 0 && answer.shown <= responseLines(state, id).length &&
      (answer.shown ? Number.isInteger(answer.received) : answer.received === null) &&
      answer.ready === (answer.shown === responseLines(state, id).length))) return null;
    if ((state.callAt !== null && (!Number.isInteger(state.callAt) || state.callAt < 0 || state.callAt > state.minute)) ||
      !state.history.every(id => ["search", "update", "tram"].includes(id)) ||
      !Object.values(state.read).every(Number.isInteger) ||
      !Object.values(state.relations).every(Number.isInteger)) return null;
    if (!state.notes.every(note => typeof note?.id === "string" &&
      /^(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|note-\d+-\d+)$/.test(note.id) && typeof note.title === "string" &&
      typeof note.text === "string" && Number.isFinite(note.created) && Number.isFinite(note.updated))) return null;
    if (!state.pending.every(event => Number.isFinite(event?.at) && (event.kind === "call" ||
      (event.kind === "reply" && own(state.answers, event.id)))) ||
      !Object.entries(state.answers).every(([id, a]) => a.ready || state.pending.some(e => e.kind === "reply" && e.id === id)) ||
      (state.call === "scheduled" && !state.pending.some(e => e.kind === "call")) ||
      (state.ending && !replied(state, "record"))) return null;
    return state;
  } catch { return null; }
}

export function nextLead(state) {
  if (!replied(state, "knock")) return "Неизвестный номер ждёт ответа.";
  if (!replied(state, "mark") || !replied(state, "alina")) return "Сверь свои воспоминания с Марком и Алиной.";
  if (!hasClues(state, "photo")) return "Алина упоминала оригинал IMG_1148 в Фото.";
  if (!hasClues(state, "call")) return "Проверь, когда неизвестный номер впервые звонил.";
  if (!hasClues(state, "news")) return "Найди запрос очевидцев в архиве CityFeed.";
  if (!replied(state, "claim")) return "Неизвестный номер прислал свою версию.";
  if (!replied(state, "pavel") || !hasClues(state, "ledger")) return "У Павла есть выписка со смены.";
  if (!replied(state, "denis") || !replied(state, "markAgain")) return "Денис и Марк могут уточнить детали.";
  if (!hasClues(state, "flat")) return "Найди оригинал фотографии кухни в галерее.";
  if (!replied(state, "alinaAgain")) return "Алина написала после публикации CityFeed.";
  if (!replied(state, "veraAgain")) return "Вера хочет обсудить условия передачи материалов.";
  if (!replied(state, "nia")) return "В редакции CityFeed ждут твоего ответа.";
  if (!hasClues(state, "export")) return "Нина прислала закрытую папку в диалог.";
  if (!hasClues(state, "account", "witness")) return "Отметь, что именно подтвердили Марк и Денис.";
  if (state.comparisons.length < 3) return "У Нины в папке можно сверить две версии вечера.";
  return "Нина ждёт твоего решения, как использовать материалы.";
}

export function compare(state, id, choice, at = Date.now(), delay = 1100) {
  if (state.ending || !archiveOpen(state) || !hasClues(state, "export") ||
      !["timestamps", "witness", "order"].includes(id) || state.comparisons.includes(id)) return false;
  if (id === "witness" && !hasClues(state, "witness", "ledger")) return false;
  if (id === "order" ? choice !== "photo:ledger:export:help" : choice !== "supported") return false;
  state.comparisons.push(id);
  advance(state, at, delay);
  return true;
}
