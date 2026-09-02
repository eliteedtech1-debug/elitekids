/**
 * GameConfigEditor — plug-&-play visual editor for all 7 game templates.
 *
 * Replaces the raw-JSON experience for teachers: each template gets purpose-
 * built form controls (item rows, tap-to-set-correct-answer, emoji pickers,
 * media library pickers, word-bank chips). The JSON stays the source of truth
 * (GameCreator owns the `configJson` string); every form edit re-serializes
 * through onJsonChange, and the Advanced tab is the same JSON two-way bound —
 * so anything the forms don't cover is still editable, and nothing is lost.
 *
 * Templates: matching · memory-pairs · tap-recognition · drag-sort ·
 *            quiz · fill-in-blank · puzzle-split
 */
import { useState, useMemo, useEffect } from 'react';
import { Wand2, Plus, Trash2, Code2, Sparkles } from 'lucide-react';
import MediaPicker from '@/components/MediaPicker';
import EmojiPicker from '@/components/EmojiPicker';
import { t } from '@/lib/i18n';

type Rec = Record<string, any>;

interface GameConfigEditorProps {
  template: string;
  configJson: string;
  onJsonChange: (json: string) => void;
}

/* ── tiny UI atoms ─────────────────────────────────────────────────────── */

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600">{label}</label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
    />
  );
}

/** Text input with an emoji button — used for labels that kids see. */
function EmojiTextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [showEmoji, setShowEmoji] = useState(false);
  return (
    <div className="relative">
      <TextInput value={value} onChange={onChange} placeholder={placeholder} />
      <button
        type="button"
        onClick={() => setShowEmoji((s) => !s)}
        title={t('gameEditor.pickEmoji')}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-base hover:bg-gray-100"
      >
        😊
      </button>
      {showEmoji && (
        <div className="absolute right-0 top-10 z-30">
          <EmojiPicker
            mode="panel"
            onSelect={(emoji) => { onChange(value + emoji); setShowEmoji(false); }}
            onClose={() => setShowEmoji(false)}
          />
        </div>
      )}
    </div>
  );
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ''}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
    />
  );
}

function RowCard({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="relative rounded-xl border border-gray-200 bg-gray-50/60 p-3 pr-9">
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title={t('common.remove')}
          className="absolute right-2 top-2 rounded-lg p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-[#0F4D92]/40 hover:bg-blue-50/50 hover:text-[#0F4D92]"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}

/** Tap-to-choose correct answer strip. */
function CorrectPicker({ ids, correctId, onPick, labelOf }: { ids: string[]; correctId: string; onPick: (id: string) => void; labelOf: (id: string) => string }) {
  return (
    <div className="rounded-xl bg-teal-50 border border-teal-200 p-3">
      <p className="mb-2 text-xs font-semibold text-teal-700">{t('gameEditor.tapCorrect')}</p>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onPick(id)}
            className={`max-w-[45%] truncate rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              id === correctId
                ? 'bg-teal-600 text-white shadow ring-2 ring-teal-300'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-400'
            }`}
          >
            {id === correctId ? '✓ ' : ''}{labelOf(id) || id}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── the editor ────────────────────────────────────────────────────────── */

export default function GameConfigEditor({ template, configJson, onJsonChange }: GameConfigEditorProps) {
  const [tab, setTab] = useState<'visual' | 'advanced'>('visual');

  const parsed: Rec = useMemo(() => {
    try { return JSON.parse(configJson) || {}; } catch { return {}; }
  }, [configJson]);
  const isValid = useMemo(() => {
    try { JSON.parse(configJson); return true; } catch { return false; }
  }, [configJson]);

  // If the user is on the visual tab but JSON broke (Advanced edits), fall
  // back to Advanced so they can see and fix the error.
  useEffect(() => {
    if (!isValid && tab === 'visual') setTab('advanced');
  }, [isValid, tab]);

  /** Immutable deep update helper — patch = partial of a nested path. */
  const update = (fn: (c: Rec) => void) => {
    if (!isValid) return;
    const next: Rec = JSON.parse(JSON.stringify(parsed));
    fn(next);
    onJsonChange(JSON.stringify(next, null, 2));
  };

  /* ── per-template visual forms (each returns JSX) ─────────────────────── */

  const MatchingForm = () => {
    const pairs: Rec[] = parsed.pairs || [];
    return (
      <div className="space-y-3">
        {pairs.map((p, i) => (
          <RowCard key={i} onRemove={() => update(c => c.pairs.splice(i, 1))}>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label={t('gameEditor.prompt')}>
                <EmojiTextInput value={p.a || ''} onChange={v => update(c => { c.pairs[i].a = v; })} />
              </Field>
              <Field label={t('gameEditor.matchWith')}>
                <EmojiTextInput value={p.b || ''} onChange={v => update(c => { c.pairs[i].b = v; })} />
              </Field>
              <Field label={t('mediaPicker.image')}>
                <MediaPicker value={p.image || ''} onChange={v => update(c => { c.pairs[i].image = v; })} />
              </Field>
            </div>
          </RowCard>
        ))}
        <AddButton label={t('gameEditor.addPair')} onClick={() => update(c => { c.pairs.push({ a: '', b: '', image: '' }); })} />
      </div>
    );
  };

  const MemoryPairsForm = () => {
    const items: Rec[] = parsed.assets?.items || [];
    return (
      <div className="space-y-3">
        {parsed.assets?.background !== undefined && (
          <Field label={t('gameEditor.background')}>
            <MediaPicker value={parsed.assets.background || ''} onChange={v => update(c => { c.assets.background = v; })} />
          </Field>
        )}
        {items.map((it, i) => (
          <RowCard key={i} onRemove={() => update(c => c.assets.items.splice(i, 1))}>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="ID">
                <TextInput value={it.id || ''} onChange={v => update(c => { c.assets.items[i].id = v; })} />
              </Field>
              <Field label={t('mediaPicker.image')}>
                <MediaPicker value={it.image || ''} onChange={v => update(c => { c.assets.items[i].image = v; })} />
              </Field>
              <Field label={t('gameEditor.matchesId')} hint={t('gameEditor.matchesHint')}>
                <TextInput value={it.matches || ''} onChange={v => update(c => { c.assets.items[i].matches = v; })} />
              </Field>
            </div>
          </RowCard>
        ))}
        <AddButton label={t('gameEditor.addMemoryItem')} onClick={() => update(c => { c.assets.items.push({ id: '', image: '', matches: '' }); })} />
      </div>
    );
  };

  const TapRecognitionForm = () => {
    const items: Rec[] = parsed.items || [];
    return (
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={t('gameEditor.instruction')}>
            <EmojiTextInput value={parsed.prompt || ''} onChange={v => update(c => { c.prompt = v; })} placeholder={t('gameEditor.tapTheRedApple')} />
          </Field>
          <Field label={t('gameEditor.voiceoverHint')} hint={t('gameEditor.optional')}>
            <TextInput value={parsed.context || ''} onChange={v => update(c => { c.context = v; })} />
          </Field>
        </div>
        {items.map((it, i) => (
          <RowCard key={i} onRemove={() => update(c => c.items.splice(i, 1))}>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label={t('gameEditor.label')}>
                <EmojiTextInput value={it.text || ''} onChange={v => update(c => { c.items[i].text = v; })} />
              </Field>
              <Field label={t('mediaPicker.image')}>
                <MediaPicker value={it.image || ''} onChange={v => update(c => { c.items[i].image = v; })} />
              </Field>
              <Field label={t('gameEditor.altDescription')}>
                <TextInput value={it.context || ''} onChange={v => update(c => { c.items[i].context = v; })} />
              </Field>
            </div>
          </RowCard>
        ))}
        <AddButton label={t('gameEditor.addItem')} onClick={() => update(c => { c.items.push({ id: 'obj' + (c.items.length + 1), image: '', text: '', context: '' }); })} />
        <CorrectPicker
          ids={items.map(x => x.id)}
          correctId={parsed.correctId || ''}
          onPick={id => update(c => { c.correctId = id; })}
          labelOf={id => items.find(x => x.id === id)?.text || id}
        />
      </div>
    );
  };

  const DragSortForm = () => {
    const buckets: Rec[] = parsed.assets?.buckets || [];
    const items: Rec[] = parsed.assets?.items || [];
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{t('gameEditor.buckets')}</p>
          <div className="space-y-2">
            {buckets.map((b, i) => (
              <RowCard key={i} onRemove={() => update(c => c.assets.buckets.splice(i, 1))}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={t('gameEditor.label')}>
                    <EmojiTextInput value={b.label || ''} onChange={v => update(c => { c.assets.buckets[i].label = v; })} />
                  </Field>
                  <Field label={t('mediaPicker.image')}>
                    <MediaPicker value={b.image || ''} onChange={v => update(c => { c.assets.buckets[i].image = v; })} />
                  </Field>
                </div>
              </RowCard>
            ))}
            <AddButton label={t('gameEditor.addBucket')} onClick={() => update(c => { c.assets.buckets.push({ id: 'b' + (c.assets.buckets.length + 1), label: '', image: '' }); })} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{t('gameEditor.itemsToSort')}</p>
          <div className="space-y-2">
            {items.map((it, i) => (
              <RowCard key={i} onRemove={() => update(c => c.assets.items.splice(i, 1))}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={t('mediaPicker.image')}>
                    <MediaPicker value={it.image || ''} onChange={v => update(c => { c.assets.items[i].image = v; })} />
                  </Field>
                  <Field label={t('gameEditor.dragInto')}>
                    <select
                      value={it.bucketId || ''}
                      onChange={e => update(c => { c.assets.items[i].bucketId = e.target.value; })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
                    >
                      <option value="">— {t('gameEditor.chooseBucket')} —</option>
                      {buckets.map(b => <option key={b.id} value={b.id}>{b.label || b.id}</option>)}
                    </select>
                  </Field>
                </div>
              </RowCard>
            ))}
            <AddButton label={t('gameEditor.addItem')} onClick={() => update(c => { c.assets.items.push({ id: 'i' + (c.assets.items.length + 1), image: '', bucketId: buckets[0]?.id || '' }); })} />
          </div>
        </div>
      </div>
    );
  };

  const QuizForm = () => (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t('gameEditor.question')}>
          <EmojiTextInput value={parsed.question || ''} onChange={v => update(c => { c.question = v; })} />
        </Field>
        <Field label={t('gameEditor.storyHint')}>
          <TextInput value={parsed.context || ''} onChange={v => update(c => { c.context = v; })} />
        </Field>
      </div>
      <Field label={t('gameEditor.questionImage')}>
        <MediaPicker value={parsed.image || ''} onChange={v => update(c => { c.image = v; })} />
      </Field>
      {(parsed.options || []).map((o: Rec, i: number) => (
        <RowCard key={o.id || i} onRemove={() => update(c => c.options.splice(i, 1))}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label={t('gameEditor.answer')}>
              <EmojiTextInput value={o.label || ''} onChange={v => update(c => { c.options[i].label = v; })} />
            </Field>
            <Field label={t('gameEditor.answerImage')}>
              <MediaPicker value={o.image || ''} onChange={v => update(c => { c.options[i].image = v; })} />
            </Field>
          </div>
        </RowCard>
      ))}
      <AddButton label={t('gameEditor.addAnswer')} onClick={() => update(c => { c.options.push({ id: 'o' + (c.options.length + 1), label: '', image: '' }); })} />
      <CorrectPicker
        ids={(parsed.options || []).map((o: Rec) => o.id)}
        correctId={parsed.correctId || ''}
        onPick={id => update(c => { c.correctId = id; })}
        labelOf={id => (parsed.options || []).find((o: Rec) => o.id === id)?.label || id}
      />
    </div>
  );

  const FillInBlankForm = () => {
    const words: string[] = parsed.wordBank || [];
    return (
      <div className="space-y-3">
        <Field label={t('gameEditor.sentenceWithBlanks')} hint={t('gameEditor.useThreeUnderscores')}>
          <TextInput value={parsed.sentence || ''} onChange={v => update(c => { c.sentence = v; })} placeholder="The cat sat on the ___" />
        </Field>
        {(parsed.blanks || []).map((b: Rec, i: number) => (
          <RowCard key={i} onRemove={() => update(c => c.blanks.splice(i, 1))}>
            <Field label={`${t('gameEditor.correctWord')} ${i + 1}`}>
              <TextInput value={b.answer || ''} onChange={v => update(c => { c.blanks[i].answer = v; })} />
            </Field>
          </RowCard>
        ))}
        <AddButton label={t('gameEditor.addBlank')} onClick={() => update(c => { c.blanks.push({ id: c.blanks.length, answer: '' }); })} />
        <Field label={t('gameEditor.wordBank')} hint={t('gameEditor.wordBankHint')}>
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/60 p-2">
            {words.map((w, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700">
                {w}
                <button type="button" onClick={() => update(c => { c.wordBank.splice(i, 1); })} className="text-gray-300 hover:text-red-500">×</button>
              </span>
            ))}
            <input
              type="text"
              placeholder={t('gameEditor.addWordEllipsis')}
              className="min-w-[110px] flex-1 rounded-lg border-0 bg-transparent px-2 py-1 text-xs outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) { update(c => { c.wordBank.push(v); }); (e.target as HTMLInputElement).value = ''; }
                }
              }}
            />
          </div>
        </Field>
      </div>
    );
  };

  const PuzzleSplitForm = () => {
    const diffs: Rec = parsed.difficulties || {};
    return (
      <div className="space-y-3">
        <Field label={t('gameEditor.puzzlePicture')}>
          <MediaPicker value={parsed.originalImageUrl || ''} onChange={v => update(c => { c.originalImageUrl = v; })} />
        </Field>
        <p className="text-xs text-gray-400">{t('gameEditor.puzzleAutoNote')}</p>
        {Object.entries(diffs).map(([key, d]: [string, Rec]) => (
          <RowCard key={key}>
            <div className="grid gap-2 sm:grid-cols-4">
              <Field label={t('gameEditor.gridRows')}>
                <NumberInput value={d.grid?.rows ?? 2} onChange={v => update(c => { c.difficulties[key].grid.rows = Math.max(1, v); })} min={1} max={10} />
              </Field>
              <Field label={t('gameEditor.gridCols')}>
                <NumberInput value={d.grid?.cols ?? 2} onChange={v => update(c => { c.difficulties[key].grid.cols = Math.max(1, v); })} min={1} max={10} />
              </Field>
              <Field label="Emoji">
                <EmojiTextInput value={d.emoji || ''} onChange={v => update(c => { c.difficulties[key].emoji = v; })} />
              </Field>
              <Field label={t('gameEditor.minimumAge')}>
                <TextInput value={d.minAge || ''} onChange={v => update(c => { c.difficulties[key].minAge = v; })} />
              </Field>
            </div>
          </RowCard>
        ))}
      </div>
    );
  };

  const FORMS: Record<string, React.FC> = {
    matching: MatchingForm,
    'memory-pairs': MemoryPairsForm,
    'tap-recognition': TapRecognitionForm,
    'drag-sort': DragSortForm,
    quiz: QuizForm,
    'fill-in-blank': FillInBlankForm,
    'puzzle-split': PuzzleSplitForm,
  };

  const Form = FORMS[template];
  const supported = !!Form;

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('visual')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
            tab === 'visual' ? 'bg-[#0F4D92] text-white shadow' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <Wand2 className="h-4 w-4" /> {t('gameEditor.easyMode')}
        </button>
        <button
          type="button"
          onClick={() => setTab('advanced')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
            tab === 'advanced' ? 'bg-[#0F4D92] text-white shadow' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <Code2 className="h-4 w-4" /> {t('gameEditor.advancedJson')}
        </button>
        {tab === 'visual' && supported && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
            <Sparkles className="h-3 w-3" /> {t('gameEditor.noCodeNeeded')}
          </span>
        )}
      </div>

      {tab === 'advanced' || !supported ? (
        <p className="mb-2 text-xs text-gray-400">
          {t('gameEditor.advancedHint')}
        </p>
      ) : null}
      {/* (hint sits above whichever pane renders next) */}

      {tab === 'visual' && supported && isValid && <Form />}

      {tab === 'advanced' && (
        <div>
          <textarea
            value={configJson}
            onChange={(e) => onJsonChange(e.target.value)}
            rows={20}
            spellCheck={false}
            className={`w-full rounded-xl border px-3 py-2.5 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 ${
              isValid
                ? 'border-gray-200 focus:border-[#0F4D92] focus:ring-[#0F4D92]/30'
                : 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200'
            }`}
          />
          {!isValid && <p className="mt-2 text-xs text-red-500">{t('gameEditor.fixJsonToContinue')}</p>}
        </div>
      )}
    </div>
  );
}
