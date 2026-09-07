import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, type Location } from "react-router-dom";
import { Banner, Button } from "@don-juan/ui";
import { ApiRequestError } from "../../lib/api/httpClient";
import { useAuth } from "./useAuth";
import "./LoginPage.css";

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network") return "No se pudo contactar el servidor. Verifica tu conexión.";
    if (error.status === 401) return "Usuario o contraseña incorrectos.";
    if (error.status === 400) return "Revisa los datos ingresados e intenta de nuevo.";
  }
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status === "authenticated") {
    const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/";
    return <Navigate to={from} replace />;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    auth
      .login({ username, password })
      .then(() => {
        const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/";
        navigate(from, { replace: true });
      })
      .catch((cause: unknown) => {
        setError(loginErrorMessage(cause));
        setSubmitting(false);
      });
  };

  return (
    <div className="dj-login">
      <form className="dj-login__card" onSubmit={handleSubmit}>
        <h1 className="dj-login__title">Don Juan POS/ERP</h1>
        <p className="dj-login__subtitle">Inicia sesión para continuar.</p>

        {error ? <Banner tone="danger" title={error} /> : null}

        <label className="dj-login__field">
          <span>Usuario</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            disabled={submitting}
            autoComplete="username"
          />
        </label>

        <label className="dj-login__field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={submitting}
            autoComplete="current-password"
          />
        </label>

        <Button type="submit" disabled={submitting}>
          {submitting ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
    </div>
  );
}
