export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (resource = 'Resource') =>
  new ApiError(404, `${resource} not found`);
