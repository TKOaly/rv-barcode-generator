import { useCallback, useEffect, useState } from "react"

async function errorMessage(response: Response, fallback: string) {
  const failure: unknown = await response.json().catch(() => null)

  return failure &&
    typeof failure === "object" &&
    "error" in failure &&
    typeof failure.error === "string"
    ? failure.error
    : fallback
}

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Check whether a session exists on page load
  useEffect(() => {
    let active = true

    fetch("/auth/session")
      .then(response => {
        if (!active) return

        if (response.ok) {
          setIsLoggedIn(true)
        } else if (response.status === 401) {
          setIsLoggedIn(false)
        } else {
          setError("Could not check your session.")
        }
      })
      .catch(() => {
        if (active) setError("Could not reach the server.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setError("")

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        setError(await errorMessage(response, "Invalid credentials."))
        return false
      }

      setIsLoggedIn(true)
      return true
    } catch {
      setError("Could not reach the server.")
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    setError("")

    try {
      await fetch("/api/logout", { method: "POST" })
    } catch {
      // Clear local state even if the request fails
    }

    setIsLoggedIn(false)
  }, [])

  return { isLoggedIn, loading, error, login, logout }
}
