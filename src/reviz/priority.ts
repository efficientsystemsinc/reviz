// AUTO-GENERATED prioritization (Slite research → ranked utility for research/ML teams).
// Source: prioritize-reviz-components workflow. Regenerate by re-running that workflow.
// Tiers: P0 = core, fix first · P1 = high value · P2 = useful.

export type PriorityTier = "P0" | "P1" | "P2";

export interface PriorityEntry {
  rank: number;
  id: string;
  tier: PriorityTier;
  rationale: string;
}

export const TIER_META: Record<PriorityTier, { name: string; blurb: string }> = {
  P0: { name: "Core", blurb: "The load-bearing few — fix and polish these first." },
  P1: { name: "High value", blurb: "Reached for constantly across research workflows." },
  P2: { name: "Useful", blurb: "Solid, frequently-handy building blocks." },
};

export const PRIORITY: PriorityEntry[] = [
  { rank: 1, id: "search-tree", tier: "P0", rationale: "Unanimous top-tier across all three lenses and the single most archetype-defining artifact for an MCTS + world-model team: principal variation, explored/pruned branches, per-node N/Q/WM stats. No substitute exists and it is nearly impossible to hand-roll well." },
  { rank: 2, id: "training-curve", tier: "P0", rationale: "Importance 10 in two lenses, P0 in all three. Loss/metric-vs-step with EMA over a faint raw trace and std band is the most-reached-for ML figure across training, evals, search/WM, and interp angles." },
  { rank: 3, id: "ablation-table", tier: "P0", rationale: "Named recurring deliverable (Phase-3++ Ablation Grid), importance 10 in evals and training-scaling, P0 in all three lenses. Variants x metrics with best-cell accents, pinned baseline, per-row deltas is the lab's dominant near-daily medium." },
  { rank: 4, id: "metric-scorecard", tier: "P0", rationale: "Importance 9-10 across evals, search, training, and ops. Headline-number tiles with count-up, delta chips vs baseline/target, and sparklines sit at the top of every run report; first-class runtime artifact." },
  { rank: 5, id: "leaderboard", tier: "P0", rationale: "Importance 10 and P0 in all three lenses. The canonical 'who is winning' scoreboard ranking models/checkpoints by a headline metric (R@10, val-sigma) with inline score bars and accents; the recurring eval-gate artifact." },
  { rank: 6, id: "calibration-plot", tier: "P0", rationale: "Importance 10 and an explicitly named open gap: no ECE metric exists yet the confirm head drives the two-vote 0.55 stop. Reliability diagram with diagonal, per-bin gap shading, and counts is the precisely-missing artifact for this team." },
  { rank: 7, id: "dag-flow", tier: "P0", rationale: "Importance 10 for the branching query-lifecycle DAG (planner -> WM -> parallel retrieval -> reranker -> synthesizer) — the heart-of-system architecture figure with fan-out/converge that a linear pipeline cannot capture." },
  { rank: 8, id: "pipeline-diagram", tier: "P0", rationale: "Importance 10 hero of the architecture angle: the linear staged ingest flow (webhook -> queue -> chunk -> embed -> upsert). Distinct from the branching DAG and the canonical left-to-right system figure reached for in every design doc." },
  { rank: 9, id: "kpi-grid", tier: "P1", rationale: "Importance 10 ops surface: the pctl status / Grafana top-row at-a-glance grid watched daily. Demoted just below the P0 cluster because it overlaps metric-scorecard, but it remains the most load-bearing ops communication panel." },
  { rank: 10, id: "line-chart", tier: "P1", rationale: "The universal metric-vs-x fallback (checkpoints, cost-over-time, probe-acc-over-layers) appearing in nearly every angle as the general-purpose trend workhorse; essential breadth even where training-curve handles the specialized case." },
  { rank: 11, id: "data-table", tier: "P1", rationale: "Importance 8-9 general workhorse turning raw eval/gate dumps, recent-runs lists, and sweep variants into sortable, heat-shaded figures with inline mini-bars; cross-cutting across evals, training, and ops." },
  { rank: 12, id: "reward-curve", tier: "P1", rationale: "Importance 9 in two lenses. RL return-over-training with std band and stacked shaped-reward decomposition maps exactly to the team's multi-term per-step reward design; a specialized job beyond training-curve." },
  { rank: 13, id: "eval-grid", tier: "P1", rationale: "Importance 9 dense models x tasks/conditions capability matrix (1,632 x 5 x 2 cohort) with summary strips; scales the leaderboard's single number into the per-cell comparison surface eval teams reach for constantly." },
  { rank: 14, id: "benchmark-bars", tier: "P1", rationale: "Importance 9 hero per-task benchmark figure with SE whiskers and a baseline gate line; exactly how eval reporting against gate thresholds (>=0.276, >=0.80) is presented." },
  { rank: 15, id: "decision-tree", tier: "P1", rationale: "Importance 9 for rendering each planner node as a decision (disposition/rationale/confidence) and roadmap probe-gating branches; complements search-tree for the legibility story and serves general decision-logic needs." },
  { rank: 16, id: "pr-curve", tier: "P1", rationale: "Importance 9 to tune and defend the 0.55 two-vote stop boundary where precision ~ recall; the canonical operating-point figure for the binary confirm/stop decision, distinct from calibration." },
  { rank: 17, id: "embedding-projector", tier: "P1", rationale: "Importance 10 in interp and a P0 in the differentiation lens: the defining 2D semantic-map (UMAP/t-SNE/PCA with hull-wrapped clusters) backing Emergent Factor Discovery on 19,561x256 embeddings — a distinct high-value job ad-hoc code does poorly." },
  { rank: 18, id: "latency-percentiles", tier: "P1", rationale: "Importance 8 p50/p90/p95/p99 tail view across evals, training, and ops with the 1500ms SLO line; a purpose-built, recurring, genuinely fiddly serving-quality figure tied to explicit daily-tracked SLOs." },
  { rank: 19, id: "confidence-band", tier: "P1", rationale: "Sigma is the team's primary uncertainty measure (val_sigma gates, ensemble variance, collapse below 0.04). Banded trends with a threshold line appear across training, evals, and search-progress angles." },
  { rank: 20, id: "hyperparameter-sweep", tier: "P1", rationale: "Importance 9; multiple concrete named sweeps (UCB c-sweep, Phase-2 8-arch, Phase-3 ~30-variant, instance-split) map directly to metric-vs-param curves and 2-param heatmaps with auto best-cell." },
  { rank: 21, id: "attention-matrix", tier: "P1", rationale: "Importance 9 in interp and a P0 in the differentiation lens: the bread-and-butter query x key transformer-interp heatmap. Core mechanistic artifact that keeps the library research-general beyond this one team." },
  { rank: 22, id: "system-topology", tier: "P1", rationale: "Importance 9 host/port deployment map (cato V100s, engram, Modal, GCP) with zoned directed service links; the distinct ops/onboarding/design-review figure pure flow diagrams miss." },
  { rank: 23, id: "gantt-chart", tier: "P2", rationale: "Importance 9 for the explicit week-by-week 2-month landing schedule with spanning task bars and dependency/probe gating; the defining roadmap-planning artifact, used in planning more than weekly debugging." },
  { rank: 24, id: "scatter-plot", tier: "P2", rationale: "General 2D workhorse for pred-vs-true, quality-vs-cost tradeoffs, precomputed embedding/ID projections, and intrinsic-dimensionality reads; recurs across evals, training, interp, and search as the flexible fallback." },
  { rank: 25, id: "bar-chart", tier: "P2", rationale: "The most basic universally reused categorical-comparison primitive (per-task scores, action priors over the 17 tools, any single-metric comparison); load-bearing fallback the policy-prior and many ad-hoc views lean on." },
  { rank: 26, id: "architecture-diagram", tier: "P2", rationale: "Importance 8 encoder-then-4-heads WM schematic and six-component module diagram; the standard neural-architecture-section figure, distinct from deployment topology though re-opened less than the data-path DAGs." },
  { rank: 27, id: "confusion-matrix", tier: "P2", rationale: "Appears across evals, search, and interp: backs the confirm-head balanced_acc ~0.74 and probe/classifier error structure. A standard diagnostic, secondary to the continuous Recall@K/R2 metrics this lab leans on." },
  { rank: 28, id: "pareto-frontier", tier: "P2", rationale: "Importance 7 quality-vs-latency tradeoff with a computed frontier and dimmed dominated points (c=2.2 under 5s p50); a unique config-selection job no plain scatter covers, though not yet formalized in the lab." },
  { rank: 29, id: "probe-results", tier: "P2", rationale: "Importance 9 in interp: accuracy-vs-layer with chance baseline and peak marker for the linear-probe-sweep — the 'where is X represented' figure, the distinct interp localization job beyond embedding-projector." },
  { rank: 30, id: "token-probabilities", tier: "P2", rationale: "Importance 8 ranked next-action/next-token probability bars with the chosen item accented; purpose-built for the policy_prior softmax over 17 ToolNames and for interp generation narration." },
];

/** id → rank (1-based). Undefined for components outside the top 30. */
export const PRIORITY_RANK: Record<string, number> = Object.fromEntries(
  PRIORITY.map((p) => [p.id, p.rank]),
);

/** id → tier, for components in the top 30. */
export const PRIORITY_TIER: Record<string, PriorityTier> = Object.fromEntries(
  PRIORITY.map((p) => [p.id, p.tier]),
);

export const PRIORITY_IDS = new Set(PRIORITY.map((p) => p.id));
