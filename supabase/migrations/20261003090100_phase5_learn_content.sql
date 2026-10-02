-- Phase 5: learn hub content. Short, plain-language modules in English and Bangla.
-- Educational only; no product, investment or loan recommendations.
-- Markdown subset used: "## heading", paragraphs, "- " bullets, **bold**.

insert into public.learn_modules
  (slug, position, level, minutes, title_en, title_bn, summary_en, summary_bn, body_md_en, body_md_bn)
values
(
  'budget-basics', 1, 1, 3,
  'What a budget really is',
  'বাজেট আসলে কী',
  'A budget is just a plan for your money, made before you spend it.',
  'বাজেট হলো খরচ করার আগে টাকার একটি পরিকল্পনা।',
  $md$A budget is not a punishment. It is a simple plan: how much comes in, and where you want it to go.

## Three steps

- **Know what comes in.** Add up your usual income for a month.
- **List what must be paid.** Rent, bills, food, transport.
- **Decide the rest.** What is left can go to savings or to things you enjoy.

## A rule of thumb

Many people try to keep about half for needs, some for wants, and some for savings. Your numbers will differ, and that is fine. What matters is that you decide on purpose.

## Try it

Pick the one category where money disappears fastest and set a monthly limit for it in Compass. Check in once a week.$md$,
  $md$বাজেট কোনো শাস্তি নয়। এটা একটা সহজ পরিকল্পনা: কত টাকা আসছে, আর কোথায় যাবে।

## তিনটি ধাপ

- **কত আসে জানুন।** এক মাসের স্বাভাবিক আয় যোগ করুন।
- **যা দিতেই হবে তার তালিকা করুন।** ভাড়া, বিল, খাবার, যাতায়াত।
- **বাকিটা ঠিক করুন।** যা থাকে তা সঞ্চয়ে বা পছন্দের কাজে যেতে পারে।

## একটি সহজ নিয়ম

অনেকে আয়ের প্রায় অর্ধেক প্রয়োজনে, কিছু শখে, আর কিছু সঞ্চয়ে রাখার চেষ্টা করেন। আপনার হিসাব আলাদা হতেই পারে, তাতে সমস্যা নেই। মূল কথা হলো ভেবে-চিন্তে ঠিক করা।

## নিজে করে দেখুন

যে ক্যাটাগরিতে টাকা সবচেয়ে দ্রুত শেষ হয়, সেটির জন্য Compass-এ মাসিক সীমা ঠিক করুন। সপ্তাহে একবার দেখে নিন।$md$
),
(
  'needs-vs-wants', 2, 1, 3,
  'Needs and wants',
  'প্রয়োজন আর শখ',
  'Telling needs from wants makes tight months easier.',
  'প্রয়োজন আর শখ আলাদা করতে পারলে টানাটানির মাস সামলানো সহজ হয়।',
  $md$A **need** is something you cannot do without: food, rent, bills, travel to work. A **want** is something nice to have: a new phone cover, eating out, extra data.

## Why it matters

When money is short, cut wants first and protect needs. Mixing them up is how people end up skipping a bill to pay for something they did not need.

## The gray area

Some things sit in the middle. A phone is a need if you work with it, but the newest model is a want. Ask: what is the simplest version that does the job?

## Try it

Look at last month's spending in Compass. Pick three items and label each need or want. Which want surprised you?$md$,
  $md$**প্রয়োজন** হলো যা ছাড়া চলে না: খাবার, ভাড়া, বিল, কাজে যাওয়ার খরচ। **শখ** হলো যা থাকলে ভালো: নতুন ফোন কভার, বাইরে খাওয়া, বাড়তি ডেটা।

## কেন গুরুত্বপূর্ণ

টাকা কম পড়লে আগে শখের খরচ কমান, প্রয়োজন বাঁচিয়ে রাখুন। দুটি গুলিয়ে ফেললে অনেকে অপ্রয়োজনীয় কিছুর জন্য বিল দিতে দেরি করেন।

## মাঝামাঝি জিনিস

কিছু জিনিস দুই দিকেই পড়ে। কাজে লাগে বলে ফোন প্রয়োজন, কিন্তু সবচেয়ে নতুন মডেলটা শখ। নিজেকে জিজ্ঞেস করুন: কাজ চালানোর সবচেয়ে সহজ উপায় কোনটা?

## নিজে করে দেখুন

Compass-এ গত মাসের খরচ দেখুন। তিনটি খরচ বেছে প্রয়োজন না শখ লিখুন। কোন শখের খরচটা অবাক করল?$md$
),
(
  'emergency-fund', 3, 1, 4,
  'Why an emergency buffer matters',
  'জরুরি তহবিল কেন দরকার',
  'A small cushion keeps a surprise bill from becoming a crisis.',
  'ছোট একটি জমানো তহবিল হঠাৎ খরচকে সংকটে পরিণত হতে দেয় না।',
  $md$An emergency buffer is money set aside for surprises: a medical bill, a broken phone, a week without work.

## How much?

A common first goal is enough for **one week of essentials**, then one month, then three months. Compass uses seven days of essential spending as your safety buffer.

## Where to keep it

Keep it somewhere easy to reach but not so easy that you spend it on a whim. A separate goal in Compass works well.

## Start small

You do not need a big amount to begin. Even ৳50 a week builds the habit, and the habit matters more than the size at the start.

## Try it

Create a goal called "Emergency buffer" and add a small amount today.$md$,
  $md$জরুরি তহবিল হলো হঠাৎ ঘটনার জন্য আলাদা করে রাখা টাকা: চিকিৎসার খরচ, নষ্ট ফোন, কিংবা কাজ ছাড়া এক সপ্তাহ।

## কতটা?

প্রথম লক্ষ্য হিসেবে **এক সপ্তাহের প্রয়োজনীয় খরচ** ভালো, তারপর এক মাস, তারপর তিন মাস। Compass সাত দিনের প্রয়োজনীয় খরচকে আপনার নিরাপদ সীমা ধরে।

## কোথায় রাখবেন

এমন জায়গায় রাখুন যেখান থেকে দরকারে সহজে বের করা যায়, কিন্তু খেয়ালের বশে খরচ করা যায় না। Compass-এ আলাদা একটি লক্ষ্য ভালো কাজ করে।

## ছোট করে শুরু

শুরু করতে বড় অঙ্ক লাগে না। সপ্তাহে ৫০ টাকাও অভ্যাস তৈরি করে, আর শুরুতে অঙ্কের চেয়ে অভ্যাসই বড়।

## নিজে করে দেখুন

"জরুরি তহবিল" নামে একটি লক্ষ্য খুলুন এবং আজই অল্প কিছু টাকা যোগ করুন।$md$
),
(
  'save-small', 4, 1, 3,
  'Saving small, saving often',
  'অল্প অল্প করে জমানো',
  'Small, regular amounts add up faster than you expect.',
  'অল্প অল্প নিয়মিত জমালে যোগফল ভাবনার চেয়ে দ্রুত বড় হয়।',
  $md$Saving does not have to mean putting away a large sum. Small amounts, saved often, build up quietly.

## The math

Saving ৳50 a day is ৳1,500 in a month and ৳18,000 in a year. You hardly feel it day to day, but it adds up to a real cushion.

## Make it automatic

The easiest saving is the one you do not have to remember. Round-ups in Compass move the small change from each payment into a goal for you.

## Pay yourself first

When income arrives, move the savings amount first, then spend what is left. Doing it the other way round usually leaves nothing to save.

## Try it

Turn on round-ups for one goal and watch it grow for a week.$md$,
  $md$সঞ্চয় মানেই বড় অঙ্ক সরিয়ে রাখা নয়। অল্প অল্প করে নিয়মিত জমালে চুপচাপ জমে যায়।

## হিসাবটা

রোজ ৫০ টাকা জমালে মাসে ১,৫০০ আর বছরে ১৮,০০০ টাকা হয়। রোজকার দিনে টের পাওয়া যায় না, কিন্তু জমে একটা ভালো তহবিল হয়।

## স্বয়ংক্রিয় করুন

সবচেয়ে সহজ সঞ্চয় হলো যেটা মনে রাখতে হয় না। Compass-এর রাউন্ড-আপ প্রতিটি পেমেন্টের খুচরো টাকা আপনার লক্ষ্যে সরিয়ে দেয়।

## আগে নিজেকে দিন

আয় এলে আগে সঞ্চয়ের অঙ্ক সরান, তারপর বাকিটা খরচ করুন। উল্টোটা করলে সাধারণত জমানোর মতো কিছু থাকে না।

## নিজে করে দেখুন

একটি লক্ষ্যের জন্য রাউন্ড-আপ চালু করুন এবং এক সপ্তাহ দেখুন কেমন বাড়ে।$md$
),
(
  'mobile-money-safety', 5, 1, 4,
  'Staying safe with mobile money',
  'মোবাইল মানিতে নিরাপদ থাকুন',
  'A few habits protect your wallet from the most common scams.',
  'কয়েকটি অভ্যাস সবচেয়ে সাধারণ প্রতারণা থেকে আপনার ওয়ালেট বাঁচায়।',
  $md$Most mobile money losses come from tricking the person, not from breaking the system.

## Never share

- Your **PIN**, with anyone, ever. No real company will ask for it.
- The **OTP** sent to your phone. It is a key, not a prize code.

## Common tricks

- A call or message saying you won a prize or must "verify" your account.
- A stranger who sends money "by mistake" and asks you to send it back.
- A link that looks like your wallet but is not.

## What to do

Stop, do not click, do not reply. Hang up and contact the provider through its official number or app. If something looks wrong, change your PIN right away.

## Try it

Check that your Compass PIN is not your birth year or a simple pattern like 1234.$md$,
  $md$মোবাইল মানিতে বেশির ভাগ ক্ষতি হয় মানুষকে ধোঁকা দিয়ে, সিস্টেম ভেঙে নয়।

## কখনো দেবেন না

- আপনার **পিন**, কাউকে নয়, কখনো নয়। কোনো আসল প্রতিষ্ঠান এটা চায় না।
- ফোনে আসা **ওটিপি**। এটা একটি চাবি, পুরস্কারের কোড নয়।

## সাধারণ কৌশল

- ফোন বা মেসেজে বলা যে আপনি পুরস্কার জিতেছেন বা অ্যাকাউন্ট "যাচাই" করতে হবে।
- অচেনা কেউ "ভুলে" টাকা পাঠিয়ে ফেরত চাইছে।
- দেখতে আপনার ওয়ালেটের মতো কিন্তু আসলে নকল লিংক।

## কী করবেন

থামুন, ক্লিক করবেন না, উত্তর দেবেন না। ফোন কেটে দিয়ে প্রতিষ্ঠানের অফিসিয়াল নম্বর বা অ্যাপে যোগাযোগ করুন। কিছু সন্দেহ হলে সঙ্গে সঙ্গে পিন বদলান।

## নিজে করে দেখুন

আপনার Compass পিন যেন জন্মসাল বা ১২৩৪-এর মতো সহজ ছক না হয়, দেখে নিন।$md$
),
(
  'irregular-income', 6, 2, 4,
  'Managing income that changes',
  'অনিয়মিত আয় সামলানো',
  'When pay is uneven, plan around your lean weeks, not your best ones.',
  'আয় অসমান হলে সেরা সপ্তাহ নয়, কম আয়ের সপ্তাহ ধরে পরিকল্পনা করুন।',
  $md$Drivers, delivery riders and freelancers earn different amounts each week. That makes planning harder, but not impossible.

## Plan on the low side

Look at your last few months and find a typical **lean week**. Build your plan on that, not on the best week you ever had.

## Pay yourself a wage

In a good week, move the extra into a buffer. In a lean week, draw from it. Over time you give yourself a steady "salary" from an uneven income.

## Know your fixed costs

Rent, loan installments and bills come on fixed dates whatever you earn. Compass's forecast shows when these may squeeze your balance.

## Try it

Open the forecast and look for any dip below your safety buffer. What would you do a week before it?$md$,
  $md$ড্রাইভার, ডেলিভারি রাইডার বা ফ্রিল্যান্সারের আয় সপ্তাহে সপ্তাহে আলাদা। এতে পরিকল্পনা কঠিন হয়, কিন্তু অসম্ভব নয়।

## কম আয় ধরে হিসাব করুন

গত কয়েক মাস দেখে একটি সাধারণ **কম আয়ের সপ্তাহ** খুঁজে নিন। জীবনের সেরা সপ্তাহ নয়, এটির ওপর পরিকল্পনা দাঁড় করান।

## নিজেকে বেতন দিন

ভালো সপ্তাহে বাড়তি টাকা তহবিলে সরান। কম আয়ের সপ্তাহে সেখান থেকে নিন। এভাবে অসমান আয় থেকে নিজের জন্য একটি স্থির "বেতন" তৈরি হয়।

## স্থির খরচ জানুন

ভাড়া, কিস্তি আর বিল আয় যাই হোক নির্দিষ্ট তারিখেই আসে। Compass-এর পূর্বাভাস দেখায় কখন এগুলো ব্যালেন্সে চাপ ফেলতে পারে।

## নিজে করে দেখুন

পূর্বাভাস খুলে নিরাপদ সীমার নিচে নামার কোনো দিন আছে কি না দেখুন। সেটির এক সপ্তাহ আগে আপনি কী করবেন?$md$
),
(
  'goals-that-stick', 7, 2, 3,
  'Setting goals that stick',
  'যে লক্ষ্য টেকে',
  'Clear, small, dated goals are the ones people actually reach.',
  'স্পষ্ট, ছোট আর তারিখসহ লক্ষ্যই মানুষ সত্যিই পূরণ করে।',
  $md$"Save more" is a wish. "Save ৳6,000 for a phone by March" is a goal.

## Make it specific

Give a goal a name, an amount and a date. Then divide: ৳6,000 over six months is ৳1,000 a month, about ৳33 a day.

## Keep it small

A goal you can reach in a few months keeps you motivated. Big goals are easier when cut into steps.

## Make progress visible

Seeing a bar fill up is a reward in itself. Check your goals weekly, and celebrate each step.

## If you fall behind

Falling behind is normal. Adjust the date or the amount and carry on. Stopping is the only way to really fail.

## Try it

Create one goal with a target date and see what Compass says about the pace.$md$,
  $md$"আরও জমাব" একটি ইচ্ছা। "মার্চের মধ্যে ফোনের জন্য ৬,০০০ টাকা জমাব" একটি লক্ষ্য।

## নির্দিষ্ট করুন

লক্ষ্যের একটি নাম, একটি অঙ্ক আর একটি তারিখ দিন। তারপর ভাগ করুন: ছয় মাসে ৬,০০০ টাকা মানে মাসে ১,০০০, রোজ প্রায় ৩৩ টাকা।

## ছোট রাখুন

কয়েক মাসে পৌঁছানো যায় এমন লক্ষ্য উৎসাহ ধরে রাখে। বড় লক্ষ্য ধাপে ভাগ করলে সহজ হয়।

## অগ্রগতি দেখুন

বার ভরে উঠতে দেখাটাই একটি পুরস্কার। সপ্তাহে একবার লক্ষ্য দেখুন, প্রতিটি ধাপ উদ্যাপন করুন।

## পিছিয়ে পড়লে

পিছিয়ে পড়া স্বাভাবিক। তারিখ বা অঙ্ক বদলে আবার চালিয়ে যান। থেমে যাওয়াই একমাত্র সত্যিকারের ব্যর্থতা।

## নিজে করে দেখুন

একটি লক্ষ্য তারিখসহ খুলুন এবং Compass গতি নিয়ে কী বলে দেখুন।$md$
),
(
  'borrowing-basics', 8, 3, 4,
  'Borrowing: what to check first',
  'ধার নেওয়ার আগে কী দেখবেন',
  'Before you borrow, know the full cost and whether you can repay.',
  'ধার নেওয়ার আগে মোট খরচ আর শোধ করার সামর্থ্য জেনে নিন।',
  $md$Borrowing can help, but it always costs something. This is general education, not advice about any particular loan.

## Ask these questions

- **How much will I repay in total**, not only per month?
- **What is the interest or fee**, and how often is it charged?
- **What happens if I am late?**
- **Can I afford the installment** in my leanest month?

## Watch for

- Offers that talk only about the small monthly amount.
- Borrowing to pay another loan.
- Pressure to decide today.

## A simple test

Add up the installments and subtract what you borrowed. That difference is what the loan costs you. If you cannot explain it in one sentence, wait and ask more questions.

## Try it

Look at the forecast for your regular payments. Would a new installment fit under your safety buffer?$md$,
  $md$ধার কাজে লাগতে পারে, কিন্তু এর একটা খরচ থাকেই। এটি সাধারণ শিক্ষামূলক আলোচনা, কোনো নির্দিষ্ট ঋণ নিয়ে পরামর্শ নয়।

## এই প্রশ্নগুলো করুন

- **মোট কত টাকা ফেরত দিতে হবে**, শুধু মাসে কত নয়?
- **সুদ বা ফি কত**, আর কত দিন পর পর ধরা হয়?
- **দেরি হলে কী হবে?**
- **সবচেয়ে কম আয়ের মাসেও কিস্তি দিতে পারব কি?**

## সতর্ক থাকুন

- যে প্রস্তাবে শুধু মাসিক ছোট অঙ্কের কথা বলা হয়।
- এক ঋণ শোধ করতে আরেক ঋণ নেওয়া।
- আজই সিদ্ধান্ত নেওয়ার চাপ।

## একটি সহজ পরীক্ষা

সব কিস্তি যোগ করে যা ধার নিয়েছিলেন তা বাদ দিন। এই পার্থক্যই ঋণের খরচ। এক বাক্যে বোঝাতে না পারলে অপেক্ষা করুন, আরও প্রশ্ন করুন।

## নিজে করে দেখুন

নিয়মিত পেমেন্টের জন্য পূর্বাভাস দেখুন। নতুন কিস্তি কি আপনার নিরাপদ সীমার নিচে ঢুকবে?$md$
);
