# Learn modules: style spec

What the eight hand-written modules (`supabase/migrations/20261003090100_phase5_learn_content.sql`) actually look like, measured, so that the generated "Made for you" modules (F28) read like the same course. The limits in `packages/shared/src/learn-style.ts` (`LEARN_STYLE_LIMITS`, `LEARN_SHAPE_LIMITS`) are the **largest** values below, not more. A test (`learn-style.test.ts`) runs the same checks over all eight modules and they all pass, so the limits are exactly as loose as the current content and no looser.

How it was counted (`measureMarkdown` in `learn-style.ts`): a word is a whitespace-separated token with a letter or digit in it, after removing `**`, `## ` and `- `. A sentence ends at `.`, `!`, `?` or `।` followed by a space. A section is a `##` heading and everything under it, heading included. The body includes the opening paragraph and the closing "Try it" section, and excludes the title and summary.

## Measurements

| Module | Lang | Words | Opening | Sections before "Try it" | Words per section | "Try it" | Bullets per list | Longest bullet | Avg sentence | Longest sentence | Label |
|---|---|---|---|---|---|---|---|---|---|---|---|
| budget-basics | en | 120 | 22 | 2 | 38, 36 | 24 | 3 | 15 | 8.6 | 17 | 3 min |
| | bn | 98 | 14 | 2 | 33, 30 | 21 | 3 | 12 | 6.9 | 14 | |
| needs-vs-wants | en | 119 | 29 | 2 | 32, 36 | 22 | none | | 11.1 | 19 | 3 min |
| | bn | 93 | 24 | 2 | 23, 26 | 20 | none | | 8.6 | 12 | |
| emergency-fund | en | 120 | 19 | 3 | 30, 28, 29 | 14 | none | | 13.8 | 19 | 4 min |
| | bn | 106 | 19 | 3 | 24, 26, 21 | 16 | none | | 12.1 | 19 | |
| save-small | en | 121 | 18 | 3 | 31, 30, 27 | 15 | none | | 12.3 | 15 | 3 min |
| | bn | 96 | 15 | 3 | 24, 21, 21 | 15 | none | | 9.7 | 12 | |
| mobile-money-safety | en | 131 | 14 | 3 | 28, 40, 31 | 18 | 2, 3 | 14 | 10.2 | 16 | 4 min |
| | bn | 109 | 12 | 3 | 24, 30, 26 | 17 | 2, 3 | 13 | 8.3 | 14 | |
| irregular-income | en | 127 | 17 | 3 | 30, 33, 25 | 22 | none | | 10.2 | 13 | 4 min |
| | bn | 111 | 16 | 3 | 25, 26, 22 | 22 | none | | 8.8 | 12 | |
| goals-that-stick | en | 128 | 15 | 4 | 27, 23, 21, 25 | 17 | none | | 9.4 | 15 | 3 min |
| | bn | 103 | 13 | 4 | 25, 18, 16, 17 | 14 | none | | 7.7 | 14 | |
| borrowing-basics | en | 131 | 18 | 3 | 41, 20, 33 | 19 | 4, 3 | 12 | 8.6 | 13 | 4 min |
| | bn | 120 | 19 | 3 | 36, 22, 27 | 16 | 4, 3 | 11 | 7.8 | 11 | |

Titles: English 15 to 31 characters (3 to 5 words), Bangla 13 to 26 characters. Summaries: one sentence, English 8 to 14 words, Bangla 8 to 12. Headings: 3 to 5 words. Bold: 0 to 4 phrases per module. At most one bullet list per section.

## Limits that follow (upper end of the above)

| Limit | English | Bangla |
|---|---|---|
| Words in the whole body | 131 | 120 |
| Words in one section (heading included) | 41 | 36 |
| Words in the "Try it" section (heading included) | 24 | 22 |
| Words in one sentence | 19 | 19 |
| Words in one bullet | 15 | 13 |
| Words in a heading | 5 | 5 |
| Title length (characters) | 31 | 26 |
| Summary (words) | 14 | 12 |
| Sections before "Try it" | 2 to 4 | 2 to 4 |
| Bullets per list, lists per section | 2 to 4, at most 1 | 2 to 4, at most 1 |

The quick check is new (the hand-written modules have none), so its limits are not measured: a question and an explanation are one sentence each under the sentence limit, and an option is at most 8 words.

## Reading time

The "N min read" label is computed: `ceil(words / rate)` with 42 words a minute for English and 36 for Bangla. The hand-written labels were set by hand and **no single rate reproduces all eight** (two English modules of 120 words carry different labels). These rates are the best fit: they match 6 of 8 English labels (misses: emergency-fund, 120 words labelled 4, computed 3; goals-that-stick, 128 words labelled 3, computed 4) and 7 of 8 Bangla labels (miss: emergency-fund, 106 words labelled 4, computed 3). The labels are slow on purpose; they allow for careful reading on a phone.

## Voice and tone

- **Addressed as "you", in Bangla the polite আপনি** (and the matching verb forms: করুন, দেখুন, রাখুন). Never তুমি.
- **Short, plain sentences.** Average 8.6 to 13.8 words in English, 6.9 to 12.1 in Bangla. One idea per paragraph. No jargon; where a term is needed it is explained in place ("A **need** is something you cannot do without").
- **Headings are short noun phrases or gentle imperatives** in sentence case, with no full stop: "Three steps", "Start small", "Know your fixed costs", "If you fall behind". A question is allowed ("How much?").
- **Opens straight away.** The first line states the idea ("A budget is not a punishment."). There is no "In this module you will learn" and no closing summary or pep talk.
- **Examples are everyday and local**: rent, bills, food, a phone, a delivery rider, Rs 50 a week. Amounts are small and round. English writes `৳50`, Bangla writes `৫০ টাকা` with Bangla digits. Only 4 of the 8 modules use a number at all.
- **Ends with "Try it"**: one small action inside Compass (set a limit, create a goal, open the forecast), sometimes followed by a reflective question.
- **What the tone does not do:** no shaming ("Falling behind is normal"), no fear, no slogans or exclamation marks, no promises, no product or firm names, no advice to borrow, invest or buy. Instructions are suggestions the reader can try, not orders. The borrowing module says outright that it is "general education, not advice about any particular loan".

## Reference excerpts (used in the generation prompt)

English, from *Managing income that changes*:

> ## Plan on the low side
>
> Look at your last few months and find a typical **lean week**. Build your plan on that, not on the best week you ever had.

English, from *Saving small, saving often*:

> ## Pay yourself first
>
> When income arrives, move the savings amount first, then spend what is left. Doing it the other way round usually leaves nothing to save.

Bangla, from *অনিয়মিত আয় সামলানো*:

> ## নিজেকে বেতন দিন
>
> ভালো সপ্তাহে বাড়তি টাকা তহবিলে সরান। কম আয়ের সপ্তাহে সেখান থেকে নিন। এভাবে অসমান আয় থেকে নিজের জন্য একটি স্থির "বেতন" তৈরি হয়।

Bangla, from *জরুরি তহবিল কেন দরকার*:

> ## ছোট করে শুরু
>
> শুরু করতে বড় অঙ্ক লাগে না। সপ্তাহে ৫০ টাকাও অভ্যাস তৈরি করে, আর শুরুতে অঙ্কের চেয়ে অভ্যাসই বড়।

The prompt carries one excerpt per language (the "Pay yourself first" and "নিজেকে বেতন দিন" sections), chosen because they show the voice without a number the model could copy.

## Format

Only the subset the app's renderer (`apps/web/src/features/learn/markdown.tsx`) supports: `##` headings, paragraphs, `- ` bullets and `**bold**`. No other heading levels, numbered lists, tables, links, URLs, HTML, code, block quotes, italics or emoji. The generated module is returned as JSON fields; code assembles the Markdown, so the model never writes `##` or `- ` itself, and the validator rejects any of these marks inside a field.
