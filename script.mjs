import { people } from "./people.mjs";
import { clues, endings, fresh, readSave, collect, finish, canOpenArchive, canSend, reply } from "./game.mjs";

const storageKey = "lastseen_save";
const screen = document.querySelector("#screen");
const dock = document.querySelector("#dock");
const notice = document.querySelector("#notice");
const names = { UNKNOWN: "Неизвестный номер", Mark: "Марк", Alina: "Алина" };
let state = fresh();
try { state = readSave(localStorage.getItem(storageKey)); } catch {}
let current = state.ending ? "ending" : "home";
let threadName = "UNKNOWN";
let noticeTimer;

const icons = {
  messages: '<path d="M4 5h16v11H9l-5 3zM8 9h8m-8 4h5"/>',
  photo: '<rect x="3.5" y="4" width="17" height="16" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m4.5 17 5-5 4 3 2-2 4 4"/>',
  phone: '<path d="M7 3.5 4.5 5c-.8.5-.9 1.5-.6 2.4 2.1 5.7 6.5 10.1 12.2 12.2.9.3 1.9.2 2.4-.6l1.5-2.5-4.3-3-2 2a15 15 0 0 1-5.8-5.8l2-2z"/>',
  news: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2.2 5-4.8 2 2-4.8z"/>',
  notes: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 9h8m-8 4h8m-8 4h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2"/>',
};
const titles = { messages: "Сообщения", photo: "Фото", phone: "Телефон", news: "Браузер", notes: "Заметки", settings: "Настройки" };
const esc = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const icon = id => `<svg aria-hidden="true" viewBox="0 0 24 24">${icons[id]}</svg>`;
const heading = (label, title) => `<header class="page-heading"><p class="label">${label}</p><h1 tabindex="-1">${title}</h1></header>`;
const card = (title, text) => `<article class="card"><h2>${title}</h2><p>${text}</p></article>`;
const button = (label, action, id = "", style = "") =>
  `<button class="choice ${style}" data-action="${action}" data-id="${id}">${label}</button>`;
const open = (label, view, style) => button(label, "open", view, style);
const log = (id, label = "Сохранить как улику") => state.clues.includes(id)
  ? '<p class="saved" tabindex="-1">✓ Добавлено в журнал</p>' : button(label, "collect", id, "primary");

function notify(text) {
  clearTimeout(noticeTimer);
  notice.textContent = text;
  noticeTimer = setTimeout(() => { notice.textContent = ""; }, 3500);
}

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { notify("Хранилище недоступно. Прогресс сохранён до закрытия страницы."); }
}

const pages = {
  home: () => `<section class="hero">
    ${heading("ЭПИЗОД 01 · 13 НОЯБРЯ", "LAST<br>SEEN")}
    <p>Ты был у торгового центра той ночью. Всё, что осталось от неё, хранится в телефоне.</p>
    </section>
    <div class="apps">${Object.entries(titles).map(([id, title]) =>
      open(`<span class="icon ${id}">${icon(id)}</span><span>${title}</span>`, id, "app")).join("")}</div>
    ${open(`Журнал расследования <span>${state.clues.length} / ${Object.keys(clues).length}</span>`, "evidence", "journal")}`,
  messages: () => `${heading("ВХОДЯЩИЕ", "Сообщения")}${Object.entries(people).map(([id, person]) => {
    const chat = state.chats[person.key];
    return button(`<span class="avatar">${person.initial}</span><span class="chat-summary"><strong>${names[id]}</strong>
      <small>${esc(chat?.responses.at(-1) ?? person.opening.at(-1))}</small></span><small>${chat?.replyTime ?? person.time}</small>`, "thread", id, "row");
  }).join("")}`,
  thread: () => {
    const person = people[threadName];
    const chat = state.chats[person.key];
    const bubble = (text, style = "") => `<p class="bubble ${style}">${esc(text)}</p>`;
    return `${open("Все сообщения", "messages", "back")}${heading("ПЕРЕПИСКА", names[threadName])}
      <p class="label time">Сегодня · ${person.time}</p>${person.opening.map(text => bubble(text)).join("")}
      ${chat ? bubble(chat.choice, "mine") + `<p class="label time">${chat.replyTime}</p>` +
        chat.responses.map(text => bubble(text)).join("") + '<p class="muted">Ответ сохранён.</p>'
        : person.options.map((text, index) => button(esc(text), "reply", index)).join("")}
      ${threadName === "Alina" && state.clues.includes("recording")
        ? card("Новое сообщение", "Это была я. Голосовое с телефона охранника. Если ты его нашёл, решай сам, кому его показать.") : ""}`;
  },
  photo: () => `${heading("НЕДАВНО · 13 НОЯБРЯ", "Фото")}
    <div class="photo-preview" role="img" aria-label="Тёмный служебный вход на парковке, освещённый фонарём"><span aria-hidden="true"></span></div>
    ${card("IMG_1148.jpg", clues.photo.text)}${log("photo")}`,
  phone: () => `${heading("НЕДАВНИЕ ВЫЗОВЫ", "Телефон")}
    ${card("Марк", "Сегодня · 20:54 · исходящий")}
    ${card("Неизвестный номер", "Вчера · 00:17 · пропущен")}
    ${card("Алина", "Вчера · 22:08 · исходящий")}
    ${log("call", "Отметить неизвестный номер")}`,
  news: () => `${heading("ЛОКАЛЬНЫЕ НОВОСТИ · 14 НОЯБРЯ", "Браузер")}
    ${card("Полиция ищет очевидцев", clues.news.text + " Опубликовано в 09:12.")}${log("news", "Сохранить статью")}`,
  notes: () => `${heading("АВТОСОХРАНЕНИЕ", "Заметки")}
    <label for="note">Личная заметка</label><textarea id="note" placeholder="Запиши всё важное…"></textarea>`,
  settings: () => `${heading("LAST SEEN · 1.0", "Настройки")}
    ${card("Прогресс", `Ответов в чатах: ${Object.keys(state.chats).length}. Улик: ${state.clues.length}. Концовок: ${state.unlocked.length} / 3.`)}
    ${button("Сбросить весь прогресс", "reset")}`,
  evidence: () => `${heading(`ДЕЛО · ${state.clues.length} / ${Object.keys(clues).length} УЛИК`, "Журнал")}
    ${state.clues.length ? Object.entries(clues).filter(([id]) => state.clues.includes(id)).map(([, clue]) =>
      `<article class="card"><p class="label">${clue.source} · ${clue.time}</p><h2>${clue.title}</h2><p>${clue.text}</p></article>`).join("")
      : '<p class="muted">Сохрани материалы из фото, журнала вызовов и браузера.</p>'}
    ${canOpenArchive(state) ? open("Открыть архив", "archive", "primary")
      : '<p class="muted">Архив откроется, когда в журнале будут снимок парковки, вызов и статья.</p>'}
    ${open("Перейти к финальному решению", "decision")}`,
  archive: () => `${open("Журнал улик", "evidence", "back")}${heading("ВОССТАНОВЛЕННЫЙ ФАЙЛ · 00:18", "Архив")}
    ${card("Алина · расшифровка", "Это Алина. Я звоню с телефона охранника. Марк подпер дверь, чтобы никто не вышел. Ты вернулся и вытащил охранника. Я записала всё от начала до конца. Если полиция спросит — у меня есть оригинал.")}
    ${log("recording")}`,
  decision: () => `${open("Продолжить расследование", "evidence", "back")}${heading("ЭПИЗОД 01 · ФИНАЛ", "Что теперь?")}
    <p class="muted">Твой выбор завершит эпизод.</p>
    ${canSend(state) ? button("Передать материалы полиции", "finish", "witness", "primary")
      : '<p class="hint">Для передачи полиции нужны все четыре улики, включая голосовое из архива.</p>'}
    ${button("Связаться с Алиной", "finish", "alina")}
    ${button("Закрыть дело", "finish", "silence")}`,
  ending: () => `${heading("ЭПИЗОД 01 ЗАВЕРШЁН", endings[state.ending].title)}
    <p class="epilogue">${endings[state.ending].text}</p>
    <h2>Концовки · ${state.unlocked.length} / 3</h2>
    <ul class="ending-list">${Object.entries(endings).map(([id, ending]) =>
      `<li>${state.unlocked.includes(id) ? ending.title : "Не открыта"}</li>`).join("")}</ul>
    ${button("Переиграть эпизод", "replay", "", "primary")}`,
};

function render(next, focus = true) {
  current = next;
  screen.innerHTML = pages[next]();
  dock.hidden = next === "ending";
  for (const tab of dock.querySelectorAll("button")) {
    if (tab.dataset.view === next) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  const note = screen.querySelector("#note");
  if (note) note.value = state.notes;
  if (focus) {
    screen.scrollTop = 0;
    screen.querySelector("h1").focus({ preventScroll: true });
  }
}

dock.addEventListener("click", event => {
  const view = event.target.closest("button")?.dataset.view;
  if (view) render(view);
});

screen.addEventListener("input", event => {
  if (event.target.id !== "note") return;
  state.notes = event.target.value;
  persist();
});

screen.addEventListener("click", event => {
  const control = event.target.closest("button[data-action]");
  if (!control) return;
  const { action, id } = control.dataset;
  switch (action) {
    case "open":
      if (id !== "archive" || canOpenArchive(state)) render(id);
      break;
    case "thread":
      threadName = id;
      render("thread");
      break;
    case "reply": {
      const person = people[threadName];
      if (state.chats[person.key]) break;
      const selected = reply(person, person.options[Number(id)]);
      if (!selected) break;
      state.chats[person.key] = selected;
      persist();
      render("thread");
      break;
    }
    case "collect":
      if (!collect(state, id)) break;
      notify(`Улика сохранена · ${clues[id].title}`);
      persist();
      render(current, false);
      screen.querySelector(".saved").focus({ preventScroll: true });
      break;
    case "finish":
      if (finish(state, id)) {
        persist();
        render("ending");
      }
      break;
    case "replay": {
      const notes = state.notes;
      state = { ...fresh(state.unlocked), notes };
      persist();
      render("home");
      break;
    }
    case "reset":
      if (window.confirm("Удалить переписки, улики, заметки и открытые концовки?")) {
        state = fresh();
        persist();
        render("home");
      }
      break;
  }
});

render(current, false);
