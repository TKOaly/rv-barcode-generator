import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Studio, PrintView } from "./App";
import "./styles.css";
const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="not-found">
      <p>That page is missing.</p>
      <a href="/">Back to your catalog</a>
    </main>
  ),
});
const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Studio,
});
const printRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/print",
  component: PrintView,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([studioRoute, printRoute]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<RouterProvider router={router} />);
