# Parallel Multi-Lens Goldfish Swarms for Divergent Ideation

Parallel multi-lens goldfish swarms use short-lived, memory-constrained agents with distinct lenses to generate diverse ideas before the synthesis phase.

I have been thinking about how multi-agent systems can produce genuinely diverse ideas instead of converging on the first plausible answer. The usual setup is a swarm of persistent agents sharing a growing memory pool. That sounds good until you watch it: one strong idea lands early, and every later agent quietly optimizes around it. The result is a polished consensus rarely surprising. Parallel multi-lens goldfish swarms attack that problem directly, and represent one of the more interesting recent directions in agent-based ideation.

## What the goldfish pattern actually is

The goldfish pattern is a design motif for creative multi-agent systems in which agents are intentionally ephemeral. Each agent discards most of its intermediate reasoning after every ideation cycle. It keeps only a compact, lens-specific summary, then resets. The point of this ephemerality is to stop early high-scoring ideas from dominating later exploration. Persistent memory in conventional swarms is the root cause of premature convergence, and the goldfish constraint removes it.

In practice, a goldfish agent has a small working-memory window. It cannot hold the global idea pool. It sees the seed problem, applies its lens, and produces local hypotheses. That limitation is the feature. Because it cannot overfit to dominant suggestions, it samples a different region of the idea space each cycle.

The lens is what makes the swarm multi-lens rather than just many copies of the same agent. Each goldfish agent is equipped with a distinct analytical perspective. Common lenses include feasibility, novelty, risk, user value, market differentiation, ethical safety, and technical feasibility. Each lens acts as a selective attention filter, foregrounding different features of the problem. When the objective functions are sufficiently diverse, the swarm's combined coverage exceeds what any single agent could achieve, even with larger memory or longer runtime.

## The two-phase interaction protocol

The interaction protocol formalizes into two phases: an expansion phase and a synthesis phase.

During expansion, goldfish agents operate in parallel without access to the global idea pool. Each lens generates candidate ideas independently. There is no cross-agent critique during this phase. The deliberate isolation is what amplifies divergence. Agents cannot react to each other, so they cannot anchor on each other's outputs.

During synthesis, a coordinator merges and deduplicates outputs while preserving outlier concepts. This is where the hard work happens. Naive parallel execution yields redundant ideas and inconsistent formatting, which complicates downstream use. A strong synthesis layer reconciles conflicting perspectives without flattening them into a single consensus. The goal is not to pick a winner. The goal is to preserve the spread of ideas while removing true duplicates and organizing them for human judgment.

The structured idea schema helps here. Each idea carries fields for claim, mechanism, evidence, and risk. That structure enables automated clustering and novelty scoring, making synthesis tractable at scale.

## Why constraining memory reduces anchoring

Anchoring is the tendency of an agent to latch onto the first strong suggestion it encounters and then defend it. In a persistent-memory swarm, early ideas get stored, retrieved, and reinforced across cycles. They become the default reference point. Later agents do not explore freely; they refine the dominant idea.

Goldfish agents break that loop. By discarding intermediate reasoning and retaining only a compact lens-specific summary, they reset perspective each cycle. They cannot remember enough to anchor. The memory cap enforces this. It is a hard constraint, not a soft preference.

There is a failure mode to watch for: lens drift when summaries are too compressed. If the retained summary is too thin, the agent loses its lens identity and starts producing generic ideas. The adaptive memory budget proposal addresses this: memory grows only when an idea shows cross-lens support. That keeps exploration broad by default but allows depth when multiple perspectives converge on something genuinely interesting.

## Lens independence and detecting collapsed perspectives

One contribution I find particularly useful is the lens-independence metric. It quantifies how much each agent's output differs from the swarm median. If a lens is producing ideas that look like everyone else's, its perspective has collapsed. The metric makes that visible.

This matters because lenses can be complementary or antagonistic depending on problem structure. A feasibility lens and a novelty lens may pull in opposite directions on some problems. That tension is productive. But two lenses that are supposed to be different can quietly converge if their prompts are not calibrated. The independence metric catches that before it wastes compute.

Lens calibration is genuinely hard. Redundant perspectives are the main limitation. Adding more agents only helps if the lenses are actually diverse. Scaling experiments show diversity gains plateau without lens diversity but improve when new lenses are added. Invest effort in defining distinct lenses before scaling agent count.

## Swarm temperature and idea quality

The swarm temperature control modulates how aggressively agents are encouraged to deviate from seed prompts. Low temperature keeps agents close to the seed. High temperature pushes them toward stranger territory.

Moderate temperature maximizes the number of ideas rated both novel and coherent by human evaluators. Too low and you get safe, obvious ideas. Too high and you get incoherent ones. The sweet spot produces ideas that are non-obvious but still viable, which is exactly the region most valuable for divergent ideation.

This is a knob worth tuning per problem domain. Scientific hypothesis generation may tolerate higher temperature than urban-planning concept development, where coherence constraints are tighter.

## Scaling from ten to hundreds of agents

Orchestration at scale introduces real challenges. A scheduler batches lens-specific prompts, enforces memory caps, and rotates agent identities to prevent stylistic lock-in. Identity rotation matters because agents can develop stylistic habits over cycles, and those habits act as a soft form of anchoring.

The scaling experiments run from ten to several hundred concurrent agents. The consistent finding is that diversity gains plateau without lens diversity but continue to improve when new lenses are added. So the scaling strategy should be: add lenses first, agents second.

Cost-aware early stopping is part of the practical guidance. Parallel goldfish swarms are not cheap. Each agent cycle consumes compute, and the synthesis layer adds overhead. Early stopping based on diversity signals prevents spending budget on diminishing returns.

## Ethical considerations

Safety and fairness lenses must not be marginalized by commercially oriented ones. In a multi-lens swarm, feasibility and market lenses can dominate while safety and ethics become decorative. The architecture should weight lenses so critical perspectives survive synthesis. The structured schema helps because risk is an explicit field on every idea.

## FAQ

### What is a goldfish agent?

A goldfish agent is a short-lived, memory-constrained agent in a multi-agent swarm. It discards most intermediate reasoning after each ideation cycle and retains only a compact, lens-specific summary. The constraint prevents anchoring on early dominant ideas.

### How many lenses should a swarm use?

Start with a small set of genuinely distinct lenses, such as feasibility, novelty, risk, and user value. Add new lenses when diversity signals plateau. More agents only help if the lenses are actually different from each other.

### Does this replace human ideation?

No. The swarm expands the idea space and surfaces non-obvious candidates. A human still judges which ideas are worth pursuing. The synthesis layer organizes output for human review.

### What is swarm temperature?

Swarm temperature controls how aggressively agents deviate from seed prompts. Moderate temperature maximizes ideas that are both novel and coherent. Too low produces obvious ideas; too high produces incoherent ones.

### When should I use this pattern?

Use it when you need genuine divergence rather than refinement. Product design, research hypothesis generation, and creative problem solving fit well. It is less useful for tasks with a single correct answer.

## Closing thoughts

I think parallel multi-lens goldfish swarms are best understood as a deliberate bet on divergence over convergence. The goldfish constraint, lens diversity, and synthesis layer each address a specific failure mode of conventional swarms. Used together, they produce a wider, more honest spread of ideas than single-agent baselines or homogeneous setups. The cost is real and lens calibration takes care. But when the next good idea matters more than the first good one, the tradeoff is worth it.

Tags: goldfish swarms, divergent ideation, multi-agent systems, lens independence