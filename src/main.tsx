import { createRoot } from "react-dom/client"
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { PrintView, Studio } from "./App"
import "./styles.css"
import { LoginForm } from "./LoginFrom"
import { useAuth } from "./useAuth"

function AuthLayout() {
  const { isLoggedIn, loading, error, login } = useAuth()

  if (loading) return <p>Loading…</p> // never return null here

  if (!isLoggedIn) return <LoginForm login={login} error={error} />

  return <Outlet />
}

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="not-found">
      <p>That page is missing.</p>
      <a href="/">Back to your catalog</a>
    </main>
  ),
})

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  component: AuthLayout,
})

const studioRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/",
  component: Studio,
})

const printRoute = createRoute({
  getParentRoute: () => authRoute,
  path: "/print",
  component: PrintView,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([
    authRoute.addChildren([studioRoute, printRoute]),
  ]),
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")
if (root) createRoot(root).render(<RouterProvider router={router} />)
