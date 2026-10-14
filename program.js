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

// Monday-first weekly schedule (index 0 = Monday).
const DEFAULT_SCHEDULE = ['A', 'B', 'C', 'D', 'E', 'CARDIO', 'REST'];

const GOALS = {
  stepsPerDay: 10000,
  cardioMinPerWeek: 150,
  calories: 1575,
  protein: 148,
};

const TYPE_LABEL = {
  heavy: 'Heavy',
  arms: 'High reps',
  volume: 'Build',
  bw: 'Bodyweight',
  time: 'Hold',
  cardio: 'Cardio',
};
