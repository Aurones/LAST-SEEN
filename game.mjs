import { people } from "./people.mjs";

export const clues = {
  photo: { title: "IMG_1148.jpg", source: "Фото", text: "13 ноября, 23:16. Снимок служебного входа со стороны парковки. У двери стоит Марк. В стекле отражается Алина с телефоном.", time: "13 ноября · 23:16" },
  call: { title: "Пропущенный вызов", source: "Телефон", text: "В 00:17 звонили с номера, который сегодня написал тебе. С того же номера пришло голосовое сообщение.", time: "Вчера · 00:17" },
  news: { title: "Запрос полиции", source: "Браузер", text: "Вечером 13 ноября у торгового центра произошёл инцидент. Камера парковки не видела служебный вход. Полиция просит прислать оригиналы записей.", time: "14 ноября · 09:12" },
  recording: { title: "Голосовое Алины", source: "Архив", text: "Алина звонила с телефона охранника. Марк подпер служебную дверь, а ты вывел охранника из-за неё. Алина сохранила полную запись и ждёт твоего ответа.", time: "Вчера · 00:18" },
};

export const endings = {
  witness: { title: "Показания", text: "Ты отправляешь полиции оригиналы и голосовое Алины. Утром следователь звонит: запись совпала с журналом охраны. Марк приходит сам и признаётся, зачем подпер дверь. Охранник подтверждает, что ты вернулся за ним. В 09:12 под твоим последним сообщением Алине появляется «Прочитано»." },
  alina: { title: "Только между нами", text: "Ты пересылаешь Алине то, что успел сохранить. Она встречает тебя у того самого входа и отдаёт копию записи. Вместе вы слушаете её до конца. Полиция всё ещё ищет свидетелей, но теперь у тебя есть человек, с которым можно решить, что сказать." },
  silence: { title: "Не в сети", text: "Ты закрываешь дело и выключаешь телефон. Наутро снимок служебного входа появляется в новостях с подписью «Очевидец неизвестен». Когда ты снова включаешь телефон, сообщение Алины уже удалено. От неё осталась одна строка в списке вызовов." },
};

const replyTimes = { unknown: "21:42", mark: "21:00", alina: "21:14" };
const primary = ["photo", "call", "news"];
const has = (catalog, key) => typeof key === "string" && Object.hasOwn(catalog, key);
const cleanIds = (items, catalog) => Array.isArray(items) ? [...new Set(items.filter(id => has(catalog, id)))] : [];
export const fresh = (unlocked = []) => ({ version: 1, notes: "", chats: {}, clues: [], ending: null, unlocked });
export const canOpenArchive = state => primary.every(id => state.clues.includes(id));
export const canSend = state => canOpenArchive(state) && state.clues.includes("recording");

export function reply(person, choice) {
  if (!person.options.includes(choice)) return null;
  return { choice, responses: [...person.responses[choice]], replyTime: replyTimes[person.key] };
}

export function readSave(raw) {
  try {
    const stored = JSON.parse(raw);
    const state = fresh(cleanIds(stored?.unlocked, endings));
    state.notes = typeof stored?.notes === "string" ? stored.notes : "";
    for (const person of Object.values(people)) {
      const chat = stored?.chats?.[person.key];
      const sent = chat?.choice ?? stored?.flags?.[person.key + "_reply"];
      const original = reply(person, sent);
      const validResponses = Array.isArray(chat?.responses) && chat.responses.length > 0 &&
        chat.responses.every(line => typeof line === "string" && !/восстановлена|предыдущей версии|переписка сохранена/i.test(line));
      if (chat && typeof chat.choice === "string" && validResponses) {
        state.chats[person.key] = { choice: chat.choice, responses: chat.responses, replyTime: replyTimes[person.key] };
      } else if (original || stored?.flags?.[person.key] === true || typeof chat?.choice === "string") {
        state.chats[person.key] = original ?? {
          choice: typeof sent === "string" ? sent : "Сообщение отправлено в предыдущей версии.",
          responses: ["Сообщение прочитано."], replyTime: replyTimes[person.key],
        };
      }
    }
    state.clues = cleanIds(stored?.clues, clues);
    if (stored?.version !== 1) state.clues = primary.filter(id => stored?.flags?.[id] === true);
    finish(state, stored?.ending);
    return state;
  } catch {
    return fresh();
  }
}

export function collect(state, id) {
  if (state.ending || !has(clues, id) || state.clues.includes(id)) return false;
  if (id === "recording" && !canOpenArchive(state)) return false;
  state.clues.push(id);
  return true;
}

export function finish(state, id) {
  if (state.ending || !has(endings, id) || (id === "witness" && !canSend(state))) return false;
  state.ending = id;
  if (!state.unlocked.includes(id)) state.unlocked.push(id);
  return true;
}
