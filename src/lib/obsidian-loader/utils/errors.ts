import type { YAMLException } from "js-yaml";

export interface ErrorLocation {
  file?: string;
  line?: number;
  column?: number;
}

export class MarkdownError extends Error {
  loc?: ErrorLocation;

  constructor(props: {
    name: string;
    message?: string;
    stack?: string;
    location?: ErrorLocation;
  }) {
    super(props.message);
    this.name = props.name;
    this.loc = props.location;
    if (props.stack) this.stack = props.stack;
  }

  setLocation(location: ErrorLocation): void {
    this.loc = location;
  }

  setMessage(message: string): void {
    this.message = message;
  }
}

export function isYAMLException(err: unknown): err is YAMLException {
  return err instanceof Error && err.name === "YAMLException";
}
