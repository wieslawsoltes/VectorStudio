/** Capability-aware UI for static deployments; the server edition is unchanged. */
import { dialog } from './controls/index.js';
export const isStatic = globalThis.VELLUM_STATIC === true;
export function installStaticUI({ commands, collab }) {
  if (!isStatic) return;
  document.body.dataset.edition = 'browser';
  const button = document.querySelector('[data-action="share"]');
  if (button) { button.textContent = 'Share / export'; button.title = 'Export a copy; projects are stored only in this browser'; }
  const explain = (title, extra = '') => {
    const panel = dialog(title, `<p><strong>GitHub Pages stores projects only in this browser.</strong> The page URL does not share artwork or upload your projects.</p><p>Download an editable .vellum file to back up your work or send a copy to another person. Clearing browser site data can remove local projects.</p>${extra}<p>For authenticated multi-user collaboration, project roles, audit administration, native CDR import and native print processing, run the included standalone server: <code>node server/local.mjs</code>.</p>`, '<button class="primary-button" id="static-download">Download editable project</button>');
    panel.querySelector('#static-download').onclick = () => commands.execute('save-file');
    return panel;
  };
  commands.register('share', 'Share / export a project copy', () => explain('Share an exported copy'));
  commands.register('administration', 'Server administration requirements', () => explain('Administration requires the server', '<p>This static edition has no remote accounts, administrator login or cloud database.</p>'));
  const status = document.querySelector('#save-status');
  if (status) status.title = 'Saved projects and revisions stay in this browser profile. Download .vellum backups.';
  collab.addEventListener('status', ({ detail }) => {
    if (detail.status === 'saved' && status) status.textContent = 'Saved in this browser';
  });
}
