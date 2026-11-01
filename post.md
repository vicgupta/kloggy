# Token cost optimization through Elephant-Goldfish architecture patterns

Cut LLM token costs with Elephant-Goldfish architecture: tiered routing, context pruning, and prompt budgeting that keeps quality high. Practical guide.

I've spent a lot of time staring at token bills. The pattern that keeps showing up in the research—and that I've started applying myself—is what people call the Elephant-Goldfish architecture. The idea is simple: stop treating every request like it needs your biggest, most expensive model and your full conversation history. Split work into two lanes. An Elephant lane does deep, high-stakes reasoning with large context windows and strong models. A Goldfish lane handles fast, cheap, routine work with compact prompts and smaller models. Most traffic lands in the Goldfish lane, so aggregate spend drops sharply while quality holds.

## What the Elephant-Goldfish pattern actually is

The core move is architectural routing instead of prompt tweaking. You don't try to make one model cheaper. You decide, per request, how much thinking the task actually deserves.

The Elephant lane is for planning, synthesis, verification, and anything where being wrong is expensive. It gets the big context window and the strong model. The Goldfish lane is for classification, extraction, formatting, and routine generation. It gets a tight prompt and a small model.

A lightweight router scores each incoming request on complexity, risk, and expected token budget, then dispatches it. The thresholds are adaptive: a task can move between lanes as confidence changes. That prevents the common failure of defaulting everything to the premium model "just in case."

There's also a memory split. Short-term working memory is Goldfish: intentionally forgetful, bounded, cheap. A separate Elephant store holds durable facts, decisions, and user preferences outside the active prompt, and injects them only when relevant.

## Tiered model routing: Elephant lane vs Goldfish lane

This is where the biggest savings come from. Most production traffic is routine. Customer support triage, field extraction, simple rewrites, status checks—none of these need a frontier model with a 200k context window.

The router is the key component. It has to be fast and cheap itself, or you've just moved the cost. In practice a small classifier or a rules-based scorer works. Score on three things: complexity (how many steps, how much ambiguity), risk (what happens if it's wrong), and expected token budget (how much context the task needs).

The adaptive thresholds matter more than people expect. A task that starts as routine extraction can turn into a reasoning problem once edge cases appear. The system should escalate to the Elephant lane mid-flight when confidence drops, not after a failure.

Per-lane token accounting is what makes this visible. If you can't see tokens per lane, per feature, per user journey, you're guessing. Dashboards that break spend down by lane turn "the bill is high" into "the extraction step in the document pipeline is the problem."

## Goldfish context pruning for long-running agents

Long-running agents are where costs explode. Each step appends observations, tool outputs, and intermediate reasoning. Full history replay maximizes recall but the bill grows linearly or worse.

Goldfish pruning keeps a rolling window of recent observations plus a compact, structured summary of earlier state. Recency-based truncation handles the easy cases. Importance scoring handles the hard ones: salient events survive, redundant tool outputs get discarded.

The failure mode is over-pruning. Drop the evidence a later step needs and the agent hallucinates or loops. The mitigation is verification checkpoints: before a final answer, query the Elephant store to confirm the key facts are still recoverable.

The result is predictable cost and stable latency instead of a curve that climbs with every turn.

## Persistent summarization: Elephant memory

Instead of replaying every message, maintain a continuously updated structured digest: goals, constraints, decisions, unresolved questions. Each turn appends to a short Goldfish buffer. A background process folds important items into the Elephant digest and discards the rest.

Three strategies compare cleanly:

- Full history replay: best recall, worst cost.
- Fixed-window truncation: cheap, but risks dropping critical constraints.
- Elephant-Goldfish summarization: compresses intent, preserves actionable details, stabilizes input tokens after warmup.

Summarization quality is the limiting factor. When summaries contradict new evidence, you need conflict resolution rules. For high-risk workflows, periodic re-grounding against source transcripts keeps the digest honest. Guardrails for sensitive data belong in the summarization step too, so you're not compressing PII into a long-lived store.

## Cost-aware prompt budgeting

Routing and pruning get you most of the way. Budgeting finishes the job. Every step gets an explicit token budget, and components justify the context they include.

Elephant components—planners, reviewers—get larger budgets for global reasoning. Goldfish components—extractors, formatters—operate under strict caps. Practical techniques:

- Cache stable prefixes so you don't re-pay for system prompts.
- Compress tool results before reinjecting them.
- Use structured outputs to cut parsing overhead.
- Split long tasks into checkpointed subtasks.

The warning here is false economy. Compress too hard and correctness drops, retries multiply, and you spend more than you saved. Budgeting is a tuning problem, not a minimization problem.

## Putting it together: a practical adoption path

Don't do all of this at once. Start where the pain is.

1. Add per-lane token accounting first. You can't optimize what you can't see.
2. Route the obvious Goldfish traffic—classification, extraction, formatting—to a smaller model.
3. Add context pruning to your longest-running agent.
4. Introduce prompt budgets on the noisiest pipeline.
5. Add adaptive thresholds and verification checkpoints last, once you have data.

A document-processing pipeline that applied routing, pruning, and budgeting together cut token costs by more than half without quality loss on common tasks. That's the realistic target: half the spend, same quality, more predictable latency.

## FAQ

### Does this require switching to a specific model provider?

No. The pattern is architectural. It works with any provider mix. The point is deciding which model handles which task, not which vendor you use.

### How do I know if my router is misclassifying?

Track escalation rate and retry rate per lane. If Goldfish tasks frequently escalate or fail and retry, your thresholds are too aggressive. If Elephant traffic stays high, your router is too conservative.

### Is context pruning safe for tasks that need exact recall?

Partially. Pruning helps routine agents. For tasks needing exact recall—legal review, financial reconciliation—keep the Elephant store comprehensive and add verification checkpoints before final answers. Periodic re-grounding against transcripts is the safety net.

### What's the first metric to watch?

Input tokens per completed task, broken down by lane. That single number tells you whether the architecture is actually reducing spend or just moving it around.

tags: token cost optimization, elephant-goldfish architecture, llm cost reduction, context pruning