export interface SmsLessonSubject {
  subject_code: string;
  subject_name: string | null;
  class_code: string | null;
  status?: string | null;
}

export interface SmsLessonContext {
  context_source: 'elite-sms' | 'flagship-local';
  context_version: string;
  school_id: string;
  branch_id: string | null;
  class_code: string | null;
  class_label: string | null;
  age_band: string | null;
  academic_year: string | null;
  term_name: string | null;
  week_number: number | null;
  subject_code: string | null;
  subjects?: SmsLessonSubject[];
  sms_lesson_id: string | null;
  context_snapshot?: Record<string, unknown> | null;
}

export interface SmsLessonContextQuery {
  class_code: string;
  subject_code?: string;
  lesson_id?: string;
  academic_year?: string;
  term?: string;
  week_number?: number;
}

export interface BridgeGameComponent {
  order?: number;
  template: string;
  item_count?: number;
  playable_item_count?: number;
}

export interface EcceLessonBridge {
  id?: string;
  lesson_id: string;
  outcome_id: string;
  school_id: string;
  branch_id?: string | null;
  class_code?: string | null;
  class_label: string;
  age_band: string;
  academic_year?: string | null;
  term_name: string;
  week_number: number;
  subject_id: string;
  subject_code?: string | null;
  sms_lesson_id?: string | null;
  context_source?: 'elite-sms' | 'flagship-local';
  context_version?: string;
  objective: string;
  concrete_experience: string;
  micro_objectives: string[];
  success_evidence: string[];
  evidence_routes: string[];
  game_plan: { components: BridgeGameComponent[]; [key: string]: unknown };
  [key: string]: unknown;
}

// ── Teacher authoring → review → publish ──────────────────────────────────
export type BridgeStatus = 'draft' | 'ready_for_review' | 'approved' | 'published' | 'recalled';

/** GET /kids/learning-outcomes — one reviewed curriculum outcome. */
export interface BridgeOutcome {
  id: string;
  source: string;
  age_band: string;
  subject_id: string;
  strand: string | null;
  sub_strand: string | null;
  statement: string;
}

/**
 * GET /kids/lesson-bridges/:id/publish-gate — the server-authoritative gate
 * (SRS FR-13). `not_evaluated` names the contract gates owned by the
 * content-review phase; they are not claimed as passing.
 */
export interface BridgePublishGate {
  content_id: string | null;
  bridge_id: string;
  status: BridgeStatus;
  gates: Record<string, boolean>;
  not_evaluated: string[];
  publishable: boolean;
  blocking_reasons: string[];
}
