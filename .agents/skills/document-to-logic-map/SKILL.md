---
name: document-to-logic-map
description: Transform arbitrary documents into a logic-first import tree for BrainFlow. Use when Codex needs to convert pasted text, Markdown files, process docs, plans, analysis docs, or notes into an ordered logic map with section/claim/evidence/task/decision/risk/metric/question nodes, short titles, note-backed detail, strict task extraction, and source spans.
---

# Document To Logic Map

Convert one source document into a logic-first map for BrainFlow import.

## Workflow

1. Read `references/input.schema.json` to confirm the expected input shape.
2. Read `references/output.schema.json` before producing the final JSON.
3. Read `references/task-rules.md` when deciding whether a node is a `task`, `evidence`, `claim`, or `section`.
4. Use `references/examples/analysis-expected.json` and `references/examples/process-expected.json` only as behavior anchors, not as templates to copy.

## Required behavior

1. Classify the source document as exactly one of `analysis`, `process`, `plan`, or `notes`.
2. Normalize headings into `wrapper`, `semantic`, or `archival` headings before building the main spine.
3. Build the main spine in original source order. Do not reorganize the document into a canned template.
4. Prefer semantic headings such as `结论`, `拆解`, `方法`, `决策`, and `下一步` over archival wrappers.
5. Do not default the logic root to the document title. Choose the root from the highest-information semantic unit such as the core question, thesis, main decision, or main job-to-be-done.
6. For conversation-export documents, derive the spine from the user core question, the assistant main conclusion, and the assistant decomposition sections.
7. Emit only these node types: `section`, `claim`, `evidence`, `task`, `decision`, `risk`, `metric`, `question`.
8. Keep node titles short. Put detailed wording, evidence text, and nuance into `note`.
9. Attach every `evidence` node under the nearest supported `claim` or `section`.
10. Emit `task` only when the text contains both a clear action and a clear deliverable.
11. Preserve line-based source coverage with `source_spans`.
12. Keep `semantic_role` equal to `type` in v1 output.
13. When `document_type=analysis`, prefer breadth first at level 1 and depth at level 2. If you extract 4-8 peer first-order semantic sections, keep all of them visible instead of collapsing the document to one branch.
14. For `analysis`, each first-order section may expose 1-3 representative children: a `claim`, a `metric/evidence/question`, and a `task` only when both action and deliverable are explicit.

## Source normalization

1. Wrapper headings include, unless they clearly carry the thesis: `说明`, `备注`, `对话记录`, `用户`, `助手`, `Turn n · User`, `Turn n · Assistant`, `文件格式`, `本文说明`, `当前对话整理`, `对话整理`, and `Markdown 记录`.
2. Wrapper headings must not become the first two visible levels of the logic map unless they clearly carry the main thesis.
3. Preserve wrapper headings only in archive handling, not in the visible logic spine.
4. Treat archive or source-outline headings as archival scaffolding, not as main semantic structure.

## Hard prohibitions

1. Do not create placeholder parent nodes such as `步骤`, `适用场景`, `检验标准`, `数据`, `证据`, `分论点`, `任务池`, or `统一证据`.
2. Do not group all evidence under a shared evidence bucket unless the source explicitly has that heading.
3. Do not convert every numbered step into `task`.
4. Do not emit long sentence-like titles when the same detail can live in `note`.
5. Do not drop source order to make the tree look cleaner.
6. Do not let wrapper headings become the visible logic spine.
7. Do not use archive or source-outline nodes as the main mounted logic tree.
8. Do not collapse an analysis document to a single branch when multiple peer sections were extracted.

## Output rules

1. Return valid JSON only.
2. Keep `nodes` flat and ordered by `parent_id` plus `order`.
3. Set `task.status` to `todo` when `type=task`.
4. Set `task.output` to the concrete deliverable extracted from the text. If there is no concrete deliverable, do not emit a `task`.
5. Use `confidence` conservatively. Prefer `medium` over `high` when the classification or node type is inferential.
