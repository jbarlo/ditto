## Code Style

- **Comments**: Only where the logic isn't self-evident. No restating-the-obvious, no section dividers, no JSDoc that just repeats the function name. Good comments explain *why*, not *what*.
- **Error handling**: Railway-oriented — DAL returns `{ ok, data } | { ok, error }` result types. Propagate errors up, don't throw.
- **No bang assertions**: Avoid `!` (non-null assertions). In tests, use `assert()` to narrow types — it fails loudly with a clear stack trace rather than silently passing `undefined`. In production code, restructure logic to avoid the need (e.g. `reduce`, early returns, guards).
- **Transactions**: Multi-statement DAL methods must use `db.transaction()`. Single-statement methods don't need one.

## Project

- **Tech stack**: Next.js 16, TypeScript, tRPC, Drizzle ORM, SQLite/Turso
- **Testing**: `pnpm test` (vitest)
- **Type check**: `pnpm typecheck`

## Data Fetching Convention

Use the **hydrated query pattern** for client components that display data:

1. **Server component fetches data** via DAL (not tRPC)
2. **Pass to client as `initialData` prop** (required, not optional)
3. **Client uses `useQuery({ initialData })`** to seed React Query cache
4. **Mutations use `utils.queryName.invalidate()`** for snappy client-side refetch

```typescript
// page.tsx (server component)
const items = await dal.getItems(userId);
return <ItemList initialData={items} />;

// ItemList.tsx (client component)
function ItemList({ initialData }) {
  const { data } = trpc.items.list.useQuery(undefined, { initialData });

  const utils = trpc.useUtils();
  const deleteMutation = trpc.items.delete.useMutation({
    onSuccess: () => utils.items.list.invalidate(),
  });
}
```

**DO NOT:**
- Use `useQuery()` without `initialData` in client components
- Use `router.refresh()` to update query data (doesn't invalidate RQ cache)
- Fetch data client-side that could be fetched server-side

## Routes

All internal route references must use `route()` from `lib/routes.ts`. Never use bare string paths. This gives autocomplete and type-safe param enforcement.

- `route("/home")` — static route
- `route("/canvas/:canvasId", { canvasId })` — parameterized route

## Canvas Image URLs

Use `canvasImageUrl(imageId, compositedAt)` from `lib/storage` for all canvas image URLs. Never use bare `imageStorage.getUrl()` for canvas images — it skips cache busting.

## Testing

- RBAC tests must cover the full role matrix (owner/editor/viewer/no-access/unauth) for every procedure. See `canvas-rbac.test.ts` for the pattern.

## Commits

Use conventional commits:
- `feat: ...` - new feature
- `fix: ...` - bug fix
- `refactor: ...` - code change (no new feature or fix)
- `docs: ...` - documentation only
- `test: ...` - adding/updating tests
- `chore: ...` - maintenance, deps, config
