"""Real Chromium smoke test of the static editor and IndexedDB persistence."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
import json, os, functools
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'dist/pages'
PREFIX = '/VectorStudio/'
OUTPUT = ROOT / 'publication-output'
OUTPUT.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.wasm': 'application/wasm'}
    def do_GET(self):
        if not self.path.startswith(PREFIX):
            self.send_error(404); return
        self.path = '/' + self.path[len(PREFIX):]
        super().do_GET()
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(SITE)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}{PREFIX}'
try:
    with sync_playwright() as p:
        executable = os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH')
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'], **({'executable_path': executable} if executable else {}))
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        page = context.new_page(); errors = []; failed = []; apis = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('response', lambda r: failed.append(f'{r.status} {r.url}') if r.status >= 400 else None)
        page.on('request', lambda r: apis.append(r.url) if '/api/' in r.url else None)
        page.goto(url)
        page.wait_for_function('window.vellum && window.vellum.collaboration.local === true')
        page.wait_for_selector('#stage svg')
        assert page.locator('body').get_attribute('data-edition') == 'browser'
        initial = page.evaluate('({nodes: vellum.store.doc.nodes.length, pages: vellum.store.doc.pages.length})')
        assert initial['nodes'] > 0 and initial['pages'] > 0
        page.screenshot(path=str(OUTPUT / 'pages-studio.png'), full_page=True)
        page.evaluate("""async () => {
          const v = window.vellum;
          v.store.transact('Persistence test', d => { d.name = 'GitHub Pages persistence'; });
          v.store.add('rect', { x: 40, y: 50, width: 150, height: 80, name: 'Persisted rectangle' });
          await v.commands.execute('save');
        }""")
        page.wait_for_function('vellum.collaboration.project && !vellum.collaboration.dirty && !vellum.collaboration.saving')
        saved = page.evaluate('({id: vellum.collaboration.project.id, name: vellum.store.doc.name, count: vellum.store.doc.nodes.length})')
        assert '?project=' in page.url and PREFIX in page.url
        page.reload()
        page.wait_for_function('vellum.collaboration.project && vellum.store.doc.name === "GitHub Pages persistence"')
        assert page.evaluate('vellum.store.doc.nodes.length') == saved['count']
        assert page.evaluate('vellum.collaboration.project.id') == saved['id']
        page.evaluate("""async () => { vellum.store.update([vellum.store.doc.nodes.at(-1).id], {x: 95}); await vellum.commands.execute('save'); }""")
        page.wait_for_function('!vellum.collaboration.dirty && !vellum.collaboration.saving')
        revisions = page.evaluate("async () => (await vellum.collaboration.action('revisions')).revisions")
        assert len(revisions) >= 2
        page.evaluate("() => vellum.commands.execute('share')")
        assert 'only in this browser' in page.locator('dialog[open]').inner_text()
        page.locator('dialog[open] [data-action="close-dialog"]').click()
        page.evaluate("async () => { await vellum.commands.execute('print-production'); }")
        assert page.locator('#production-export').is_disabled()
        assert 'standalone server' in page.locator('dialog[open]').inner_text()
        page.locator('dialog[open] [data-action="close-dialog"]').click()
        message = page.evaluate("""async () => { const io = await import('./studio/io/index.js'); try { await io.readFile(new File(['RIFF'], 'test.cdr'), vellum.store.pageId); } catch (e) { return e.message; } }""")
        assert 'standalone server' in message
        with page.expect_download() as download_info:
            page.evaluate("() => vellum.commands.execute('save-file')")
        assert download_info.value.suggested_filename.endswith('.vellum')
        assert '<svg' in page.evaluate('vellum.exportSVG()')
        page.evaluate("() => vellum.commands.execute('page-manager')")
        count = page.evaluate('vellum.store.doc.pages.length')
        page.locator('[data-page-copy]').first.click()
        assert page.evaluate('vellum.store.doc.pages.length') == count + 1
        page.locator('dialog[open] [data-action="close-dialog"]').last.click()
        page.evaluate("async () => { await vellum.commands.execute('save'); }")
        page.wait_for_function('!vellum.collaboration.dirty && !vellum.collaboration.saving')
        page.set_viewport_size({'width': 820, 'height': 900})
        page.screenshot(path=str(OUTPUT / 'pages-narrow.png'), full_page=True)
        component = context.new_page(); component.on('pageerror', lambda e: errors.append(str(e)))
        component.goto(url + 'examples/standalone.html')
        component.wait_for_function('window.componentLab && componentLab.store.doc.nodes.length > 0')
        assert component.locator('vellum-canvas').count() == 1
        assert component.evaluate('typeof window.vellum') == 'undefined'
        component.screenshot(path=str(OUTPUT / 'pages-components.png'), full_page=True)
        assert not errors, errors
        assert not failed, failed
        assert not apis, apis
        report = {'status': 'passed', 'initial': initial, 'savedProject': saved['id'], 'savedObjectCount': saved['count'], 'revisions': len(revisions), 'pageErrors': errors, 'httpErrors': failed, 'apiRequests': apis, 'checks': ['editor boot', 'real IndexedDB save', 'reload persistence', 'editable geometry', 'revision history', 'file download', 'multipage duplication', 'backend capability notices', 'native import guard', 'standalone controls', 'desktop and narrow screenshots']}
        (OUTPUT / 'browser-report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))
        context.close(); browser.close()
finally:
    server.shutdown(); server.server_close()
