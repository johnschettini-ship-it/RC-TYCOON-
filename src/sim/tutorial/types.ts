/** Tutorial run state (Phase 5 §4.11, §5). Owner: W3-I. One member of `ScenarioState`. */
export interface TutorialRun {
  kind: 'tutorial';
  /** Index of the current step (0–15); 16 when every step is done. */
  stepIndex: number;
  /** Skip tutorial was pressed: the park continues as free play. */
  skipped: boolean;
  done: boolean;
}

export function newTutorialRun(): TutorialRun {
  return { kind: 'tutorial', stepIndex: 0, skipped: false, done: false };
}
