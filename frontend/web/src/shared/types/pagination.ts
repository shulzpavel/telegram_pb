export type ParamValue = string | number | boolean | null | undefined;

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  limit: number;
}
