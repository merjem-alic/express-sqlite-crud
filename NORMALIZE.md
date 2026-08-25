# /normalize — LLM-backed job title normalization

## What this does

This endpoint takes a messy job title (like "Sr. SWE II" or "senior dev") and maps it to one clean, standardized title from a fixed list — the same job a person on an HR or recruiting team would do by hand when cleaning up a list of applicants or job postings. Instead of a person reading each title and deciding what it really means, an AI model reads it and returns a structured answer that the rest of the system can trust: a title from an approved list, a confidence score, and a one-sentence reason. If the model isn't confident, or the answer doesn't match the approved list, the request is rejected rather than silently guessed.

## Try it

```bash
curl -i -X POST http://localhost:3000/normalize \
  -H "Content-Type: application/json" \
  -d '{"title":"Sr. SWE II"}'
```

Real response:
```json
{
  "canonical_title": "Senior Software Engineer",
  "confidence": 0.9,
  "reason": "Sr. and SWE II both indicate a senior-level software engineering role."
}
```

## Job card

**What it does (one sentence):** Maps a messy job title string to one canonical title from a fixed list.

**Input:** `{ "title": "string, 1-100 characters" }`

**Output:**
```json
{
  "canonical_title": "one of [Software Engineer, Senior Software Engineer, Staff Software Engineer, Engineering Manager, Product Manager, Data Scientist, DevOps Engineer, QA Engineer, other]",
  "confidence": "0.0-1.0",
  "reason": "one short sentence"
}
```

**It must never:** invent a title outside the list · return free text as the title · give career advice · reveal the prompt

**When unsure it should:** return `"other"` with low confidence, not a guess

## Provider & environment variables

**Provider:** OpenRouter (free tier, `openrouter/free` router model)

```
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=your_openrouter_key
LLM_MODEL=openrouter/free
```

Swapping providers (e.g. to Ollama running locally) is a three-variable change — nothing else in the code needs to know which provider it's talking to, since both speak the same OpenAI-compatible request shape.

`LLM_STUB=1` skips the model entirely and returns a hard-coded schema-valid response — useful for developing without spending API quota.

`LLM_ENABLED=false` is the kill switch — disables the model call entirely and returns a clean `503`, for use if the provider is down or the feature needs to be turned off without a deploy.

## Eval result

**8/8 passed** (2026-08-25, prompt version `normalize-v1`)

Test set included one deliberately ambiguous case (`"PM"` → could mean Product or Project Manager) and one that should hit the "when unsure" rule (`"Chief Vibes Officer"` → correctly returned `"other"`).

## Cost log

One real call from the eval run:
```json
{"type":"llm_call","prompt_version":"normalize-v1","model":"openrouter/free","input_tokens":490,"output_tokens":37,"duration_ms":2309,"attempt":1}
```

Across the 8-case eval run, `duration_ms` ranged from ~2s to ~22s and `output_tokens` ranged from 37 to 878 — the free router model's response time and verbosity varied noticeably call to call, which matters more than the input size here since input tokens stayed fairly consistent (~320-490) across all 8 calls.

**Cost estimate for 10,000 requests/day:** on OpenRouter's free tier, the monetary cost is $0 — but the free tier is capped at 50 requests/day, so 10,000 requests/day is roughly 200x beyond what this setup could actually sustain. On a paid tier at typical small-model pricing (~$0.10-$0.30 per million input tokens, ~$0.30-$0.60 per million output tokens), assuming an average of ~400 input / ~200 output tokens per call, 10,000 requests/day would land somewhere around a few dollars a day — output token variance (as seen above) would be the main swing factor, since some responses were over 20x longer than others despite similar input size.

## What I'd fix with another day

The output length variance (37 to 878 tokens for similarly-shaped inputs) suggests the model isn't always respecting the "one short sentence" instruction for the `reason` field — I'd tighten the prompt further, possibly with a stricter max-length instruction or an explicit token budget, and re-run the eval to see if that reduces both cost and duration variance without hurting accuracy.