// The training program, based on the "Glute + Cut Plan" doc, retuned for:
//   arms  -> high reps (15-20)
//   legs  -> heavier weight (5-8, add load)
//   more cardio (incline-walk finisher every lifting day + a long cardio day)
//
// Exercise types drive how the app suggests your next session:
//   heavy  - legs: double progression, add weight once you hit the top of the rep range
//   arms   - high reps: add a rep each session; add weight only after 20s on every set
//   volume - moderate accessories: double progression
//   bw     - bodyweight: add reps
//   time   - holds: add seconds
//   cardio - minutes, then incline, then speed

const PROGRAM = {
  A: {
    id: 'A', name: 'Legs Heavy · Glutes', short: 'Glute', kind: 'legs',
    blurb: 'Heavy hinge day. Low reps, chase more weight.',
    ex: [
      { id: 'hip-thrust', name: 'Barbell hip thrust', type: 'heavy', sets: 5, reps: [5, 8], inc: 10,
        start: 'Empty bar (45 lb) to learn it, or 65–95 lb if you have done hip thrusts before.' },
      { id: 'rdl', name: 'Romanian deadlift', type: 'heavy', sets: 4, reps: [6, 8], inc: 5,
        start: '45–65 lb barbell or two 20–30 lb dumbbells. Flat back, feel the hamstrings.' },
      { id: 'bss', name: 'Bulgarian split squat (lean forward)', type: 'heavy', sets: 3, reps: [8, 10], inc: 5, each: true,
        start: 'First set bodyweight, then 15–25 lb dumbbells.' },
      { id: 'kickback', name: 'Cable kickback', type: 'volume', sets: 3, reps: [12, 15], inc: 2.5, each: true,
        start: '10–20 lb on the stack. Pause and squeeze at the top.' },
      { id: 'leg-raise', name: 'Hanging leg raise', type: 'bw', sets: 3, reps: [10, 15] },
      { id: 'walk-a', name: 'Incline walk finisher', type: 'cardio', goalMin: 20 },
    ],
  },
  B: {
    id: 'B', name: 'Upper · High-Rep Arms', short: 'Arms', kind: 'arms',
    blurb: 'Pump day. Chase reps, not max weight.',
    ex: [
      { id: 'lat-pulldown', name: 'Lat pulldown (or pull-ups)', type: 'volume', sets: 3, reps: [10, 12], inc: 5,
        start: '50–70 lb. Pull elbows to your back pockets.' },
      { id: 'incline-press', name: 'DB incline press', type: 'volume', sets: 3, reps: [10, 12], inc: 5,
        start: '15–20 lb dumbbells.' },
      { id: 'db-curl', name: 'Dumbbell curl', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5,
        start: '8–12 lb dumbbells. Slow on the way down.' },
      { id: 'rope-pushdown', name: 'Triceps rope pushdown', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5,
        start: '20–30 lb on the stack.' },
      { id: 'lateral-raise', name: 'Lateral raise', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5,
        start: '5–8 lb dumbbells. Lead with the elbows.' },
      { id: 'ab-wheel', name: 'Ab wheel', type: 'bw', sets: 3, reps: [8, 12] },
      { id: 'walk-b', name: 'Incline walk finisher', type: 'cardio', goalMin: 20 },
    ],
  },
  C: {
    id: 'C', name: 'Legs Heavy · Squat', short: 'Squat', kind: 'legs',
    blurb: 'Heavy squat day. Deep reps, add load.',
    ex: [
      { id: 'squat', name: 'Squat or hack squat (deep)', type: 'heavy', sets: 5, reps: [5, 8], inc: 10,
        start: 'Empty bar (45 lb), or 70–90 lb total on a hack squat.' },
      { id: 'b-stance', name: 'B-stance hip thrust', type: 'heavy', sets: 3, reps: [8, 10], inc: 10, each: true,
        start: 'About half of your regular hip thrust weight.' },
      { id: 'lunges', name: 'Walking lunges (dumbbells)', type: 'heavy', sets: 3, reps: [10, 12], inc: 5, each: true,
        start: '15–20 lb dumbbells.' },
      { id: 'back-ext', name: '45° back extension (rounded upper back)', type: 'volume', sets: 3, reps: [12, 15], inc: 5,
        start: 'Bodyweight first, then hug a 10–25 lb plate.' },
      { id: 'abductor', name: 'Abductor machine', type: 'volume', sets: 3, reps: [15, 20], inc: 10,
        start: '60–90 lb. Lean forward slightly for more glute.' },
      { id: 'pallof', name: 'Pallof press', type: 'volume', sets: 3, reps: [12, 12], inc: 2.5, each: true,
        start: '10–20 lb on the stack.' },
      { id: 'walk-c', name: 'Incline walk finisher', type: 'cardio', goalMin: 20 },
    ],
  },
  D: {
    id: 'D', name: 'Upper · High-Rep Arms 2', short: 'Arms', kind: 'arms',
    blurb: 'Second pump day. Shoulders, back and arms.',
    ex: [
      { id: 'db-row', name: 'Dumbbell row', type: 'volume', sets: 3, reps: [10, 12], inc: 5, each: true,
        start: '20–30 lb dumbbell.' },
      { id: 'shoulder-press', name: 'Seated DB shoulder press', type: 'volume', sets: 3, reps: [10, 12], inc: 2.5,
        start: '12–15 lb dumbbells.' },
      { id: 'face-pull', name: 'Face pulls', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5,
        start: '20–30 lb on the stack.' },
      { id: 'hammer-curl', name: 'Hammer curl', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5,
        start: '10–12 lb dumbbells.' },
      { id: 'oh-triceps', name: 'Overhead triceps extension', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5,
        start: 'One 10–15 lb dumbbell or the cable rope.' },
      { id: 'dead-bug', name: 'Dead bugs', type: 'bw', sets: 3, reps: [10, 15], each: true },
      { id: 'walk-d', name: 'Incline walk finisher', type: 'cardio', goalMin: 20 },
    ],
  },
  E: {
    id: 'E', name: 'Glute Pump', short: 'Pump', kind: 'pump',
    blurb: 'Lighter, high-rep glute work plus core.',
    ex: [
      { id: 'sl-hip-thrust', name: 'Single-leg hip thrust', type: 'volume', sets: 3, reps: [12, 15], inc: 5, each: true,
        start: 'Bodyweight. Add a dumbbell on the hip later.' },
      { id: 'pull-through', name: 'Cable pull-through', type: 'volume', sets: 3, reps: [15, 15], inc: 5,
        start: '30–50 lb on the stack.' },
      { id: 'step-ups', name: 'Step-ups (dumbbells)', type: 'heavy', sets: 3, reps: [8, 10], inc: 5, each: true,
        start: 'Knee-height box with 10–20 lb dumbbells.' },
      { id: 'frog-pumps', name: 'Frog pumps', type: 'bw', sets: 2, reps: [30, 40] },
      { id: 'plank', name: 'Plank', type: 'time', sets: 3, reps: [45, 60] },
      { id: 'walk-e', name: 'Incline walk finisher', type: 'cardio', goalMin: 20 },
    ],
  },
  PILATES: {
    id: 'PILATES', name: 'Pilates', short: 'Pilates', kind: 'pilates',
    blurb: 'Core, control and mobility. A great swap for any day.',
    ex: [
      { id: 'pilates-class', name: 'Pilates class', type: 'class', goalMin: 50 },
    ],
  },
  CARDIO: {
    id: 'CARDIO', name: 'Cardio Day', short: 'Cardio', kind: 'cardio',
    blurb: 'Long, conversational-pace cardio. Build minutes first.',
    ex: [
      { id: 'long-walk', name: 'Incline walk or StairMaster', type: 'cardio', goalMin: 45 },
      { id: 'intervals', name: 'Intervals (bike or rower), optional', type: 'cardio', goalMin: 15 },
    ],
  },
  REST: {
    id: 'REST', name: 'Rest Day', short: 'Rest', kind: 'rest',
    blurb: 'Recover. Still hit your steps.',
    ex: [],
  },
};

// Common lifts you can add to any workout (machine taken, swapping something in, extra work).
// Same fields as the program exercises, so they get the same suggestions and history.
const EXTRA_GROUPS = [
  { label: 'Glutes & legs', ex: [
    { id: 'adductor', name: 'Adductor machine', type: 'volume', sets: 3, reps: [15, 20], inc: 10, start: '60–90 lb.' },
    { id: 'cable-abduction', name: 'Cable hip abduction', type: 'volume', sets: 3, reps: [12, 15], inc: 2.5, each: true, start: '5–15 lb on the stack.' },
    { id: 'band-abduction', name: 'Banded hip abduction', type: 'bw', sets: 3, reps: [20, 30] },
    { id: 'glute-bridge', name: 'Barbell glute bridge', type: 'heavy', sets: 3, reps: [8, 12], inc: 10, start: '45–95 lb.' },
    { id: 'hip-thrust-machine', name: 'Hip thrust machine', type: 'heavy', sets: 4, reps: [8, 12], inc: 10, start: '50–90 lb.' },
    { id: 'leg-press', name: 'Leg press', type: 'heavy', sets: 4, reps: [8, 12], inc: 20, start: '90–140 lb on the sled.' },
    { id: 'smith-squat', name: 'Smith machine squat', type: 'heavy', sets: 4, reps: [6, 10], inc: 10, start: 'Empty bar, or 10s on each side.' },
    { id: 'goblet-squat', name: 'Goblet squat', type: 'heavy', sets: 3, reps: [8, 12], inc: 5, start: '20–30 lb dumbbell.' },
    { id: 'sumo-deadlift', name: 'Sumo deadlift', type: 'heavy', sets: 4, reps: [5, 8], inc: 10, start: '65–95 lb.' },
    { id: 'single-leg-rdl', name: 'Single-leg RDL', type: 'volume', sets: 3, reps: [8, 10], inc: 5, each: true, start: '15–25 lb dumbbell.' },
    { id: 'reverse-lunge', name: 'Reverse lunge', type: 'heavy', sets: 3, reps: [8, 12], inc: 5, each: true, start: '15–20 lb dumbbells.' },
    { id: 'curtsy-lunge', name: 'Curtsy lunge', type: 'volume', sets: 3, reps: [10, 12], inc: 5, each: true, start: 'Bodyweight, then 10–15 lb dumbbells.' },
    { id: 'hamstring-curl', name: 'Hamstring curl', type: 'volume', sets: 3, reps: [10, 12], inc: 5, start: '40–60 lb.' },
    { id: 'leg-extension', name: 'Leg extension', type: 'volume', sets: 3, reps: [12, 15], inc: 5, start: '40–60 lb.' },
    { id: 'calf-raise', name: 'Calf raise', type: 'volume', sets: 3, reps: [15, 20], inc: 10, start: 'Bodyweight, then hold dumbbells.' },
  ] },
  { label: 'Back, chest & shoulders', ex: [
    { id: 'cable-row', name: 'Cable row', type: 'volume', sets: 3, reps: [10, 12], inc: 5, start: '50–70 lb.' },
    { id: 'chest-press', name: 'Chest press machine', type: 'volume', sets: 3, reps: [10, 12], inc: 5, start: '30–50 lb.' },
    { id: 'push-up', name: 'Push-ups', type: 'bw', sets: 3, reps: [8, 15] },
    { id: 'arnold-press', name: 'Arnold press', type: 'volume', sets: 3, reps: [10, 12], inc: 2.5, start: '10–15 lb dumbbells.' },
    { id: 'rear-delt-fly', name: 'Rear delt fly', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5, start: '5–8 lb dumbbells.' },
    { id: 'front-raise', name: 'Front raise', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5, start: '5–8 lb dumbbells.' },
  ] },
  { label: 'Arms', ex: [
    { id: 'cable-curl', name: 'Cable curl', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5, start: '15–25 lb.' },
    { id: 'preacher-curl', name: 'Preacher curl', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5, start: '15–25 lb.' },
    { id: 'skull-crusher', name: 'Skull crushers', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5, start: '10–15 lb dumbbells.' },
    { id: 'tricep-kickback', name: 'Triceps kickback', type: 'arms', sets: 3, reps: [15, 20], inc: 2.5, each: true, start: '5–10 lb dumbbell.' },
    { id: 'bench-dip', name: 'Bench dips', type: 'bw', sets: 3, reps: [12, 20] },
  ] },
  { label: 'Core', ex: [
    { id: 'cable-crunch', name: 'Cable crunch', type: 'volume', sets: 3, reps: [12, 15], inc: 5, start: '30–50 lb.' },
    { id: 'russian-twist', name: 'Russian twists', type: 'bw', sets: 3, reps: [20, 30] },
    { id: 'bicycle-crunch', name: 'Bicycle crunches', type: 'bw', sets: 3, reps: [20, 30] },
    { id: 'side-plank', name: 'Side plank', type: 'time', sets: 3, reps: [30, 45], each: true },
  ] },
  { label: 'Cardio', ex: [
    { id: 'stairmaster', name: 'StairMaster', type: 'cardio', goalMin: 20 },
    { id: 'bike', name: 'Bike', type: 'cardio', goalMin: 20 },
    { id: 'elliptical', name: 'Elliptical', type: 'cardio', goalMin: 20 },
    { id: 'run', name: 'Run', type: 'cardio', goalMin: 20 },
    { id: 'row-machine', name: 'Rowing machine', type: 'cardio', goalMin: 15 },
    { id: 'outdoor-walk', name: 'Outdoor walk', type: 'cardio', goalMin: 30 },
  ] },
];

// Monday-first weekly schedule (index 0 = Monday).
const DEFAULT_SCHEDULE = ['A', 'B', 'C', 'D', 'E', 'CARDIO', 'REST'];

const GOALS = {
  stepsPerDay: 10000,
  cardioMinPerWeek: 150,
  calories: 1575,
  protein: 148,
  fiber: 28,
};

const TYPE_LABEL = {
  heavy: 'Heavy',
  arms: 'High reps',
  volume: 'Build',
  bw: 'Bodyweight',
  time: 'Hold',
  cardio: 'Cardio',
  class: 'Class',
};
