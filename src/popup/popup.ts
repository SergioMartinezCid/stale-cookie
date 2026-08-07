import browser from 'webextension-polyfill';
import { localizePage } from '../ui/i18n';

localizePage();

const scanButton = document.getElementById('scan') as HTMLButtonElement;

scanButton.addEventListener('click', () => {
  // TODO(v0.1): scan cookies, correlate with history, show preview.
  void browser.cookies.getAll({});
});
