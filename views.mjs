import { people, story, endings } from "./people.mjs";
import { photos, articles, oldNotes, clues, connections } from "./materials.mjs";
import { availableClue, archiveOpen, clock, replied, responseLines, VERSION } from "./game.mjs";

const glyphs = {
  messages: '<path d="M5 5h14a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-5 4v-4H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z" fill="currentColor" stroke="none"/>',
  photo: '<rect x="3" y="4" width="18" height="16" rx="4"/><circle cx="9" cy="9" r="1.4"/><path d="m4.5 17 5-5 4 3 2-2 4 4"/>',
  phone: '<path d="M7 3.5 4.5 5c-.8.5-.9 1.5-.6 2.4 2.1 5.7 6.5 10.1 12.2 12.2.9.3 1.9.2 2.4-.6l1.5-2.5-4.3-3-2 2a15 15 0 0 1-5.8-5.8l2-2z" fill="currentColor"/>',
  browser: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.4 5.6L8 16l2.4-5.6z" fill="currentColor"/>',
  notes: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3"/>',
  journal: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M8 13h8m-8 3h5M7 5V3"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  send: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  lock: '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  zoom: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5M7 10h6m-3-3v6"/>',
  folder: '<path d="M3 7h7l2 2h9v10H3z"/>',
};
export const esc = value => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
export const svg = id => `<svg aria-hidden="true" viewBox="0 0 24 24">${glyphs[id]}</svg>`;
const labels = { messages: "Сообщения", photos: "Фото", calls: "Телефон", browser: "Браузер", notes: "Заметки", settings: "Настройки", journal: "Журнал" };
const appGlyph = { photos: "photo", calls: "phone" };
const avatar = (state, id) => id === "unknown" && !replied(state, "claim")
  ? '<span class="avatar unknown" aria-hidden="true">?</span>'
  : `<img class="avatar" src="./assets/${people[id].avatar}.jpg" alt="" width="42" height="42">`;
const name = (state, id) => id === "unknown" && replied(state, "claim") ? people.unknown.revealed : people[id].name;
const button = (label, action, id = "", style = "", attrs = "") =>
  `<button type="button" class="${style}" data-action="${action}" data-id="${id}" ${attrs}>${label}</button>`;
const go = (label, id, style = "", attrs = "") => button(label, "open", id, style, attrs);
const back = (label, id) => go(svg("back") + label, id, "back");
const head = (title, before = "", after = "") =>
  `<header class="app-head">${before}<h1 tabindex="-1">${title}</h1>${after}</header>`;
const stamp = time => `<p class="stamp">${time}</p>`;
const group = (label, content) => `<section class="group"><h2>${label}</h2>${content}</section>`;
const text = paragraphs => paragraphs.map(line => `<p>${line}</p>`).join("");
const image = (file, alt = "") => `<img src="./assets/${file}" alt="${esc(alt)}">`;
const saved = (state, id) => state.clues.includes(id) ? '<p class="saved" tabindex="-1">Сохранено в журнале</p>'
  : button("Сохранить в журнал", "collect", id, "action");
const hint = (state, settings, step, message) => settings.hints && state.tutorial === step
  ? `<aside class="coach">${message}${button("Пропустить", "skip", "", "quiet")}</aside>` : "";

const oldCalls = [
  ["mark", "23 ноября · 20:54", "Исходящий"],
  ["alina", "22 ноября · 22:08", "Исходящий"],
  ["unknown", "14 ноября · 00:17", "Пропущенный"],
];

export function threads(state) {
  const result = {};
  for (const [id, minute] of Object.entries(state.unlocked)) {
    const node = story[id];
    const answer = state.answers[id];
    const entry = result[node.who] ??= { who: node.who, nodes: [], latest: "", time: 0 };
    entry.nodes.push(id);
    const readTime = answer?.received ?? answer?.sent ?? minute;
    if (entry.nodes.length === 1 || readTime >= entry.time) {
      entry.time = readTime;
      entry.latest = answer?.shown ? responseLines(state, id)[answer.shown - 1]
        : answer ? node.choices[answer.choice].text : node.lines.at(-1);
    }
  }
  return Object.values(result).sort((left, right) => right.time - left.time);
}

export const unread = state => threads(state).filter(entry => entry.time > (state.read[entry.who] ?? -Infinity)).length;

function threadView(state, settings, ui) {
  const who = ui.thread;
  const entry = threads(state).find(item => item.who === who);
  if (!entry) return head("Сообщения", back("Назад", "messages"));
  const bubble = (line, mine = false) => `<p class="bubble${mine ? " mine" : ""}">${line}</p>`;
  const blocks = entry.nodes.map(id => {
    const node = story[id];
    const answer = state.answers[id];
    const attachment = { pavel: "ledger", denis: "witness", markAgain: "account" }[id];
    return `${stamp(id === "knock" ? "Сегодня, 21:41" : clock(state.unlocked[id]))}
      ${node.lines.map(line => bubble(line)).join("")}
      ${answer ? bubble(node.choices[answer.choice].text, true) +
        `<p class="receipt">${answer.ready ? "Прочитано" : "Доставлено"} · ${clock(answer.sent)}</p>` +
        responseLines(state, id).slice(0, answer.shown).map(line => bubble(line)).join("") +
        (answer.ready ? "" : '<p class="typing" aria-label="Собеседник набирает сообщение"><i></i><i></i><i></i></p>') : ""}
      ${attachment && availableClue(state, attachment) ? `<aside class="attachment">${svg("folder")}<div>
        <strong>${clues[attachment].title}</strong><p>${clues[attachment].text}</p>${saved(state, attachment)}</div></aside>` : ""}
      ${id === "nia" && archiveOpen(state) ? button(`${svg("folder")} Папка редакции`, "open", "archive", "attachment link") : ""}`;
  }).join("");
  const nodeId = entry.nodes.find(id => !state.answers[id]);
  const options = nodeId ? Object.entries(story[nodeId].choices).map(([id, choice]) =>
    button(choice.text, "select", `${nodeId}:${id}`, "reply-option", `aria-pressed="${ui.draft === `${nodeId}:${id}`}"`)).join("") : "";
  const selected = ui.draft ? ui.draft.split(":") : [];
  const draft = selected[0] === nodeId ? story[nodeId]?.choices[selected[1]]?.text : "";
  return `<header class="chat-head">${back("Назад", "messages")}<div>${avatar(state, who)}<h1 tabindex="-1">${name(state, who)}</h1></div></header>
  <section class="conversation" aria-label="История переписки">${blocks}</section>
  ${hint(state, settings, "choose", "Выбери реплику. Она появится в поле сообщения.")}
  ${hint(state, settings, "send", "Нажми стрелку, чтобы отправить выбранный ответ.")}
  ${hint(state, settings, "wait", "У собеседника появился индикатор набора. Дождись ответа.")}
  ${hint(state, settings, "home", "Нажми нижнюю полоску, чтобы вернуться домой.")}
  <section class="composer" aria-label="Ответ">${options}<div class="compose"><span>${esc(draft || "Сообщение")}</span>
    ${button(svg("send"), "send", nodeId ?? "", "send", `aria-label="Отправить ответ" ${draft ? "" : "disabled"}`)}</div></section>`;
}

export function view(page, state, settings, ui) {
  const pages = {
    splash: () => '<section class="cover splash"><h1>LAST SEEN</h1><p>EPISODE 01 — 21:41</p></section>',
    menu: () => `<section class="cover menu"><div class="cover-title"><p>EPISODE 01</p><h1 tabindex="-1">LAST<br>SEEN</h1><p>21:41</p></div>
      <nav aria-label="Главное меню">${button("Новая игра", "new", "", "menu-primary")}
      ${button("Продолжить", "continue", "", "", ui.hasSave ? "" : "disabled")}
      ${go("Настройки", "settings")}${go("Об игре", "about")}</nav>
      ${ui.notice ? `<p class="menu-note">${ui.notice}</p>` : ""}
      <span class="version">1.1 · COMPLETE EXPERIENCE</span></section>`,
    about: () => `<section class="cover content-cover">${back("Меню", "menu")}<h1 tabindex="-1">LAST SEEN</h1>
      <p>Вымышленный психологический триллер в интерфейсе телефона. Эпизод 01 — 21:41.</p>
      <p>Город, материалы расследования и персонажи вымышлены. Вызовы и сообщения происходят внутри игры.</p>
      <p>Версия ${VERSION} · Complete Experience</p></section>`,
    intro: () => `<section class="cover content-cover intro"><p class="kicker">23 НОЯБРЯ</p><h1 tabindex="-1">Всё началось<br>с сообщения.</h1>
      <p>От той ночи у тебя остались обрывки. Телефон помнит больше.</p>
      ${go("Взять телефон", "lock", "menu-primary")}</section>`,
    lock: () => `<section class="lock"><div class="lock-clock" aria-label="Понедельник, 23 ноября, 21:41">${svg("lock")}<p>Понедельник, 23 ноября</p><h1 tabindex="-1">21:41</h1></div>
      <button class="lock-notification" data-action="unlock"><span class="app-icon messages">${svg("messages")}</span>
        <span><strong>Неизвестный номер</strong><small>Ты дома?</small></span><small>сейчас</small></button>
      <div class="lock-help"><p>Проведи вверх, чтобы разблокировать телефон</p>${button("Разблокировать", "unlock", "", "lock-button")}</div></section>`,
    home: () => {
      const apps = ["messages", "photos", "calls", "browser", "notes", "settings", "journal"];
      const tiles = (ids, dock = false) => ids.map(id => {
        const count = id === "messages" ? unread(state) : id === "calls" && state.call === "declined" ? 1 : 0;
        const focus = id === "messages" && state.tutorial === "messages" || id === "photos" && state.tutorial === "photo" || id === "journal" && state.tutorial === "journal";
        return go(`<span class="app-icon ${id}">${svg(appGlyph[id] ?? id)}${count ? `<span class="badge" aria-hidden="true">${count}</span>` : ""}</span>${dock ? "" : `<span>${labels[id]}</span>`}`,
          id, `app-tile${focus && settings.hints ? " highlighted" : ""}`, `aria-label="${labels[id]}"`);
      }).join("");
      return `<h1 class="visually-hidden" tabindex="-1">Домашний экран</h1><div class="home-grid">${tiles(apps)}</div>
        <div class="home-coach">${hint(state, settings, "messages", "Открой Сообщения.")}
        ${hint(state, settings, "photo", "В сообщении есть зацепка. Открой Фото и найди снимок лестницы.")}
        ${hint(state, settings, "journal", "Открой Журнал и посмотри, что сохранилось.")}</div>
        <nav class="dock" aria-label="Док">${tiles(["calls", "messages", "browser"], true)}</nav>`;
    },
    messages: () => `${head("Сообщения")}
      ${hint(state, settings, "thread", "Открой переписку с неизвестного номера.")}
      <input class="search" type="search" id="chat-search" autocomplete="off" placeholder="Поиск" aria-label="Поиск переписок">
      <div class="chat-list">${threads(state).map(entry => {
        const display = name(state, entry.who);
        const isUnread = entry.time > (state.read[entry.who] ?? -Infinity);
        return button(`<span class="unread-dot ${isUnread ? "visible" : ""}"></span>${avatar(state, entry.who)}
          <span class="chat-copy"><strong>${display}</strong><span>${esc(entry.latest)}</span></span>
          <time>${clock(entry.time)}</time>`, "thread", entry.who, "chat-row",
          `data-search="${esc(display + " " + entry.nodes.flatMap(id => story[id].lines).join(" ") + " " + entry.latest)}" ${isUnread ? 'aria-description="Непрочитанное сообщение"' : ""}`);
      }).join("")}<p id="no-results" class="empty" hidden>Переписки не найдены.</p></div>`,
    thread: () => threadView(state, settings, ui),
    photos: () => `${head("Фото")}<p class="section-note">Все фотографии · ноябрь</p><div class="photo-grid">${photos.map(p =>
      button(image(p.file, p.title) + `<span>${p.date.split(" · ")[0]}</span>`, "photo", p.id, "photo-thumb", `aria-label="${p.title}"`)).join("")}</div>`,
    photo: () => {
      const p = photos[ui.photo];
      const tutorialPhoto = p.id === "parking" && state.tutorial === "save";
      return `${head(p.date, back("Фото", "photos"))}
        <div class="shot ${ui.zoom ? "zoomed" : ""}">${image(p.file, p.title)}</div>
        <nav class="photo-controls" aria-label="Управление фотографией">
          ${button(svg("back"), "photo-step", "-1", "", 'aria-label="Предыдущая фотография"')}
          ${button(svg("zoom"), "zoom", "", "", `aria-label="Увеличение" aria-pressed="${ui.zoom}"`)}
          ${button(svg("info"), "metadata", "", "", `aria-label="Метаданные" aria-pressed="${ui.metadata || tutorialPhoto}"`)}
          ${button(svg("next"), "photo-step", "1", "", 'aria-label="Следующая фотография"')}
        </nav>
        ${tutorialPhoto && settings.hints ? hint(state, settings, "save", "В метаданных видно время оригинала. Сохрани снимок в журнал.") : ""}
        ${ui.metadata || tutorialPhoto ? `<section class="metadata"><h2>${p.title}</h2><p>${p.detail}</p>${p.clue ? saved(state, p.clue) : ""}</section>` : ""}`;
    },
    calls: () => `${head("Телефон")}<div class="tabs">${go("Недавние", "calls", "selected")}${go("Контакты", "contacts")}</div>
      ${state.call && !["scheduled","ringing","active"].includes(state.call) ? `<article class="call-row">${avatar(state, "pavel")}<div><strong>Павел</strong><p>23 ноября · ${clock(state.callAt)} · ${state.call === "declined" ? "Пропущенный" : "Входящий"}</p></div></article>` : ""}
      ${oldCalls.map(([who, time, kind]) => `<article class="call-row">${avatar(state, who)}<div><strong>${name(state, who)}</strong><p>${time} · ${kind}</p></div></article>`).join("")}${saved(state, "call")}`,
    contacts: () => `${head("Контакты")}<div class="tabs">${go("Недавние", "calls")}${go("Контакты", "contacts", "selected")}</div>
      ${threads(state).sort((a, b) => name(state, a.who).localeCompare(name(state, b.who), "ru")).map(({who}) =>
        button(`${avatar(state, who)}<strong>${name(state, who)}</strong>`, "thread", who, "call-row")).join("")}`,
    ringing: () => `<section class="call-screen">${avatar(state, "pavel")}<p>Входящий вызов</p><h1 tabindex="-1">Павел</h1><div class="call-actions">
      ${button(svg("phone") + "<span>Отклонить</span>", "call", "decline", "decline")}
      ${button(svg("phone") + "<span>Принять</span>", "call", "accept", "accept")}</div></section>`,
    active: () => {
      const lines = ["Слышишь меня? Это Павел, я дежурил в «Северном».", "Когда я увидел Дениса у лестницы, дверь уже была открыта. Я видел время на панели, но лица у двери не видел.", "Дам выписку из журнала. Там время вызова скорой, отдельно от отметки у двери. Перешлю в сообщения."];
      return `<section class="call-screen active">${avatar(state, "pavel")}<p>Вызов · Павел</p><h1 tabindex="-1">На линии</h1>
        <div class="subtitles" aria-live="polite">${text(lines.slice(0, ui.callLine + 1))}</div>
        ${ui.callLine < lines.length - 1 ? button("Дальше", "call-next", "", "action") : ""}
        ${button("Завершить вызов", "hang", "", "end-call")}</section>`;
    },
    browser: () => `${head("Браузер")}<div class="address">${svg("lock")} cityfeed.local</div>
      ${go("CityFeed", "feed", "web-bookmark")}${go("Архив новостей", "feedArchive", "web-bookmark")}
      ${go("ГорТранс", "transit", "web-bookmark")}${go("История посещений", "history", "web-bookmark")}`,
    transit: () => `${head("Браузер", back("Закладки", "browser"))}<div class="address">${svg("lock")} gortrans.local</div>
      <article class="news"><p class="kicker">ГОРОДСКОЙ ТРАНСПОРТ</p><h2>Маршрут 4</h2>${image("tram.jpg")}
      <p>Складская → Набережная → Северный. Первый рейс 07:12. У старого склада остановка работает только в сторону центра.</p>
      <p>Обновлено 21 ноября. Время указано по расписанию, фактическое движение может отличаться.</p></article>`,
    feed: () => feed("CityFeed", "Последние новости", ["update", "tram"], "browser"),
    feedArchive: () => feed("Архив", "Ноябрь", ["update", "tram", "search"], "feed"),
    history: () => `${head("История", back("Браузер", "browser"))}<div class="address">cityfeed.local</div>
      ${state.history.length ? state.history.slice().reverse().map(id => id === "transit" ? go("ГорТранс · маршрут 4", "transit", "web-bookmark")
        : button(articles[id].title, "article", id, "web-bookmark")).join("") :
        '<p class="empty">Ты ещё не открывал статьи.</p>'}`,
    article: () => {
      const article = articles[ui.article];
      return `${head("CityFeed", back("Назад", ui.articleBack))}<div class="address">cityfeed.local / новости</div><article class="news">
      <p class="kicker">${article.category}</p><h2>${article.title}</h2><p class="stamp">${article.date}</p>
      ${image(article.image)}${text(article.paragraphs)}${article.clue ? saved(state, article.clue) : ""}</article>`;
    },
    notes: () => `${head("Заметки", "", button("Новая", "note-new", "", "text-button"))}
      ${group("На телефоне", Object.entries(oldNotes).map(([id, note]) =>
        button(`<strong>${note.title}</strong><small>${note.date}</small>`, "note", id, "note-row")).join(""))}
      ${state.notes.length ? group("Мои заметки", state.notes.slice().reverse().map(note =>
        button(`<strong>${esc(note.title || "Без названия")}</strong><small>${noteDate(note.updated)}</small>`, "note", note.id, "note-row")).join("")) : ""}`,
    note: () => {
      const original = oldNotes[ui.note];
      const personal = state.notes.find(item => item.id === ui.note);
      return `${head("Заметки", back("Все", "notes"))}${original
        ? `<article class="note-body">${stamp(original.date)}<h2>${original.title}</h2><p>${original.text}</p>${original.clue ? saved(state, original.clue) : ""}</article>`
        : `<article class="note-body">${stamp(`Создано ${noteDate(personal.created)} · изменено ${noteDate(personal.updated)}`)}
          <input id="note-title" aria-label="Заголовок" placeholder="Заголовок" value="${esc(personal.title)}" maxlength="120">
          <textarea id="note-text" aria-label="Текст заметки" placeholder="Текст заметки" maxlength="4000">${esc(personal.text)}</textarea></article>`}`;
    },
    journal: () => {
      const items = state.clues.map(id => ({ id, ...clues[id] }));
      return `${head("Журнал")}
        ${ui.journalCoach && settings.hints ? '<aside class="coach">Материалы добавляются по мере событий. Журнал отделяет факты от показаний и предположений.</aside>' : ""}
        <div class="tabs">${go("Материалы", "journal", "selected")}${go("Хронология", "timeline")}</div>
        ${items.length ? ["Факты", "Показания", "Предположения"].map(type => {
          const matches = items.filter(item => item.type === type);
          return matches.length ? group(type, matches.map(item => button(`<strong>${item.title}</strong><small>${item.source} · ${item.date}</small>`, "clue", item.id, "note-row")).join("")) : "";
        }).join("") : '<p class="empty">Здесь появятся материалы, которые ты сохранишь.</p>'}`;
    },
    timeline: () => `${head("Хронология", back("Журнал", "journal"))}
      ${state.clues.length ? `<ol class="timeline">${state.clues.map(id => clues[id]).sort((a,b) => a.order-b.order).map(item =>
        `<li><time>${item.date}</time><strong>${item.title}</strong><p>${item.text}</p></li>`).join("")}</ol>` :
        '<p class="empty">Хронология появится после сохранения первого материала.</p>'}`,
    clue: () => {
      const clue = clues[ui.clue];
      return `${head(clue.type, back("Журнал", "journal"))}<article class="document"><p class="kicker">${clue.source}</p>
      <h2>${clue.title}</h2><p>${clue.date}</p><p>${clue.text}</p><p class="muted">Связано с: ${clue.related}</p>
      ${connections[ui.clue].filter(id => state.clues.includes(id)).map(id =>
        button(clues[id].title, "clue", id, "note-row")).join("")}
      <p class="saved">Сохранено</p></article>`;
    },
    archive: () => `${head("Папка редакции", back("Сообщения", "thread"))}<article class="document">
      <p class="kicker">ПРИЛОЖЕНИЕ К ЧЕРНОВИКУ</p><h2>Копия и оригинал</h2>
      <dl><dt>Оригинал IMG_1093</dt><dd>7 ноября · 19:43</dd><dt>Доставка пересланной копии</dt><dd>13 ноября · 23:27</dd>
      <dt>Выписка смены</dt><dd>13 ноября · 23:22, 23:24, 23:29</dd></dl>
      <p>Публикация адреса не согласована. Отправка сообщения с аккаунта не удостоверяет личность человека, державшего телефон.</p>
      ${saved(state, "export")}
      ${state.clues.includes("export") ? go("Сверить версии", "compare", "action") : ""}</article>`,
    compare: () => `${head("Сверка материалов", back("Папка", "archive"))}
      <article class="document"><p>Проверь, что можно подтвердить по двум независимым источникам.</p>
      ${comparison(state, "timestamps", "Доказывает ли снимок, что отправитель был дома в 23:27?",
        "Фото старое. Известно только время отправки копии.", "Да, время под сообщением совпадает с моментом съёмки.")}
      ${state.clues.includes("witness") ? comparison(state, "witness", "Можно ли назвать человека, стоявшего у двери в момент падения?",
        "Нет. Денис не видел лица, а в журнале нет имени.", "Да. В журнале есть точное время, значит известен и человек.") :
        '<p class="muted">Для второй сверки сохрани слова Дениса в журнале.</p>'}
      ${orderPuzzle(state, ui.sequence)}
      ${state.comparisons.length === 3 ? go("Вернуться к Нине", "thread", "action") : ""}</article>`,
    settings: () => `${head("Настройки", ui.settingsBack === "menu" ? back("Меню", "menu") : "")}
      <div class="settings-list">
        <label>Громкость <input id="volume" type="range" min="0" max="100" value="${settings.volume}"></label>
        <label>Сюжетные паузы <select id="speed"><option value="normal" ${settings.speed === "normal" ? "selected" : ""}>Обычные</option><option value="fast" ${settings.speed === "fast" ? "selected" : ""}>Короткие</option><option value="instant" ${settings.speed === "instant" ? "selected" : ""}>Без пауз</option></select></label>
        <label>Подсказки <input id="hints" type="checkbox" role="switch" ${settings.hints ? "checked" : ""}></label>
        <label>Плавные анимации <input id="motion" type="checkbox" role="switch" ${settings.motion ? "checked" : ""}></label>
        ${button("Повторить обучение", "teach", "", "setting-button")}
        ${button("Новая игра", "new", "", "setting-button critical")}
        ${go("Главное меню", "menu", "setting-button")}
      </div><p class="section-note">LAST SEEN ${VERSION} · Complete Experience</p>
      <p class="section-note">Для полноэкранного запуска открой игру в Safari, нажми «Поделиться» и выбери «На экран Домой».</p>`,
    ending: () => {
      const end = endings[state.ending];
      const scenes = state.ending === "wrong" && state.answers.record.choice === "source" ? end.uncorroborated : end.scenes;
      return `<section class="cover content-cover ending"><p class="kicker">EPISODE 01 · ЗАВЕРШЁН</p><h1 tabindex="-1">${end.title}</h1><p>${end.subtitle}</p>
        ${scenes.map(([time, speaker, line]) => `<article class="epilogue">${stamp(time)}<h2>${speaker}</h2><p>${line}</p></article>`).join("")}
        ${go("Мои решения", "summary", "menu-primary")}${button("Начать заново", "new", "", "menu-primary")}${go("Главное меню", "menu", "menu-secondary")}</section>`;
    },
    summary: () => `<section class="cover content-cover">${back("Эпилог", "ending")}<h1 tabindex="-1">Мои решения</h1>
      ${Object.entries(state.answers).map(([id, a]) => `<article class="epilogue"><p class="stamp">${name(state, story[id].who)}</p><p>${story[id].choices[a.choice].text}</p></article>`).join("")}
      <article class="epilogue"><p>Звонок Павла: ${state.call === "accepted" ? "принят" : "отклонён"}.</p></article></section>`,
  };
  return pages[page]();
}

function feed(title, subtitle, ids, parent) {
  return `${head("Браузер", back("Назад", parent))}<div class="address">${svg("lock")} cityfeed.local</div>
    <section class="feed"><div class="feed-brand"><strong>${title}</strong><p>${subtitle}</p></div>
    ${ids.map(id => {
      const article = articles[id];
      return button(`${image(article.image)}<span class="feed-story"><small>${article.category} · ${article.date}</small><strong>${article.title}</strong></span>`, "article", id, "feed-card");
    }).join("")}${title !== "Архив" ? go("Архив новостей", "feedArchive", "web-bookmark") : ""}</section>`;
}

function noteDate(value) {
  return new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(value);
}

function comparison(state, id, question, supported, disputed) {
  const options = [
    button(supported, "compare", id + ":supported", "reply-option"),
    button(disputed, "compare", id + ":disputed", "reply-option"),
  ];
  if (id === "timestamps") options.reverse();
  return `<section class="comparison"><h2>${question}</h2>${state.comparisons.includes(id)
    ? `<p class="saved">${supported}</p>` : options.join("")}</section>`;
}

function orderPuzzle(state, sequence) {
  const events = {
    export: "Доставка копии снимка кухни",
    help: "Вызов скорой",
    photo: "Снимок лестницы",
    ledger: "Снят фиксатор двери",
  };
  if (!state.comparisons.includes("timestamps") || !state.comparisons.includes("witness")) return "";
  const complete = state.comparisons.includes("order");
  const order = complete ? ["photo", "ledger", "export", "help"] : sequence;
  return `<section class="comparison"><h2>Восстанови порядок событий</h2>
    <p class="muted">Сверь время на снимке, в выписке и в папке редакции. Выбирай от раннего к позднему.</p>
    ${order.length ? `<ol class="sequence">${order.map(id => `<li>${events[id]}</li>`).join("")}</ol>` : ""}
    ${complete ? '<p class="saved">Хронология сверена</p>' : Object.keys(events).filter(id => !order.includes(id)).map(id =>
      button(events[id], "order-add", id, "reply-option")).join("") +
      (order.length ? button("Убрать последний пункт", "order-undo", "", "text-button") : "") +
      (order.length === 4 ? button("Сверить хронологию", "compare-order", "", "action") : "")}
    </section>`;
}
