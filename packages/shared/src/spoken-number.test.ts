import { describe, expect, it } from "vitest";
import { candidateAmounts, spokenNumbers } from "./spoken-number";

describe("spokenNumbers: English words (hand-computed)", () => {
  it("reads simple and compound numbers", () => {
    expect(spokenNumbers("add five hundred taka for tea")).toEqual([500]);
    expect(spokenNumbers("fifty taka")).toEqual([50]);
    expect(spokenNumbers("two thousand fifty")).toEqual([2050]); // 2000 + 50
    expect(spokenNumbers("one hundred and twenty five")).toEqual([125]);
    expect(spokenNumbers("three lakh")).toEqual([300_000]);
    expect(spokenNumbers("five thousand two hundred")).toEqual([5200]); // 5000 + 200
    expect(spokenNumbers("twenty one")).toEqual([21]);
  });

  it("reads every separate number in a sentence", () => {
    expect(spokenNumbers("move five hundred to the goal and spend fifty on tea")).toEqual([
      500, 50,
    ]);
  });

  it("ignores text with no number words", () => {
    expect(spokenNumbers("remove my last payment")).toEqual([]);
  });
});

describe("spokenNumbers: Bangla words (hand-computed)", () => {
  it("reads a joined hundred and a spaced one", () => {
    expect(spokenNumbers("পাঁচশো টাকা")).toEqual([500]);
    expect(spokenNumbers("পাঁচ শো টাকা")).toEqual([500]);
    expect(spokenNumbers("দুইশ")).toEqual([200]);
  });

  it("reads tens, thousands and lakh", () => {
    expect(spokenNumbers("পঞ্চাশ টাকা")).toEqual([50]);
    expect(spokenNumbers("পঁচিশ")).toEqual([25]);
    expect(spokenNumbers("পাঁচ হাজার")).toEqual([5000]);
    expect(spokenNumbers("পাঁচ হাজার দুইশো পঞ্চাশ")).toEqual([5250]); // 5000 + 200 + 50
    expect(spokenNumbers("দুই লাখ")).toEqual([200_000]);
  });

  it("reads one-and-a-half and two-and-a-half", () => {
    expect(spokenNumbers("দেড় হাজার")).toEqual([1500]);
    expect(spokenNumbers("আড়াই শো")).toEqual([250]);
  });

  it("does not read ordinary words as numbers", () => {
    expect(spokenNumbers("আজ রহিম স্টলে চা খেয়ে খরচ করেছি")).toEqual([]);
  });
});

describe("candidateAmounts: digits and words together", () => {
  it("gives every amount in the transcript once", () => {
    expect(candidateAmounts("Add ৳ 500 for tea at Rahim's stall today.")).toEqual([500]);
    expect(candidateAmounts("আজ চায়ে পাঁচশো টাকা খরচ")).toEqual([500]);
    expect(candidateAmounts("Tea stall এ ৫০ টাকা")).toEqual([50]);
    expect(candidateAmounts("add 500, that is five hundred")).toEqual([500]);
    expect(candidateAmounts("five k")).toEqual([5]); // "k" is only read after digits
  });

  it("returns nothing when no amount was spoken", () => {
    expect(candidateAmounts("remove my last payment")).toEqual([]);
  });
});
