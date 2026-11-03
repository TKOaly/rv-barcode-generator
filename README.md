# RV Catalog studio

Run the catalog editor with local SQLite persistence. Requires Node.js 22 or newer and pnpm 10. The implementation was verified on Node.js 24.22.2.

```sh
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:5174. Vite proxies `/api` to the Node server on port 3001. `pnpm dev` starts both processes. SQLite lives at `data/catalog.sqlite`, which Git ignores. Set `DATABASE_PATH` to use another database. Back up the database with SQLite backup tooling or stop the server before copying it.

The seed defaults to the original archive at `seed/CATALOG.zip`. You can supply another archive.

```sh
pnpm db:seed -- /path/to/CATALOG.zip
```

The supplied archive contains 14 active products and 29 archived products. Active products start included. Archived products start excluded. Standalone SVG codes, including `VAPAAT`, are not products. The seed decodes HTML entities, removes soft hyphens, calculates EAN-8 check digits, and verifies SVG text. Sharp rotates each photo using EXIF orientation, center-crops it to 512×512, and encodes WebP at quality 82 with metadata stripped. The output bytes live in the SQLite `images` table under their SHA-256 hash. It never executes archive files or extracts arbitrary paths.

Import validation finishes before product writes. SQLite inserts run in one transaction. IDs derive from barcodes. Reruns insert missing products and append them after existing products. Existing names, images, barcodes, order, and Include state remain unchanged. A deleted imported product returns on the next seed run.

Generate schema changes and apply migrations separately from product imports.

```sh
pnpm db:generate
pnpm db:migrate
```

`server/schema.ts` owns the Drizzle schema. Generated SQL in `drizzle/` contains schema changes only. Product data belongs to the seed script.

Categories come from the seven-digit EAN base through the registry in `src/catalog.ts`. No category column or product-data migration is needed. Each registry start owns 100 consecutive bases, including the start. Valid legacy EANs outside these ranges remain editable and display **Unassigned**. The category filter lists registry categories; **All categories** also shows unassigned products.

| Start   | Category                   |
| ------- | -------------------------- |
| 0000000 | Pantit                     |
| 0000100 | Kahvi tee yms ei laskettu  |
| 0000200 | Suklaat                    |
| 0000300 | Karkit                     |
| 0000400 | Keksit                     |
| 0000500 | Jäätelöt                   |
| 0000600 | Välipala/proteiini patukat |
| 0000700 | Puurot                     |
| 0000800 | varalla                    |
| 0000900 | Muut                       |

Choose a category when adding a product. The dialog previews the lowest unused base with its EAN-8 check digit. For example, base `0000200` produces `00002004`. The server allocates again inside an immediate SQLite transaction, so another client's creation can change the final code. Excluded and archived products occupy their codes. Gaps from deleted products can be reused. A full range rejects creation without spilling into the next category. The existing catalog limit is 500 products.

Create commands carry a new UUID, name, image, Include state, and category key. They cannot supply an EAN. Save commands edit existing products and reject barcode changes or missing IDs. Existing product barcodes and categories are read-only in the dialog. Catalog validation and a SQLite unique index reject duplicate EANs. The index migration changes schema only. Archive imports and fixture imports use the shared `eanFromBase` checksum helper.

Search and category filters apply to the management list. Include controls preview and print. Edit products in the dialog, or drag cards in the right preview to reorder them across pages. Each page contains twelve cards. Print catalog calls `window.print()` directly after pending writes complete. Choose A4 landscape and disable browser headers and footers.

The frontend reads SQLite before editing and queues mutation commands in order. The API validates commands with Zod and executes each command in an immediate SQLite transaction against current rows. Load and save failures display a plain message. After a save failure, reload before editing again. Browser storage is unused.

Build and run the API with the production frontend.

```sh
pnpm build
API_PORT=3001 pnpm start
```

Open http://localhost:3001. The server serves `dist` and the API from the same origin. It binds to loopback by default. Set `API_HOST` to change the listening address. Images are served from SQLite through `/api/images/<hash>`. No image files are required in `public` or `dist`.

Run verification.

```sh
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

Database tests verify the real ZIP, normalized image bytes, rerun preservation, invalid input, stale restore, and concurrent HTTP commands. Every browser test starts its own API server and temporary SQLite database containing fourteen fixture products. Fixture source images live under `tests/assets` and are imported into each test database as blobs. No public database reset endpoint exists.

Add products with a JPEG, PNG, or WebP photo upload. Save stays disabled during upload and until a new product has a stored photo. Editing can keep the existing photo or upload a replacement. The server verifies raster bytes with Sharp, limits input to 10 MiB and 40 megapixels, and rejects SVG and multi-page images. Identical normalized output deduplicates. Canceling can leave an unused immutable blob.

`POST /api/images` accepts a raw binary body and returns `{ "image": "/api/images/<hash>" }` after storing it. `GET /api/images/<hash>` serves binary WebP with an immutable one-year cache policy and ETag. Catalog responses contain image URLs only. Product commands reject missing images and any URL outside this endpoint. Replacing or deleting a product never deletes image blobs.

For an existing catalog with local `/products` references, back up SQLite first, then run:

```sh
pnpm db:migrate
pnpm db:import-images
```

The import normalizes all source photos before its database transaction, updates only image references and the catalog revision, verifies every stored reference, then removes the migrated runtime files from `public/products`. A repeat import leaves valid references unchanged. Unsupported old URLs or missing files produce an error before any product update. Keep `seed/CATALOG.zip` for repeatable seeding. Schema migrations contain no product content.

## Run with Docker Compose

The production image uses Node.js 24 on Debian Bookworm, matching the tested Node major and the native better-sqlite3 and Sharp runtime. The builder installs pnpm 10.28.2 with the frozen lockfile, compiles the frontend, and removes development dependencies. Compilers stay in the builder. The final image runs as the `node` user and includes migrations, the seed archive, and the shared catalog schema. `tsx` is a production dependency because the server runs TypeScript directly. Sharp's platform binaries remain optional dependencies. Do not install with `--no-optional`. Its build hook is permitted in `pnpm-workspace.yaml` as recommended by [Sharp's installation guide](https://sharp.pixelplumbing.com/install/).

With Docker Engine and the Compose plugin installed, run:

```sh
docker compose up --build -d
docker compose ps
curl --fail http://localhost:3001/api/health
```

Open http://localhost:3001. Set `CATALOG_PORT=8080` before `docker compose up` to publish port 8080 instead. The API listens on `0.0.0.0` inside the container. Local `pnpm start` and `pnpm dev` still default to `127.0.0.1`. Set `API_HOST` to override that default. The image healthcheck calls `/api/health`, which reads the SQLite catalog revision without loading products or image blobs.

Startup applies schema migrations and fails if they fail. A new volume starts with an empty catalog. Import the supplied products once, when wanted:

```sh
docker compose exec catalog node --import tsx server/seed.ts
```

This imports 43 products with 14 included, and stores normalized image bytes in SQLite. Startup never seeds. Deleted products stay deleted after restarts. Running the seed command again explicitly restores missing seed products.

The `catalog-data` named volume mounts at `/app/data`. It persists the SQLite database and its image blobs across container replacement and `docker compose down`. `docker compose down --volumes` deletes it. The image initializes this directory with ownership for the nonroot `node` user, which Docker copies into a new named volume. If replacing the volume with a bind mount, create the host directory first and grant UID 1000 and GID 1000 write access. Bind mounts hide the image directory's ownership.

Run one replica per database volume. SQLite is local storage. Multiple application replicas and network filesystems are not supported by this setup. The published service has no authentication. Keep it on a trusted network or configure authenticated access at your reverse proxy before public use.

The build context uses an allowlist in `.dockerignore`. It excludes local databases, backups, `.env` files, Git history, test fixtures, test results, and local `node_modules` and `dist`. Only the checked-in `seed/CATALOG.zip` is included as initial product content. No live data is baked into the image.

To move an existing catalog, stop every process writing that source database before making a copy. Use SQLite backup tooling, or close all writers before copying `catalog.sqlite`. Preserve a separate backup. Start Compose once to initialize the target volume, then stop it before copying the database into the volume:

```sh
docker compose stop catalog
docker compose cp ./data/catalog.sqlite catalog:/app/data/catalog.sqlite
docker compose run --rm --no-deps --user root --entrypoint chown catalog node:node /app/data/catalog.sqlite
docker compose up -d
```

Use this copy procedure for a fresh target volume only. Do not overwrite an existing target database with WAL sidecar files present. The source SQLite file already includes images stored as blobs. Legacy file-based photos need the local `db:import-images` procedure above first. Back up the volume before upgrades. Schema migrations run automatically, so reverting an image may also require restoring its database backup.

## CI and image delivery

`.github/workflows/ci.yaml` runs on pull requests, pushes to `main`, `v*` tags, and manual dispatch. It installs with the frozen pnpm lockfile on Node.js 24, typechecks, runs unit and database tests, installs Chromium with system dependencies, runs browser tests, and builds the production frontend. Failed browser runs upload available test artifacts.

After those checks pass, CI builds the Docker image without pushing and runs the reusable smoke test. On a Docker host, run the same check locally:

```sh
pnpm test:docker
# Or check an image already built locally:
pnpm test:docker -- rv-catalog:ci
```

The script uses a unique disposable named volume and removes its test container and volume on exit. It verifies empty-database migration, explicit seeding, all seeded image hashes and WebP responses, Include edits, deletion preservation across restart, volume reuse by a replacement container, and graceful SIGTERM. It uses an ephemeral loopback host port, leaving the local development server and database alone.

The publish job promotes the exact tested image to `ghcr.io/<lowercase GitHub repository>`. A `main` build gets `main` and `sha-<commit>` tags. A valid semver tag such as `v1.2.3` gets `1.2.3`, `1.2`, and a SHA tag. No `latest` tag is created. Only the publish job receives package write permission through `GITHUB_TOKEN`. Pull request builds never log in or push.

No Git remote or deployment host is configured in this checkout. These workflows take effect after the repository is hosted on GitHub with Actions and package publishing enabled. Delivery ends at GHCR. Host rollout, reverse proxy, TLS, and registry pull credentials are not configured. Docker is unavailable in the implementation environment, so the image build and container smoke test must first run on a Docker host or in CI.

Licensed under the [Apache License 2.0](LICENSE).
