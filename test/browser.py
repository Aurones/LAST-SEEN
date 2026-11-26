"""Browser regression and screenshots on a GitHub Pages-style subpath."""
import argparse
import functools
import json
import mimetypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile
import threading

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MOBILE = {"width": 390, "height": 844}
TEST_PREFS = {"volume": 0, "speed": "instant", "motion": False, "hints": True}
SAVE = "lastseen_episode01"
PREFIX = "/LAST-SEEN/"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def run(browser, url, screenshots, engine):
    def context(size=MOBILE, prefs=TEST_PREFS):
        result = browser.new_context(viewport=size, has_touch=True, device_scale_factor=2,
                                     reduced_motion="reduce")
        result.add_init_script(
            f'if (!localStorage.getItem("lastseen_preferences")) '
            f'localStorage.setItem("lastseen_preferences", {json.dumps(json.dumps(prefs))});')
        return result

    def shot(page, label):
        if label in {"01-menu", "02-lock", "03-home", "07-ringing", "12-ending"}:
            assert page.locator("#phone").evaluate(
                "node => getComputedStyle(node).backgroundColor !== 'rgb(244, 244, 248)'")
        if screenshots:
            page.screenshot(path=screenshots / f"{label}.png", animations="disabled")
        assert page.evaluate("document.documentElement.scrollWidth === innerWidth"), label
        assert page.evaluate(
            '[...document.images].every(img => img.complete && img.naturalWidth > 0)'), label

    def click(page, action, value=None):
        locator = f'#phone button[data-action="{action}"]'
        if value is not None:
            locator += f'[data-id="{value}"]'
        page.locator(locator).first.click()

    def home(page):
        page.get_by_role("button", name="На домашний экран").click()

    def title(page, label):
        expect(page.get_by_role("heading", name=label, exact=True)).to_be_visible()

    def wait_page(page, value):
        expect(page.locator("#phone")).to_have_attribute("data-page", value)

    def open_app(page, app):
        home(page)
        page.locator(f'.home-grid button[data-id="{app}"]').click()

    def open_thread(page, who):
        open_app(page, "messages")
        click(page, "thread", who)

    def answer(page, node, option):
        reply_id = f"{node}:{option}"
        click(page, "select", reply_id)
        expect(page.get_by_role("button", name="Отправить ответ")).to_be_enabled()
        click(page, "send", node)
        expect(page.locator(f'[data-id="{reply_id}"]')).to_have_count(0)
        page.wait_for_function(
            f'JSON.parse(localStorage.getItem("{SAVE}")).answers[{json.dumps(node)}].ready')

    def capture_error(page, errors):
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("response", lambda response: errors.append(f"{response.status} {response.url}")
                if response.status >= 400 else None)

    def new_game(page, swipe=False):
        click(page, "new")
        wait_page(page, "intro")
        click(page, "open", "lock")
        wait_page(page, "lock")
        if swipe:
            shot(page, "02-lock")
            page.mouse.move(175, 675)
            page.mouse.down()
            page.mouse.move(175, 570, steps=5)
            page.mouse.up()
        else:
            page.get_by_role("button", name="Разблокировать", exact=True).click()
        wait_page(page, "home")

    errors = []
    ctx = context()
    page = ctx.new_page()
    capture_error(page, errors)
    page.goto(url)
    wait_page(page, "menu")
    expect(page.get_by_role("button", name="Продолжить")).to_be_disabled()
    shot(page, "01-menu")
    click(page, "open", "about")
    title(page, "LAST SEEN")
    click(page, "open", "menu")
    new_game(page, swipe=True)
    shot(page, "03-home")
    expect(page.get_by_text("Открой Сообщения.")).to_be_visible()
    click(page, "open", "messages")
    shot(page, "04-messages")
    expect(page.get_by_text("Открой переписку с неизвестного номера.")).to_be_visible()
    click(page, "thread", "unknown")
    expect(page.get_by_text("Выбери реплику.", exact=False)).to_be_visible()
    shot(page, "05-thread")
    answer(page, "knock", "listen")
    expect(page.get_by_text("Нажми нижнюю полоску", exact=False)).to_be_visible()
    home(page)
    expect(page.get_by_text("В сообщении есть зацепка", exact=False)).to_be_visible()
    click(page, "open", "photos")
    shot(page, "06-photos")
    click(page, "photo", "parking")
    expect(page.get_by_text("В метаданных видно время оригинала", exact=False)).to_be_visible()
    click(page, "collect", "photo")
    open_app(page, "journal")
    expect(page.get_by_text("Материалы добавляются", exact=False)).to_be_visible()
    shot(page, "10-journal")
    click(page, "open", "timeline")
    title(page, "Хронология")
    click(page, "open", "journal")
    click(page, "clue", "photo")
    expect(page.get_by_text("Связано с:", exact=False)).to_be_visible()
    open_app(page, "settings")
    shot(page, "11-settings")
    click(page, "teach")
    wait_page(page, "lock")
    page.get_by_role("button", name="Разблокировать", exact=True).click()
    expect(page.get_by_text("Открой Сообщения.")).to_be_visible()
    click(page, "leave-practice")
    title(page, "Настройки")
    open_app(page, "notes")
    shot(page, "09-notes")
    click(page, "note-new")
    page.get_by_role("textbox", name="Заголовок").fill("У служебного входа")
    page.get_by_role("textbox", name="Текст заметки").fill("Сравнить время отправки и оригинал.")
    page.reload()
    wait_page(page, "menu")
    expect(page.get_by_role("button", name="Продолжить")).to_be_enabled()
    click(page, "continue")
    open_app(page, "notes")
    page.get_by_text("У служебного входа", exact=True).click()
    expect(page.get_by_role("textbox", name="Текст заметки")).to_have_value("Сравнить время отправки и оригинал.")
    open_app(page, "messages")
    search = page.get_by_role("searchbox")
    search.fill("Алина")
    expect(page.locator(".chat-row:visible")).to_have_count(1)
    search.fill("неттакого")
    expect(page.get_by_text("Переписки не найдены.")).to_be_visible()
    search.fill("")
    open_thread(page, "unknown")
    expect(page.get_by_text("Что произошло той ночью?", exact=True)).to_be_visible()
    expect(page.locator('[data-action="select"]')).to_have_count(0)
    assert not page.locator('[data-open="ending"]').count()

    def solve(page, final, accept, first_done=False):
        if not first_done:
            open_thread(page, "unknown")
            answer(page, "knock", "distance")
        open_thread(page, "mark")
        answer(page, "mark", "calm" if accept else "evening")
        open_thread(page, "alina")
        answer(page, "alina", "ask")
        open_app(page, "photos")
        click(page, "photo", "parking")
        click(page, "zoom")
        assert page.locator(".shot").evaluate("node => node.scrollWidth > node.clientWidth")
        click(page, "zoom")
        if not first_done:
            click(page, "metadata")
            click(page, "collect", "photo")
        click(page, "photo-step", "-1")
        click(page, "metadata")
        click(page, "collect", "flat")
        open_app(page, "calls")
        click(page, "open", "contacts")
        title(page, "Контакты")
        click(page, "open", "calls")
        click(page, "collect", "call")
        open_app(page, "browser")
        click(page, "open", "transit")
        expect(page.get_by_text("Маршрут 4")).to_be_visible()
        click(page, "open", "browser")
        click(page, "open", "feed")
        if first_done:
            shot(page, "08-cityfeed")
        click(page, "open", "feedArchive")
        click(page, "article", "search")
        click(page, "collect", "news")
        open_app(page, "browser")
        click(page, "open", "history")
        expect(page.get_by_role("button", name="Полиция ищет очевидцев у «Северного»")).to_be_visible()
        open_thread(page, "unknown")
        answer(page, "claim", "context" if accept else "deny")
        title(page, "Павел")
        if first_done:
            shot(page, "07-ringing")
        click(page, "call", "accept" if accept else "decline")
        if accept:
            title(page, "На линии")
            click(page, "call-next")
            click(page, "call-next")
            expect(page.get_by_text("Дам выписку", exact=False)).to_be_visible()
            click(page, "hang")
        else:
            expect(page.locator(".call-row").first.get_by_text("Пропущенный", exact=False)).to_be_visible()
        open_thread(page, "alina")
        answer(page, "alinaAgain", "ask")
        open_thread(page, "pavel")
        answer(page, "pavel", "copy")
        click(page, "collect", "ledger")
        open_thread(page, "denis")
        answer(page, "denis", "listen")
        click(page, "collect", "witness")
        open_thread(page, "mark")
        answer(page, "markAgain", "private" if accept else "confront")
        click(page, "collect", "account")
        open_thread(page, "unknown")
        answer(page, "veraAgain", "promise" if accept else "object")
        open_thread(page, "nina")
        answer(page, "nia", "verify")
        click(page, "open", "archive")
        click(page, "collect", "export")
        click(page, "open", "compare")
        click(page, "compare", "timestamps:disputed")
        expect(page.get_by_text("Сравни время создания оригинала", exact=False)).to_be_visible()
        click(page, "compare", "timestamps:supported")
        expect(page.get_by_text("Вернуться к Нине")).to_have_count(0)
        click(page, "compare", "witness:supported")
        for event in ("photo", "ledger", "export", "help"):
            click(page, "order-add", event)
        click(page, "compare-order")
        click(page, "open", "thread")
        answer(page, "record", final)
        wait_page(page, "ending")
        title(page, {"source": "21:41", "blame": "THE WRONG PERSON", "withdraw": "BLOCKED"}[final])
        if first_done:
            shot(page, "12-ending")
        click(page, "open", "summary")
        title(page, "Мои решения")
        click(page, "open", "ending")

    solve(page, "source", True, first_done=True)
    click(page, "open", "menu")
    click(page, "continue")
    title(page, "21:41")
    for decision in ["blame", "withdraw"]:
        page.once("dialog", lambda dialog: dialog.accept())
        new_game(page)
        click(page, "skip")
        expect(page.get_by_text("Открой Сообщения.")).to_have_count(0)
        save = page.evaluate(f'JSON.parse(localStorage.getItem("{SAVE}"))')
        assert not save["answers"] and not save["notes"] and not save["clues"] and not save["ending"]
        solve(page, decision, False)
    assert not errors, errors
    ctx.close()

    ctx = context(prefs={**TEST_PREFS, "speed": "normal"})
    pending = ctx.new_page()
    pending.add_init_script("""localStorage.setItem("lastseen_save", JSON.stringify({version:1, notes:"Старый текст"}))""")
    pending.goto(url)
    expect(pending.get_by_text("Найдено сохранение 1.0", exact=False)).to_be_visible()
    expect(pending.get_by_role("button", name="Продолжить")).to_be_disabled()
    new_game(pending)
    open_thread(pending, "unknown")
    click(pending, "select", "knock:ask")
    click(pending, "send", "knock")
    expect(pending.get_by_label("Собеседник набирает сообщение")).to_be_visible()
    pending.reload()
    wait_page(pending, "menu")
    click(pending, "continue")
    pending.wait_for_function(f'JSON.parse(localStorage.getItem("{SAVE}")).answers.knock.ready')
    open_thread(pending, "unknown")
    expect(pending.get_by_text("Сначала скажи, ты один?", exact=True)).to_have_count(1)
    expect(pending.get_by_text("Старый текст", exact=True)).to_have_count(0)
    ctx.close()

    for size in [{"width": 320, "height": 568}, {"width": 375, "height": 667},
                 {"width": 430, "height": 932}, {"width": 844, "height": 390}]:
        ctx = context(size)
        mobile = ctx.new_page()
        mobile.goto(url)
        wait_page(mobile, "menu")
        new_game(mobile)
        assert mobile.evaluate("document.documentElement.scrollWidth === innerWidth")
        assert mobile.locator(".home-grid").evaluate("node => getComputedStyle(node).gridTemplateColumns.split(' ').length") == 4
        home(mobile)
        ctx.close()

    ctx = context()
    offline = ctx.new_page()
    offline.goto(url)
    wait_page(offline, "menu")
    offline.wait_for_function("navigator.serviceWorker.controller !== null", timeout=15000)
    offline.evaluate("""async () => {
        const cache = await caches.open("last-seen-episode01-1.1.0");
        await cache.put("./index.html", new Response("<h1>OUTDATED</h1>", {headers: {"Content-Type": "text/html"}}));
    }""")
    offline.reload()
    wait_page(offline, "menu")
    expect(offline.get_by_text("OUTDATED")).to_have_count(0)
    # The real index entry is refreshed online before exercising offline fallback.
    offline.goto(url + "index.html")
    wait_page(offline, "menu")
    ctx.set_offline(True)
    offline.goto(url + "?offline")
    wait_page(offline, "menu")
    new_game(offline)
    open_app(offline, "photos")
    offline.locator(".photo-thumb img").first.evaluate("img => img.decode()")
    ctx.close()
    print(f"{engine}: all three endings, tutorial, resume, all apps, offline cache and five viewport sizes passed.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=["chromium", "webkit"], required=True)
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    mimetypes.add_type("text/javascript", ".mjs")
    with tempfile.TemporaryDirectory(prefix="last-seen-test-") as temp:
        target = Path(temp) / "LAST-SEEN"
        target.mkdir()
        for path in ["index.html", "style.css", "script.mjs", "views.mjs", "game.mjs",
                     "materials.mjs", "people.mjs", "manifest.webmanifest", "sw.js"]:
            shutil.copy2(ROOT / path, target)
        shutil.copytree(ROOT / "assets", target / "assets")
        handler = functools.partial(QuietHandler, directory=temp)
        with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            threading.Thread(target=server.serve_forever, daemon=True).start()
            with sync_playwright() as playwright:
                launch = {}
                if args.engine == "chromium" and shutil.which("chromium"):
                    launch["executable_path"] = shutil.which("chromium")
                browser = getattr(playwright, args.engine).launch(**launch)
                run(browser, f"http://127.0.0.1:{server.server_port}{PREFIX}", args.screenshots, args.engine)
                browser.close()
            server.shutdown()


if __name__ == "__main__":
    main()
