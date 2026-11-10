// Abre um Chrome headless com perfil TEMPORÁRIO (nunca usa o Chrome da pessoa, nunca faz login).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function candidatosDoSistema() {
  const l = [];
  if (process.env.ESPIAO_CHROME) l.push(process.env.ESPIAO_CHROME);
  if (process.platform === 'win32') {
    for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
      if (base) l.push(path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'));
    }
  } else if (process.platform === 'darwin') {
    l.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    l.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium');
  }
  return l;
}

export async function acharChrome(puppeteer) {
  // Se a pessoa apontou um Chrome, vale esse.
  if (process.env.ESPIAO_CHROME && fs.existsSync(process.env.ESPIAO_CHROME)) return process.env.ESPIAO_CHROME;
  // 1) o Chrome for Testing que o puppeteer baixou no npm install
  try {
    const p = puppeteer.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch { /* segue */ }
  // 2) um Chrome instalado no computador
  for (const c of candidatosDoSistema()) if (c && fs.existsSync(c)) return c;
  return null;
}

export async function abrirNavegador() {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch {
    throw new Error('O pacote "puppeteer" não está instalado. Rode "npm install" dentro da pasta da skill espiao.');
  }
  const exe = await acharChrome(puppeteer);
  if (!exe) throw new Error('Não achei um Chrome. Rode "npm install" (baixa o Chrome for Testing) ou aponte um Chrome com ESPIAO_CHROME=/caminho/do/chrome.');
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'espiao-perfil-'));
  const args = ['--lang=pt-BR', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--window-size=1400,2200'];
  if (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox');
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, userDataDir: perfil, args, defaultViewport: { width: 1400, height: 2200 } });
  const ua = (await browser.userAgent()).replace('HeadlessChrome', 'Chrome');
  let fechado = false;
  const fechar = async () => {
    if (fechado) return;
    fechado = true;
    try { await browser.close(); } catch { /* já fechou */ }
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch { /* o sistema apaga a pasta temporária depois */ }
  };
  for (const sinal of ['SIGINT', 'SIGTERM']) process.once(sinal, () => { fechar().finally(() => process.exit(130)); });
  return {
    browser, ua, exe, perfil, fechar,
    paginasAbertas: 0,
    async novaPagina() {
      const page = await browser.newPage();
      await page.setUserAgent(ua);
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' });
      return page;
    },
  };
}
