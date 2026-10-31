# Present content on a page

This covers everything written into a page: the content of a custom page and the input of a built-in page, such as Choose questions and options, Form field descriptions and Table columns.

## Lead with the answer

Open with the conclusion or recommendation, then the reasons and details. A reader who stops after the first screen should already know the answer. For a diagnosis, state the verdict first, such as "This is not a product defect: the user lacks the `orders:write` permission", then explain how the human triggered it.

When the answer covers many items, start with an overview table that gives each fact its own column, then a section for each item that needs work:

```markdown
// Bad: the decision and its reason share one free-form column.

| Service   | Assessment                                          |
| --------- | --------------------------------------------------- |
| order-api | Needs a change, it calls the old endpoint directly  |
| billing   | Probably fine since requests go through the gateway |

// Good: the decision can be scanned in one column.

| Service   | Change | Reason                      |
| --------- | ------ | --------------------------- |
| order-api | Yes    | Calls `/v1/charge` directly |
| billing   | No     | Requests go through gateway |
```

## Choose the form

Pick the form that carries the content with the least reading:

- Flows across components or actors: a Mermaid `sequenceDiagram`; for swimlanes, a `flowchart` with one `subgraph` per actor.
- Parameter or payload structures: a `jsonc` CodeBlock, with comments on the fields that matter.
- Comparisons of options: a table with one row per option and one column per criterion.
- Changes to an interface or configuration: a `DiffView` with `jsonc` on both sides, such as the request body of one endpoint before and after an iteration.
- Behavior that depends on inputs or state: an interactive view instead of an explanation. Let the human set parameters and watch the result, switch between options to compare them, step through the system's states, or browse request and response examples for different cases to check them against expectations. The Sentinel LeapArray example in [Authoring](authoring.md#sentinel-leaparray) works this way.

Use prose for the reasoning that connects these pieces.

## Slice the content

- Make each section understandable on its own. Repeat the key fact or number a section depends on, instead of sending the reader back to where it first appeared.
- Where order matters, reveal content step by step, through steps, Tabs or Accordion.
- Size slices by the content, one per decision, mechanism step or item. Neither one long scroll nor many fragments.

## Ask one decision per question

Put one decision in each question, whether in Choose or elsewhere. When options bundle several decisions, the human often agrees with part of every option, cannot pick one, and can only answer under **Other** by rewriting the whole plan.

```markdown
// Bad: one question bundles three decisions.
Which setup?

- SQLite + in-process cache + single node
- PostgreSQL + Redis + cluster

// Good: one question per decision.
Which storage? SQLite / PostgreSQL
Which cache? In-process / Redis
Which deployment? Single node / Cluster
```

When the options of one decision depend on the answer to another, ask the first decision, then ask the next one in a new run.

## Iterate after feedback

- Ask the human about anything unclear.
- Apply clear feedback directly to the existing content, so the page always shows the current recommendation. Edit a custom page's source in place; run a built-in page again with revised input.
- Keep replies and history out of the page. A section answering each annotation, or a revised plan placed beside the old one, makes the human untangle versions instead of reading the plan. Summarize what changed in a sentence or two in chat when it helps.

## Write the text

- Use short sentences, one idea each.

  ```markdown
  // Bad
  After confirming that the retry storm triggered once repeated downstream calls caused by cache misses were blocked by the rate limiter is the main cause of the latency increase, I judge the fix belongs in `gateway/limiter.ts:142`.

  // Good
  Latency rose from 200 ms to 3 s. The main cause is a retry storm (my judgment, not verified). The chain: cache miss → repeated downstream calls → rate limiter rejects them → clients retry → the load keeps growing. The fix belongs in `gateway/limiter.ts:142`.
  ```

- Describe a problem from the side of the user or caller: who, in what situation, did what, got what, and what they expected. The subject is a person or caller, not a variable or function.

  ```markdown
  // Bad
  When `isOffline` is true, `save()` skips `sync()`; reconnecting triggers `pull()` and the remote overwrites `localDraft`.

  // Good
  A user who saves while offline keeps the change only locally. After reconnecting, the server version overwrites it and the change is lost. Expected: the change syncs after reconnecting.
  ```

- Take every term from one of three sources: established industry terms in their usual form (`LSP`, `GC`, `OOM`), words the human used in this conversation, or real identifiers with their location (`RpcAdapter#connect`, `src/adapter/rpc.ts:79`). Never coin a concept name or translate a standard term into an invented one. When unsure whether the reader knows a term, add what it does in plain words.

  ```markdown
  // Bad
  The script checks authorization by trying to get a ticket.

  // Good
  The script checks authorization with `auth-center ticket create`.
  ```

- Keep exact values: numbers and magnitudes, file paths with line numbers, runnable commands, IDs, branches, versions, environment names and key fragments of error messages. The reader should be able to act on the text: "optimized the related module" gives nothing to act on; "raised the timeout at `rpc.ts:79` from 3 s to 10 s" does.
- Make clear what kind of statement each sentence is. State facts (verified, run, or read in code) plainly with their values. Mark judgments ("I think", "likely"). State unknowns ("not tested", "not yet clear").
- Back a proposal with evidence, so it persuades as well as explains: a comparison table of the mainstream approaches with source links, or a reproduction record of what was done under which conditions and what happened.

## Page copy

Add explanatory text only where the human needs guidance, and let the layout carry the rest. Before keeping a hint, caption or instruction, check whether the human could complete the action without it; if so, remove it. Avoid captions that restate what an icon or button shows, usage manuals pasted onto the page, and a short paragraph in every corner.
