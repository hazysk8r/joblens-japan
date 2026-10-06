export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
  ) {
    super(message);

    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const isJobPostingVersionConflict = (
  error: unknown,
): boolean => {
  return (
    error instanceof ApiError &&
    error.status === 412 &&
    error.code ===
      'JOB_POSTING_VERSION_CONFLICT'
  );
};