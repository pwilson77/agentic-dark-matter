export type AgentSdkErrorCode =
  | "INVALID_CONFIG"
  | "INVALID_INPUT"
  | "OPERATION_FAILED";

export class AgentSdkError extends Error {
  readonly code: AgentSdkErrorCode;
  readonly operation: string;
  readonly retriable: boolean;
  readonly causeValue?: unknown;

  constructor(input: {
    code: AgentSdkErrorCode;
    operation: string;
    message: string;
    retriable?: boolean;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "AgentSdkError";
    this.code = input.code;
    this.operation = input.operation;
    this.retriable = input.retriable ?? false;
    this.causeValue = input.cause;
  }
}

export function toSdkError(input: {
  operation: string;
  error: unknown;
  retriable?: boolean;
}): AgentSdkError {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  return new AgentSdkError({
    code: "OPERATION_FAILED",
    operation: input.operation,
    message,
    retriable: input.retriable,
    cause: input.error,
  });
}
