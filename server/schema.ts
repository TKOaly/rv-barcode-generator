import {
  blob,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const metadata = sqliteTable("catalog", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  revision: integer("revision").notNull().default(0),
})
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ean: text("ean").notNull(),
    image: text("image").notNull(),
    included: integer("included", { mode: "boolean" }).notNull(),
    position: integer("position").notNull(),
  },
  table => [uniqueIndex("products_ean_unique").on(table.ean)],
)

export const images = sqliteTable("images", {
  id: text("id").primaryKey(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  mime: text("mime").notNull(),
})
