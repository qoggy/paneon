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
- Changes to an interface or configuration: a `DiffView` with `jsonc` on both sides, such as the request body of one endpoint before and after an iteration. Include the file, section and nearby unchanged lines so the location of an insertion is visible.
- Behavior that depends on inputs or state: an interactive view instead of an explanation. Let the human set parameters and watch the result, switch between options to compare them, step through the system's states, or browse request and response examples for different cases to check them against expectations. The Sentinel LeapArray example in [Authoring](authoring.md#sentinel-leaparray) works this way.
- Several independent topics: choose navigation by how the human will review the material. A design can be split by concern (database design, API design, UI design, affected scope, test plan), or by independent proposal (one item per change, keeping its purpose, before/after behavior and diff together). Use Sidebar or another suitable navigation structure.
- A runnable example whose output matters to the explanation: show its usage and corresponding rendered result or execution output together. For an API, pair example request parameters with the corresponding response; for a UI, pair an interaction with the resulting page state. Keep the code, inputs and result consistent, and identify proposed behavior separately from existing capabilities.

Use prose for the reasoning that connects these pieces.

### Example: designing a component

<example>
User: Help me design a rating component.

**Bad**
Rating takes value, max and onChange. value is the current score, max is the maximum score, and clicking a star calls onChange.

**Good**
Props definition:

```ts
interface RatingProps {
  /** Current score: an integer from 0 to max. */
  value: number;
  /** Total number of stars: a positive integer. */
  max: number;
  /** Called with the selected score when a star is clicked. */
  onChange: (value: number) => void;
}
```

The page places editable props, usage code and a rendered component preview together. All three use the same values:

| Props editor           | Usage code                                         | Component preview |
| ---------------------- | -------------------------------------------------- | ----------------- |
| value=3, max=5         | `<Rating value={3} max={5} onChange={setScore} />` | ★★★☆☆             |
| Change max to 7        | `<Rating value={3} max={7} onChange={setScore} />` | ★★★☆☆☆☆           |
| Then change value to 6 | `<Rating value={6} max={7} onChange={setScore} />` | ★★★★★★☆           |

Editing the props updates the code and preview immediately. Clicking a star in the preview also updates value.

<reasoning>
Reviewing the component's props requires the complete definition, including types and comments. Sample calls alone cannot replace it. Reviewing the appearance requires seeing how different props affect the result. An editable preview is preferred; several sets of props paired with their rendered results are also useful. The demonstration runs in the page and follows the proposed props contract.
</reasoning>
</example>

### Example: changing an API

<example>
User: Update the quote API so callers can display the discount breakdown.

**Bad**
The POST /quotes response adds subtotal and discount. total stays unchanged.

**Good**
The page starts with a JSONC DiffView of the response change (quotes/response.jsonc):

```diff
 {
+  // Subtotal: unit price multiplied by quantity
+  "subtotal": 60,
+  // Discount amount
+  "discount": 6,
   // Amount payable
   "total": 54
 }
```

Below the diff, the reviewer can switch between three input/output examples:

| POST /quotes input                           | Response before | Response after                      |
| -------------------------------------------- | --------------- | ----------------------------------- |
| unitPrice=20, quantity=3, discountPercent=10 | total=54        | subtotal=60, discount=6, total=54   |
| unitPrice=20, quantity=3, discountPercent=0  | total=60        | subtotal=60, discount=0, total=60   |
| unitPrice=50, quantity=2, discountPercent=20 | total=80        | subtotal=100, discount=20, total=80 |

The page also lets the reviewer edit unit price, quantity and discount. Changing the first example's quantity to 4 immediately updates the output to subtotal=80, discount=8, total=72.

<reasoning>
The JSONC diff shows the contract change; several input/output pairs show its effects in different cases. Editable inputs are a further enhancement, not a substitute for either. Live calculations use an explicit model of the proposal and must not be described as responses from a real endpoint.
</reasoning>
</example>

### Example: improving a Skill from failure cases

<example>
User: Improve the meeting-notes Skill based on these failures:
1. Given “Mira will deliver a draft by Friday”, the output omits the Friday deadline.
2. Given “Mira will deliver a draft; also confirm printing costs”, the output also names Mira as the owner of “confirm printing costs”.

Current Skill:

```markdown
## Action items

Output columns: task, owner.
When an owner is missing, reuse the previous item's owner.
```

**Bad**
Change the output to task, owner and deadline columns. Write “not stated” when the owner is missing.

**Good**
The page has two Sidebar items: “Missing deadline” and “Incorrectly reused owner”. Each contains its own analysis, before/after output and DiffView.

**Missing deadline**

- Problem: the user supplied “Mira will deliver a draft by Friday”. The agent kept the task and owner but omitted the deadline.
- Cause and source: “Output columns: task, owner.” provides no deadline field. This is missing guidance; following the specified columns would still omit the deadline.
- Before: Deliver a draft | Mira.
- Expected after: Deliver a draft | Mira | Friday.
- This item's DiffView (meeting-notes/SKILL.md):

```diff
 ## Action items
-Output columns: task, owner.
+Output columns: task, owner, deadline.
+Write “not stated” when no deadline is given.
 When an owner is missing, reuse the previous item's owner.
```

**Incorrectly reused owner**

- Problem: the user did not assign an owner to “confirm printing costs”. The agent copied Mira's name from the preceding task.
- Cause and source: “When an owner is missing, reuse the previous item's owner.” explicitly directs that behavior. This is incorrect guidance; following it produces an unsupported assignment.
- Before: Confirm printing costs | Mira.
- Expected after: Confirm printing costs | not stated.
- This item's DiffView (meeting-notes/SKILL.md):

```diff
 ## Action items
 Output columns: task, owner.
-When an owner is missing, reuse the previous item's owner.
+Use only the owner explicitly named for that task; otherwise write “not stated”.
```

<reasoning>
The failures can be judged independently, so each gets a Sidebar item. Each item traces the observed behavior to a quoted instruction, then pairs its before/after effects with its own diff. Changes for other cases stay out of that diff. Expected outputs are distinguished from actual evaluation results. If the original instruction already requires the correct behavior, first check whether it was followed rather than assuming the Skill needs a change.
</reasoning>
</example>

### Example: improving UI interaction and styling

<example>
User: The gallery page's navigation looks awful. Can you improve it?

**Bad**
Reduce the spacing between navigation items, add a background to the selected item, and add hover feedback.

**Good**
The page shows “Current” and “Proposed” navigation side by side. Both contain “Gallery, Favorites, Settings”, and clicking an item switches the content below it.

| Same action                 | Current                                                               | Proposed                                                                 |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Start with Gallery selected | All three labels look the same                                        | Gallery has a background highlight and bold text                         |
| Hover over Favorites        | No feedback                                                           | Favorites changes background on hover                                    |
| Click Favorites             | Favorites content appears, with no selection marker in the navigation | Favorites content appears and the selection highlight moves to Favorites |
| Then click Settings         | Settings content appears                                              | Settings content appears and the selection highlight moves to Settings   |

Both previews use the same sample content. The reviewer can click through each preview independently and reproduce the states shown above.

<reasoning>
The user is reviewing appearance and interaction, so optimization advice or static screenshots alone are insufficient. Interactive before/after previews with the same content and actions let them compare layout, hover and selection feedback directly. Switching content within the page is enough for this review; the full gallery page need not be implemented first.
</reasoning>
</example>

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
- Apply clear feedback directly to the existing content, so the page always shows the current recommendation.
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
