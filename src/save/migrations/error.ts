/** A migration failure with a player-facing message (the codec uses it as the load error as is). */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}
