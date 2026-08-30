/**
 * i18n integrity tests — P0 gate.
 *
 * - Every static `t('...')` key used anywhere in src resolves to a real
 *   translation (never falls back to the raw key).
 * - Every static `tN('...')` key resolves its `.other` plural form.
 * - Interpolation + plural helpers behave.
 * - Locale switching updates the active locale + TTS tag.
 */
// MUST be first: installs localStorage before the store module below evaluates.
import './test-shim';
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { t, tN, setLocale, getLocale, getTtsLocale, useI18n } from './index';

/** Recursively collect source files (skip .test.ts, .bak-*, node_modules). */
function collectSrcFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      collectSrcFiles(full, out);
    } else if (
      (extname(entry) === '.ts' || extname(entry) === '.tsx') &&
      !entry.includes('.test.') &&
      !entry.includes('.bak')
    ) {
      out.push(full);
    }
  }
  return out;
}

/** Extract static string keys from `t('key'` and `tN('key'` call sites. */
function extractKeys(srcDir: string): { tKeys: string[]; tNKeys: string[] } {
  const tKeys = new Set<string>();
  const tNKeys = new Set<string>();
  for (const file of collectSrcFiles(srcDir)) {
    // strip block comments and full-line comments so docstrings don't count
    let code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const tRe = /\bt\(\s*'([^']+)'/g;
    const tNRe = /\btN\(\s*'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = tNRe.exec(code))) tNKeys.add(m[1]);
    while ((m = tRe.exec(code))) tKeys.add(m[1]);
  }
  return { tKeys: [...tKeys], tNKeys: [...tNKeys] };
}

const { tKeys, tNKeys } = extractKeys(join(__dirname, '..', '..'));

describe('i18n dictionary integrity', () => {
  it('every t() key used in src resolves to a translation', () => {
    const missing = tKeys.filter((k) => t(k) === k);
    expect(missing).toEqual([]);
  });

  it('every tN() key used in src resolves its plural forms', () => {
    const missing = tNKeys.filter((k) => {
      // .other form must resolve (tN falls back to plain key if missing)
      const resolved = tN(k, 2);
      return resolved === k;
    });
    expect(missing).toEqual([]);
  });

  it('does not ship the raw key for any registered dictionary entry', () => {
    // sanity: t() of a known key never echoes the key
    expect(t('common.loading')).not.toBe('common.loading');
  });
});

describe('t() interpolation + fallback', () => {
  it('interpolates {param} placeholders', () => {
    expect(t('offline.indicator.saved', { count: 4 })).toBe('4 items saved');
    expect(t('login.welcomeTo', { school: 'Demo School' })).toBe('Welcome to Demo School');
  });

  it('returns the raw key for unknown keys (never crashes)', () => {
    expect(t('no.such.key.anywhere')).toBe('no.such.key.anywhere');
  });
});

describe('tN() plurals', () => {
  it('uses .one for count === 1 and .other otherwise', () => {
    expect(tN('offline.indicator.itemsToSync', 1)).toBe('1 item to sync');
    expect(tN('offline.indicator.itemsToSync', 3)).toBe('3 items to sync');
    expect(tN('offline.indicator.itemsToSync', 0)).toBe('0 items to sync');
  });

  it('interpolates extra params', () => {
    expect(tN('offline.indicator.itemsToSync', 2, { count: 2 })).toBe(
      '2 items to sync'
    );
  });
});

describe('locale switching', () => {
  it('setLocale updates getLocale and the TTS tag', () => {
    setLocale('en');
    expect(getLocale()).toBe('en');
    expect(getTtsLocale()).toBe('en-US');
    setLocale('en-NG');
    expect(getLocale()).toBe('en-NG');
    expect(getTtsLocale()).toBe('en-NG');
  });

  it('ignores unknown locales (store unchanged)', () => {
    const before = getLocale();
    setLocale('xx');
    expect(getLocale()).toBe(before);
  });

  it('persists the locale through the store', () => {
    useI18n.getState().setLocale('en');
    const saved = JSON.parse(
      (globalThis as any).localStorage.getItem('elitekids-locale') || '{}'
    );
    expect(saved.state?.locale).toBe('en');
  });
});
