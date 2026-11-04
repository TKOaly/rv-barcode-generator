import { useState } from "react"
import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { useAuth } from "./useAuth"

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
})

export type LoginValues = z.infer<typeof loginSchema>

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const { loading, error, login } = useAuth()

  const form = useForm({
    defaultValues: { username: "", password: "" },
    validators: { onChange: loginSchema },
    onSubmit: async ({ value }) => {
      await login(value.username, value.password)
    },
  })

  return (
    <main className="login-page">
      <form
        className="login-form"
        onSubmit={e => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <h1>Log In</h1>

        <form.Field
          name="username"
          children={field => (
            <div className="field">
              <label htmlFor={field.name}>Username</label>
              <input
                id={field.name}
                name={field.name}
                type="text"
                autoComplete="username"
                disabled={loading}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={e => field.handleChange(e.target.value)}
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.map((err, i) => (
                  <p key={i} role="alert" className="form-error">
                    {err?.message}
                  </p>
                ))}
            </div>
          )}
        />

        <form.Field
          name="password"
          children={field => (
            <div className="field">
              <label htmlFor={field.name}>Password</label>
              <div className="search-control">
                <input
                  id={field.name}
                  name={field.name}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  disabled={loading}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={e => field.handleChange(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {field.state.meta.isTouched &&
                field.state.meta.errors.map((err, i) => (
                  <p key={i} role="alert" className="form-error">
                    {err?.message}
                  </p>
                ))}
            </div>
          )}
        />

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <form.Subscribe
          selector={state => state.canSubmit}
          children={canSubmit => (
            <div className="dialog-footer">
              <button type="submit" disabled={!canSubmit || loading}>
                {loading ? "Logging in..." : "Log In"}
              </button>
            </div>
          )}
        />
      </form>
    </main>
  )
}

export default LoginForm
