export class HeyGenNotConfiguredError extends Error {
  readonly missingEnv: string[];

  constructor(missingEnv: string[]) {
    super(
      "HeyGen LiveAvatar integration is not configured. Set required environment variables on the server.",
    );
    this.name = "HeyGenNotConfiguredError";
    this.missingEnv = missingEnv;
  }
}
