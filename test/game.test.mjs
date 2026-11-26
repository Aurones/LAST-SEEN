import { test } from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { archiveOpen, collect, compare, fresh, hangUp, readSave, resolveCall, send, tick, unlock } from "../game.mjs";

function start() {
  const state = fresh();
  state.location = "lock";
  assert.equal(unlock(state), true);
  return state;
}

function answer(state, node, option) {
  assert.equal(send(state, node, option, 10, 0), true, node);
  assert.equal(tick(state, 10, 0), true, node);
}

function reachArchive({ accept = true, friendly = true } = {}) {
  const state = start();
  answer(state, "knock", friendly ? "listen" : "distance");
  answer(state, "mark", friendly ? "calm" : "evening");
  answer(state, "alina", "ask");
  for (const clue of ["photo","call","news","flat"]) assert.equal(collect(state, clue, 10, 0), true);
  answer(state, "claim", friendly ? "context" : "deny");
  assert.equal(state.call, "ringing");
  assert.equal(resolveCall(state, accept, 10, 0), true);
  if (accept) assert.equal(hangUp(state, 10, 0), true);
  answer(state, "alinaAgain", "ask");
  answer(state, "pavel", "copy");
  assert.equal(collect(state, "ledger", 10, 0), true);
  answer(state, "denis", "listen");
  answer(state, "markAgain", friendly ? "private" : "confront");
  answer(state, "veraAgain", friendly ? "promise" : "object");
  answer(state, "nia", friendly ? "verify" : "rush");
  return state;
}

function verify(state) {
  for (const clue of ["export","witness","account"]) assert.equal(collect(state, clue, 10, 0), true);
  assert.equal(compare(state, "timestamps", "supported", 10, 0), true);
  assert.equal(compare(state, "witness", "supported", 10, 0), true);
  assert.equal(compare(state, "order", "help:export:ledger:photo", 10, 0), false);
  assert.equal(compare(state, "order", "photo:ledger:export:help", 10, 0), true);
}

test("new game starts without a transcript or a path to an ending", () => {
  const state = fresh();
  assert.deepEqual(state.unlocked, {});
  assert.equal(send(state, "record", "source", 0, 0), false);
  assert.equal(collect(state, "export"), false);
  assert.equal(collect(state, "photo"), false);
  assert.equal(unlock(state), false);
  assert.equal(readSave('{"version":1}'), null);
});

test("reply is immutable and incremental delivery survives a reload", () => {
  const state = start();
  assert.equal(send(state, "knock", "listen", 100, 100), true);
  assert.equal(send(state, "knock", "distance", 100, 0), false);
  assert.equal(tick(state, 199, 100), false);
  assert.equal(tick(state, 200, 100), true);
  assert.equal(state.answers.knock.shown, 1);
  const restored = readSave(JSON.stringify(state));
  assert.deepEqual(restored, state);
  assert.equal(tick(restored, 265, 100), true);
  assert.equal(restored.answers.knock.ready, true);
  assert.equal(restored.answers.knock.shown, 2);
  assert.deepEqual(restored.pending, []);
  assert.equal(tick(restored, 300, 100), false);
});

test("archive and conclusion require sequential actions and deduction", () => {
  const state = reachArchive();
  assert.equal(archiveOpen(state), true);
  assert.equal(send(state, "record", "source", 10, 0), false);
  assert.equal(compare(state, "timestamps", "supported"), false);
  assert.equal(collect(state, "export"), true);
  assert.equal(collect(state, "export"), false);
  assert.equal(compare(state, "timestamps", "disputed"), false);
  assert.equal(compare(state, "witness", "supported"), false);
  assert.deepEqual(state.comparisons, []);
  assert.equal(state.ending, null);
});

test("all endings follow the final reply, corroboration, and prior decisions", () => {
  for (const [decision, end, accept, friendly] of [
    ["source","truth",true,true], ["source","wrong",false,false],
    ["source","truth",false,true], ["blame","wrong",true,true], ["withdraw","blocked",false,false],
  ]) {
    const state = reachArchive({ accept, friendly });
    verify(state);
    answer(state, "record", decision);
    assert.equal(state.ending, end);
    assert.equal(send(state, "record", "withdraw", 10, 0), false);
    assert.equal(collect(state, "update"), false);
    assert.deepEqual(readSave(JSON.stringify(state)), state);
  }
});

test("active call can be restored and finishing it releases the next message", () => {
  const state = start();
  answer(state, "knock", "ask");
  answer(state, "mark", "phone");
  answer(state, "alina", "ask");
  for (const clue of ["photo","call","news"]) collect(state, clue, 10, 0);
  answer(state, "claim", "context");
  resolveCall(state, true, 10, 0);
  const restored = readSave(JSON.stringify(state));
  assert.equal(restored.call, "active");
  assert.equal(Object.hasOwn(restored.unlocked, "pavel"), false);
  assert.equal(hangUp(restored, 10, 0), true);
  assert.equal(Object.hasOwn(restored.unlocked, "pavel"), true);
});

test("damaged and incompatible saves fail safely", () => {
  for (const input of ["{", "null", '{"version":2}', '{"version":1,"notes":"старые"}']) assert.equal(readSave(input), null);
  const state = start();
  send(state, "knock", "listen", 100, 10);
  state.pending = [];
  assert.equal(readSave(JSON.stringify(state)), null);
  assert.equal(readSave(JSON.stringify({ ...start(), history: ["bogus"] })), null);
});

test("offline manifest and cache resources exist", async () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) await access(new URL(icon.src, root));
  const worker = await readFile(new URL("sw.js", root), "utf8");
  for (const match of worker.matchAll(/"([\w./-]+\.(?:html|mjs|css|svg|png|jpg|webmanifest))(\?[^"]*)?"/g)) {
    const path = match[1].endsWith(".jpg") || /^(icon|wallpaper)/.test(match[1]) ? "assets/" + match[1] : match[1];
    await access(new URL(path, root));
  }
});
