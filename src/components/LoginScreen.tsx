import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import shieldImage from "../assets/naiadd-shield.png";
import "../styles/LoginScreen.css";
import "../styles/LoginScreen-responsive.css";

const loginBackgrounds = Object.values(
  import.meta.glob("../assets/login-backgrounds/*.{jpg,jpeg,png,webp,avif}", {
    eager: true,
    import: "default",
  }),
) as string[];

type LoginScreenProps = {
  loading: boolean;
  error: string;
  message?: string;
  onEmailPasswordLogin: (email: string, password: string) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
};

export default function LoginScreen({
  loading,
  error,
  message = "",
  onEmailPasswordLogin,
  onPasswordReset,
}: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [backgroundImage, setBackgroundImage] = useState("");

  const selectedBackground = useMemo(() => {
    if (loginBackgrounds.length === 0) return "";

    const index = Math.floor(Math.random() * loginBackgrounds.length);
    return loginBackgrounds[index];
  }, []);

  useEffect(() => {
    if (!selectedBackground) return;

    const image = new Image();

    image.onload = () => {
      setBackgroundImage(selectedBackground);
    };

    image.onerror = () => {
      console.error(
        "Unable to load the selected NAIADD login background:",
        selectedBackground,
      );
    };

    image.src = selectedBackground;

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [selectedBackground]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onEmailPasswordLogin(email.trim(), password);
  }

  async function handlePasswordReset() {
    await onPasswordReset(email.trim());
  }

  return (
    <main
      className="login-page"
      style={
        backgroundImage
          ? { backgroundImage: `url("${backgroundImage}")` }
          : undefined
      }
    >
      <div className="login-shell">
        <section className="login-brand-panel">
          <div className="login-shield-column">
            <img
              className="login-shield"
              src={shieldImage}
              alt="NAIADD shield"
            />
          </div>

          <div className="login-brand-copy">
            <p className="login-kicker">NAIADD</p>
            <h1>Nongame Aquatic Invertebrate Assessment and Distribution Database</h1>
            <p>
              A Virginia Department of Wildlife Resources platform for the
              collection, management, analysis, and distribution of
              nongame aquatic invertebrate observations.
            </p>

            <div className="login-feature-list">
              <div className="login-feature-pill">Offline Drafts</div>
              <div className="login-feature-pill">Field Collection</div>
              <div className="login-feature-pill">Agency Review</div>
              <div className="login-feature-pill">Secure Access</div>
              <div className="login-feature-pill">Living Data Pipeline</div>
            </div>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-heading">
          <div className="login-panel-heading">
            <p>AUTHORIZED ACCESS</p>
            <h2 id="login-heading">Sign in to NAIADD</h2>
            <span>Use the account assigned by your administrator.</span>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="login-label">
              Email Address
              <div className="login-input-wrap">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  disabled={loading}
                />
              </div>
            </label>

            <label className="login-label">
              Password
              <div className="login-input-wrap">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
              </div>
            </label>

            <button
              type="submit"
              className="primary-login-button"
              disabled={loading || !email.trim() || !password}
            >
              {loading ? "Signing in..." : "Login with Email"}
            </button>

            <button
              type="button"
              className="forgot-password-link"
              onClick={handlePasswordReset}
              disabled={loading}
            >
              Forgot Password?
            </button>
          </form>

          {message && <div className="login-info">{message}</div>}
          {error && <div className="login-error">{error}</div>}

          <p className="login-footnote">
            Access is restricted to authorized users. Contact the NAIADD
            Administrator if you need an account.
          </p>
        </section>
      </div>
    </main>
  );
}
