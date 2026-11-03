import { readFile } from "node:fs/promises"
import { imageUrl, normalizeImage } from "../server/images"
import { catalogSchema, eanFromBase } from "../src/catalog"
import type { Catalog } from "../src/catalog"

const names = [
  "Pullon palautus -0,10€",
  "Tölkin palautus -0,15€",
  "Pullon palautus -0,20€",
  "Pullon palautus -0,40€",
  "KAHVI sponsored by Netlight 0,19€",
  "Tee 0,19€",
  "KitKat MINI 16,7g",
  "Tutti Frutti 17g",
  "Oreo Original täytekeksi 44g",
  "Pingviini Toffee-Suklaa & Keksihippu 67g",
  "Mars jäätelöpatukka 40g",
  "Snickers Creamy 39g",
  "Naturli Cookie Dough 90g",
  "Daniela Minttu 110ml",
]
const codes = [
  "00000000",
  "00000017",
  "00000024",
  "00000031",
  "00001007",
  "00001014",
  "00002004",
  "00003001",
  "00004008",
  "00005005",
  "00005043",
  "00005067",
  "00005098",
  "00005227",
]
export const fixtureImages = await Promise.all(
  names.map((_, index) =>
    readFile(`tests/assets/product-${index}.png`).then(normalizeImage),
  ),
)
export const initialCatalog: Catalog = catalogSchema.parse({
  title: "Office essentials",
  products: names.map((name, index) => ({
    id: `product-${index}`,
    name,
    ean: eanFromBase(codes[index]?.slice(0, 7) ?? ""),
    image: imageUrl(fixtureImages[index]?.id ?? ""),
  })),
})
