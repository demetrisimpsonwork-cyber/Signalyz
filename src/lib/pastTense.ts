/**
 * Convert the first word of a bullet string to past tense.
 * Pure string operation — only the very first word is touched.
 */

const IRREGULAR: Record<string, string> = {
  build: "Built",
  begin: "Began",
  bring: "Brought",
  buy: "Bought",
  catch: "Caught",
  choose: "Chose",
  come: "Came",
  cut: "Cut",
  do: "Did",
  draw: "Drew",
  drive: "Drove",
  eat: "Ate",
  fall: "Fell",
  feed: "Fed",
  feel: "Felt",
  fight: "Fought",
  find: "Found",
  fly: "Flew",
  forbid: "Forbade",
  forget: "Forgot",
  forgive: "Forgave",
  freeze: "Froze",
  get: "Got",
  give: "Gave",
  go: "Went",
  grow: "Grew",
  have: "Had",
  hear: "Heard",
  hide: "Hid",
  hit: "Hit",
  hold: "Held",
  hurt: "Hurt",
  keep: "Kept",
  know: "Knew",
  lay: "Laid",
  lead: "Led",
  leave: "Left",
  lend: "Lent",
  let: "Let",
  lie: "Lay",
  lose: "Lost",
  make: "Made",
  mean: "Meant",
  meet: "Met",
  overcome: "Overcame",
  oversee: "Oversaw",
  pay: "Paid",
  put: "Put",
  read: "Read",
  rebuild: "Rebuilt",
  run: "Ran",
  say: "Said",
  see: "Saw",
  seek: "Sought",
  sell: "Sold",
  send: "Sent",
  set: "Set",
  shake: "Shook",
  shed: "Shed",
  shine: "Shone",
  shoot: "Shot",
  show: "Showed",
  shrink: "Shrank",
  shut: "Shut",
  sit: "Sat",
  speak: "Spoke",
  spend: "Spent",
  spin: "Spun",
  split: "Split",
  spread: "Spread",
  stand: "Stood",
  steal: "Stole",
  stick: "Stuck",
  strike: "Struck",
  sweep: "Swept",
  swim: "Swam",
  swing: "Swung",
  take: "Took",
  teach: "Taught",
  tear: "Tore",
  tell: "Told",
  think: "Thought",
  throw: "Threw",
  undergo: "Underwent",
  understand: "Understood",
  undertake: "Undertook",
  win: "Won",
  withdraw: "Withdrew",
  write: "Wrote",
  arise: "Arose",
  awake: "Awoke",
  bear: "Bore",
  beat: "Beat",
  become: "Became",
  bend: "Bent",
  bet: "Bet",
  bid: "Bid",
  bind: "Bound",
  bite: "Bit",
  bleed: "Bled",
  blow: "Blew",
  break: "Broke",
  breed: "Bred",
  broadcast: "Broadcast",
  burst: "Burst",
  cast: "Cast",
  cling: "Clung",
  cost: "Cost",
  creep: "Crept",
  deal: "Dealt",
  dig: "Dug",
  dive: "Dove",
  drag: "Dragged",
  drink: "Drank",
  dwell: "Dwelt",
  forecast: "Forecast",
  foresee: "Foresaw",
  grind: "Ground",
  hang: "Hung",
  kneel: "Knelt",
  knit: "Knit",
  lean: "Leaned",
  leap: "Leapt",
  learn: "Learned",
  light: "Lit",
  outdo: "Outdid",
  outgrow: "Outgrew",
  output: "Output",
  quit: "Quit",
  rid: "Rid",
  ring: "Rang",
  rise: "Rose",
  sew: "Sewed",
  sink: "Sank",
  slay: "Slew",
  slide: "Slid",
  sling: "Slung",
  slit: "Slit",
  smell: "Smelt",
  sow: "Sowed",
  spell: "Spelled",
  spill: "Spilled",
  spit: "Spat",
  spoil: "Spoiled",
  spring: "Sprang",
  sting: "Stung",
  stink: "Stank",
  stride: "Strode",
  string: "Strung",
  strive: "Strove",
  swear: "Swore",
  swell: "Swelled",
  thrive: "Thrived",
  tread: "Trod",
  weave: "Wove",
  weep: "Wept",
  wring: "Wrung",
};

// Words that are already past tense or should not be changed
const SKIP_WORDS = new Set([
  // Common past-tense endings
  // We'll detect these by suffix instead
]);

function isAlreadyPastTense(word: string): boolean {
  const lower = word.toLowerCase();
  // Already ends in -ed (most regular past tenses)
  if (lower.endsWith("ed")) return true;
  // Check if it's an irregular past tense value
  const irregularPastForms = new Set(Object.values(IRREGULAR).map(v => v.toLowerCase()));
  if (irregularPastForms.has(lower)) return true;
  return false;
}

function toPastTense(word: string): string {
  const lower = word.toLowerCase();

  // Already past tense — leave it alone
  if (isAlreadyPastTense(word)) return word;

  // Check irregular map
  const irregular = IRREGULAR[lower];
  if (irregular) {
    // Preserve original casing style (Title case since bullets start with capital)
    return irregular.charAt(0).toUpperCase() + irregular.slice(1).toLowerCase();
  }

  // Regular conjugation rules
  let base = lower;
  let past: string;

  if (base.endsWith("e")) {
    past = base + "d";
  } else if (base.endsWith("y") && base.length > 2 && !"aeiou".includes(base[base.length - 2])) {
    past = base.slice(0, -1) + "ied";
  } else if (
    base.length >= 3 &&
    !"aeiou".includes(base[base.length - 1]) &&
    "aeiou".includes(base[base.length - 2]) &&
    !"aeiou".includes(base[base.length - 3]) &&
    !base.endsWith("w") &&
    !base.endsWith("x") &&
    !base.endsWith("y")
  ) {
    // CVC pattern — double final consonant
    past = base + base[base.length - 1] + "ed";
  } else {
    past = base + "ed";
  }

  // Preserve original capitalisation (first letter)
  if (word[0] === word[0].toUpperCase()) {
    past = past.charAt(0).toUpperCase() + past.slice(1);
  }

  return past;
}

/**
 * Convert the first word of `bullet` to past tense.
 * Returns the full bullet string with only the first word changed.
 */
export function bulletToPastTense(bullet: string): string {
  if (!bullet) return bullet;
  const trimmed = bullet.trimStart();
  const leadingSpace = bullet.slice(0, bullet.length - trimmed.length);
  const match = trimmed.match(/^(\S+)(.*)/s);
  if (!match) return bullet;
  const [, firstWord, rest] = match;
  // Strip trailing punctuation from the word for lookup, then re-attach
  const punctMatch = firstWord.match(/^([A-Za-z'-]+)(.*)$/);
  if (!punctMatch) return bullet; // non-alpha first token — skip
  const [, alpha, trailing] = punctMatch;
  const converted = toPastTense(alpha);
  return leadingSpace + converted + trailing + rest;
}
