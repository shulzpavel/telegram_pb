export type ParamValue = string | number | boolean | null | undefined;

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  limit: number;
  /**
   * Optional precise count for the underlying query. Most CMS endpoints
   * don't compute it (cursor-only pagination), but the manager paginated
   * endpoints do. Consumers should treat `null`/`undefined` interchangeably
   * — the progressive list hook normalizes them to `null`.
   */
  total?: number | null;
}
