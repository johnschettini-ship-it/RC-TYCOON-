/**
 * Owner: W1-D. Guest thought texts (Phase 1 §4.3, Phase 3 §4.16, Phase 2 §4.11).
 * Keys are thought ids (master R5). No final period (master R4); `!` and `?` stay.
 * The id constants live in `src/sim/guests/thoughts.ts` (`THOUGHT`).
 */
export const guestStrings: Record<string, string> = {
  // Phase 1 §4.3
  hungry: 'I am hungry',
  thirsty: 'I am thirsty',
  needRestroom: 'I need a restroom',
  tired: 'I am tired',
  sick: 'I feel a bit sick',
  lost: 'I am lost',
  amazing: 'That was amazing!',
  nice: 'That was nice',
  tame: 'That was a bit tame',
  tooIntense: 'That looks too intense for me',
  rideTooExpensive: 'That ride costs too much',
  snackTooExpensive: 'Too expensive for a snack',
  drinkTooExpensive: 'Too expensive for a drink',
  queueTooLong: 'That queue is far too long',
  waitedTooLong: 'I waited too long',
  goHome: 'Time to go home',
  greatPark: 'What a great park!',

  // Phase 2 §4.11
  airtimeAwesome: 'Floating out of my seat was awesome!',
  neverUpsideDown: 'Upside down? Never again',

  // Phase 3 §4.16
  filthy: 'This path is filthy',
  cleanPark: 'Nice clean park!',
  brokeBench: 'Someone broke that bench',
  brokeBin: 'Someone broke that bin',
  brokeLamp: 'Someone broke that lamp',
  rideBrokeDown: 'The ride broke down. Typical!',
  stuck: 'We are stuck!',
  stormClosed: 'They closed it for the storm',
  lostNeedMap: 'I am lost. I need a map',
  mapLifesaver: 'This map is a lifesaver',
  balloonFlewAway: 'My balloon flew away!',
  loveBalloon: 'I love my balloon',
  rainNoUmbrella: 'It is raining and I have no umbrella',
  goodUmbrella: 'Good thing I have an umbrella',
  tooHot: 'It is too hot',
  tooCold: 'Brr, it is cold',
  wantCocoa: 'A cocoa would be nice',
  feelAwful: 'I feel awful',
  performerFun: 'That performer is fun!',
  needCash: 'I need cash',
  thrillWeekend: 'Thrill Weekend? Count me in!',
  chillWeekend: 'Chill Weekend sounds perfect',
  // Phase 4 §4.5, §4.7
  flowersSad: 'These flowers look sad',
  pathTooDark: 'This path is too dark',
  // Phase 6 §4.4 (the spec names the id `thought.greatShow`; ids here have no prefix, master R5)
  greatShow: 'What a great show!',
};
