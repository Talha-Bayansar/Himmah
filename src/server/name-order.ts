import { sql, type SQL } from "drizzle-orm";
import { CommunityError, type PageInput } from "../community/contracts.ts";
/** The same database key drives display order and every cursor page. No page-local sorting. */
export const nameKey = (name: SQL) =>
  sql`lower(coalesce(${name},'')) collate "C"`;
export const nameField = (name: SQL) => sql`${nameKey(name)} as "sortName"`;
export const nameOrder = (name: SQL, id: SQL = sql`id`) =>
  sql`${nameKey(name)} asc,${id} asc`;
export function nameAfter(
  p: PageInput,
  name: SQL,
  id: SQL = sql`id`,
  type: "uuid" | "text" = "uuid",
) {
  if (!p.after) return sql``;
  if (p.after.name === undefined) throw new CommunityError("invalid_cursor");
  return sql`and (${nameKey(name)},${id})>(${p.after.name} collate "C",${p.after.id}${sql.raw("::" + type)})`;
}
