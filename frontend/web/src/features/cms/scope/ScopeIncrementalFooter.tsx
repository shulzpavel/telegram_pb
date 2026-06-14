import { LoadMoreFooter } from "../components/CmsPrimitives";
import { SCOPE_LIST_PAGE_SIZE } from "./scopeListPaging";

export function ScopeIncrementalFooter({
  loadedCount,
  total,
  hasMore,
  onMore,
  itemNoun = "задач",
}: {
  loadedCount: number;
  total: number;
  hasMore: boolean;
  onMore: () => void;
  itemNoun?: string;
}) {
  if (total <= SCOPE_LIST_PAGE_SIZE) {
    return null;
  }

  return (
    <LoadMoreFooter
      loading={false}
      hasMore={hasMore}
      loadedCount={loadedCount}
      total={total}
      onMore={onMore}
      itemNoun={itemNoun}
      variant="compact"
    />
  );
}
