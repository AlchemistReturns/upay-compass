/**
 * A labelled set of merchant names for training and testing the categorizer.
 *
 * It is built here, not collected: a vocabulary of shop and brand names per category (English,
 * Bangla, common misspellings), combined with owner names, places and note text by a seeded
 * generator. That makes it reproducible and lets the evaluation hold out whole vocabulary terms,
 * but it also means it is only as realistic as the vocabulary below. It shows that the method
 * works; it does not measure accuracy on real upay merchants.
 */

export const MODEL_CLASSES = [
  "food",
  "transport",
  "recharge_data",
  "bills",
  "education",
  "shopping",
  "family",
  "health",
  "entertainment",
  "savings",
  "other",
] as const;
export type ModelClass = (typeof MODEL_CLASSES)[number];

/** One vocabulary entry: a way a merchant of this category might be named. */
type Term = { label: ModelClass; name: string; notes?: string[] };

const T = (label: ModelClass, names: string[], notes?: string[]): Term[] =>
  names.map((name) => ({ label, name, notes }));

export const VOCABULARY: Term[] = [
  ...T(
    "food",
    [
      "Restaurant",
      "Restuarant",
      "Resturant",
      "রেস্তোরাঁ",
      "Biryani House",
      "Biriyani Ghor",
      "Kacchi Bhai",
      "Haji Biryani",
      "Tehari Ghor",
      "তেহারি ঘর",
      "Misti Ghor",
      "Mishti Mela",
      "Sweet Corner",
      "মিষ্টি ঘর",
      "Cha Ghor",
      "Tea Corner",
      "Cha Adda",
      "Coffee House",
      "Chai Point",
      "Fast Food",
      "Burger Hub",
      "Pizza Planet",
      "Chicken Fry",
      "Shawarma Point",
      "Kabab Ghor",
      "Chinese Corner",
      "Mudi Dokan",
      "মুদি দোকান",
      "Grocery Mart",
      "Super Shop",
      "Fresh Vegetables",
      "Fish Market",
      "Meat Shop",
      "Rice Depot",
      "Dim Dokan",
      "Pizza Hut",
      "Dominos",
      "Sultans Dine",
      "Madchef",
      "Takeout",
      "Burger King",
      "Nandos",
      "Cafe Rio",
      "Bangla Bakery",
      "Cake Shop",
      "Bread and Cake",
      "Hotel Al Razzak",
      "Vat Ghor",
      "Pitha Ghor",
      "Juice Bar",
      "Ice Cream Parlour",
      "Dhaba",
      "Canteen",
      "Mess Bill",
      "Tiffin Service",
    ],
    ["lunch", "dinner", "snacks", "tea", "iftar", "groceries", "breakfast"],
  ),
  ...T(
    "transport",
    [
      "Pathao Bike",
      "Uber Ride",
      "InDrive",
      "Obhai",
      "Shohoz",
      "Chalo",
      "Green Line Paribahan",
      "Hanif Enterprise",
      "Shyamoli Paribahan",
      "Ena Transport",
      "Soudia",
      "Desh Travels",
      "Shohagh Paribahan",
      "SR Travels",
      "Bus Counter",
      "Bus Ticket",
      "Launch Ghat",
      "Filling Station",
      "Fuel Pump",
      "Petrol Pump",
      "Padma Oil",
      "Jamuna Oil",
      "Meghna Petroleum",
      "CNG Station",
      "Parking Fee",
      "Toll Plaza",
      "Bridge Toll",
      "Rail Ticket",
      "Bangladesh Railway",
      "E-ticket Train",
      "Metro Rail Card",
      "Rapid Pass",
      "Auto Driver",
      "Rickshaw Puller",
      "রিকশাওয়ালা",
      "বাস কাউন্টার",
      "Air Ticket",
      "Biman Bangladesh",
      "US-Bangla Airlines",
      "Novoair",
      "Car Rental",
      "Ride Share",
      "Truck Service",
      "Courier Pickup",
    ],
    ["fare", "ticket", "ride", "trip", "going home"],
  ),
  ...T(
    "recharge_data",
    [
      "Grameenphone",
      "GP Internet",
      "Robi Axiata",
      "Banglalink",
      "Teletalk",
      "Airtel Bangladesh",
      "Skitto",
      "Mobile Recharge Point",
      "Flexiload Shop",
      "Data Pack Store",
      "Recharge Dokan",
      "Telecom Center",
      "Minute Pack",
      "SIM Corner",
      "ফ্লেক্সিলোড",
      "মোবাইল রিচার্জ",
      "Load Dokan",
      "Mobile Bazar Recharge",
    ],
    ["recharge", "data pack", "minutes", "internet pack"],
  ),
  ...T(
    "bills",
    [
      "Power Distribution",
      "Electricity Board",
      "Palli Bidyut",
      "Gas Distribution",
      "Karnaphuli Gas",
      "Water Supply Authority",
      "City Corporation Tax",
      "Holding Tax",
      "Building Maintenance",
      "Service Charge",
      "Apartment Rent",
      "Home Rent",
      "Dish Line",
      "Cable Operator",
      "Fiber Net",
      "Internet Provider",
      "Amber IT",
      "Dot Internet",
      "Triangle Services",
      "Sundarban Gas",
      "Bashundhara LP Gas",
      "Insurance Premium",
      "Metlife Premium",
      "Jiban Bima",
      "বিদ্যুৎ বিল",
      "গ্যাস বিল",
      "বাড়ি ভাড়া",
      "Landlord",
      "House Owner",
      "Utility Payment",
      "Maid Salary",
      "Guard Salary",
    ],
    ["monthly bill", "bill", "rent", "due"],
  ),
  ...T(
    "education",
    [
      "Coaching Centre",
      "Academy",
      "Model School",
      "College Fee",
      "University Fee",
      "Admission Fee",
      "Exam Centre",
      "Private Tutor",
      "Sir Tuition",
      "Madam Tuition",
      "Book Shop",
      "Boi Mela",
      "Library Fee",
      "Stationery Corner",
      "Kalam Ghar",
      "Course Fee",
      "Online Course",
      "Skill Training",
      "Language Center",
      "IELTS Centre",
      "Ten Minute School",
      "Bohubrihi",
      "Shikho",
      "Rokomari",
      "বই ঘর",
      "কোচিং সেন্টার",
      "স্কুল ফি",
      "Madrasa Fee",
      "Hostel Fee",
      "Photocopy Shop",
      "Print and Copy",
    ],
    ["fee", "tuition", "semester", "books", "exam"],
  ),
  ...T(
    "shopping",
    [
      "Fashion House",
      "Garments Outlet",
      "Boutique",
      "Cloth Store",
      "Saree Mahal",
      "Panjabi Corner",
      "Shoe Palace",
      "Footwear Center",
      "Electronics Mart",
      "Mobile Gallery",
      "Gadget Hub",
      "Computer World",
      "Furniture Gallery",
      "Cosmetics Corner",
      "Beauty Parlour",
      "Gift Shop",
      "Toy Store",
      "Home Decor",
      "Watch Corner",
      "Bag House",
      "Daraz",
      "Pickaboo",
      "Bikroy",
      "Othoba",
      "Ajkerdeal",
      "Yellow",
      "Ecstasy",
      "Richman",
      "Infinity Mega Mall",
      "Bashundhara City",
      "Jamuna Future Park",
      "Mobile Accessories",
      "Kids Zone",
      "Jewellers",
      "Gold Palace",
      "Optical Shop",
      "Fabrics",
      "Kapor Dokan",
      "কাপড়ের দোকান",
      "জুতার দোকান",
      "Salon",
      "Tailors",
      "Lifestyle Store",
    ],
    ["shopping", "eid shopping", "clothes", "gift"],
  ),
  ...T(
    "family",
    [
      "Mama",
      "Chacha",
      "Khala",
      "Fupu",
      "Dadu",
      "Nani",
      "Bhabi",
      "Apu",
      "Bhaiya",
      "Boro Bhai",
      "Chhoto Bon",
      "Uncle",
      "Aunty",
      "Cousin",
      "Sasur",
      "Shashuri",
      "মামা",
      "চাচা",
      "খালা",
      "ফুফু",
      "দাদু",
      "নানি",
      "ভাবি",
      "আপু",
    ],
    ["eid salami", "pocket money", "help", "borrowed", "gift", "sending home", "ধার"],
  ),
  ...T(
    "health",
    [
      "Pharmacy",
      "Pharmasy",
      "Medicine Corner",
      "Drug House",
      "Ostad Medical",
      "Clinic",
      "Diagnostic Centre",
      "Pathology Lab",
      "Eye Hospital",
      "Dental Care",
      "Skin Care Clinic",
      "Homeopathy",
      "Kabiraj",
      "Medical Hall",
      "Nursing Home",
      "Child Specialist",
      "Dr Rahman Chamber",
      "Square Pharmaceuticals",
      "Popular Diagnostic",
      "Labaid",
      "United Hospital",
      "Ibn Sina",
      "Apollo",
      "Lazz Pharma",
      "Health Care",
      "Physiotherapy",
      "Blood Test",
      "X-Ray Centre",
      "ফার্মেসি",
      "ডায়াগনস্টিক",
      "ওষুধের দোকান",
      "Ambulance Service",
      "Surgical Shop",
    ],
    ["medicine", "doctor", "test", "checkup"],
  ),
  ...T(
    "entertainment",
    [
      "Cinema Hall",
      "Cineplex",
      "Multiplex",
      "Star Cineplex",
      "Blockbuster",
      "Gaming Zone",
      "Game Center",
      "Snooker Club",
      "Billiard",
      "Amusement Park",
      "Fantasy Kingdom",
      "Nandan Park",
      "Water Kingdom",
      "Resort Entry Ticket",
      "Concert Ticket",
      "Event Ticket",
      "Theatre",
      "Chorki",
      "Hoichoi",
      "Bongo",
      "Toffee",
      "Netflix",
      "Spotify",
      "YouTube Premium",
      "Steam",
      "PlayStation",
      "Cricket Ticket",
      "Club Entry",
      "Picnic Spot",
      "Zoo Ticket",
      "Boat Ride",
      "Karaoke",
      "Bowling",
      "Escape Room",
      "সিনেমা হল",
      "গেমিং জোন",
    ],
    ["movie", "tickets", "fun", "weekend", "subscription"],
  ),
  ...T(
    "savings",
    [
      "DPS Installment",
      "DPS",
      "Fixed Deposit",
      "FDR",
      "Sanchay Patra",
      "Savings Account",
      "Savings Scheme",
      "Deposit Pension Scheme",
      "Monthly Savings",
      "Pension Fund",
      "Shanchoy",
      "Bank Deposit",
      "Cooperative Samity",
      "Samity Deposit",
      "Provident Fund",
      "সঞ্চয়",
      "ডিপিএস",
      "সমিতি",
    ],
    ["savings", "installment", "monthly deposit"],
  ),
  // Generic shop names that say nothing about what is sold. A model should not guess for these.
  ...T("other", [
    "Enterprise",
    "Trading Co",
    "Agency",
    "Services",
    "Corporation",
    "Brothers",
    "and Sons",
    "Traders",
    "Store",
    "Lounge",
    "Point",
    "Mart",
    "Centre",
    "International",
    "Associates",
    "Limited",
    "Hub",
    "Solutions",
    "Ventures",
    "House",
    "Zone",
    "Palace",
    "Corner",
    "Dokan",
    "দোকান",
  ]),
];

const OWNERS = [
  "Rahim",
  "Karim",
  "Salma",
  "Jamal",
  "Nasrin",
  "Hasan",
  "Mitu",
  "Sohel",
  "Rubel",
  "Tania",
  "Farhana",
  "Imran",
  "Shuvo",
  "Sumon",
  "Nipa",
  "Babul",
  "Rony",
  "Mahbub",
  "Liton",
  "Ruma",
  "Alam",
  "Sharmin",
  "Kabir",
  "Anwar",
  "রহিম",
  "করিম",
  "সালমা",
  "জামাল",
  "নাসরিন",
  "হাসান",
];

const PLACES = [
  "Dhanmondi",
  "Mirpur",
  "Uttara",
  "Gulshan",
  "Banani",
  "Mohammadpur",
  "Chattogram",
  "Sylhet",
  "Khulna",
  "Rajshahi",
  "Bogura",
  "Cumilla",
  "Motijheel",
  "Farmgate",
  "Rampura",
  "Jatrabari",
  "Savar",
  "Gazipur",
  "Narayanganj",
  "Barishal",
  "Rangpur",
  "Mymensingh",
  "ঢাকা",
  "চট্টগ্রাম",
];

export type LabelledMerchant = {
  counterparty: string;
  note: string;
  channel: "merchant" | "send_money" | "bill";
  label: ModelClass;
  /** The vocabulary entry it came from, so whole terms can be held out of training. */
  term: string;
};

/** Small seeded generator (mulberry32) so the set is identical on every run. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    pick: <X>(items: readonly X[]): X => items[Math.floor(next() * items.length)]!,
  };
}

/** A typing slip or a different spelling, the kind a person or a merchant account would have. */
function noisy(name: string, rng: ReturnType<typeof makeRng>): string {
  if (!/^[\x00-\x7f]+$/.test(name)) return name;
  const roll = rng.next();
  const chars = [...name];
  if (roll < 0.25) return name.toUpperCase();
  if (roll < 0.45) return name.toLowerCase();
  if (roll < 0.6 && chars.length > 4) {
    const i = 1 + Math.floor(rng.next() * (chars.length - 2));
    chars.splice(i, 1);
    return chars.join("");
  }
  if (roll < 0.7 && chars.length > 3) {
    const i = Math.floor(rng.next() * chars.length);
    chars.splice(i, 0, chars[i]!);
    return chars.join("");
  }
  if (roll < 0.8) return name.replace(/\s+/g, "");
  return name;
}

/**
 * `perTerm` examples for every vocabulary entry. Names are "<term>", "<owner> <term>",
 * "<owner>'s <term>", "<term> <place>" or "<owner> <term> <place>"; a quarter get a spelling slip
 * and a fifth get a note. Family names are sent as send_money, the rest are merchant payments.
 */
export function buildMerchantSet(perTerm = 14, seed = 7): LabelledMerchant[] {
  const rng = makeRng(seed);
  const out: LabelledMerchant[] = [];
  for (const term of VOCABULARY) {
    for (let k = 0; k < perTerm; k++) {
      const owner = rng.pick(OWNERS);
      const place = rng.pick(PLACES);
      const shape = rng.next();
      let name: string;
      if (term.label === "family") name = rng.chance(0.5) ? `${owner} ${term.name}` : term.name;
      else if (shape < 0.25) name = term.name;
      else if (shape < 0.45) name = `${owner} ${term.name}`;
      else if (shape < 0.6) name = `${owner}'s ${term.name}`;
      else if (shape < 0.8) name = `${term.name} ${place}`;
      else name = `${owner} ${term.name} ${place}`;
      if (rng.chance(0.25)) name = noisy(name, rng);
      const note = term.notes && rng.chance(0.2) ? rng.pick(term.notes) : "";
      out.push({
        counterparty: name,
        note,
        channel:
          term.label === "family"
            ? "send_money"
            : term.label === "bills" && rng.chance(0.4)
              ? "bill"
              : "merchant",
        label: term.label,
        term: `${term.label}:${term.name}`,
      });
    }
  }
  return out;
}

/** Stable 0..1 value for a string, used to assign vocabulary terms to splits. */
export function unitHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}
