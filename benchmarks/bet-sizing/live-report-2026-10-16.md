# Bet-size pilot — 2026-10-16

All 960 authorized decisions completed. The allocation is exhausted. Production remains on the current menu. No additional inference or promotion is authorized by this report.

Only **GPT-5.4-mini quarter-pot** passes the predeclared usage screen. It is a candidate for a separately planned and authorized paired-match study, not an established strength improvement. Jev quarter-pot, Jev 1.5-pot and LLM 1.5-pot do not pass.

## Mechanical completion and provenance

Exactly 480 Jev and 480 LLM requests were sent; zero compatibility calls, retries, exclusions or incomplete reservations. All 960 decisions passed runtime candidate/context agreement and engine application. No invalid outputs, engine rejections or exact-safeguard violations were observed. Every provider/fixture/menu cell contains ten completed repetitions; all three-menu matched blocks are complete.

The ledger manifest matches frozen plan digest `f45f0b5200dd52725baf05877c6567b420197c51b693113295bc955d2acf4da8`; all 360 source hashes verified after the run. Each durable reservation/request count, planned slot and returned row identity was checked. The preserved preflight import failure sent zero requests; its runner-only amendment changed no experimental inputs.

Configured models were Jev `jev-latest` at medium difficulty and `openai/gpt-5.4-mini` at low reasoning with balanced playstyle. Returned identifiers were `jev-1.13.0` and `openai/gpt-5.4-mini`. The latter does not expose a finer model revision. Eevo received offline compatibility coverage only, with no paid behavioral or strength evidence.

## Usage screen

Each experimental size was available in 120 eligible decisions per provider. Controls offered no additions. Qualification required selections in at least two eligible fixtures, at least three of ten repetitions in each, plus complete mechanical success.

| Provider | Added menu | Selected / available | Fixtures at ≥3/10 | Eligible for later match study |
| --- | --- | ---: | ---: | --- |
| jev | quarter-pot | 0/120 | 0 | No |
| jev | 1.5-pot | 0/120 | 0 | No |
| llm | quarter-pot | 13/120 | 3 | Yes |
| llm | 1.5-pot | 0/120 | 0 | No |

LLM quarter-pot selections by fixture: 2-turn-0 1/10; 2-turn-1 1/10; 2-river-0 3/10; 2-river-1 3/10; 6-flop-0 2/10; 6-flop-1 3/10. The other six eligible fixtures had zero selections. Only the two heads-up river fixtures and six-seat flop draw fixture meet the per-fixture threshold.

## Eligible-fixture behavior

Jev chose exactly the same realized action and amount in all 120 eligible paired repetitions under either challenger: 110 checks and ten full-pot bets. Neither new size was selected. This is specific to this fixed matrix, not a claim that the model never uses these sizes elsewhere.

Across LLM eligible decisions, baseline had 83 bets and 37 checks; quarter-pot had 80 bets and 40 checks; 1.5-pot had 88 bets and 32 checks. No eligible LLM decisions selected all-in in any arm; the short-stack control selected all-in 10/10 under every LLM arm. The pilot supplies no evidence of reduced eligible all-ins.

LLM quarter-pot paired selections of the new size corresponded to ten baseline one-third-pot bets, two two-thirds-pot bets and one check. These are matched observations under stochastic inference, not proven causal replacements.

| Provider | Menu vs current | Eligible blocks | Excluded | Mean payment difference (chips) | Mean difference / pot | Mean difference / effective stack |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| jev | quarter-pot | 120 | 0 | 0.000000 | 0.000000 | 0.000000 |
| jev | 1.5-pot | 120 | 0 | 0.000000 | 0.000000 | 0.000000 |
| llm | quarter-pot | 120 | 0 | 0.008333 | 0.002083 | 0.004028 |
| llm | 1.5-pot | 120 | 0 | 0.633333 | 0.038889 | 0.005658 |

Means include checks as zero payments. The quarter-pot arm did not reduce mean commitment on this matrix; movements among existing sizes offset the small new bets. The overbet arm changed some existing-size/check choices despite never selecting the addition. Neither observation is an EV estimate.

## Unchanged-menu control variability

The menus and inputs are identical across arms in these controls. Counts below show action-or-amount disagreement with the matched baseline out of ten; this variability cautions against attributing every arm difference to a new bet size.

| Provider | Control | Quarter-pot arm disagreements | 1.5-pot arm disagreements |
| --- | --- | ---: | ---: |
| jev | preflop | 1/10 | 0/10 |
| jev | raise | 5/10 | 3/10 |
| jev | short | 4/10 | 5/10 |
| jev | safeguard | 0/10 | 0/10 |
| llm | preflop | 3/10 | 3/10 |
| llm | raise | 4/10 | 3/10 |
| llm | short | 0/10 | 0/10 |
| llm | safeguard | 0/10 | 0/10 |

Both providers checked the exact-safeguard control in every arm and repetition.

## Latency and cost coverage

| Provider | Menu | Requests | Median ms | p95 ms | Cost-report coverage | Reported cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| jev | current | 160 | 316 | 455 | 0/160 | Unknown |
| jev | quarter-pot | 160 | 324 | 482 | 0/160 | Unknown |
| jev | 1.5-pot | 160 | 318 | 508 | 0/160 | Unknown |
| llm | current | 160 | 3094 | 5803 | 160/160 | 0.3367707 |
| llm | quarter-pot | 160 | 3311 | 5774 | 160/160 | 0.3114330 |
| llm | 1.5-pot | 160 | 3351 | 6913 | 160/160 | 0.3223230 |

OpenRouter reported $0.9705267 across all 480 LLM requests. Jev reported no per-response cost, so the total pilot cost is unknown. Reported usage cost is not a verified billing statement.

## Evidence and next decision

`live-evidence-2026-10-16.json.gz` preserves the sanitized durable ledger and frozen manifest. `live-analysis-2026-10-16.json.gz` preserves full fixture-level and aggregate distributions, availability, matched transitions, commitment changes, failures, latency and cost coverage. Derived analysis remains in `benchmarks/results/bet-sizing-analysis.json`. No provider responses, credentials or private histories are included.

This was a fixed-decision usage pilot with no independent EV reference. Provider probabilities are not strategic frequencies. No strength score is assigned. The sole shortlist item is LLM quarter-pot; any next study needs separate authorization, paired deals and seat rotations, heads-up/six-seat results, varied opponents, production equity budgets, uncertainty estimates and predeclared budget/strength/regression gates. Jev/Eevo menus remain unchanged. Do not combine additions or spend the unused request ceiling.
