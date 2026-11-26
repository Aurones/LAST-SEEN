import { test } from "node:test";
import assert from "node:assert/strict";
import { people } from "../people.mjs";
import { canOpenArchive, canSend, collect, finish, fresh, readSave, reply } from "../game.mjs";

test("archive requires all three source clues and deduplicates entries", () => {
  const state = fresh();
  assert.equal(collect(state, "recording"), false);
  for (const id of ["photo", "call", "news"]) {
    assert.equal(canOpenArchive(state), false);
    assert.equal(collect(state, id), true);
    assert.equal(collect(state, id), false);
  }
  assert.equal(canOpenArchive(state), true);
  assert.equal(collect(state, "recording"), true);
  assert.equal(canSend(state), true);
});

test("each ending can be reached and the police ending requires the recording", () => {
  const state = fresh();
  for (const id of ["photo", "call", "news"]) collect(state, id);
  assert.equal(finish(state, "witness"), false);
  collect(state, "recording");
  assert.equal(finish(state, "witness"), true);
  assert.equal(finish(state, "silence"), false);
  assert.equal(collect(state, "other"), false);
  const replay = fresh([...state.unlocked]);
  assert.equal(finish(replay, "alina"), true);
  const finalReplay = fresh([...replay.unlocked]);
  assert.equal(finish(finalReplay, "silence"), true);
  assert.deepEqual(readSave(JSON.stringify(finalReplay)), finalReplay);
  assert.deepEqual(finalReplay.unlocked, ["witness", "alina", "silence"]);
});

test("prototype clues, notes and replies migrate", () => {
  const choice = people.UNKNOWN.options[1];
  const save = {
    notes: "Вход с парковки",
    flags: { photo: true, call: true, news: true, unknown: true, unknown_reply: choice },
    chats: { alina: reply(people.Alina, people.Alina.options[0]) },
  };
  const state = readSave(JSON.stringify(save));
  assert.equal(state.notes, save.notes);
  assert.deepEqual(state.clues, ["photo", "call", "news"]);
  assert.deepEqual(state.chats.unknown, reply(people.UNKNOWN, choice));
  assert.deepEqual(state.chats.alina, save.chats.alina);
});

test("older placeholder chat restores its original reply", () => {
  const choice = people.Mark.options[0];
  const previous = { chats: { mark: { choice, responses: ["Переписка восстановлена"] } } };
  assert.deepEqual(readSave(JSON.stringify(previous)).chats.mark, reply(people.Mark, choice));
});

test("invalid storage and invalid IDs are ignored", () => {
  assert.deepEqual(readSave("{"), fresh());
  const state = readSave(JSON.stringify({ version: 1, clues: ["photo", "photo", "__proto__"], ending: "witness", unlocked: ["unknown"] }));
  assert.deepEqual(state.clues, ["photo"]);
  assert.deepEqual(state.unlocked, []);
  assert.equal(state.ending, null);
});
