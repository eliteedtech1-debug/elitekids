/**
 * Student tab restructure — render rules (STUDENT-TAB-RESTRUCTURE.md).
 *
 * These guard the five-tab contract structurally, from the AST:
 *   1. TABS declares exactly home / play / path / review / me.
 *   2. Every tab key has exactly ONE `activeTab === 'key'` render branch,
 *      and there is no fallback `else` (or ternary chain) that could render a
 *      tab the child did not pick — the bug that made PLAY render on HOME.
 *   3. One tab = one job: the merged components (RevisionCard/ReviewZone →
 *      REVIEW, Stats/Teams/Leaderboard → ME, LearningPath → LEARN, grid →
 *      PLAY) are imported by that tab only, and never again by StudentHome.
 *   4. Shared helpers (FloatingDeco, getAgeColor, SUBJECT_FILTERS,
 *      HOME_SECTION_LABEL) are declared in exactly one place.
 *
 * Static by design: no DOM environment is configured in this project (vitest
 * runs in `node`), and the rules are about structure, not pixel output. It is
 * the same approach as the i18n key-integrity gate in lib/i18n/i18n.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { en } from '../../../lib/i18n/en';

const STUDENT_DIR = join(__dirname, '..');

/** The 5 tabs the restructure promises, in tab-bar order. */
const EXPECTED_TAB_KEYS = ['home', 'play', 'path', 'review', 'me'];

/** Tab components, one lazy chunk each (code-split per tab). */
const TAB_MODULE_SUFFIXES = [
  './tabs/HomeTab',
  './tabs/PlayTab',
  './tabs/PathTab',
  './tabs/ReviewTab',
  './tabs/MeTab',
];

/** Every file that may own tab content. */
const STUDENT_FILES = [
  'StudentHome.tsx',
  'tabs/HomeTab.tsx',
  'tabs/PlayTab.tsx',
  'tabs/PathTab.tsx',
  'tabs/ReviewTab.tsx',
  'tabs/MeTab.tsx',
  'tabs/StatsTab.tsx',
  'tabs/TeamsTab.tsx',
  'StudentLeaderboardPanel.tsx',
];

/** Component → the single tab file allowed to import it. */
const OWNERSHIP: Array<[string, string]> = [
  // REVISED tab owns all revision/practice UI
  ['/components/RevisionCard', 'tabs/ReviewTab.tsx'],
  ['/components/ReviewZone', 'tabs/ReviewTab.tsx'],
  // LEARN owns the structured path
  ['/components/LearningPath', 'tabs/PathTab.tsx'],
  // PLAY owns the games grid
  ['/components/CheckpointTestOut', 'tabs/PlayTab.tsx'],
  // HOME owns motivation
  ['/components/GardenScene', 'tabs/HomeTab.tsx'],
  // ME owns stats, social and the trophy board
  ['./StatsTab', 'tabs/MeTab.tsx'],
  ['./TeamsTab', 'tabs/MeTab.tsx'],
  ['/StudentLeaderboardPanel', 'tabs/MeTab.tsx'],
  // The seasonal festival is a banner slotted into PLAY, imported by the host
  ['/components/StudentFestival', 'StudentHome.tsx'],
];

/** Content that must never render straight out of StudentHome again. */
const FORBIDDEN_IN_HOME = [
  '/components/RevisionCard',
  '/components/ReviewZone',
  '/components/LearningPath',
  '/components/CheckpointTestOut',
  '/components/GoalCard',
  '/components/XPBar',
  '/components/StreakCounter',
  '/StudentLeaderboardPanel',
  './tabs/StatsTab',
  './tabs/TeamsTab',
];

/** Helpers that must be declared once, in utils/helpers.tsx. */
const SHARED_HELPERS = ['FloatingDeco', 'getAgeColor', 'SUBJECT_FILTERS', 'HOME_SECTION_LABEL'];
const HELPERS_FILE = 'pages/Student/utils/helpers.tsx';

/* ── Source / AST helpers ─────────────────────────────────────── */

function parseFile(absPath: string): ts.SourceFile {
  return ts.createSourceFile(
    absPath,
    readFileSync(absPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/**
 * Module specifiers a file pulls in — static imports AND `import()` calls, so
 * the lazy tab chunks (`lazy(() => import('./tabs/HomeTab'))`) are counted too.
 */
function importSpecifiers(sf: ts.SourceFile): string[] {
  const specs: string[] = [];
  walk(sf, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteral(arg)) specs.push(arg.text);
    }
  });
  return specs;
}

/** Names a file declares (only real declarations, not imports). */
function declaredNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  walk(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) names.add(n.name.text);
    else if (ts.isClassDeclaration(n) && n.name) names.add(n.name.text);
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) names.add(n.name.text);
  });
  return names;
}

/** The `key` values of the TABS array literal. */
function tabKeys(sf: ts.SourceFile): string[] {
  const keys: string[] = [];
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || n.name.text !== 'TABS') return;
    if (!n.initializer || !ts.isArrayLiteralExpression(n.initializer)) return;
    for (const el of n.initializer.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      const keyProp = el.properties.find(
        (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'key',
      );
      if (keyProp && ts.isStringLiteral(keyProp.initializer)) keys.push(keyProp.initializer.text);
    }
  });
  return keys;
}

/** `activeTab === '<literal>'` comparisons, with 1-based line numbers. */
function activeTabLiteralChecks(sf: ts.SourceFile): Array<{ key: string; line: number }> {
  const out: Array<{ key: string; line: number }> = [];
  walk(sf, (n) => {
    if (!ts.isBinaryExpression(n)) return;
    if (n.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return;
    if (!ts.isIdentifier(n.left) || n.left.text !== 'activeTab') return;
    if (!ts.isStringLiteral(n.right)) return;
    out.push({ key: n.right.text, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
  });
  return out;
}

/** Tab labels declared in the TABS array. */
function tabLabelKeys(sf: ts.SourceFile): string[] {
  const labels: string[] = [];
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || !ts.isIdentifier(n.name) || n.name.text !== 'TABS') return;
    if (!n.initializer || !ts.isArrayLiteralExpression(n.initializer)) return;
    for (const el of n.initializer.elements) {
      if (!ts.isObjectLiteralExpression(el)) return;
      const labelProp = el.properties.find(
        (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'labelKey',
      );
      if (labelProp && ts.isStringLiteral(labelProp.initializer)) labels.push(labelProp.initializer.text);
    }
  });
  return labels;
}

/** Text of a named JSX attribute on the first matching component, if present. */
function jsxAttributeText(sf: ts.SourceFile, componentName: string, attributeName: string): string | null {
  let found: string | null = null;
  walk(sf, (n) => {
    if (!ts.isJsxSelfClosingElement(n) || n.tagName.getText(sf) !== componentName) return;
    for (const attr of n.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name.getText(sf) === attributeName && attr.initializer) {
        found = attr.initializer.getText(sf);
      }
    }
  });
  return found;
}


const homePath = join(STUDENT_DIR, 'StudentHome.tsx');
const homeSf = parseFile(homePath);
const studentSfs = new Map(STUDENT_FILES.map((f) => [f, parseFile(join(STUDENT_DIR, f))]));

/* ── 1. Tab set ───────────────────────────────────────────────── */

describe('five-tab structure', () => {
  it('TABS declares exactly home, play, path, review and me — in order', () => {
    expect(tabKeys(homeSf)).toEqual(EXPECTED_TAB_KEYS);
  });

  it('each tab has a lazy chunk of its own (one code-split module per tab)', () => {
    const tabImports = importSpecifiers(homeSf).filter((s) => /^\.\/tabs\/\w+Tab$/.test(s)).sort();
    expect(tabImports).toEqual([...TAB_MODULE_SUFFIXES].sort());
  });

  it('every tab label key resolves to a translation', () => {
    for (const labelKey of tabLabelKeys(homeSf)) {
      expect(en[labelKey], `missing i18n key: ${labelKey}`).toBeTruthy();
    }
  });
});

/* ── 2. One branch per key, no fallback else ──────────────────── */

describe('render branches', () => {
  const checks = activeTabLiteralChecks(homeSf);

  it('renders each tab key from exactly one branch', () => {
    for (const key of EXPECTED_TAB_KEYS) {
      const hits = checks.filter((c) => c.key === key);
      expect(hits.map((h) => h.line), `activeTab === '${key}'`).toHaveLength(1);
    }
  });

  it('has no branch for a removed tab key (stats / festival / leaderboard / teams / progress)', () => {
    const removed = ['stats', 'festival', 'leaderboard', 'teams', 'progress'];
    const stale = checks.filter((c) => removed.includes(c.key));
    expect(stale.map((s) => `${s.key}@${s.line}`)).toEqual([]);
  });

  it('uses no ternary tab chain — a hash of tab keys instead of a fallback `else`', () => {
    const ternaries: string[] = [];
    walk(homeSf, (n) => {
      if (!ts.isConditionalExpression(n)) return;
      let condition = n.condition;
      while (ts.isParenthesizedExpression(condition)) condition = condition.expression;
      if (!ts.isBinaryExpression(condition)) return;
      if (condition.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return;
      if (!ts.isIdentifier(condition.left) || condition.left.text !== 'activeTab') return;
      // `activeTab === tab.key ? … : …` (styling) is not a tab chain — only a
      // literal tab key decides which tab renders.
      if (!ts.isStringLiteral(condition.right)) return;
      const line = homeSf.getLineAndCharacterOfPosition(n.getStart(homeSf)).line + 1;
      ternaries.push(`line ${line}`);
    });
    expect(ternaries).toEqual([]);
  });

  it('renders PlayTab only from the play branch (the old fallback `else` bug)', () => {
    const playBlock = homeSf.getText().split("activeTab === 'play'")[1]?.split("activeTab === 'path'")[0];
    expect(playBlock, 'play branch not found').toBeTruthy();
    expect(playBlock!.includes('<PlayTab')).toBe(true);
    // …and no other branch mentions PLAY's grid content.
    for (const other of ['home', 'path', 'review', 'me']) {
      const block = homeSf.getText().split(`activeTab === '${other}'`)[1]?.split('activeTab === ')[0];
      expect(block?.includes('<PlayTab'), `PlayTab leaked into '${other}'`).toBeFalsy();
    }
  });

  it('passes the seasonal festival banner into PLAY instead of rendering it as a tab', () => {
    const banner = jsxAttributeText(homeSf, 'PlayTab', 'festivalBanner');
    expect(banner, 'no festivalBanner attribute on <PlayTab>').toContain('<StudentFestival');
    expect(banner).toContain('banner');
  });
});

/* ── 3. One tab = one job ─────────────────────────────────────── */

describe('no component renders in two tabs', () => {
  const importers = (needle: string) =>
    [...studentSfs.entries()]
      .filter(([, sf]) => importSpecifiers(sf).some((spec) => spec === needle || spec.endsWith(needle)))
      .map(([file]) => file);

  it.each(OWNERSHIP)('%s is owned by %s alone', (component, owner) => {
    expect(importers(component)).toEqual([owner]);
  });

  it('StudentHome no longer owns any tab content directly', () => {
    const specs = importSpecifiers(homeSf);
    const leaks = FORBIDDEN_IN_HOME.filter((needle) =>
      specs.some((spec) => spec === needle || spec.endsWith(needle)),
    );
    expect(leaks).toEqual([]);
  });

  it('the merged components live in the tabs that promise them', () => {
    const expectOwnedBy = (owner: string, needed: string[]) => {
      const specs = importSpecifiers(studentSfs.get(owner)!);
      for (const needle of needed) {
        expect(specs.some((s) => s === needle || s.endsWith(needle)), `${owner} should import ${needle}`).toBe(true);
      }
    };
    expectOwnedBy('tabs/ReviewTab.tsx', ['/components/RevisionCard', '/components/ReviewZone']);
    expectOwnedBy('tabs/MeTab.tsx', ['./StatsTab', './TeamsTab', '/StudentLeaderboardPanel']);
    expectOwnedBy('tabs/HomeTab.tsx', ['/components/GardenScene', '/components/StreakReminder']);
    expectOwnedBy('tabs/PathTab.tsx', ['/components/LearningPath']);
  });
});

/* ── 4. Shared helpers live in one place ──────────────────────── */

describe('shared helpers', () => {
  // Scope: the student dashboard surface. Components outside it (BossBattle
  // Overlay, GardenScene, ReviewZone, RevisionCard) still carry their own
  // private blob with a different opacity — untouched by the restructure.
  it('are declared once, in utils/helpers.tsx, across the tab surface', () => {
    const scanned = [...STUDENT_FILES, 'utils/helpers.tsx'];
    const definitions = new Map<string, string[]>();
    for (const file of scanned) {
      const names = declaredNames(parseFile(join(STUDENT_DIR, file)));
      for (const helper of SHARED_HELPERS) {
        if (!names.has(helper)) continue;
        definitions.set(helper, [...(definitions.get(helper) ?? []), `pages/Student/${file}`]);
      }
    }
    for (const helper of SHARED_HELPERS) {
      expect(definitions.get(helper), `${helper} declared in`).toEqual([HELPERS_FILE]);
    }
  });

  it('is imported by the tabs that use it instead of re-declared', () => {
    const users = STUDENT_FILES.filter((f) =>
      importSpecifiers(studentSfs.get(f)!).some((s) => s.includes('utils/helpers')),
    );
    expect(users.sort()).toEqual(
      [
        'StudentHome.tsx',
        'StudentLeaderboardPanel.tsx',
        'tabs/PlayTab.tsx',
        'tabs/StatsTab.tsx',
      ].sort(),
    );
  });
});
