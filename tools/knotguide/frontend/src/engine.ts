// @ts-nocheck
/* KnotGuide — engine.js: Knot database & search (browser-only) */

export const ACTIVITIES = ['climbing','fishing','sailing','camping','general'];

export const KNOTS = [
  { id:'bowline', name:'Bowline', activities:['sailing','climbing','camping','general'], difficulty:2, strength:60,
    desc:'Creates a fixed loop that doesn\'t slip. Easy to untie after loading.',
    steps:['Form a small loop in the standing part.','Pass the working end up through the loop.','Wrap behind the standing part.','Pass back down through the small loop.','Tighten by pulling standing part and loop.'] },
  { id:'figure8_follow', name:'Figure 8 Follow-Through', activities:['climbing'], difficulty:2, strength:75,
    desc:'The standard climbing tie-in knot. Strong, easy to inspect visually.',
    steps:['Tie a figure-8 knot in the rope.','Thread the tail through your harness.','Retrace the figure-8 with the tail.','Leave a tail of at least 15cm.','Dress the knot neatly and tighten.'] },
  { id:'clove_hitch', name:'Clove Hitch', activities:['climbing','sailing','camping','general'], difficulty:1, strength:55,
    desc:'Quick hitch around a pole or carabiner. Can slip under variable loads.',
    steps:['Wrap the rope around the object.','Cross over the standing part.','Wrap around again.','Tuck the end under the last wrap.','Pull to tighten.'] },
  { id:'trucker_hitch', name:'Trucker\'s Hitch', activities:['camping','general'], difficulty:3, strength:70,
    desc:'Creates a 3:1 mechanical advantage for tensioning lines.',
    steps:['Form a loop (slip knot) in the standing part.','Pass the working end around the anchor.','Thread up through the loop.','Pull down to tension (3:1 advantage).','Secure with two half hitches.'] },
  { id:'cleat_hitch', name:'Cleat Hitch', activities:['sailing'], difficulty:1, strength:80,
    desc:'Standard dock line hitch. Quick to tie and release.',
    steps:['Wrap the line once around the far horn.','Cross over to the near horn.','Cross back to the far horn (figure-8 pattern).','Finish with a locking half hitch.','Ensure the final loop locks under itself.'] },
  { id:'palomar', name:'Palomar Knot', activities:['fishing'], difficulty:2, strength:95,
    desc:'One of the strongest fishing knots. Works with braided and monofilament line.',
    steps:['Double 15cm of line into a loop.','Pass the loop through the hook eye.','Tie an overhand knot with the doubled line.','Pass the loop over the hook.','Moisten and pull tight.'] },
  { id:'blood_knot', name:'Blood Knot', activities:['fishing'], difficulty:3, strength:80,
    desc:'Joins two lines of similar diameter. Common for fly fishing leaders.',
    steps:['Overlap the two line ends by 15cm.','Wrap one end around the other 5 times.','Tuck the end through the centre gap.','Repeat with the other end (opposite direction).','Moisten, pull both standing parts to tighten.'] },
  { id:'sheet_bend', name:'Sheet Bend', activities:['sailing','camping','general'], difficulty:1, strength:55,
    desc:'Joins two ropes, especially of different diameters.',
    steps:['Form a bight in the thicker rope.','Pass the thinner rope up through the bight.','Wrap around behind both parts of the bight.','Tuck under itself.','Tighten all four ends.'] },
  { id:'prusik', name:'Prusik Knot', activities:['climbing'], difficulty:2, strength:65,
    desc:'Friction hitch that slides when unloaded, grips when loaded. Used for ascending.',
    steps:['Form a loop with a cord (girth hitch start).','Wrap the loop around the main rope 3 times.','Pass the loop through itself.','Dress neatly — all wraps parallel.','Grips when pulled down, slides when pushed up.'] },
  { id:'taut_line', name:'Taut-Line Hitch', activities:['camping','general'], difficulty:2, strength:60,
    desc:'Adjustable loop that can be slid to tension a line. Perfect for tent guy lines.',
    steps:['Wrap twice around inside the loop.','Pass once around outside.','Tuck through the outer loop.','Slide to adjust tension.','Holds under load, adjusts when unloaded.'] },
  { id:'munter', name:'Munter Hitch', activities:['climbing'], difficulty:2, strength:70,
    desc:'Emergency belay/rappel hitch using just a carabiner. No device needed.',
    steps:['Form a loop and clip into a locking carabiner.','The rope should run through with a twist.','Feeding rope in flips the hitch.','Lock the carabiner.','Control descent by holding the brake strand.'] },
  { id:'fisherman', name:'Double Fisherman\'s', activities:['climbing','general'], difficulty:3, strength:85,
    desc:'Very secure bend for joining two ropes. Used for cordelette and prusik loops.',
    steps:['Tie a double overhand around the other rope.','Repeat with the other end.','Pull standing parts to seat the knots.','Knots should slide together tightly.','Tails should be at least 8cm.'] },
];

/** Search knots by activity */
export function searchByActivity(activity) {
  return KNOTS.filter(k => k.activities.includes(activity))
    .sort((a,b) => a.difficulty - b.difficulty);
}

/** Search by keyword */
export function searchByKeyword(query) {
  const q = query.toLowerCase();
  return KNOTS.filter(k => k.name.toLowerCase().includes(q) || k.desc.toLowerCase().includes(q));
}

/** Get a single knot */
export function getKnot(id) { return KNOTS.find(k => k.id === id) || null; }

/** Get difficulty label */
export function difficultyLabel(d) { return ['','Easy','Moderate','Challenging'][d] || 'Unknown'; }
